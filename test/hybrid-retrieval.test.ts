import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseService } from '../src/main/services/database.service'
import { SemanticIndexRepository } from '../src/main/services/semantic-index/semantic-index-repository.service'
import type { AiEmbeddingResponse } from '../src/types/ai'
import type { HybridRetrievalRequest, HybridRetrievalResult } from '../src/types/retrieval'
import type { SemanticChunkDraft } from '../src/types/semantic-index'

interface HybridRetrievalServiceContract {
  retrieve(input: HybridRetrievalRequest): Promise<HybridRetrievalResult>
}

type HybridRetrievalServiceConstructor = new (dependencies: {
  repository: SemanticIndexRepository
  aiCore: { embed: (input: unknown) => Promise<AiEmbeddingResponse> }
}) => HybridRetrievalServiceContract

describe('hybrid retrieval', () => {
  let tempDir: string
  let vaultPath: string
  let database: DatabaseService
  let repository: SemanticIndexRepository

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-hybrid-retrieval-'))
    vaultPath = path.join(tempDir, 'vault')
    fs.mkdirSync(vaultPath, { recursive: true })
    database = new DatabaseService()
    database.connect(vaultPath)
    seedLibrary(database, vaultPath)
    repository = new SemanticIndexRepository(database)
  })

  afterEach(() => {
    database.close()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('fuses lexical and semantic candidates while keeping a lesson scope', async () => {
    await seedCompletedIndex(repository, [
      chunk('lesson-1:lexical', 'course-1', 'module-1', 'lesson-1', 'Dependency injection separates construction from behavior.', 0, 8),
      chunk('lesson-1:semantic', 'course-1', 'module-1', 'lesson-1', 'Composition root wires dependencies at startup.', 12, 20),
      chunk('lesson-2:other', 'course-1', 'module-1', 'lesson-2', 'Dependency injection from another lesson must stay out.', 0, 8)
    ], [[1, 0], [0, 1], [1, 0]])
    const aiCore = { embed: vi.fn().mockResolvedValue(embedding([0, 1])) }
    const service = await createService(repository, aiCore)

    const result = await service.retrieve({
      query: 'dependency injection',
      scope: { type: 'lesson', lessonId: 'lesson-1' },
      limit: 4
    })

    expect(result.sources).toHaveLength(2)
    expect(result.sources.every((source) => source.lessonId === 'lesson-1')).toBe(true)
    expect(result.sources[0]).toMatchObject({ sourceRevision: 'media-revision-1' })
    expect(result.semanticUsed).toBe(true)
  })

  it('returns no coverage and never embeds for an unknown empty course scope', async () => {
    await seedCompletedIndex(repository, [
      chunk('indexed', 'course-1', 'module-1', 'lesson-1', 'Indexed dependency injection material.', 0, 4)
    ], [[1, 0]])
    const aiCore = { embed: vi.fn().mockResolvedValue(embedding([1, 0])) }
    const service = await createService(repository, aiCore)

    const result = await service.retrieve({ query: 'not indexed', scope: { type: 'course', courseId: 'course-empty' } })

    expect(result.sources).toEqual([])
    expect(result.coverage.status).toBe('none')
    expect(aiCore.embed).not.toHaveBeenCalled()
  })

  it('applies module, course and vault filters in SQL without leaking matching chunks', async () => {
    await seedCompletedIndex(repository, [
      chunk('lesson-1', 'course-1', 'module-1', 'lesson-1', 'Boundary pattern keeps services isolated.', 0, 4),
      chunk('lesson-3', 'course-1', 'module-2', 'lesson-3', 'Boundary pattern documents another module.', 0, 4),
      chunk('lesson-4', 'course-2', 'module-3', 'lesson-4', 'Boundary pattern belongs to another course.', 0, 4)
    ], [[1, 0], [1, 0], [1, 0]])
    const service = await createService(repository, { embed: vi.fn().mockRejectedValue(new Error('offline')) })

    const module = await service.retrieve({ query: 'boundary pattern', scope: { type: 'module', moduleId: 'module-1' } })
    const course = await service.retrieve({ query: 'boundary pattern', scope: { type: 'course', courseId: 'course-1' } })
    const vault = await service.retrieve({ query: 'boundary pattern', scope: { type: 'vault' } })

    expect(module.sources.map((source) => source.moduleId)).toEqual(['module-1'])
    expect(course.sources.every((source) => source.courseId === 'course-1')).toBe(true)
    expect(course.sources).toHaveLength(2)
    expect(vault.sources.map((source) => source.courseId).sort()).toEqual(['course-1', 'course-1', 'course-2'])
    expect(module.semanticUsed).toBe(false)
  })

  it('keeps lexical sources when the query vector does not match the current generation', async () => {
    await seedCompletedIndex(repository, [
      chunk('lexical', 'course-1', 'module-1', 'lesson-1', 'Dependency injection is indexed locally.', 0, 4)
    ], [[1, 0]])
    const service = await createService(repository, { embed: vi.fn().mockResolvedValue(embedding([1, 0, 0], 'openai', 'other-model')) })

    const result = await service.retrieve({ query: 'dependency injection', scope: { type: 'course', courseId: 'course-1' } })

    expect(result.sources).toMatchObject([{ sourceId: 'lexical', lexicalScore: expect.any(Number) }])
    expect(result.semanticUsed).toBe(false)
  })

  it('prioritizes the nearest stored timestamp after filtering and caps sources at eight', async () => {
    const chunks = [
      chunk('far', 'course-1', 'module-1', 'lesson-1', 'Explain this dependency injection pattern.', 10, 20),
      chunk('near', 'course-1', 'module-1', 'lesson-1', 'Explain this dependency injection pattern near the current moment.', 100, 110),
      ...Array.from({ length: 8 }, (_, index) =>
        chunk(`extra-${index}`, 'course-1', 'module-1', 'lesson-1', `Explain this dependency injection pattern extra ${index}.`, 200 + index, 201 + index)
      )
    ]
    await seedCompletedIndex(repository, chunks, chunks.map(() => [1, 0]))
    const service = await createService(repository, { embed: vi.fn().mockRejectedValue(new Error('offline')) })

    const result = await service.retrieve({
      query: 'dependency injection',
      scope: { type: 'course', courseId: 'course-1' },
      moment: { lessonId: 'lesson-1', timestampSeconds: 105 },
      limit: 50
    })

    expect(result.sources).toHaveLength(8)
    expect(result.sources[0]).toMatchObject({ sourceId: 'near', locator: { startTime: 100, endTime: 110 } })
  })
})

