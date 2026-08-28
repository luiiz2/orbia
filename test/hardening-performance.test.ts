import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { DatabaseService } from '../src/main/services/database.service'
import { HybridRetrievalService } from '../src/main/services/retrieval/hybrid-retrieval.service'
import { LibrarySearchService } from '../src/main/services/search/library-search.service'
import { chunkSemanticDocument } from '../src/main/services/semantic-index/semantic-chunker'
import { SemanticIndexRepository } from '../src/main/services/semantic-index/semantic-index-repository.service'
import type { Course, Lesson, Module } from '../src/types/course'
import type { ExtractedSemanticDocument } from '../src/types/semantic-index'

describe('Orbia v0.9 hardening performance benchmarks', () => {
  let database: DatabaseService
  let repository: SemanticIndexRepository
  let tempVaultDir: string

  beforeEach(() => {
    tempVaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-perf-test-'))
    database = new DatabaseService()
    database.connect(tempVaultDir)
    repository = new SemanticIndexRepository(database)
  })

  afterEach(() => {
    database.close()
    fs.rmSync(tempVaultDir, { recursive: true, force: true })
  })

  it('measures 100 and 500 courses with 5,000 lessons using bounded database queries', () => {
    const rawDb = database.getDatabase()!
    const heapBefore = process.memoryUsage().heapUsed

    const seed100Started = performance.now()
    seedCatalog(rawDb, 1, 100)
    const seed100Ms = performance.now() - seed100Started

    const fetch100Started = performance.now()
    expect(database.getAllCourses()).toHaveLength(100)
    const fetch100Ms = performance.now() - fetch100Started

    const seed500Started = performance.now()
    seedCatalog(rawDb, 101, 400)
    const seed500Ms = performance.now() - seed500Started

    const fetch500Started = performance.now()
    expect(database.getAllCourses()).toHaveLength(500)
    const fetch500Ms = performance.now() - fetch500Started

    const searchStarted = performance.now()
    const results = database.searchGlobal('Optimizing Architecture')
    const lexicalSearchMs = performance.now() - searchStarted
    expect(results.length).toBeGreaterThan(0)

    rawDb.pragma('wal_checkpoint(TRUNCATE)')
    const databaseSizeBytes = fs.statSync(
      path.join(tempVaultDir, '.orbia', 'library.db')
    ).size
    const heapDeltaBytes = Math.max(
      0,
      process.memoryUsage().heapUsed - heapBefore
    )
    console.info(
      '[v0.9 benchmark catalog]',
      JSON.stringify({
        seed100Ms: rounded(seed100Ms),
        fetch100Ms: rounded(fetch100Ms),
        seedAdditional400Ms: rounded(seed500Ms),
        fetch500Ms: rounded(fetch500Ms),
        lexicalSearchMs: rounded(lexicalSearchMs),
        heapDeltaBytes,
        databaseSizeBytes
      })
    )

    expect(seed100Ms).toBeLessThan(5_000)
    expect(seed500Ms).toBeLessThan(15_000)
    expect(fetch100Ms).toBeLessThan(1_000)
    expect(fetch500Ms).toBeLessThan(1_500)
    expect(lexicalSearchMs).toBeLessThan(2_000)
    expect(heapDeltaBytes).toBeLessThan(256 * 1024 * 1024)
    expect(databaseSizeBytes).toBeLessThan(128 * 1024 * 1024)
  })

  it('measures a large transcript and 2,000-vector semantic index without full-index navigation reads', async () => {
    const rawDb = database.getDatabase()!
    seedCatalog(rawDb, 1, 1)
    const heapBefore = process.memoryUsage().heapUsed

    const transcript: ExtractedSemanticDocument = {
      sourceKind: 'transcript',
      sourceId: 'transcript-large',
      courseId: 'c-bench-1',
      moduleId: 'm-bench-1-1',
      lessonId: 'l-bench-1-1-1',
      transcriptId: 'transcript-large',
      sourceRevision: 'revision-large',
      contentRevision: 'revision-large',
      dataType: 'transcript',
      text: 'large transcript',
      locator: {},
      segments: Array.from({ length: 10_000 }, (_, sequence) => ({
        sequence,
        start: sequence * 2,
        end: sequence * 2 + 1.8,
        text: `Segment ${sequence} explains leader election and replicated logs.`
      }))
    }
    const chunkingStarted = performance.now()
    const transcriptChunks = chunkSemanticDocument(transcript)
    const chunkingMs = performance.now() - chunkingStarted
    expect(transcriptChunks.length).toBeGreaterThan(100)

    const dimensions = 32
    const generation = repository.createGeneration({
      totalSources: 1,
      providerId: 'openai-compatible',
      modelId: 'local-embed',
      dimensions
    })
    const vector = Buffer.from(
      new Float32Array(
        Array.from({ length: dimensions }, (_, index) => (index === 0 ? 1 : 0))
      ).buffer
    )
    const indexingStarted = performance.now()
    rawDb.transaction(() => {
      const insertChunk = rawDb.prepare(`
        INSERT INTO semantic_index_chunks (
          id, generation_id, source_kind, source_id, course_id, module_id,
          lesson_id, source_revision, content_revision, data_type, text,
          locator_json, start_time, end_time, created_at
        ) VALUES (?, ?, 'transcript', 'transcript-large', 'c-bench-1',
          'm-bench-1-1', 'l-bench-1-1-1', 'revision-large',
          'transcript-large:revision-1', 'transcript', ?, ?, ?, ?, ?)
      `)
      const insertEmbedding = rawDb.prepare(`
        INSERT INTO semantic_index_embeddings (
          chunk_id, provider_id, model_id, dimensions, vector
        ) VALUES (?, 'openai-compatible', 'local-embed', ?, ?)
      `)
      for (let index = 0; index < 2_000; index += 1) {
        const chunkId = `large-chunk-${String(index).padStart(4, '0')}`
        insertChunk.run(
          chunkId,
          generation.id,
          `Leader election and replicated logs segment ${index}.`,
          JSON.stringify({ startTime: index * 2, endTime: index * 2 + 1.8 }),
          index * 2,
          index * 2 + 1.8,
          Date.now()
        )
        insertEmbedding.run(chunkId, dimensions, vector)
      }
      rawDb
        .prepare(
          `
        UPDATE semantic_index_generations
        SET status = 'completed', completed_at = ?, discovered_sources = 1,
            extracted_chunks = 2000, embedded_chunks = 2000,
            indexed_chunks = 2000, is_current = 1
        WHERE id = ?
      `
        )
        .run(Date.now(), generation.id)
    })()
    const indexingMs = performance.now() - indexingStarted

    const aiCore = {
      embed: async () => ({
        providerId: 'openai-compatible' as const,
        modelId: 'local-embed',
        embeddings: [
          Array.from({ length: dimensions }, (_, index) =>
            index === 0 ? 1 : 0
          )
        ]
      })
    }
    const retrieval = new HybridRetrievalService({ repository, aiCore })
    const retrievalStarted = performance.now()
    const retrievalResult = await retrieval.retrieve({
      query: 'leader election replicated logs',
      scope: { type: 'course', courseId: 'c-bench-1' },
      limit: 8
    })
    const retrievalMs = performance.now() - retrievalStarted

    const search = new LibrarySearchService({
      databaseService: database,
      repository,
      aiCore
    })
    const semanticSearchStarted = performance.now()
    const searchResult = await search.search({
      query: 'leader election replicated logs',
      mode: 'semantic',
      limit: 20
    })
    const semanticSearchMs = performance.now() - semanticSearchStarted

    rawDb.pragma('wal_checkpoint(TRUNCATE)')
    const databaseSizeBytes = fs.statSync(
      path.join(tempVaultDir, '.orbia', 'library.db')
    ).size
    const heapDeltaBytes = Math.max(
      0,
      process.memoryUsage().heapUsed - heapBefore
    )
    console.info(
      '[v0.9 benchmark semantic]',
      JSON.stringify({
        transcriptSegments: transcript.segments?.length ?? 0,
        transcriptChunks: transcriptChunks.length,
        chunkingMs: rounded(chunkingMs),
        indexedChunks: 2_000,
        indexingMs: rounded(indexingMs),
        retrievalMs: rounded(retrievalMs),
        semanticSearchMs: rounded(semanticSearchMs),
        heapDeltaBytes,
        databaseSizeBytes
      })
    )

    expect(retrievalResult.sources).toHaveLength(8)
    expect(searchResult.results).toHaveLength(20)
    expect(chunkingMs).toBeLessThan(3_000)
    expect(indexingMs).toBeLessThan(10_000)
    expect(retrievalMs).toBeLessThan(3_000)
    expect(semanticSearchMs).toBeLessThan(3_000)
    expect(heapDeltaBytes).toBeLessThan(256 * 1024 * 1024)
    expect(databaseSizeBytes).toBeLessThan(128 * 1024 * 1024)
  })
})

