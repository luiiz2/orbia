import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseService } from '../src/main/services/database.service'
import { SemanticIndexRepository } from '../src/main/services/semantic-index/semantic-index-repository.service'
import { LibrarySearchService } from '../src/main/services/search/library-search.service'
import type { SemanticChunkDraft } from '../src/types/semantic-index'

describe('library search navigation & exact search', () => {
  let tempDir: string
  let vaultDir: string
  let database: DatabaseService
  let repository: SemanticIndexRepository

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-search-nav-'))
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

  it('preserves exact normal search for course title, lesson title, and filename', async () => {
    const service = new LibrarySearchService({
      databaseService: database,
      repository
    })

    const courseResult = await service.search({
      query: 'Docker Mastery',
      mode: 'normal'
    })
    expect(courseResult.mode).toBe('normal')
    expect(
      courseResult.results.some((r) => r.title.includes('Docker Mastery'))
    ).toBe(true)

    const lessonResult = await service.search({
      query: 'Containers Architecture',
      mode: 'normal'
    })
    expect(
      lessonResult.results.some((r) =>
        r.title.includes('Containers Architecture')
      )
    ).toBe(true)

    const emptyResult = await service.search({
      query: 'Nonexistent query 12345',
      mode: 'normal'
    })
    expect(emptyResult.results).toEqual([])
  })

  it('resolves valid video chunk navigation targets to timestamp', async () => {
    const generation = repository.createGeneration({
      totalSources: 1,
      providerId: 'ollama',
      modelId: 'local-embed',
      dimensions: 2
    })
    const chunk: SemanticChunkDraft = {
      sourceKind: 'transcript',
      sourceId: 'lesson-1',
      courseId: 'course-1',
      moduleId: 'module-1',
      lessonId: 'lesson-1',
      sourceRevision: 'rev-1',
      contentRevision: 'lesson-1:rev-1',
      dataType: 'transcript',
      text: 'Explaining containers architecture at 45 seconds',
      locator: { startTime: 45.5, endTime: 50.0 }
    }
    repository.insertSourceChunks(generation.id, [chunk], [[1, 0]])
    repository.finalizeGeneration(generation.id, 'completed', true)

    const service = new LibrarySearchService({
      databaseService: database,
      repository
    })
    const fullIndexRead = vi.spyOn(repository, 'listChunks')
    const resolved = service.resolveResult({ chunkId: chunk.sourceId })

    expect(resolved.status).toBe('ok')
    if (resolved.status === 'ok') {
      expect(resolved.target).toMatchObject({
        type: 'lesson',
        courseId: 'course-1',
        moduleId: 'module-1',
        lessonId: 'lesson-1',
        timestampSeconds: 45.5
      })
    }
    expect(fullIndexRead).not.toHaveBeenCalled()
  })

  it('resolves PDF chunk navigation targets to exact page', async () => {
    const generation = repository.createGeneration({
      totalSources: 1,
      providerId: 'ollama',
      modelId: 'local-embed',
      dimensions: 2
    })
    const chunk: SemanticChunkDraft = {
      sourceKind: 'pdf',
      sourceId: 'resource:pdf-1',
      courseId: 'course-1',
      moduleId: 'module-1',
      lessonId: 'lesson-1',
      resourceId: 'pdf-1',
      sourceRevision: 'rev-1',
      contentRevision: 'pdf-1:rev-1',
      dataType: 'pdf',
      text: 'Diagram of Docker network topology on page 3',
      locator: { page: 3 }
    }
    repository.insertSourceChunks(generation.id, [chunk], [[1, 0]])
    repository.finalizeGeneration(generation.id, 'completed', true)

    const service = new LibrarySearchService({
      databaseService: database,
      repository
    })
    const resolved = service.resolveResult({ chunkId: chunk.sourceId })

    expect(resolved.status).toBe('ok')
    if (resolved.status === 'ok') {
      expect(resolved.target).toMatchObject({
        type: 'resource',
        courseId: 'course-1',
        moduleId: 'module-1',
        lessonId: 'lesson-1',
        resourceId: 'pdf-1',
        sourceKind: 'pdf',
        page: 3
      })
    }
  })

  it('resolves Code chunk navigation targets to file and line range', async () => {
    const generation = repository.createGeneration({
      totalSources: 1,
      providerId: 'ollama',
      modelId: 'local-embed',
      dimensions: 2
    })
    const chunk: SemanticChunkDraft = {
      sourceKind: 'code',
      sourceId: 'resource:code-1',
      courseId: 'course-1',
      moduleId: 'module-1',
      lessonId: 'lesson-1',
      resourceId: 'code-1',
      sourceRevision: 'rev-1',
      contentRevision: 'code-1:rev-1',
      dataType: 'materials',
      text: 'Dockerfile definition with multistage build',
      locator: { fileName: 'Dockerfile', startLine: 10, endLine: 25 }
    }
    repository.insertSourceChunks(generation.id, [chunk], [[1, 0]])
    repository.finalizeGeneration(generation.id, 'completed', true)

    const service = new LibrarySearchService({
      databaseService: database,
      repository
    })
    const resolved = service.resolveResult({ chunkId: chunk.sourceId })

    expect(resolved.status).toBe('ok')
    if (resolved.status === 'ok') {
      expect(resolved.target).toMatchObject({
        type: 'resource',
        courseId: 'course-1',
        moduleId: 'module-1',
        lessonId: 'lesson-1',
        resourceId: 'code-1',
        sourceKind: 'code',
        startLine: 10,
        endLine: 25
      })
    }
  })

  it('rejects invalid or deleted chunk IDs safely with unavailable status', () => {
    const service = new LibrarySearchService({
      databaseService: database,
      repository
    })
    const resultEmpty = service.resolveResult({ chunkId: '' })
    expect(resultEmpty.status).toBe('unavailable')

    const resultNonexistent = service.resolveResult({
      chunkId: 'deleted-chunk-999'
    })
    expect(resultNonexistent.status).toBe('unavailable')
  })
})

function seedLibrary(database: DatabaseService, vaultPath: string): void {
  const db = database.getDatabase()!
  db.prepare(
    `INSERT INTO courses (id, title, slug, source_type, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'course-1',
    'Docker Mastery',
    'docker-mastery',
    'managed',
    vaultPath,
    1,
    1
  )

  db.prepare(
    `INSERT INTO modules (id, course_id, title, order_index, duration, lesson_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run('module-1', 'course-1', 'Module 1: Fundamentals', 1, 300, 1, 1)

  db.prepare(
    `INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'lesson-1',
    'module-1',
    'course-1',
    'Containers Architecture',
    1,
    path.join(vaultPath, 'lesson-1.mp4'),
    'lesson-1.mp4',
    '.mp4',
    'video',
    300,
    1024,
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
    'docker-slides.pdf',
    path.join(vaultPath, 'docker-slides.pdf'),
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
    'Dockerfile',
    path.join(vaultPath, 'Dockerfile'),
    '.dockerfile',
    'code',
    1
  )
}
