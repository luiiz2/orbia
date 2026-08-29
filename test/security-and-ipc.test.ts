import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { extractAndValidateMediaPath } from '../src/main/protocol'
import { databaseService } from '../src/main/services/database.service'
import { registerCoursesIpc } from '../src/main/ipc/courses.ipc'
import { registerPlayerIpc } from '../src/main/ipc/player.ipc'
import { registerVaultIpc } from '../src/main/ipc/vault.ipc'
import { registerSettingsIpc } from '../src/main/ipc/settings.ipc'

const TEST_TMP_DIR = path.join(__dirname, 'tmp_security_test')

// Mock electron's ipcMain, dialog, and BrowserWindow
const registeredHandlers = new Map<
  string,
  (_event: unknown, ...args: unknown[]) => Promise<unknown> | unknown
>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (
      channel: string,
      handler: (_event: unknown, ...args: unknown[]) => unknown
    ) => {
      registeredHandlers.set(channel, handler)
    }
  },
  dialog: {
    showOpenDialog: vi.fn()
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn()
  },
  shell: {
    openPath: vi.fn().mockResolvedValue(''),
    openExternal: vi.fn().mockResolvedValue(undefined)
  },
  protocol: {
    registerSchemesAsPrivileged: vi.fn(),
    handle: vi.fn()
  },
  net: {
    fetch: vi.fn()
  },
  app: {
    getPath: vi.fn(() => TEST_TMP_DIR),
    getLocale: vi.fn(() => 'en')
  }
}))