function seedCatalog(
  rawDb: Database.Database,
  startCourse: number,
  courseCount: number
): void {
  rawDb.transaction(() => {
    const insertCourse = rawDb.prepare(`
      INSERT INTO courses (
        id, title, slug, source_type, root_path, description, total_duration,
        module_count, lesson_count, is_favorite, created_at, updated_at
      ) VALUES (?, ?, ?, 'folder', ?, ?, ?, 2, 10, ?, ?, ?)
    `)
    const insertModule = rawDb.prepare(`
      INSERT INTO modules (
        id, course_id, title, order_index, folder_path, duration,
        lesson_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 5, ?)
    `)
    const insertLesson = rawDb.prepare(`
      INSERT INTO lessons (
        id, module_id, course_id, title, order_index, file_path, file_name,
        file_extension, media_type, duration, file_size, availability, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, '.mp4', 'video', 1800,
        200000000, 'available', ?)
    `)
    for (let offset = 0; offset < courseCount; offset += 1) {
      const courseNumber = startCourse + offset
      const courseId = `c-bench-${courseNumber}`
      const now = Date.now()
      const course: Pick<Course, 'title' | 'slug'> = {
        title: `Full Stack Engineering Masterclass ${courseNumber}`,
        slug: `full-stack-engineering-masterclass-${courseNumber}`
      }
      insertCourse.run(
        courseId,
        course.title,
        course.slug,
        `/vault/courses/course_${courseNumber}`,
        `Course ${courseNumber} covering distributed systems and React`,
        18_000,
        courseNumber % 10 === 0 ? 1 : 0,
        now,
        now
      )
      for (let moduleNumber = 1; moduleNumber <= 2; moduleNumber += 1) {
        const moduleId = `m-bench-${courseNumber}-${moduleNumber}`
        const module: Pick<Module, 'title' | 'orderIndex'> = {
          title: `Module ${moduleNumber}: Advanced Concepts`,
          orderIndex: moduleNumber - 1
        }
        insertModule.run(
          moduleId,
          courseId,
          module.title,
          module.orderIndex,
          `/vault/courses/course_${courseNumber}/mod_${moduleNumber}`,
          9_000,
          now
        )
        for (let lessonNumber = 1; lessonNumber <= 5; lessonNumber += 1) {
          const lessonId = `l-bench-${courseNumber}-${moduleNumber}-${lessonNumber}`
          const lesson: Pick<Lesson, 'title' | 'orderIndex'> = {
            title: `Lesson ${lessonNumber}: Optimizing Architecture Part ${lessonNumber}`,
            orderIndex: lessonNumber - 1
          }
          insertLesson.run(
            lessonId,
            moduleId,
            courseId,
            lesson.title,
            lesson.orderIndex,
            `/vault/courses/course_${courseNumber}/mod_${moduleNumber}/lesson_${lessonNumber}.mp4`,
            `lesson_${lessonNumber}.mp4`,
            now
          )
        }
      }
    }
  })()
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100
}
