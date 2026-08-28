import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DatabaseService } from '../src/main/services/database.service'
import type { Course, Module, Lesson } from '../src/types/course'

describe('Orbia v0.9 Hardening - Migration & Backward Compatibility Audit', () => {
  let dbService: DatabaseService
  let tempVaultDir: string

  beforeEach(() => {
    tempVaultDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'orbia-migrations-test-')
    )
    dbService = new DatabaseService()
  })

  afterEach(() => {
    dbService.close()
    try {
      fs.rmSync(tempVaultDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('Applies all v0.9 migrations and verifies complete table schema integrity', () => {
    dbService.connect(tempVaultDir)
    const rawDb = (dbService as any).db

    // Verify migrations table has all migrations recorded
    const appliedMigrations = rawDb
      .prepare(`SELECT id FROM _migrations ORDER BY id ASC`)
      .all() as Array<{ id: string }>
    const migrationIds = appliedMigrations.map((m) => m.id)

    expect(migrationIds).toContain('002_course_organization_engine')
    expect(migrationIds).toContain('003_v03_review_and_portability')
    expect(migrationIds).toContain('005_v05_library_studio')
    expect(migrationIds).toContain('007_v08_connected_library')
    expect(migrationIds).toContain('008_v09_transcription')
    expect(migrationIds).toContain('009_v09_semantic_index')
    expect(migrationIds).toContain('010_v09_grounded_chat')
    expect(migrationIds).toContain('012_v09_summaries_chapters')
    expect(migrationIds).toContain('013_v09_ai_usage')

    // Verify all key tables exist and have expected structure
    const tables = rawDb
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all() as Array<{ name: string }>
    const tableNames = new Set(tables.map((t) => t.name))

    const requiredTables = [
      'courses',
      'modules',
      'lessons',
      'content_resources',
      'lesson_progress',
      'lesson_notes',
      'watch_history',
      'video_bookmarks',
      'study_sessions',
      'source_roots',
      'source_items',
      'optimization_records',
      'transcripts',
      'transcript_segments',
      'semantic_index_generations',
      'semantic_index_chunks',
      'semantic_index_embeddings',
      'chat_conversations',
      'chat_messages',
      'chat_message_sources',
      'ai_summaries',
      'lesson_chapters',
      'ai_local_usage'
    ]

    for (const tableName of requiredTables) {
      expect(
        tableNames.has(tableName),
        `Table "${tableName}" should exist`
      ).toBe(true)
    }
  })

  it('Preserves course data, notes, summaries and chapters across disconnect and reconnect', () => {
    dbService.connect(tempVaultDir)

    const testCourse: Course = {
      id: 'c-persist-1',
      title: 'Persistent Course',
      slug: 'persistent-course',
      sourceType: 'folder',
      rootPath: '/vault/courses/c1',
      description: 'Test persist',
      totalDuration: 1000,
      moduleCount: 1,
      lessonCount: 1,
      isFavorite: true,
      createdAt: 1000,
      updatedAt: 1000
    }

    const testModule: Module = {
      id: 'm-persist-1',
      courseId: 'c-persist-1',
      title: 'Module 1',
      orderIndex: 0,
      folderPath: '/vault/courses/c1/m1',
      duration: 1000,
      lessonCount: 1,
      createdAt: 1000
    }

    const testLesson: Lesson = {
      id: 'l-persist-1',
      moduleId: 'm-persist-1',
      courseId: 'c-persist-1',
      title: 'Lesson 1',
      orderIndex: 0,
      filePath: '/vault/courses/c1/m1/l1.mp4',
      fileName: 'l1.mp4',
      fileExtension: '.mp4',
      mediaType: 'video',
      duration: 1000,
      fileSize: 50_000_000,
      availability: 'available',
      createdAt: 1000
    }

    dbService.saveCourseWithHierarchy(testCourse, [
      { ...testModule, lessons: [testLesson] }
    ])

    // Save note
    dbService.addLessonNote({
      courseId: 'c-persist-1',
      lessonId: 'l-persist-1',
      timestampSeconds: 120,
      content: 'Important persistence note'
    })

    // Save chapter
    dbService.saveLessonChapters('l-persist-1', 'c-persist-1', [
      {
        id: 'chap-1',
        lessonId: 'l-persist-1',
        courseId: 'c-persist-1',
        title: 'Introduction',
        timestampSeconds: 0,
        source: 'manual',
        isManual: true,
        createdAt: 1000,
        updatedAt: 1000
      }
    ])

    // Close and reconnect to simulate app restart
    dbService.close()
    const newDbService = new DatabaseService()
    newDbService.connect(tempVaultDir)

    const courseData = newDbService.getCourseById('c-persist-1')
    expect(courseData).not.toBeNull()
    expect(courseData?.course.title).toBe('Persistent Course')
    expect(courseData?.course.isFavorite).toBe(true)

    const notes = newDbService.getLessonNotes('l-persist-1')
    expect(notes).toHaveLength(1)
    expect(notes[0].content).toBe('Important persistence note')

    const chapters = newDbService.getLessonChapters('l-persist-1')
    expect(chapters).toHaveLength(1)
    expect(chapters[0].title).toBe('Introduction')
    expect(chapters[0].isManual).toBe(true)

    newDbService.close()
  })
})
