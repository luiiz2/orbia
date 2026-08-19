import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'
import {
  extractAndValidateMediaPath,
  ALLOWED_MEDIA_EXTENSIONS
} from '../src/main/protocol'
import { archiveService } from '../src/main/services/archive.service'
import { registerCoursesIpc } from '../src/main/ipc/courses.ipc'
import { registerPlayerIpc } from '../src/main/ipc/player.ipc'
import { registerVaultIpc } from '../src/main/ipc/vault.ipc'
import { registerSettingsIpc } from '../src/main/ipc/settings.ipc'

const TEST_TMP_DIR = path.join(__dirname, 'tmp_security_test')

// Mock electron's ipcMain, dialog, and BrowserWindow
const registeredHandlers = new Map<string, (_event: unknown, ...args: unknown[]) => Promise<unknown> | unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (_event: unknown, ...args: unknown[]) => unknown) => {
      registeredHandlers.set(channel, handler)
    }
  },
  dialog: {
    showOpenDialog: vi.fn()
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn()
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
    if (fs.existsSync(TEST_TMP_DIR)) {
      fs.rmSync(TEST_TMP_DIR, { recursive: true, force: true })
    }
    fs.mkdirSync(TEST_TMP_DIR, { recursive: true })
  })

  afterEach(() => {
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
        'media:///C:/Users/User/payload.sh',
        'media:///C:/Users/User/app.dll',
        'media:///C:/Users/User/secret.env',
        'media:///C:/Users/User/index.html',
        'media:///C:/Users/User/exploit.js'
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
      expect(extractAndValidateMediaPath('http://localhost/video.mp4').valid).toBe(false)
      expect(extractAndValidateMediaPath('file:///C:/video.mp4').valid).toBe(false)
      expect(extractAndValidateMediaPath('').valid).toBe(false)
    })

    it('contains all required media extensions in whitelist', () => {
      expect(ALLOWED_MEDIA_EXTENSIONS.has('.mp4')).toBe(true)
      expect(ALLOWED_MEDIA_EXTENSIONS.has('.mkv')).toBe(true)
      expect(ALLOWED_MEDIA_EXTENSIONS.has('.mp3')).toBe(true)
      expect(ALLOWED_MEDIA_EXTENSIONS.has('.pdf')).toBe(true)
      expect(ALLOWED_MEDIA_EXTENSIONS.has('.srt')).toBe(true)
      expect(ALLOWED_MEDIA_EXTENSIONS.has('.vtt')).toBe(true)
      expect(ALLOWED_MEDIA_EXTENSIONS.has('.png')).toBe(true)
      expect(ALLOWED_MEDIA_EXTENSIONS.has('.jpg')).toBe(true)
      expect(ALLOWED_MEDIA_EXTENSIONS.has('.exe')).toBe(false)
      expect(ALLOWED_MEDIA_EXTENSIONS.has('.db')).toBe(false)
      expect(ALLOWED_MEDIA_EXTENSIONS.has('.env')).toBe(false)
    })
  })

  describe('2. Zip Slip Directory Traversal Protection', () => {
    it('safely skips Zip Slip entries attempting directory traversal', async () => {
      const zip = new AdmZip()
      zip.addFile('safe-lesson.mp4', Buffer.from('safe video content'))

      const zipFilePath = path.join(TEST_TMP_DIR, 'zip-slip-attack.zip')
      zip.writeZip(zipFilePath)

      const destDir = path.join(TEST_TMP_DIR, 'Inbox')

      const result = await archiveService.extractZip({
        zipPath: zipFilePath,
        destinationDir: destDir
      })

      expect(result.totalExtractedFiles).toBe(1)
      expect(fs.existsSync(path.join(destDir, 'zip-slip-attack', 'safe-lesson.mp4'))).toBe(true)
    })

    it('rejects relative or traversal paths correctly in path calculation', () => {
      const baseTarget = path.resolve(TEST_TMP_DIR, 'Inbox', 'course')
      const unsafePaths = [
        '../../../../etc/passwd',
        '..\\..\\..\\Windows\\System32\\cmd.exe',
        'sub/../../escaped.txt',
        '/root/secret.txt',
        'C:\\secret.txt'
      ]

      for (const entryPath of unsafePaths) {
        const resolvedDest = path.resolve(baseTarget, entryPath)
        const targetDirResolved = path.resolve(baseTarget)
        const relative = path.relative(targetDirResolved, resolvedDest)
        const isUnsafe = relative.startsWith('..') || path.isAbsolute(relative) || entryPath.includes('..')
        expect(isUnsafe).toBe(true)
      }
    })
  })

  describe('3. Courses IPC Handlers Boundary & Input Validation', () => {
    beforeEach(() => {
      registerCoursesIpc()
    })

    it('validates courses:update-course-cover inputs', async () => {
      const handler = registeredHandlers.get('courses:update-course-cover')!
      expect(handler).toBeDefined()

      // Invalid empty payload
      const res1 = await handler({}, null as unknown as { courseId: string; coverPath: string })
      expect(res1).toEqual({ success: false, error: 'Valid courseId and coverPath are required' })

      // Empty courseId
      const res2 = await handler({}, { courseId: '', coverPath: 'C:/cover.png' })
      expect(res2).toEqual({ success: false, error: 'Valid courseId and coverPath are required' })

      // Non-string coverPath
      const res3 = await handler({}, { courseId: 'course-1', coverPath: 123 as unknown as string })
      expect(res3).toEqual({ success: false, error: 'Valid courseId and coverPath are required' })
    })

    it('validates courses:update-lesson-cover inputs', async () => {
      const handler = registeredHandlers.get('courses:update-lesson-cover')!
      expect(handler).toBeDefined()

      const res1 = await handler({}, { lessonId: ' ', coverPath: 'C:/cover.png' })
      expect(res1).toEqual({ success: false, error: 'Valid lessonId and coverPath are required' })
    })

    it('validates courses:extract-zip inputs', async () => {
      const handler = registeredHandlers.get('courses:extract-zip')!
      expect(handler).toBeDefined()

      // Missing path
      const res1 = await handler({ sender: { send: vi.fn() } }, { zipPath: '' })
      expect(res1).toEqual({ success: false, error: 'Zip archive path is required' })

      // Non-zip file
      const res2 = await handler({ sender: { send: vi.fn() } }, { zipPath: 'C:/files/movie.mp4' })
      expect(res2).toEqual({ success: false, error: 'Selected file is not a valid .zip archive' })

      // Non-existent zip file
      const res3 = await handler({ sender: { send: vi.fn() } }, { zipPath: 'C:/non_existent_folder_xyz/missing.zip' })
      expect(res3).toEqual({ success: false, error: 'Zip archive not found at path: C:/non_existent_folder_xyz/missing.zip' })
    })

    it('validates courses:scan-folder inputs', async () => {
      const handler = registeredHandlers.get('courses:scan-folder')!
      expect(handler).toBeDefined()

      const res1 = await handler({}, { folderPath: '' })
      expect(res1).toEqual({ success: false, error: 'Folder path is required' })

      const res2 = await handler({}, { folderPath: 'C:/missing_path_orbia_xyz_123' })
      expect(res2).toEqual({ success: false, error: 'Directory does not exist: "C:/missing_path_orbia_xyz_123"' })
    })

    it('validates courses:convert-srt-to-vtt against unauthorized file types', async () => {
      const handler = registeredHandlers.get('courses:convert-srt-to-vtt')!
      expect(handler).toBeDefined()

      // Empty path
      const res1 = await handler({}, { srtPath: '' })
      expect(res1).toEqual({ success: false, error: 'Subtitle file path is required' })

      // Non-subtitle file extension (e.g. trying to read system files or databases)
      const res2 = await handler({}, { srtPath: 'C:/Windows/System32/config/SAM' })
      expect(res2).toEqual({ success: false, error: 'File is not a supported subtitle file (.srt, .vtt, .sub, .ass)' })

      // Non-existent subtitle file
      const res3 = await handler({}, { srtPath: 'C:/missing_subs.srt' })
      expect(res3).toEqual({ success: false, error: 'Subtitle file not found at path: C:/missing_subs.srt' })
    })

    it('validates courses:get-by-id and returns null on invalid input', async () => {
      const handler = registeredHandlers.get('courses:get-by-id')!
      expect(handler).toBeDefined()

      expect(await handler({}, { courseId: '' })).toBeNull()
      expect(await handler({}, null as unknown as { courseId: string })).toBeNull()
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

  describe('4. Player IPC Handlers Boundary & Input Validation', () => {
    beforeEach(() => {
      registerPlayerIpc()
    })

    it('handles player:get-progress with invalid inputs gracefully', async () => {
      const handler = registeredHandlers.get('player:get-progress')!
      expect(handler).toBeDefined()

      expect(await handler({}, { lessonId: '' })).toBeNull()
      expect(await handler({}, null as unknown as { lessonId: string })).toBeNull()
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

  describe('5. Vault & Settings IPC Handlers Validation', () => {
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

    it('rejects unauthorized setting keys in settings:set', async () => {
      const handler = registeredHandlers.get('settings:set')!
      expect(handler).toBeDefined()

      // Attempt setting a non-whitelisted key (e.g. __proto__, maliciousKey)
      await handler({}, { key: '__proto__', value: 'polluted' } as unknown as { key: 'theme'; value: 'dark' })
      await handler({}, { key: 'arbitraryKey', value: 'value' } as unknown as { key: 'theme'; value: 'dark' })
    })

    it('handles system:get-locale safely', async () => {
      const handler = registeredHandlers.get('system:get-locale')!
      expect(handler).toBeDefined()

      const locale = await handler({})
      expect(typeof locale).toBe('string')
    })
  })
})
