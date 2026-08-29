import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DatabaseService } from '../src/main/services/database.service'
import { ChatRepository } from '../src/main/services/chat/chat-repository.service'
import { SourceNavigationService } from '../src/main/services/chat/source-navigation.service'
import type { Course, Module, Lesson } from '../src/types/course'
import type { ChatMessageSource } from '../src/types/grounded-chat'

describe('Orbia v0.9 Hardening - Source Grounding & Navigation Security', () => {
  let dbService: DatabaseService
  let chatRepo: ChatRepository
  let navService: SourceNavigationService
  let tempVaultDir: string

  const testCourse: Course = {
    id: 'course-real-1',
    title: 'Grounded React Mastery',
    slug: 'grounded-react-mastery',
    sourceType: 'folder',
    rootPath: '/courses/react',
    description: '',
    totalDuration: 1200,
    moduleCount: 1,
    lessonCount: 1,
    isFavorite: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  const testModule: Module = {
    id: 'module-real-1',
    courseId: 'course-real-1',
    title: 'Hooks Architecture',
    orderIndex: 0,
    folderPath: '/courses/react/m1',
    duration: 1200,
    lessonCount: 1,
    createdAt: Date.now()
  }

  const testLesson: Lesson = {
    id: 'lesson-real-1',
    moduleId: 'module-real-1',
    courseId: 'course-real-1',
    title: 'Custom Hooks Deep Dive',
    orderIndex: 0,
    filePath: '/courses/react/m1/lesson1.mp4',
    fileName: 'lesson1.mp4',
    fileExtension: '.mp4',
    mediaType: 'video',
    duration: 1200,
    fileSize: 50_000_000,
    availability: 'available',
    createdAt: Date.now()
  }

  beforeEach(() => {
    tempVaultDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'orbia-grounding-test-')
    )
    dbService = new DatabaseService()
    dbService.connect(tempVaultDir)
    dbService.saveCourseWithHierarchy(testCourse, [
      { ...testModule, lessons: [testLesson] }
    ])

    chatRepo = new ChatRepository(dbService)
    navService = new SourceNavigationService({
      databaseService: dbService,
      chatRepository: chatRepo
    })
  })

  afterEach(() => {
    dbService.close()
    try {
      fs.rmSync(tempVaultDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  function insertSource(source: {
    id: string
    courseId: string
    moduleId?: string
    lessonId?: string
    transcriptId?: string
    resourceId?: string
    noteId?: string
    sourceKind: string
    locator: Record<string, unknown>
  }): void {
    const rawDb = (dbService as any).db
    rawDb
      .prepare(
        `
      INSERT OR IGNORE INTO chat_conversations (id, title, created_at, updated_at)
      VALUES ('conv-1', 'Test Conv', ${Date.now()}, ${Date.now()})
    `
      )
      .run()
    rawDb
      .prepare(
        `
      INSERT OR IGNORE INTO chat_messages (id, conversation_id, role, content, status, created_at)
      VALUES ('msg-1', 'conv-1', 'assistant', 'Answer', 'answered', ${Date.now()})
    `
      )
      .run()
    rawDb
      .prepare(
        `
      INSERT INTO chat_message_sources (
        id, message_id, ordinal, chunk_id, source_kind, source_id, course_id,
        module_id, lesson_id, resource_id, transcript_id, note_id, source_revision,
        locator_json, display_label, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        source.id,
        'msg-1',
        0,
        'chk-1',
        source.sourceKind,
        source.id,
        source.courseId,
        source.moduleId || null,
        source.lessonId || null,
        source.resourceId || null,
        source.transcriptId || null,
        source.noteId || null,
        'rev1',
        JSON.stringify(source.locator),
        'Display Label',
        Date.now()
      )
  }

  it('Resolves valid lesson transcript source with bounded timestamp', () => {
    const rawDb = (dbService as any).db
    rawDb
      .prepare(
        `
      INSERT INTO transcripts (id, lesson_id, version, language, provider, model, created_at, source_revision, settings_json, status, is_current)
      VALUES ('tr-1', 'lesson-real-1', 1, 'pt', 'whisper', 'small', ${Date.now()}, 'rev1', '{}', 'completed', 1)
    `
      )
      .run()

    insertSource({
      id: 'src-valid-1',
      sourceKind: 'transcript',
      courseId: 'course-real-1',
      moduleId: 'module-real-1',
      lessonId: 'lesson-real-1',
      transcriptId: 'tr-1',
      locator: { startTime: 150, endTime: 200 }
    })

    const result = navService.resolve({ sourceId: 'src-valid-1' })
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.target.type).toBe('lesson')
      expect(result.target.courseId).toBe('course-real-1')
      expect(result.target.lessonId).toBe('lesson-real-1')
      expect(result.target.timestampSeconds).toBe(150)
    }
  })

  it('Rejects fabricated/non-existent source IDs', () => {
    const result = navService.resolve({ sourceId: 'non-existent-source-id' })
    expect(result.status).toBe('unavailable')
    expect(result.reason).toContain('Source record is unavailable')
  })

  it('Rejects hallucinated course IDs', () => {
    insertSource({
      id: 'src-fake-course',
      sourceKind: 'transcript',
      courseId: 'course-fake-999',
      lessonId: 'lesson-real-1',
      locator: { startSeconds: 50 }
    })

    const result = navService.resolve({ sourceId: 'src-fake-course' })
    expect(result.status).toBe('unavailable')
    expect(result.reason).toContain('Course is unavailable')
  })

  it('Rejects hallucinated lesson IDs that do not belong to course', () => {
    insertSource({
      id: 'src-fake-lesson',
      sourceKind: 'transcript',
      courseId: 'course-real-1',
      lessonId: 'lesson-fake-999',
      locator: { startSeconds: 50 }
    })

    const result = navService.resolve({ sourceId: 'src-fake-lesson' })
    expect(result.status).toBe('unavailable')
    expect(result.reason).toContain('Lesson ownership is invalid')
  })

  it('Rejects out-of-bounds timestamps exceeding lesson duration', () => {
    insertSource({
      id: 'src-oob-timestamp',
      sourceKind: 'transcript',
      courseId: 'course-real-1',
      lessonId: 'lesson-real-1',
      locator: { startSeconds: 99_999 } // Exceeds 1200s duration
    })

    const result = navService.resolve({ sourceId: 'src-oob-timestamp' })
    expect(result.status).toBe('unavailable')
    expect(result.reason).toContain('Transcript locator is invalid')
  })
})
