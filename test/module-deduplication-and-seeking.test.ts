import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { DatabaseService } from '../src/main/services/database.service'
import { ParserService } from '../src/main/services/parser.service'
import { setupMediaProtocol, type MediaPathAuthorizer } from '../src/main/protocol'
import type { Course, Module, Lesson } from '../src/types'
import type { ScannedDirectory } from '../src/main/services/scanner.service'

const state = vi.hoisted(() => ({
  handler: undefined as
    | undefined
    | ((request: { url: string; headers: Headers }) => Promise<Response>)
}))

vi.mock('electron', () => ({
  protocol: {
    registerSchemesAsPrivileged: vi.fn(),
    handle: vi.fn((_scheme: string, handler: (request: { url: string; headers: Headers }) => Promise<Response>) => {
      state.handler = handler
    })
  }
}))

vi.mock('../src/main/services/logger.service', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

describe('Module Deduplication & Video Range Seeking', () => {
  let tempDir: string
  let dbService: DatabaseService

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `orbia-test-dedup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
    fs.mkdirSync(tempDir, { recursive: true })
    dbService = new DatabaseService()
    dbService.connect(tempDir)
  })

  afterEach(() => {
    dbService.close()
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('merges duplicate modules with identical titles when parsing directory hierarchy', async () => {
    const parser = new ParserService()

    const scannedDir: ScannedDirectory = {
      name: 'Voss Academy Course',
      fullPath: path.join(tempDir, 'Voss Academy Course'),
      files: [],
      subDirectories: [
        {
          name: '01 - Modulo 1',
          fullPath: path.join(tempDir, 'Voss Academy Course', '01 - Modulo 1'),
          files: [
            {
              name: '01 - Aula 1.mp4',
              fullPath: path.join(tempDir, 'Voss Academy Course', '01 - Modulo 1', '01 - Aula 1.mp4'),
              extension: '.mp4',
              sizeBytes: 1000,
              isDirectory: false
            }
          ],
          subDirectories: []
        },
        {
          name: 'Modulo 1',
          fullPath: path.join(tempDir, 'Voss Academy Course', 'Modulo 1'),
          files: [
            {
              name: '02 - Aula 2.mp4',
              fullPath: path.join(tempDir, 'Voss Academy Course', 'Modulo 1', '02 - Aula 2.mp4'),
              extension: '.mp4',
              sizeBytes: 2000,
              isDirectory: false
            }
          ],
          subDirectories: []
        }
      ]
    }

    const proposal = await parser.parseCourseHierarchy(scannedDir)

    // Both folders resolve to the same module title ('01 - Modulo 1' / 'Modulo 1')
    // They must be merged into 1 module with 2 lessons, not 2 separate modules with the same name!
    expect(proposal.modules.length).toBe(1)
    expect(proposal.modules[0].lessons.length).toBe(2)
    expect(proposal.totalLessons).toBe(2)
  })

  it('merges duplicate modules with matching names inside SQLite database via cleanupDuplicateModules', () => {
    const course: Course = {
      id: 'course-dup-mod',
      title: 'Python Masterclass',
      slug: 'python-masterclass',
      sourceType: 'local-vault',
      rootPath: path.join(tempDir, 'Courses', 'Python Masterclass'),
      totalDuration: 400,
      moduleCount: 2,
      lessonCount: 2,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const moduleA: Module & { lessons: Lesson[] } = {
      id: 'mod-1',
      courseId: course.id,
      title: '01 - Introdução',
      orderIndex: 1,
      duration: 100,
      lessonCount: 1,
      createdAt: Date.now(),
      lessons: [
        {
          id: 'les-1',
          moduleId: 'mod-1',
          courseId: course.id,
          title: 'Aula 01',
          orderIndex: 1,
          filePath: path.join(course.rootPath, '01.mp4'),
          fileName: '01.mp4',
          fileExtension: '.mp4',
          mediaType: 'video',
          duration: 100,
          fileSize: 1000,
          createdAt: Date.now()
        }
      ]
    }

    const moduleB: Module & { lessons: Lesson[] } = {
      id: 'mod-2',
      courseId: course.id,
      title: '01 - Introdução', // Duplicate module title
      orderIndex: 2,
      duration: 300,
      lessonCount: 1,
      createdAt: Date.now(),
      lessons: [
        {
          id: 'les-2',
          moduleId: 'mod-2',
          courseId: course.id,
          title: 'Aula 02',
          orderIndex: 1,
          filePath: path.join(course.rootPath, '02.mp4'),
          fileName: '02.mp4',
          fileExtension: '.mp4',
          mediaType: 'video',
          duration: 300,
          fileSize: 3000,
          createdAt: Date.now()
        }
      ]
    }

    // Save with 2 duplicate module rows initially
    dbService.saveCourseWithHierarchy(course, [moduleA, moduleB])

    // Run cleanup
    dbService.cleanupDuplicateModules(course.id)

    const cleaned = dbService.getCourseById(course.id)
    expect(cleaned).not.toBeNull()
    expect(cleaned!.modules.length).toBe(1)
    expect(cleaned!.modules[0].title).toBe('01 - Introdução')
    expect(cleaned!.modules[0].lessons.length).toBe(2)
    expect(cleaned!.modules[0].lessons.map((l) => l.title)).toEqual(['Aula 01', 'Aula 02'])
  })

  it('merges 17 modules down to 2 when only "Lovable PRO - Rafa Voss" and "ClaudePRO - RafaVoss" are present', () => {
    const course: Course = {
      id: 'course-multi-dup',
      title: 'AI Dev Masterclass',
      slug: 'ai-dev-masterclass',
      sourceType: 'local-vault',
      rootPath: path.join(tempDir, 'Courses', 'AI Dev Masterclass'),
      totalDuration: 1700,
      moduleCount: 17,
      lessonCount: 17,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const titles = [
      'Lovable PRO - Rafa Voss',
      'ClaudePRO - RafaVoss',
      'Lovable PRO - Rafa Voss',
      'Lovable PRO - Rafa Voss',
      'Lovable PRO - Rafa Voss',
      'Lovable PRO - Rafa Voss',
      'Lovable PRO - Rafa Voss',
      'ClaudePRO - RafaVoss',
      'Lovable PRO - Rafa Voss',
      'Lovable PRO - Rafa Voss',
      'ClaudePRO - RafaVoss',
      'Lovable PRO - Rafa Voss',
      'Lovable PRO - Rafa Voss',
      'Lovable PRO - Rafa Voss',
      'Lovable PRO - Rafa Voss',
      'ClaudePRO - RafaVoss',
      'Lovable PRO - Rafa Voss'
    ]

    const modules: (Module & { lessons: Lesson[] })[] = titles.map((title, idx) => ({
      id: `mod-${idx + 1}`,
      courseId: course.id,
      title,
      orderIndex: idx + 1,
      duration: 100,
      lessonCount: 1,
      createdAt: Date.now() + idx,
      lessons: [
        {
          id: `les-${idx + 1}`,
          moduleId: `mod-${idx + 1}`,
          courseId: course.id,
          title: `Aula ${String(idx + 1).padStart(2, '0')} - ${title}`,
          orderIndex: 1,
          filePath: path.join(course.rootPath, `video_${idx + 1}.mp4`),
          fileName: `video_${idx + 1}.mp4`,
          fileExtension: '.mp4',
          mediaType: 'video',
          duration: 100,
          fileSize: 1000,
          createdAt: Date.now() + idx
        }
      ]
    }))

    // Save with duplicate modules — saveCourseWithHierarchy will automatically consolidate them!
    dbService.saveCourseWithHierarchy(course, modules)

    const result = dbService.getCourseById(course.id)
    expect(result).not.toBeNull()
    // 17 modules should be consolidated into exactly 2 modules!
    expect(result!.modules.length).toBe(2)

    const moduleTitles = result!.modules.map((m) => m.title)
    expect(moduleTitles).toContain('Lovable PRO - Rafa Voss')
    expect(moduleTitles).toContain('ClaudePRO - RafaVoss')

    // Total lessons across the 2 modules must still equal 17 (zero data loss)
    const totalLessons = result!.modules.reduce((sum, m) => sum + m.lessons.length, 0)
    expect(totalLessons).toBe(17)

    const lovableModule = result!.modules.find((m) => m.title === 'Lovable PRO - Rafa Voss')
    const claudeModule = result!.modules.find((m) => m.title === 'ClaudePRO - RafaVoss')

    expect(lovableModule).toBeDefined()
    expect(claudeModule).toBeDefined()
    expect(lovableModule!.lessons.length).toBe(13)
    expect(claudeModule!.lessons.length).toBe(4)

    // Lessons inside each module must be numbered 1..N sequentially
    lovableModule!.lessons.forEach((les, idx) => {
      expect(les.orderIndex).toBe(idx + 1)
      expect(les.moduleId).toBe(lovableModule!.id)
    })
    claudeModule!.lessons.forEach((les, idx) => {
      expect(les.orderIndex).toBe(idx + 1)
      expect(les.moduleId).toBe(claudeModule!.id)
    })
  })

  it('automatically self-heals duplicate modules on getCourseById', () => {
    const courseId = 'course-self-heal'
    // Manually insert duplicate modules directly in SQLite
    const db = (dbService as unknown as { db: import('better-sqlite3').Database }).db
    db.prepare(`
      INSERT INTO courses (id, title, slug, source_type, root_path, is_external, total_duration, module_count, lesson_count, is_favorite, created_at, updated_at)
      VALUES (?, 'Self Healing Course', 'self-healing', 'local-vault', 'C:/test', 0, 200, 2, 2, 0, 1000, 1000)
    `).run(courseId)

    db.prepare(`
      INSERT INTO modules (id, course_id, title, order_index, duration, lesson_count, created_at)
      VALUES ('mod-a', ?, 'Lovable PRO - Rafa Voss', 1, 100, 1, 1000)
    `).run(courseId)

    db.prepare(`
      INSERT INTO modules (id, course_id, title, order_index, duration, lesson_count, created_at)
      VALUES ('mod-b', ?, 'Lovable PRO - Rafa Voss', 2, 100, 1, 1000)
    `).run(courseId)

    db.prepare(`
      INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, availability, created_at)
      VALUES ('les-a', 'mod-a', ?, 'Aula 1', 1, 'C:/test/1.mp4', '1.mp4', 'mp4', 'video', 100, 500, 'local', 1000)
    `).run(courseId)

    db.prepare(`
      INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, availability, created_at)
      VALUES ('les-b', 'mod-b', ?, 'Aula 2', 1, 'C:/test/2.mp4', '2.mp4', 'mp4', 'video', 100, 500, 'local', 1000)
    `).run(courseId)

    // Querying getCourseById should detect the duplicate modules and self-heal automatically
    const hierarchy = dbService.getCourseById(courseId)
    expect(hierarchy).not.toBeNull()
    expect(hierarchy!.modules.length).toBe(1)
    expect(hierarchy!.modules[0].title).toBe('Lovable PRO - Rafa Voss')
    expect(hierarchy!.modules[0].lessons.length).toBe(2)
    expect(hierarchy!.modules[0].lessons.map((l) => l.title)).toEqual(['Aula 1', 'Aula 2'])
  })

  it('supports HTTP 206 Partial Content Range streaming with exact byte slices', async () => {
    const videoPath = path.join(tempDir, 'sample_video.mp4')
    const sampleBuffer = Buffer.from('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    fs.writeFileSync(videoPath, sampleBuffer)

    const authorizer: MediaPathAuthorizer = {
      isPathAuthorized: vi.fn().mockResolvedValue(true)
    }

    setupMediaProtocol({ authorizer })

    const toMediaUrl = (p: string) => `media://${encodeURI(p.replace(/\\/g, '/'))}`

    // Request byte range 10-19 (10 bytes: 'ABCDEFGHIJ')
    const response = await state.handler!({
      url: toMediaUrl(videoPath),
      headers: new Headers({ range: 'bytes=10-19' })
    })

    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe(`bytes 10-19/${sampleBuffer.length}`)
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(response.headers.get('Content-Length')).toBe('10')
    expect(response.headers.get('Content-Type')).toBe('video/mp4')

    const chunk = await response.text()
    expect(chunk).toBe('ABCDEFGHIJ')
  })
})
