import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseService } from '../src/main/services/database.service'
import { SemanticIndexRepository } from '../src/main/services/semantic-index/semantic-index-repository.service'
import { LibrarySearchService } from '../src/main/services/search/library-search.service'
import type { AiEmbeddingResponse } from '../src/types/ai'
import type { SemanticChunkDraft } from '../src/types/semantic-index'

describe('library search', () => {
  let tempDir: string
  let vaultDir: string
  let database: DatabaseService
  let repository: SemanticIndexRepository

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-library-search-'))
    vaultDir = path.join(tempDir, 'vault')
    fs.mkdirSync(vaultDir, { recursive: true })
    database = new DatabaseService()
    database.connect(vaultDir)
    seedLibrary(database, vaultDir)
    repository = new SemanticIndexRepository(database)
  })

  afterEach(() => {
    database.close()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('finds a semantic paraphrase and keeps the result deterministic', async () => {
    await seedCompletedIndex(repository, [
      chunk(
        'hooks',
        'transcript',
        'Hooks cannot be called conditionally.',
        { startTime: 31.42, endTime: 35.5 },
        [0, 1]
      ),
      chunk(
        'unrelated',
        'transcript',
        'This explains component styling.',
        { startTime: 4, endTime: 9 },
        [1, 0]
      )
    ])
    const aiCore = { embed: vi.fn().mockResolvedValue(embedding([0, 1])) }
    const service = new LibrarySearchService({
      databaseService: database,
      repository,
      aiCore
    })

    const result = await service.search({
      query:
        'the part where the teacher explains why hooks cannot be conditional',
      mode: 'semantic'
    })

    expect(result.semanticUsed).toBe(true)
    expect(result.results[0]).toMatchObject({
      type: 'transcript',
      title: 'Lesson 1',
      locator: { startTime: 31.42, endTime: 35.5 },
      navigation: {
        type: 'lesson',
        lessonId: 'lesson-1',
        timestampSeconds: 31.42
      }
    })
    expect(result.results[0]?.chunkId).toBe('hooks')
  })

  it('returns transcript timestamps, PDF pages and code line locations', async () => {
    await seedCompletedIndex(repository, [
      chunk(
        'transcript',
        'transcript',
        'Dependency injection in the lesson.',
        { startTime: 31.42, endTime: 32.2 },
        [1, 0]
      ),
      chunk(
        'pdf',
        'pdf',
        'Dependency injection on page two.',
        { page: 2 },
        [1, 0],
        'resource:pdf-1'
      ),
      chunk(
        'code',
        'code',
        'container.bind(Service).toConstantValue(instance)',
        { fileName: 'container.ts', startLine: 18, endLine: 18 },
        [1, 0],
        'resource:code-1'
      )
    ])
    const service = new LibrarySearchService({
      databaseService: database,
      repository,
      aiCore: { embed: vi.fn().mockResolvedValue(embedding([1, 0])) }
    })

    const result = await service.search({
      query: 'dependency injection',
      mode: 'semantic'
    })

    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'transcript',
          navigation: expect.objectContaining({ timestampSeconds: 31.42 })
        }),
        expect.objectContaining({
          type: 'pdf',
          navigation: expect.objectContaining({ page: 2, resourceId: 'pdf-1' })
        }),
        expect.objectContaining({
          type: 'code',
          navigation: expect.objectContaining({
            startLine: 18,
            endLine: 18,
            resourceId: 'code-1'
          })
        })
      ])
    )
    expect(result.groups.map((group) => group.type)).toEqual([
      'transcripts',
      'pdfs',
      'code'
    ])
  })

  it('applies course, module, content type and notes filters', async () => {
    await seedCompletedIndex(repository, [
      chunk(
        'pdf-course-1',
        'pdf',
        'Dependency injection PDF.',
        { page: 1 },
        [1, 0],
        'resource:pdf-1'
      ),
      chunk(
        'code-course-1',
        'code',
        'Dependency injection code.',
        { startLine: 4, endLine: 5 },
        [1, 0],
        'resource:code-1'
      ),
      chunk(
        'note-course-1',
        'note',
        'Dependency injection note.',
        { startTime: 5, endTime: 5 },
        [1, 0],
        'note:note-1'
      ),
      chunk(
        'pdf-course-2',
        'pdf',
        'Dependency injection other course.',
        { page: 1 },
        [1, 0],
        'resource:pdf-2',
        'course-2',
        'module-2',
        'lesson-2'
      )
    ])
    repository.setSettings({ includeNotes: true })
    const service = new LibrarySearchService({
      databaseService: database,
      repository,
      aiCore: { embed: vi.fn().mockResolvedValue(embedding([1, 0])) }
    })

    const result = await service.search({
      query: 'dependency injection',
      mode: 'semantic',
      filters: {
        courseId: 'course-1',
        moduleId: 'module-1',
        contentTypes: ['pdf', 'note'],
        includeNotes: true
      }
    })

    expect(result.results.map((item) => item.chunkId).sort()).toEqual([
      'note-course-1',
      'pdf-course-1'
    ])
  })

  it('reports no result and does not embed an incomplete index', async () => {
    const generation = repository.createGeneration({
      totalSources: 1,
      providerId: 'ollama',
      modelId: 'local-embed',
      dimensions: 2
    })
    repository.finalizeGeneration(generation.id, 'partial', true)
    const aiCore = { embed: vi.fn().mockResolvedValue(embedding([1, 0])) }
    const service = new LibrarySearchService({
      databaseService: database,
      repository,
      aiCore
    })

    const result = await service.search({
      query: 'not indexed',
      mode: 'semantic'
    })

    expect(result.results).toEqual([])
    expect(result.coverage.status).toBe('partial')
    expect(result.semanticUsed).toBe(false)
    expect(aiCore.embed).not.toHaveBeenCalled()
  })

  it('keeps lexical indexed results when the embedding provider is unavailable', async () => {
    await seedCompletedIndex(repository, [
      chunk(
        'lexical',
        'transcript',
        'Dependency injection is indexed locally.',
        { startTime: 10, endTime: 12 },
        [1, 0]
      )
    ])
    const aiCore = { embed: vi.fn().mockRejectedValue(new Error('offline')) }
    const service = new LibrarySearchService({
      databaseService: database,
      repository,
      aiCore
    })

    const result = await service.search({
      query: 'dependency injection',
      mode: 'hybrid'
    })

    expect(result.results).toHaveLength(1)
    expect(result.semanticUsed).toBe(false)
    expect(result.semanticUnavailable).toBe(true)
  })

  it('stays bounded without reading every stored chunk on a large semantic index', async () => {
    const chunks = Array.from({ length: 1_000 }, (_, index) =>
      chunk(
        'large-source',
        'transcript',
        `Indexed topic ${index}`,
        { startTime: index, endTime: index + 1 },
        [0, 1]
      )
    )
    await seedCompletedIndex(repository, chunks)
    const service = new LibrarySearchService({
      databaseService: database,
      repository,
      aiCore: { embed: vi.fn().mockResolvedValue(embedding([0, 1])) }
    })
    const fullIndexRead = vi.spyOn(repository, 'listChunks')

    const result = await service.search({
      query: 'indexed topic',
      mode: 'semantic',
      limit: 10
    })

    expect(result.results).toHaveLength(10)
    expect(fullIndexRead).not.toHaveBeenCalled()
  })

  it('supplements discovery with deterministic related lessons, materials and courses', async () => {
    await seedCompletedIndex(repository, [
      chunk(
        'anchor',
        'transcript',
        'Hooks and dependency boundaries.',
        { startTime: 10, endTime: 12 },
        [1, 0]
      ),
      chunk(
        'related-lesson',
        'transcript',
        'A related lesson about dependency boundaries.',
        { startTime: 20, endTime: 22 },
        [0.99, 0.01],
        'related-lesson',
        'course-1',
        'module-1',
        'lesson-1b'
      ),
      chunk(
        'related-material',
        'code',
        'Dependency container composition root.',
        { fileName: 'related-container.ts', startLine: 4, endLine: 5 },
        [0.98, 0.02],
        'resource:code-2',
        'course-1',
        'module-1',
        'lesson-1b'
      ),
      chunk(
        'related-course',
        'pdf',
        'Dependency architecture in another course.',
        { page: 2 },
        [0.95, 0.05],
        'resource:pdf-2',
        'course-2',
        'module-2',
        'lesson-2'
      )
    ])
    const service = new LibrarySearchService({
      databaseService: database,
      repository,
      aiCore: { embed: vi.fn().mockResolvedValue(embedding([1, 0])) }
    })

    const result = await service.related({
      anchor: {
        chunkId: 'anchor',
        courseId: 'course-1',
        moduleId: 'module-1',
        lessonId: 'lesson-1'
      }
    })

    expect(result.groups.map((group) => group.type)).toEqual([
      'lessons',
      'materials',
      'courses'
    ])
    expect(
      result.groups
        .flatMap((group) => group.results)
        .some((item) => item.chunkId === 'anchor')
    ).toBe(false)
  })
})

