import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseService } from '../src/main/services/database.service'
import { SemanticIndexRepository } from '../src/main/services/semantic-index/semantic-index-repository.service'
import { ContentExtractorService } from '../src/main/services/semantic-index/content-extractor.service'
import { SemanticIndexService } from '../src/main/services/semantic-index/semantic-index.service'
import { TranscriptRepository } from '../src/main/services/transcription/transcript-repository.service'
import { OptimizationQueueService } from '../src/main/services/optimizer/optimization-queue.service'
import type {
  ExtractedSemanticDocument,
  SemanticSourceDescriptor
} from '../src/types/semantic-index'
import {
  chunkSemanticDocument,
  normalizeSemanticScope
} from '../src/main/services/semantic-index/semantic-chunker'
import type { SemanticChunkDraft } from '../src/types/semantic-index'

describe('semantic index chunking', () => {
  it('keeps transcript timestamps and source revisions on natural chunks', () => {
    const document: ExtractedSemanticDocument = {
      sourceKind: 'transcript',
      sourceId: 'lesson:lesson-1:transcript',
      courseId: 'course-1',
      moduleId: 'module-1',
      lessonId: 'lesson-1',
      sourceRevision: 'media-revision-1',
      contentRevision: 'transcript:transcript-1:v1',
      dataType: 'transcript',
      locator: { transcriptId: 'transcript-1', language: 'pt-BR' },
      text: 'A primeira frase. A segunda frase.',
      segments: [
        { sequence: 0, start: 0, end: 2, text: 'A primeira frase.' },
        { sequence: 1, start: 2, end: 4, text: 'A segunda frase.' }
      ]
    }

    const chunks = chunkSemanticDocument(document)

    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({
      sourceKind: 'transcript',
      sourceId: 'lesson:lesson-1:transcript',
      courseId: 'course-1',
      moduleId: 'module-1',
      lessonId: 'lesson-1',
      sourceRevision: 'media-revision-1',
      contentRevision: 'transcript:transcript-1:v1',
      startTime: 0,
      endTime: 4,
      text: 'A primeira frase. A segunda frase.'
    })
  })

  it('keeps PDF page provenance and code line metadata', () => {
    const pdfDocument: ExtractedSemanticDocument = {
      sourceKind: 'pdf',
      sourceId: 'resource:pdf-1',
      courseId: 'course-1',
      sourceRevision: 'sha256:pdf',
      contentRevision: 'sha256:pdf',
      dataType: 'pdf',
      locator: { page: 3, fileName: 'guide.pdf' },
      text: 'Conteúdo textual da página três.'
    }
    const codeDocument: ExtractedSemanticDocument = {
      sourceKind: 'code',
      sourceId: 'resource:code-1',
      courseId: 'course-1',
      sourceRevision: 'sha256:code',
      contentRevision: 'sha256:code',
      dataType: 'materials',
      locator: { fileName: 'main.ts', language: 'typescript' },
      text: 'const answer = 42\n\nexport function getAnswer(): number {\n  return answer\n}'
    }

    const pdfChunk = chunkSemanticDocument(pdfDocument)[0]
    const codeChunk = chunkSemanticDocument(codeDocument)[0]

    expect(pdfChunk.locator).toMatchObject({ page: 3, fileName: 'guide.pdf' })
    expect(codeChunk.locator).toMatchObject({
      fileName: 'main.ts',
      language: 'typescript',
      startLine: 1,
      endLine: 5
    })
  })

  it('normalizes selected scopes and rejects an empty selection', () => {
    expect(normalizeSemanticScope({
      type: 'selected',
      lessonIds: ['lesson-2', 'lesson-1', 'lesson-2'],
      resourceIds: ['resource-1', 'resource-1'],
      noteIds: []
    })).toEqual({
      type: 'selected',
      lessonIds: ['lesson-1', 'lesson-2'],
      resourceIds: ['resource-1']
    })

    expect(() => normalizeSemanticScope({ type: 'selected' })).toThrow('selected scope')
  })
})

