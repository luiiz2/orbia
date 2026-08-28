import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DatabaseService } from '../src/main/services/database.service'
import { AiStorageService } from '../src/main/services/ai/ai-storage.service'
import { AiUsageService } from '../src/main/services/ai/ai-usage.service'
import type { Course, Module, Lesson } from '../src/types/course'

describe('Orbia v0.9 Hardening - AI Storage Management & Local Usage', () => {
  let dbService: DatabaseService
  let storageService: AiStorageService
  let usageService: AiUsageService
  let tempVaultDir: string

  const testCourse: Course = {
    id: 'c-test-1',
    title: 'Storage & Usage Test Course',
    slug: 'storage-usage-test',
    sourceType: 'folder',
    rootPath: '/courses/test',
    description: '',
    totalDuration: 600,
    moduleCount: 1,
    lessonCount: 1,
    isFavorite: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  const testModule: Module = {
    id: 'm-test-1',
    courseId: 'c-test-1',
    title: 'Module 1',
    orderIndex: 0,
    folderPath: '/courses/test/m1',
    duration: 600,
    lessonCount: 1,
    createdAt: Date.now()
  }

  const testLesson: Lesson = {
    id: 'l-test-1',
    moduleId: 'm-test-1',
    courseId: 'c-test-1',
    title: 'Lesson 1',
    orderIndex: 0,
    filePath: '/courses/test/m1/lesson1.mp4',
    fileName: 'lesson1.mp4',
    fileExtension: '.mp4',
    mediaType: 'video',
    duration: 600,
    fileSize: 10_000_000,
    availability: 'available',
    createdAt: Date.now()
  }

  beforeEach(() => {
    tempVaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-storage-test-'))
    dbService = new DatabaseService()
    dbService.connect(tempVaultDir)
    dbService.saveCourseWithHierarchy(testCourse, [
      { ...testModule, lessons: [testLesson] }
    ])

    storageService = new AiStorageService({ db: dbService })
    usageService = new AiUsageService({ db: dbService })
  })

  afterEach(() => {
    dbService.close()
    try {
      fs.rmSync(tempVaultDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('Calculates AI storage breakdown and clears categories independently without touching courses/lessons', async () => {
    const rawDb = (dbService as any).db

    // Insert sample summary
    dbService.upsertAiSummary({
      scopeType: 'lesson',
      courseId: 'c-test-1',
      moduleId: 'm-test-1',
      lessonId: 'l-test-1',
      title: 'Lesson Summary',
      overview: 'Summary overview content.',
      keyConcepts: ['Hooks'],
      topicsCovered: ['State'],
      importantDetails: ['Details'],
      timestamps: [],
      fullMarkdown: '# Summary Markdown',
      providerId: 'ollama',
      modelId: 'llama3',
      templateVersion: 'v1.0',
      sourceRevision: 'rev1',
      isStale: false
    })

    // Insert sample transcript
    rawDb
      .prepare(
        `
      INSERT INTO transcripts (id, lesson_id, version, language, provider, model, created_at, source_revision, settings_json, status, is_current)
      VALUES ('tr-1', 'l-test-1', 1, 'pt', 'whisper', 'base', ${Date.now()}, 'rev1', '{}', 'completed', 1);
    `
      )
      .run()
    rawDb
      .prepare(
        `
      INSERT INTO transcript_segments (id, transcript_id, sequence, start_time, end_time, text)
      VALUES ('seg-1', 'tr-1', 0, 0, 10, 'Hello world transcript text.');
    `
      )
      .run()

    rawDb
      .prepare(
        `
      INSERT INTO semantic_index_generations (
        id, status, provider_id, model_id, dimensions, chunking_version,
        created_at, completed_at, total_sources, discovered_sources,
        extracted_chunks, embedded_chunks, indexed_chunks, is_current
      ) VALUES ('gen-1', 'completed', 'ollama', 'nomic-embed-text', 3, 'v1', ?, ?, 1, 1, 1, 1, 1, 1)
    `
      )
      .run(Date.now(), Date.now())
    rawDb
      .prepare(
        `
      INSERT INTO semantic_index_chunks (
        id, generation_id, source_kind, source_id, course_id, module_id, lesson_id,
        source_revision, content_revision, data_type, text, locator_json, created_at
      ) VALUES ('chunk-1', 'gen-1', 'transcript', 'tr-1', 'c-test-1', 'm-test-1',
        'l-test-1', 'rev1', 'rev1', 'transcript', 'Indexed transcript text.', '{}', ?)
    `
      )
      .run(Date.now())
    rawDb
      .prepare(
        `
      INSERT INTO semantic_index_embeddings (chunk_id, provider_id, model_id, dimensions, vector)
      VALUES ('chunk-1', 'ollama', 'nomic-embed-text', 3, ?)
    `
      )
      .run(Buffer.from(new Float32Array([1, 0, 0]).buffer))

    const initialStats = await storageService.getStorageStats()
    expect(initialStats.categories.summaries.itemCount).toBe(1)
    expect(initialStats.categories.summaries.sizeBytes).toBeGreaterThan(0)
    expect(initialStats.categories.transcripts.itemCount).toBe(1)
    expect(initialStats.categories.transcripts.sizeBytes).toBeGreaterThan(0)
    expect(initialStats.categories.semanticIndex.itemCount).toBe(1)
    expect(initialStats.categories.semanticIndex.sizeBytes).toBeGreaterThan(0)
    expect(initialStats.totalSizeBytes).toBeGreaterThan(0)

    // Clear only summaries
    const clearResult = await storageService.clearCategory('summaries')
    expect(clearResult).toBe(true)

    const statsAfterSummaryClear = await storageService.getStorageStats()
    expect(statsAfterSummaryClear.categories.summaries.itemCount).toBe(0)
    expect(statsAfterSummaryClear.categories.summaries.sizeBytes).toBe(0)
    expect(statsAfterSummaryClear.categories.transcripts.itemCount).toBe(1)

    expect(await storageService.clearCategory('semanticIndex')).toBe(true)
    const statsAfterIndexClear = await storageService.getStorageStats()
    expect(statsAfterIndexClear.categories.semanticIndex.itemCount).toBe(0)
    expect(statsAfterIndexClear.categories.semanticIndex.sizeBytes).toBe(0)
    expect(statsAfterIndexClear.categories.transcripts.itemCount).toBe(1)

    // Verify course and lesson remain 100% untouched
    const courses = dbService.getAllCourses()
    expect(courses).toHaveLength(1)
    expect(courses[0].id).toBe('c-test-1')
    const lesson = dbService.getLessonById('l-test-1')
    expect(lesson).not.toBeNull()
  })

  it('Records local AI usage metrics with zero telemetry and allows resetting', () => {
    usageService.recordUsage({
      promptTokens: 150,
      completionTokens: 80,
      transcriptionSeconds: 120.5,
      embeddedChunks: 4
    })

    usageService.recordUsage({
      promptTokens: 50,
      completionTokens: 30
    })

    const usage = usageService.getUsageStats()
    expect(usage.totalRequests).toBe(2)
    expect(usage.totalPromptTokens).toBe(200)
    expect(usage.totalCompletionTokens).toBe(110)
    expect(usage.totalTranscriptionSeconds).toBe(120.5)
    expect(usage.totalEmbeddedChunks).toBe(4)
    expect(usage.lastActivityAt).toBeDefined()

    // Reset usage counters
    expect(usageService.resetUsageStats()).toBe(true)
    const resetStats = usageService.getUsageStats()
    expect(resetStats.totalRequests).toBe(0)
    expect(resetStats.totalPromptTokens).toBe(0)
    expect(resetStats.totalCompletionTokens).toBe(0)
  })
})