async function createService(
  repository: SemanticIndexRepository,
  aiCore: { embed: (input: unknown) => Promise<AiEmbeddingResponse> }
): Promise<HybridRetrievalServiceContract> {
  const module = await import('../src/main/services/retrieval/hybrid-retrieval.service') as unknown as {
    HybridRetrievalService: HybridRetrievalServiceConstructor
  }
  return new module.HybridRetrievalService({ repository, aiCore })
}

function seedLibrary(database: DatabaseService, vaultPath: string): void {
  const db = database.getDatabase()!
  for (const courseId of ['course-1', 'course-2']) {
    db.prepare(`INSERT INTO courses (id, title, slug, source_type, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      courseId, courseId, courseId, 'managed', vaultPath, 1, 1
    )
  }
  for (const [moduleId, courseId] of [['module-1', 'course-1'], ['module-2', 'course-1'], ['module-3', 'course-2']] as const) {
    db.prepare(`INSERT INTO modules (id, course_id, title, order_index, duration, lesson_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      moduleId, courseId, moduleId, 1, 10, 1, 1
    )
  }
  for (const [lessonId, moduleId, courseId] of [
    ['lesson-1', 'module-1', 'course-1'], ['lesson-2', 'module-1', 'course-1'], ['lesson-3', 'module-2', 'course-1'], ['lesson-4', 'module-3', 'course-2']
  ] as const) {
    db.prepare(`INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      lessonId, moduleId, courseId, lessonId, 1, path.join(vaultPath, `${lessonId}.mp4`), `${lessonId}.mp4`, '.mp4', 'video', 10, 5, 1
    )
  }
}

async function seedCompletedIndex(repository: SemanticIndexRepository, chunks: SemanticChunkDraft[], vectors: number[][]): Promise<void> {
  const generation = repository.createGeneration({ totalSources: chunks.length, providerId: 'ollama', modelId: 'local-embed', dimensions: 2 })
  chunks.forEach((entry, index) => repository.insertSourceChunks(generation.id, [entry], [vectors[index]]))
  repository.finalizeGeneration(generation.id, 'completed', true)
}

function chunk(
  sourceId: string,
  courseId: string,
  moduleId: string,
  lessonId: string,
  text: string,
  startTime: number,
  endTime: number
): SemanticChunkDraft {
  return {
    sourceKind: 'transcript',
    sourceId,
    courseId,
    moduleId,
    lessonId,
    sourceRevision: 'media-revision-1',
    contentRevision: `${sourceId}:revision-1`,
    dataType: 'transcript',
    text,
    locator: { startTime, endTime },
    startTime,
    endTime
  }
}

function embedding(values: number[], providerId: AiEmbeddingResponse['providerId'] = 'ollama', modelId = 'local-embed'): AiEmbeddingResponse {
  return { providerId, modelId, embeddings: [values] }
}