describe('semantic index persistence', () => {
  let tempDir: string
  let vaultDir: string
  let database: DatabaseService
  let repository: SemanticIndexRepository

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-semantic-index-'))
    vaultDir = path.join(tempDir, 'vault')
    fs.mkdirSync(vaultDir, { recursive: true })
    database = new DatabaseService()
    database.connect(vaultDir)
    const db = database.getDatabase()!
    db.prepare(`INSERT INTO courses (id, title, slug, source_type, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'course-1', 'Course', 'course', 'managed', vaultDir, 1, 1
    )
    db.prepare(`INSERT INTO modules (id, course_id, title, order_index, duration, lesson_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'module-1', 'course-1', 'Module', 1, 10, 1, 1
    )
    db.prepare(`INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'lesson-1', 'module-1', 'course-1', 'Lesson', 1, path.join(vaultDir, 'lesson.mp4'), 'lesson.mp4', '.mp4', 'video', 10, 5, 1
    )
    db.prepare(`INSERT INTO transcripts (id, lesson_id, version, language, provider, model, created_at, source_revision, settings_json, status, is_current) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'transcript-1', 'lesson-1', 1, 'pt-BR', 'subtitle', null, 1, 'media-revision-1', '{}', 'completed', 1
    )
    repository = new SemanticIndexRepository(database)
  })

  afterEach(() => {
    database.close()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('stores provenance and Float32 vectors, then publishes only a complete generation', () => {
    const generation = repository.createGeneration({
      totalSources: 1,
      providerId: 'ollama',
      modelId: 'nomic-embed-text',
      dimensions: 3
    })
    const chunk: SemanticChunkDraft = {
      sourceKind: 'transcript',
      sourceId: 'lesson:lesson-1:transcript',
      courseId: 'course-1',
      moduleId: 'module-1',
      lessonId: 'lesson-1',
      transcriptId: 'transcript-1',
      sourceRevision: 'media-revision-1',
      contentRevision: 'transcript:transcript-1:v1',
      dataType: 'transcript',
      text: 'Conteúdo indexado.',
      locator: { transcriptId: 'transcript-1', startTime: 2, endTime: 4 },
      startTime: 2,
      endTime: 4
    }

    repository.insertSourceChunks(generation.id, [chunk], [[1, 2, 3]])

    expect(repository.getCurrent()).toBeNull()
    expect(repository.listChunks(generation.id)).toMatchObject([{
      sourceId: 'lesson:lesson-1:transcript',
      lessonId: 'lesson-1',
      sourceRevision: 'media-revision-1',
      startTime: 2,
      endTime: 4
    }])
    const vectorRow = database.getDatabase()!.prepare(`SELECT vector FROM semantic_index_embeddings WHERE chunk_id = ?`).get(repository.listChunks(generation.id)[0].id) as { vector: Buffer }
    expect(vectorRow.vector.byteLength).toBe(12)

    repository.finalizeGeneration(generation.id, 'completed', true)
    expect(repository.getCurrent()).toMatchObject({
      id: generation.id,
      providerId: 'ollama',
      modelId: 'nomic-embed-text',
      dimensions: 3,
      indexedChunks: 1,
      isCurrent: true
    })
  })

  it('replaces only one source and reports partial generations without promoting them', () => {
    const generation = repository.createGeneration({ totalSources: 2, providerId: 'ollama', modelId: 'model', dimensions: 2 })
    const makeChunk = (sourceId: string, text: string): SemanticChunkDraft => ({
      sourceKind: 'text',
      sourceId,
      courseId: 'course-1',
      sourceRevision: 'revision-1',
      contentRevision: `${sourceId}:content-1`,
      dataType: 'materials',
      text,
      locator: { fileName: `${sourceId}.txt` }
    })
    repository.insertSourceChunks(generation.id, [makeChunk('resource:a', 'A antigo')], [[1, 2]])
    repository.insertSourceChunks(generation.id, [makeChunk('resource:b', 'B')], [[3, 4]])
    repository.insertSourceChunks(generation.id, [makeChunk('resource:a', 'A atualizado')], [[5, 6]])

    expect(repository.listChunks(generation.id).map((chunk) => chunk.text)).toEqual(expect.arrayContaining(['A atualizado', 'B']))
    repository.finalizeGeneration(generation.id, 'partial', false, 'one source failed')
    expect(repository.getCurrent()).toBeNull()
    expect(repository.getLatest()).toMatchObject({ status: 'partial', failedSources: 0, errorMessage: 'one source failed' })
  })

  it('keeps notes opt-in and rejects incompatible embedding metadata', () => {
    expect(repository.getSettings()).toEqual({ includeNotes: false })
    expect(repository.setSettings({ includeNotes: true })).toBe(true)
    expect(repository.getSettings()).toEqual({ includeNotes: true })

    const generation = repository.createGeneration({ totalSources: 1, providerId: 'ollama', modelId: 'model', dimensions: 2 })
    expect(() => repository.setEmbeddingConfig(generation.id, 'openai', 'other-model', 3)).toThrow('incompatible')
  })

  it('persists semantic jobs in the shared queue without a fake lesson identity', () => {
    const queue = new OptimizationQueueService(database)
    const first = queue.enqueueSemanticIndex({
      scope: { type: 'vault' },
      includeNotes: false,
      cloudConsent: false
    })
    const duplicate = queue.enqueueSemanticIndex({
      scope: { type: 'vault' },
      includeNotes: false,
      cloudConsent: false
    })

    expect(first).toMatchObject({ jobType: 'semantic_index', lessonId: '', semanticScope: { type: 'vault' } })
    expect(duplicate.id).toBe(first.id)
    expect(database.getDatabase()!.prepare(`SELECT lesson_id FROM optimization_queue WHERE id = ?`).get(first.id)).toMatchObject({ lesson_id: null })
    expect(queue.listSemanticIndexQueue()).toHaveLength(1)

    expect(queue.pauseJob(first.id)).toBe(true)
    expect(queue.listSemanticIndexQueue()[0].status).toBe('paused')
    expect(queue.resumeJob(first.id)).toBe(true)
    queue.updateJob(first.id, { status: 'indexing' })
    queue.recoverInterruptedJobs()
    expect(queue.listSemanticIndexQueue()[0].status).toBe('queued')
  })
})

describe('semantic index content extraction', () => {
  let tempDir: string
  let vaultDir: string
  let database: DatabaseService
  let transcriptRepository: TranscriptRepository
  let extractor: ContentExtractorService

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-semantic-extraction-'))
    vaultDir = path.join(tempDir, 'vault')
    fs.mkdirSync(vaultDir, { recursive: true })
    const mediaPath = path.join(vaultDir, 'lesson.mp4')
    const subtitlePath = path.join(vaultDir, 'lesson.srt')
    const pdfPath = path.join(vaultDir, 'guide.pdf')
    const codePath = path.join(vaultDir, 'main.ts')
    fs.writeFileSync(mediaPath, 'media')
    fs.writeFileSync(subtitlePath, '1\n00:00:00,000 --> 00:00:01,000\nLegenda\n')
    fs.writeFileSync(pdfPath, 'pdf fixture')
    fs.writeFileSync(codePath, 'export const answer = 42\n')

    database = new DatabaseService()
    database.connect(vaultDir)
    const db = database.getDatabase()!
    db.prepare(`INSERT INTO courses (id, title, slug, source_type, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'course-1', 'Course', 'course', 'managed', vaultDir, 1, 1
    )
    db.prepare(`INSERT INTO modules (id, course_id, title, order_index, duration, lesson_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'module-1', 'course-1', 'Module', 1, 10, 1, 1
    )
    db.prepare(`INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'lesson-1', 'module-1', 'course-1', 'Lesson', 1, mediaPath, 'lesson.mp4', '.mp4', 'video', 10, 5, 1
    )
    db.prepare(`INSERT INTO content_resources (id, course_id, module_id, lesson_id, role, name, file_path, file_extension, file_size, resource_type, language, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'subtitle-1', 'course-1', 'module-1', 'lesson-1', 'subtitle', 'lesson.srt', subtitlePath, '.srt', 42, 'document', 'pt-BR', 'Português', 1
    )
    db.prepare(`INSERT INTO content_resources (id, course_id, module_id, lesson_id, role, name, file_path, file_extension, file_size, resource_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'pdf-1', 'course-1', 'module-1', 'lesson-1', 'resource', 'guide.pdf', pdfPath, '.pdf', 11, 'pdf', 1
    )
    db.prepare(`INSERT INTO content_resources (id, course_id, module_id, lesson_id, role, name, file_path, file_extension, file_size, resource_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'code-1', 'course-1', 'module-1', 'lesson-1', 'resource', 'main.ts', codePath, '.ts', 25, 'code', 1
    )
    db.prepare(`INSERT INTO lesson_notes (id, lesson_id, course_id, timestamp_seconds, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'note-1', 'lesson-1', 'course-1', 3, 'Anotação importante', 1, 2
    )

    transcriptRepository = new TranscriptRepository(database)
    transcriptRepository.saveCompleted({
      lessonId: 'lesson-1',
      language: 'pt-BR',
      provider: 'subtitle',
      sourceRevision: 'media-revision-1',
      settings: {},
      segments: [{ sequence: 0, start: 0, end: 1, text: 'Transcrição atual.' }]
    })
    extractor = new ContentExtractorService({
      databaseService: database,
      transcriptRepository,
      pdfExtractor: vi.fn().mockResolvedValue([{ page: 1, text: 'Texto extraído do PDF.' }])
    })
  })

  afterEach(() => {
    database.close()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('prefers the current transcript over subtitle text and keeps hierarchy metadata', () => {
    const sources = extractor.listSources({ type: 'lesson', lessonId: 'lesson-1' }, false)
    const sourceKinds = sources.map((source) => source.sourceKind)

    expect(sourceKinds).toContain('transcript')
    expect(sourceKinds).not.toContain('subtitle')
    expect(sources.find((source) => source.sourceId === 'metadata:lesson:lesson-1')).toMatchObject({
      courseId: 'course-1',
      moduleId: 'module-1',
      lessonId: 'lesson-1'
    })
  })

  it('extracts PDF text and code without duplicating source paths into provenance', async () => {
    const sources = extractor.listSources({ type: 'lesson', lessonId: 'lesson-1' }, false)
    const pdfSource = sources.find((source) => source.sourceKind === 'pdf')!
    const codeSource = sources.find((source) => source.sourceKind === 'code')!
    const pdf = await extractor.extractSource(pdfSource)
    const code = await extractor.extractSource(codeSource)

    expect(pdf[0]).toMatchObject({ sourceId: 'resource:pdf-1', text: 'Texto extraído do PDF.', locator: { page: 1 } })
    expect(pdf[0].sourceRevision).toMatch(/^sha256:/)
    expect(code[0]).toMatchObject({ sourceId: 'resource:code-1', text: 'export const answer = 42' })
    expect(code[0].filePath).toBeUndefined()
    expect(code[0].locator).toMatchObject({ fileName: 'main.ts', language: 'typescript' })
  })

  it('indexes notes only when the vault setting explicitly enables them', () => {
    expect(extractor.listSources({ type: 'lesson', lessonId: 'lesson-1' }, false).some((source) => source.sourceKind === 'note')).toBe(false)
    expect(extractor.listSources({ type: 'lesson', lessonId: 'lesson-1' }, true).find((source) => source.sourceKind === 'note')).toMatchObject({
      sourceId: 'note:note-1',
      dataType: 'notes',
      locator: { noteId: 'note-1', startTime: 3 }
    })
  })

  it('falls back to a valid subtitle when no current transcript exists and fails unavailable files', async () => {
    database.getDatabase()!.prepare(`DELETE FROM transcripts`).run()
    const sources = extractor.listSources({ type: 'lesson', lessonId: 'lesson-1' }, false)
    expect(sources.find((source) => source.sourceKind === 'subtitle')).toMatchObject({ sourceId: 'lesson:lesson-1:subtitle' })
    const subtitle = await extractor.extractSource(sources.find((source) => source.sourceKind === 'subtitle')!)
    expect(subtitle[0].segments).toMatchObject([{ start: 0, end: 1, text: 'Legenda' }])

    await expect(extractor.extractSource({
      ...sources.find((source) => source.sourceKind === 'code')!,
      filePath: path.join(vaultDir, 'missing.ts')
    })).rejects.toThrow('Source unavailable')
  })
})

describe('semantic index processing', () => {
  let tempDir: string
  let vaultDir: string
  let database: DatabaseService
  let repository: SemanticIndexRepository
  let queue: OptimizationQueueService

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-semantic-processing-'))
    vaultDir = path.join(tempDir, 'vault')
    fs.mkdirSync(vaultDir, { recursive: true })
    database = new DatabaseService()
    database.connect(vaultDir)
    const db = database.getDatabase()!
    db.prepare(`INSERT INTO courses (id, title, slug, source_type, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'course-1', 'Course', 'course', 'managed', vaultDir, 1, 1
    )
    db.prepare(`INSERT INTO modules (id, course_id, title, order_index, duration, lesson_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'module-1', 'course-1', 'Module', 1, 10, 1, 1
    )
    db.prepare(`INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'lesson-1', 'module-1', 'course-1', 'Lesson', 1, path.join(vaultDir, 'lesson.mp4'), 'lesson.mp4', '.mp4', 'video', 10, 5, 1
    )
    for (const resourceId of ['a', 'b']) {
      db.prepare(`INSERT INTO content_resources (id, course_id, module_id, lesson_id, role, name, file_path, file_extension, file_size, resource_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        resourceId, 'course-1', 'module-1', 'lesson-1', 'resource', `${resourceId}.txt`, path.join(vaultDir, `${resourceId}.txt`), '.txt', 1, 'document', 1
      )
    }
    repository = new SemanticIndexRepository(database)
    queue = new OptimizationQueueService(database)
  })

  afterEach(() => {
    database.close()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  function source(sourceId: string, revision: string, contentRevision: string): SemanticSourceDescriptor {
    return {
      sourceKind: 'text',
      sourceId,
      courseId: 'course-1',
      moduleId: 'module-1',
      lessonId: 'lesson-1',
      resourceId: sourceId.replace('resource:', ''),
      dataType: 'materials',
      sourceRevision: revision,
      contentRevision,
      locator: { fileName: `${sourceId}.txt` }
    }
  }

  function document(descriptor: SemanticSourceDescriptor, text: string): ExtractedSemanticDocument {
    return { ...descriptor, text, sourceRevision: descriptor.sourceRevision!, contentRevision: descriptor.contentRevision! }
  }

  function createService(
    sources: SemanticSourceDescriptor[],
    documents: Map<string, ExtractedSemanticDocument[] | Error>
  ): { service: SemanticIndexService; embed: ReturnType<typeof vi.fn>; listSources: ReturnType<typeof vi.fn>; extractSource: ReturnType<typeof vi.fn> } {
    const listSources = vi.fn().mockReturnValue(sources)
    const extractSource = vi.fn().mockImplementation(async (descriptor: SemanticSourceDescriptor) => {
      const result = documents.get(descriptor.sourceId)
      if (result instanceof Error) throw result
      return result ?? []
    })
    const embed = vi.fn().mockImplementation(async (request: { input: string | string[] }) => {
      const inputs = Array.isArray(request.input) ? request.input : [request.input]
      return {
        providerId: 'ollama',
        modelId: 'local-embed',
        embeddings: inputs.map(() => [0.25, 0.75])
      }
    })
    const service = new SemanticIndexService({
      repository,
      extractor: { listSources, extractSource } as unknown as ContentExtractorService,
      aiCore: { embed } as never,
      queue
    })
    return { service, embed, listSources, extractSource }
  }

  it('indexes a scope with local embeddings and publishes provenance only after completion', async () => {
    const descriptor = source('resource:a', 'revision-a', 'content-a')
    const { service, embed } = createService(
      [descriptor],
      new Map([[descriptor.sourceId, [document(descriptor, 'Texto local indexável.')]]])
    )
    const progress: string[] = []
    const job = service.enqueue({ scope: { type: 'lesson', lessonId: 'lesson-1' } })

    await service.processJob(job, new AbortController().signal, { onProgress: (event) => progress.push(event.status) })

    const current = repository.getCurrent()
    expect(current).toMatchObject({ status: 'completed', providerId: 'ollama', modelId: 'local-embed', dimensions: 2 })
    expect(repository.listChunks(current!.id)).toMatchObject([{
      sourceId: 'resource:a',
      sourceRevision: 'revision-a',
      contentRevision: 'content-a',
      text: 'Texto local indexável.'
    }])
    expect(embed).toHaveBeenCalledWith({
      input: ['Texto local indexável.'],
      dataTypes: ['materials'],
      cloudConsent: false
    })
    expect(progress).toContain('indexing')
    expect(progress).toContain('completed')
  })

  it('updates only the selected source incrementally and rebuilds from extracted content', async () => {
    const descriptorA = source('resource:a', 'revision-a', 'content-a')
    const descriptorB = source('resource:b', 'revision-b', 'content-b')
    const documents = new Map<string, ExtractedSemanticDocument[] | Error>([
      [descriptorA.sourceId, [document(descriptorA, 'A versão inicial.')]],
      [descriptorB.sourceId, [document(descriptorB, 'B permanece.')]]
    ])
    const processing = createService([descriptorA, descriptorB], documents)
    const firstJob = processing.service.enqueue({ scope: { type: 'lesson', lessonId: 'lesson-1' } })
    await processing.service.processJob(firstJob, new AbortController().signal)
    const firstGeneration = repository.getCurrent()!
    const firstB = repository.listChunks(firstGeneration.id).find((chunk) => chunk.sourceId === descriptorB.sourceId)!

    const descriptorA2 = source('resource:a', 'revision-a2', 'content-a2')
    documents.set(descriptorA2.sourceId, [document(descriptorA2, 'A versão atualizada.')])
    processing.listSources.mockReturnValue([descriptorA2])
    const refreshJob = processing.service.refreshSource({ resourceId: 'a' }, { cloudConsent: true })
    await processing.service.processJob(refreshJob, new AbortController().signal)

    const afterIncremental = repository.listChunks(firstGeneration.id)
    expect(afterIncremental.find((chunk) => chunk.sourceId === descriptorA.sourceId)?.text).toBe('A versão atualizada.')
    expect(afterIncremental.find((chunk) => chunk.sourceId === descriptorB.sourceId)?.id).toBe(firstB.id)
    expect(processing.embed).toHaveBeenLastCalledWith({
      input: ['A versão atualizada.'],
      dataTypes: ['materials'],
      cloudConsent: true
    })

    processing.listSources.mockReturnValue([descriptorA2, descriptorB])
    const rebuildJob = processing.service.enqueue({
      scope: { type: 'lesson', lessonId: 'lesson-1' },
      rebuild: true
    })
    await processing.service.processJob(rebuildJob, new AbortController().signal)
    expect(repository.getCurrent()!.id).not.toBe(firstGeneration.id)
    expect(repository.getCurrent()!.status).toBe('completed')
  })

  it('keeps a failed source out of the current index and reports a partial generation', async () => {
    const descriptorA = source('resource:a', 'revision-a', 'content-a')
    const descriptorB = source('resource:b', 'revision-b', 'content-b')
    const { service } = createService(
      [descriptorA, descriptorB],
      new Map([
        [descriptorA.sourceId, [document(descriptorA, 'A válido.')]],
        [descriptorB.sourceId, new Error('Source unavailable')]
      ])
    )

    const job = service.enqueue({ scope: { type: 'course', courseId: 'course-1' } })
    await service.processJob(job, new AbortController().signal)

    expect(repository.getCurrent()).toBeNull()
    expect(repository.getLatest()).toMatchObject({ status: 'partial', discoveredSources: 2, failedSources: 1 })
    expect(repository.listChunks(repository.getLatest()!.id)).toHaveLength(1)
    expect(queue.listSemanticIndexQueue()[0]).toMatchObject({ status: 'partial', progressPercent: 100 })
  })
})