describe('Security & IPC Boundary Audit Test Suite', () => {
  beforeEach(() => {
    registeredHandlers.clear()
    databaseService.close()
    if (fs.existsSync(TEST_TMP_DIR)) {
      fs.rmSync(TEST_TMP_DIR, { recursive: true, force: true })
    }
    fs.mkdirSync(TEST_TMP_DIR, { recursive: true })
  })

  afterEach(() => {
    databaseService.close()
    if (fs.existsSync(TEST_TMP_DIR)) {
      fs.rmSync(TEST_TMP_DIR, { recursive: true, force: true })
    }
    vi.clearAllMocks()
  })

  describe('1. media:// Protocol Handler Security & Path Validation', () => {
    it('allows valid media file paths with supported extensions', () => {
      const validUrls = [
        'media:///C:/Courses/video.mp4',
        'media://local-media/C:/Courses/lesson1.webm',
        'media:///C:/Courses/Audio/track.mp3',
        'media:///C:/Courses/Docs/manual.pdf',
        'media:///C:/Courses/Subs/captions.vtt',
        'media:///C:/Courses/Images/cover.png',
        'media:///C:/Courses/Images/icon.svg'
      ]

      for (const url of validUrls) {
        const result = extractAndValidateMediaPath(url)
        expect(result.valid).toBe(true)
        expect(result.statusCode).toBe(200)
        expect(result.filePath).toBeDefined()
      }
    })

    it('rejects forbidden file extensions to prevent execution or data leakage', () => {
      const dangerousUrls = [
        'media:///C:/Windows/System32/cmd.exe',
        'media:///C:/Windows/System32/drivers/etc/hosts',
        'media:///C:/Users/User/.ssh/id_rsa',
        'media:///C:/Users/User/AppData/Local/orbia/config.db',
        'media:///C:/Users/User/malicious.bat',
        'media:///C:/Users/User/script.ps1',
        'media:///C:/Users/User/malware.cmd',
        'media:///C:/Users/User/app.dll',
        'media:///C:/Users/User/secret.env',
        'media:///C:/Users/User/registry.reg',
        'media:///C:/Users/User/virus.vbs',
        'media:///C:/Users/User/installer.msi'
      ]

      for (const url of dangerousUrls) {
        const result = extractAndValidateMediaPath(url)
        expect(result.valid).toBe(false)
        expect(result.statusCode).toBe(403)
        expect(result.error).toContain('Forbidden: File type')
      }
    })

    it('rejects null byte injections (%00 or \\0)', () => {
      const nullByteUrls = [
        'media:///C:/Courses/video.mp4%00.exe',
        'media:///C:/Courses/video.mp4\0.js',
        'media:///C:/Courses/video.mp4%00'
      ]

      for (const url of nullByteUrls) {
        const result = extractAndValidateMediaPath(url)
        expect(result.valid).toBe(false)
        expect(result.statusCode).toBe(400)
        expect(result.error).toBe('Null bytes are not permitted')
      }
    })

    it('rejects invalid or non-media schemes', () => {
      expect(
        extractAndValidateMediaPath('http://localhost/video.mp4').valid
      ).toBe(false)
      expect(extractAndValidateMediaPath('file:///C:/video.mp4').valid).toBe(
        false
      )
      expect(extractAndValidateMediaPath('').valid).toBe(false)
    })
  })

  describe('2. Courses IPC Handlers Boundary & Input Validation', () => {
    beforeEach(() => {
      registerCoursesIpc()
    })

    it('validates courses:update-course-cover inputs', async () => {
      const handler = registeredHandlers.get('courses:update-course-cover')!
      expect(handler).toBeDefined()

      // Invalid empty payload
      const res1 = await handler(
        {},
        null as unknown as { courseId: string; coverPath: string }
      )
      expect(res1).toEqual({
        success: false,
        error: 'Valid courseId and coverPath are required'
      })

      // Empty courseId
      const res2 = await handler(
        {},
        { courseId: '', coverPath: 'C:/cover.png' }
      )
      expect(res2).toEqual({
        success: false,
        error: 'Valid courseId and coverPath are required'
      })

      // Non-string coverPath
      const res3 = await handler(
        {},
        { courseId: 'course-1', coverPath: 123 as unknown as string }
      )
      expect(res3).toEqual({
        success: false,
        error: 'Valid courseId and coverPath are required'
      })
    })

    it('validates courses:update-lesson-cover inputs', async () => {
      const handler = registeredHandlers.get('courses:update-lesson-cover')!
      expect(handler).toBeDefined()

      const res1 = await handler(
        {},
        { lessonId: ' ', coverPath: 'C:/cover.png' }
      )
      expect(res1).toEqual({
        success: false,
        error: 'Valid lessonId and coverPath are required'
      })
    })

    it('rejects raw cover paths that were not issued by the native picker', async () => {
      const courseHandler = registeredHandlers.get(
        'courses:update-course-cover'
      )!
      const lessonHandler = registeredHandlers.get(
        'courses:update-lesson-cover'
      )!
      expect(courseHandler).toBeDefined()
      expect(lessonHandler).toBeDefined()

      const courseResult = await courseHandler(
        {},
        {
          courseId: 'course-1',
          coverPath: 'C:/Users/Dell/Documents/private.png'
        }
      )
      const lessonResult = await lessonHandler(
        {},
        {
          lessonId: 'lesson-1',
          coverPath: 'C:/Users/Dell/Documents/private.png'
        }
      )

      const expectedFailure = {
        success: false,
        error: 'Cover image must be selected with the native file picker.'
      }
      expect(courseResult).toEqual(expectedFailure)
      expect(lessonResult).toEqual(expectedFailure)
    })

    it('validates courses:convert-srt-to-vtt against unauthorized file types', async () => {
      const handler = registeredHandlers.get('courses:convert-srt-to-vtt')!
      expect(handler).toBeDefined()

      // Empty path
      const res1 = await handler({}, { srtPath: '' })
      expect(res1).toEqual({
        success: false,
        error: 'Subtitle file path is required'
      })

      // Non-subtitle file extension (e.g. trying to read system files or databases)
      const res2 = await handler(
        {},
        { srtPath: 'C:/Windows/System32/config/SAM' }
      )
      expect(res2).toEqual({
        success: false,
        error: 'File is not a supported subtitle file (.srt, .vtt, .sub, .ass)'
      })

      // Non-existent subtitle file
      const res3 = await handler({}, { srtPath: 'C:/missing_subs.srt' })
      expect(res3).toEqual({
        success: false,
        error: 'Subtitle file is not registered in the active library'
      })
    })

    it('validates courses:get-by-id and returns null on invalid input', async () => {
      const handler = registeredHandlers.get('courses:get-by-id')!
      expect(handler).toBeDefined()

      expect(await handler({}, { courseId: '' })).toBeNull()
      expect(
        await handler({}, null as unknown as { courseId: string })
      ).toBeNull()
    })

    it('validates courses:delete and returns standardized error on invalid input', async () => {
      const handler = registeredHandlers.get('courses:delete')!
      expect(handler).toBeDefined()

      const res = await handler({}, { courseId: '', deleteFiles: false })
      expect(res).toEqual({ success: false, error: 'Course ID is required' })
    })

    it('validates courses:toggle-favorite and returns false on invalid input', async () => {
      const handler = registeredHandlers.get('courses:toggle-favorite')!
      expect(handler).toBeDefined()

      expect(await handler({}, { courseId: '' })).toBe(false)
    })
  })

  describe('3. Player IPC Handlers Boundary & Input Validation', () => {
    beforeEach(() => {
      registerPlayerIpc()
    })

    it('handles player:get-progress with invalid inputs gracefully', async () => {
      const handler = registeredHandlers.get('player:get-progress')!
      expect(handler).toBeDefined()

      expect(await handler({}, { lessonId: '' })).toBeNull()
      expect(
        await handler({}, null as unknown as { lessonId: string })
      ).toBeNull()
    })

    it('handles player:get-course-progress with invalid inputs gracefully', async () => {
      const handler = registeredHandlers.get('player:get-course-progress')!
      expect(handler).toBeDefined()

      expect(await handler({}, { courseId: '' })).toBeNull()
    })

    it('handles player:toggle-lesson-completion with invalid inputs', async () => {
      const handler = registeredHandlers.get('player:toggle-lesson-completion')!
      expect(handler).toBeDefined()

      expect(await handler({}, { lessonId: '', courseId: 'c-1' })).toBe(false)
      expect(await handler({}, { lessonId: 'l-1', courseId: '' })).toBe(false)
    })

    it('clamps player:get-watch-history limit to safe boundaries', async () => {
      const handler = registeredHandlers.get('player:get-watch-history')!
      expect(handler).toBeDefined()

      // Should not throw or crash on negative or oversized limits
      const res1 = await handler({}, { limit: -10 })
      expect(Array.isArray(res1)).toBe(true)

      const res2 = await handler({}, { limit: 999999 })
      expect(Array.isArray(res2)).toBe(true)
    })

    it('validates player:get-lesson-notes', async () => {
      const handler = registeredHandlers.get('player:get-lesson-notes')!
      expect(handler).toBeDefined()

      expect(await handler({}, { lessonId: '' })).toEqual([])
    })

    it('validates player:update-lesson-note with empty content/id', async () => {
      const handler = registeredHandlers.get('player:update-lesson-note')!
      expect(handler).toBeDefined()

      expect(await handler({}, { id: '', content: 'new content' })).toBe(false)
      expect(await handler({}, { id: 'note-1', content: '' })).toBe(false)
    })

    it('validates player:delete-lesson-note with empty id', async () => {
      const handler = registeredHandlers.get('player:delete-lesson-note')!
      expect(handler).toBeDefined()

      expect(await handler({}, { id: '' })).toBe(false)
    })

    it('validates player:export-course-notes with empty courseId', async () => {
      const handler = registeredHandlers.get('player:export-course-notes')!
      expect(handler).toBeDefined()

      expect(await handler({}, { courseId: '' })).toBe('')
    })
  })

  describe('4. Vault & Settings IPC Handlers Validation', () => {
    beforeEach(() => {
      registerVaultIpc()
      registerSettingsIpc()
    })

    it('validates vault:create with empty path', async () => {
      const handler = registeredHandlers.get('vault:create')!
      expect(handler).toBeDefined()

      const res = await handler({}, { path: '', name: 'Test' })
      expect(res).toEqual({
        success: false,
        error: 'Path is required and must be a valid directory path.'
      })
    })

    it('validates vault:open with empty path', async () => {
      const handler = registeredHandlers.get('vault:open')!
      expect(handler).toBeDefined()

      const res = await handler({}, { path: '   ' })
      expect(res).toEqual({
        success: false,
        error: 'Path is required and must be a valid directory path.'
      })
    })

    it('opens only registered non-link content files', async () => {
      const handler = registeredHandlers.get('system:open-path')!
      expect(handler).toBeDefined()

      const registeredPdf = path.join(TEST_TMP_DIR, 'manual.pdf')
      const registeredLink = path.join(TEST_TMP_DIR, 'shortcut.lnk')
      const unregisteredPdf = path.join(TEST_TMP_DIR, 'private.pdf')
      fs.writeFileSync(registeredPdf, 'pdf')
      fs.writeFileSync(registeredLink, 'shortcut')
      fs.writeFileSync(unregisteredPdf, 'private')

      databaseService.connect(TEST_TMP_DIR)
      const db = databaseService.getDatabase()!
      const insertCourse = db.prepare(`
        INSERT INTO courses (id, title, slug, source_type, root_path, cover_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      insertCourse.run(
        'course-open-pdf',
        'Open PDF',
        'open-pdf',
        'local-vault',
        TEST_TMP_DIR,
        registeredPdf,
        1,
        1
      )
      insertCourse.run(
        'course-open-link',
        'Open Link',
        'open-link',
        'local-vault',
        TEST_TMP_DIR,
        registeredLink,
        1,
        1
      )

      await expect(handler({}, registeredPdf)).resolves.toBe(true)
      await expect(handler({}, registeredLink)).resolves.toBe(false)
      await expect(handler({}, unregisteredPdf)).resolves.toBe(false)
    })
  })
})