function seedLibrary(database: DatabaseService, vaultPath: string): void {
  const db = database.getDatabase()!
  db.prepare(
    `INSERT INTO courses (id, title, slug, source_type, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run('course-1', 'Course 1', 'course-1', 'managed', vaultPath, 1, 1)
  db.prepare(
    `INSERT INTO modules (id, course_id, title, order_index, duration, lesson_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run('module-1', 'course-1', 'Module 1', 1, 100, 1, 1)
  db.prepare(
    `INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'lesson-1',
    'module-1',
    'course-1',
    'Lesson 1',
    1,
    path.join(vaultPath, 'lesson.mp4'),
    'lesson.mp4',
    '.mp4',
    'video',
    100,
    5,
    1
  )
  db.prepare(
    `INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'lesson-1b',
    'module-1',
    'course-1',
    'Lesson 1B',
    2,
    path.join(vaultPath, 'lesson-1b.mp4'),
    'lesson-1b.mp4',
    '.mp4',
    'video',
    100,
    5,
    1
  )
  db.prepare(
    `INSERT INTO content_resources (id, course_id, module_id, lesson_id, role, name, file_path, file_extension, resource_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'pdf-1',
    'course-1',
    'module-1',
    'lesson-1',
    'resource',
    'slides.pdf',
    path.join(vaultPath, 'slides.pdf'),
    '.pdf',
    'pdf',
    1
  )
  db.prepare(
    `INSERT INTO content_resources (id, course_id, module_id, lesson_id, role, name, file_path, file_extension, resource_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'code-1',
    'course-1',
    'module-1',
    'lesson-1',
    'resource',
    'container.ts',
    path.join(vaultPath, 'container.ts'),
    '.ts',
    'code',
    1
  )
  db.prepare(
    `INSERT INTO content_resources (id, course_id, module_id, lesson_id, role, name, file_path, file_extension, resource_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'code-2',
    'course-1',
    'module-1',
    'lesson-1b',
    'resource',
    'related-container.ts',
    path.join(vaultPath, 'related-container.ts'),
    '.ts',
    'code',
    1
  )
  db.prepare(
    `INSERT INTO lesson_notes (id, lesson_id, course_id, timestamp_seconds, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'note-1',
    'lesson-1',
    'course-1',
    5,
    'A note about dependency injection',
    1,
    1
  )
  db.prepare(
    `INSERT INTO courses (id, title, slug, source_type, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run('course-2', 'Course 2', 'course-2', 'managed', vaultPath, 1, 1)
  db.prepare(
    `INSERT INTO modules (id, course_id, title, order_index, duration, lesson_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run('module-2', 'course-2', 'Module 2', 1, 100, 1, 1)
  db.prepare(
    `INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'lesson-2',
    'module-2',
    'course-2',
    'Lesson 2',
    1,
    path.join(vaultPath, 'lesson-2.mp4'),
    'lesson-2.mp4',
    '.mp4',
    'video',
    100,
    5,
    1
  )
  db.prepare(
    `INSERT INTO content_resources (id, course_id, module_id, lesson_id, role, name, file_path, file_extension, resource_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'pdf-2',
    'course-2',
    'module-2',
    'lesson-2',
    'resource',
    'other.pdf',
    path.join(vaultPath, 'other.pdf'),
    '.pdf',
    'pdf',
    1
  )
}

async function seedCompletedIndex(
  repository: SemanticIndexRepository,
  chunks: Array<SemanticChunkDraft & { vector: number[] }>
): Promise<void> {
  const generation = repository.createGeneration({
    totalSources: chunks.length,
    providerId: 'ollama',
    modelId: 'local-embed',
    dimensions: 2
  })
  const groups = new Map<
    string,
    Array<SemanticChunkDraft & { vector: number[] }>
  >()
  for (const entry of chunks) {
    const key = `${entry.sourceKind}:${entry.sourceId}`
    const list = groups.get(key) ?? []
    list.push(entry)
    groups.set(key, list)
  }
  for (const list of groups.values()) {
    repository.insertSourceChunks(
      generation.id,
      list,
      list.map((entry) => entry.vector ?? [1, 0])
    )
  }
  repository.finalizeGeneration(generation.id, 'completed', true)
}

function chunk(
  sourceId: string,
  sourceKind: SemanticChunkDraft['sourceKind'],
  text: string,
  locator: SemanticChunkDraft['locator'],
  vector: number[],
  resolvedSourceId = sourceId,
  courseId = 'course-1',
  moduleId = 'module-1',
  lessonId = 'lesson-1'
): SemanticChunkDraft & { vector: number[] } {
  const resourceId = resolvedSourceId.startsWith('resource:')
    ? resolvedSourceId.slice('resource:'.length)
    : undefined
  const noteId = resolvedSourceId.startsWith('note:')
    ? resolvedSourceId.slice('note:'.length)
    : undefined
  return {
    sourceKind,
    sourceId: resolvedSourceId,
    courseId,
    moduleId,
    lessonId,
    ...(resourceId ? { resourceId } : {}),
    ...(noteId ? { noteId } : {}),
    sourceRevision: 'revision-1',
    contentRevision: `${sourceId}:revision-1`,
    dataType:
      sourceKind === 'pdf'
        ? 'pdf'
        : sourceKind === 'code'
          ? 'materials'
          : sourceKind === 'note'
            ? 'notes'
            : 'transcript',
    text,
    locator,
    ...(typeof locator.startTime === 'number'
      ? { startTime: locator.startTime }
      : {}),
    ...(typeof locator.endTime === 'number'
      ? { endTime: locator.endTime }
      : {}),
    vector
  }
}

function embedding(values: number[]): AiEmbeddingResponse {
  return { providerId: 'ollama', modelId: 'local-embed', embeddings: [values] }
}
