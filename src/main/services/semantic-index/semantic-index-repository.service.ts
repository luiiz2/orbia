import crypto from 'node:crypto'
import type Database from 'better-sqlite3'
import type { AiProviderId } from '../../../types/ai'
import type { GroundedScope, IndexCoverage, RetrievedChunk } from '../../../types/retrieval'
import type {
  SemanticChunkDraft,
  SemanticIndexChunk,
  SemanticIndexGeneration,
  SemanticIndexGenerationStatus,
  SemanticIndexMetrics,
  SemanticIndexSettings,
  SemanticIndexStatus
} from '../../../types/semantic-index'
import { SEMANTIC_INDEX_CHUNKING_VERSION } from '../../../types/semantic-index'
import { databaseService, type DatabaseService } from '../database.service'

interface GenerationRow {
  id: string
  status: SemanticIndexGenerationStatus
  provider_id: AiProviderId | null
  model_id: string | null
  dimensions: number | null
  chunking_version: string
  created_at: number
  completed_at: number | null
  total_sources: number
  discovered_sources: number
  extracted_chunks: number
  embedded_chunks: number
  indexed_chunks: number
  failed_sources: number
  storage_text_bytes: number
  storage_vector_bytes: number
  error_message: string | null
  is_current: number
}

interface ChunkRow {
  id: string
  generation_id: string
  source_kind: SemanticIndexChunk['sourceKind']
  source_id: string
  course_id: string
  module_id: string | null
  lesson_id: string | null
  resource_id: string | null
  transcript_id: string | null
  note_id: string | null
  source_revision: string
  content_revision: string
  data_type: SemanticChunkDraft['dataType']
  text: string
  locator_json: string
  start_time: number | null
  end_time: number | null
  created_at: number
}

interface LexicalChunkRow extends ChunkRow {
  lexical_rank: number
}

interface VectorChunkRow extends ChunkRow {
  vector: Buffer
  provider_id: AiProviderId
  model_id: string
  dimensions: number
}

export interface CreateSemanticGenerationInput {
  totalSources: number
  providerId?: AiProviderId
  modelId?: string
  dimensions?: number
  chunkingVersion?: string
}

export interface SemanticGenerationCounters {
  discoveredSources?: number
  extractedChunks?: number
  embeddedChunks?: number
  indexedChunks?: number
  failedSources?: number
  totalSources?: number
}

export interface SemanticIndexRepositoryDependencies {
  databaseService?: DatabaseService
  now?: () => number
  createId?: () => string
}

export class SemanticIndexRepository {
  private readonly databaseService: DatabaseService
  private readonly now: () => number
  private readonly createId: () => string

  public constructor(dependencies: SemanticIndexRepositoryDependencies | DatabaseService = {}) {
    if (isDatabaseService(dependencies)) {
      this.databaseService = dependencies
      this.now = Date.now
      this.createId = crypto.randomUUID
      return
    }
    this.databaseService = dependencies.databaseService ?? databaseService
    this.now = dependencies.now ?? Date.now
    this.createId = dependencies.createId ?? crypto.randomUUID
  }

  public createGeneration(input: CreateSemanticGenerationInput): SemanticIndexGeneration {
    const db = this.requireDatabase()
    const id = this.createId()
    const createdAt = this.now()
    db.prepare(`
      INSERT INTO semantic_index_generations (
        id, status, provider_id, model_id, dimensions, chunking_version,
        created_at, total_sources
      ) VALUES (?, 'building', ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.providerId ?? null,
      input.modelId ?? null,
      input.dimensions ?? null,
      input.chunkingVersion ?? SEMANTIC_INDEX_CHUNKING_VERSION,
      createdAt,
      Math.max(0, Math.floor(input.totalSources))
    )
    return this.getGeneration(id)!
  }

  public getGeneration(id: string): SemanticIndexGeneration | null {
    const row = this.requireDatabase().prepare(`
      SELECT id, status, provider_id, model_id, dimensions, chunking_version,
             created_at, completed_at, total_sources, discovered_sources,
             extracted_chunks, embedded_chunks, indexed_chunks, failed_sources,
             storage_text_bytes, storage_vector_bytes, error_message, is_current
      FROM semantic_index_generations
      WHERE id = ?
    `).get(id) as GenerationRow | undefined
    return row ? mapGeneration(row) : null
  }

  public getCurrent(): SemanticIndexGeneration | null {
    const row = this.requireDatabase().prepare(`
      SELECT id, status, provider_id, model_id, dimensions, chunking_version,
             created_at, completed_at, total_sources, discovered_sources,
             extracted_chunks, embedded_chunks, indexed_chunks, failed_sources,
             storage_text_bytes, storage_vector_bytes, error_message, is_current
      FROM semantic_index_generations
      WHERE is_current = 1
      ORDER BY created_at DESC
      LIMIT 1
    `).get() as GenerationRow | undefined
    return row ? mapGeneration(row) : null
  }

  public getLatest(): SemanticIndexGeneration | null {
    const row = this.requireDatabase().prepare(`
      SELECT id, status, provider_id, model_id, dimensions, chunking_version,
             created_at, completed_at, total_sources, discovered_sources,
             extracted_chunks, embedded_chunks, indexed_chunks, failed_sources,
             storage_text_bytes, storage_vector_bytes, error_message, is_current
      FROM semantic_index_generations
      ORDER BY created_at DESC
      LIMIT 1
    `).get() as GenerationRow | undefined
    return row ? mapGeneration(row) : null
  }

  public getStatus(): SemanticIndexStatus {
    return {
      current: this.getCurrent(),
      latest: this.getLatest(),
      settings: this.getSettings()
    }
  }

  public insertSourceChunks(
    generationId: string,
    chunks: SemanticChunkDraft[],
    embeddings: number[][]
  ): void {
    if (chunks.length !== embeddings.length) throw new Error('Embedding count does not match chunk count')
    const db = this.requireDatabase()
    const generation = this.getGeneration(generationId)
    if (!generation) throw new Error('Semantic index generation not found')
    if (chunks.length === 0) return
    if (!generation.providerId || !generation.modelId || !generation.dimensions) {
      throw new Error('Semantic index embedding configuration is missing')
    }

    for (const embedding of embeddings) {
      validateVector(embedding, generation.dimensions)
    }

    const source = chunks[0]
    if (chunks.some((chunk) => chunk.sourceKind !== source.sourceKind || chunk.sourceId !== source.sourceId)) {
      throw new Error('Source chunks must share one provenance key')
    }

    const transaction = db.transaction(() => {
      db.prepare(`
        DELETE FROM semantic_index_chunks
        WHERE generation_id = ? AND source_kind = ? AND source_id = ?
      `).run(generationId, source.sourceKind, source.sourceId)

      const insertChunk = db.prepare(`
        INSERT INTO semantic_index_chunks (
          id, generation_id, source_kind, source_id, course_id, module_id, lesson_id,
          resource_id, transcript_id, note_id, source_revision, content_revision,
          data_type, text, locator_json, start_time, end_time, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const insertEmbedding = db.prepare(`
        INSERT INTO semantic_index_embeddings (chunk_id, provider_id, model_id, dimensions, vector)
        VALUES (?, ?, ?, ?, ?)
      `)

      chunks.forEach((chunk, index) => {
        const chunkId = this.createId()
        insertChunk.run(
          chunkId,
          generationId,
          chunk.sourceKind,
          chunk.sourceId,
          chunk.courseId,
          chunk.moduleId ?? null,
          chunk.lessonId ?? null,
          chunk.resourceId ?? null,
          chunk.transcriptId ?? null,
          chunk.noteId ?? null,
          chunk.sourceRevision,
          chunk.contentRevision,
          chunk.dataType,
          chunk.text,
          JSON.stringify(chunk.locator),
          chunk.startTime ?? null,
          chunk.endTime ?? null,
          this.now()
        )
        insertEmbedding.run(
          chunkId,
          generation.providerId,
          generation.modelId,
          generation.dimensions,
          encodeVector(embeddings[index])
        )
      })
    })
    transaction()
    this.refreshStorageMetrics(generationId)
  }

  public deleteSource(generationId: string, sourceKind: SemanticChunkDraft['sourceKind'], sourceId: string): boolean {
    const result = this.requireDatabase().prepare(`
      DELETE FROM semantic_index_chunks
      WHERE generation_id = ? AND source_kind = ? AND source_id = ?
    `).run(generationId, sourceKind, sourceId)
    this.refreshStorageMetrics(generationId)
    return result.changes > 0
  }

  public listChunks(generationId: string): SemanticIndexChunk[] {
    const rows = this.requireDatabase().prepare(`
      SELECT id, generation_id, source_kind, source_id, course_id, module_id, lesson_id,
             resource_id, transcript_id, note_id, source_revision, content_revision,
             data_type, text, locator_json, start_time, end_time, created_at
      FROM semantic_index_chunks
      WHERE generation_id = ?
      ORDER BY created_at, id
    `).all(generationId) as ChunkRow[]
    return rows.map(mapChunk)
  }

  public resolveScope(scope: GroundedScope): GroundedScope | null {
    const db = this.requireDatabase()
    if (!scope || typeof scope !== 'object') return null
    if (scope.type === 'vault') return scope
    if (scope.type === 'course' && isIdentifier(scope.courseId)) {
      return db.prepare(`SELECT id FROM courses WHERE id = ?`).get(scope.courseId) ? scope : null
    }
    if (scope.type === 'module' && isIdentifier(scope.moduleId)) {
      return db.prepare(`
        SELECT m.id
        FROM modules m
        JOIN courses course ON course.id = m.course_id
        WHERE m.id = ?
      `).get(scope.moduleId) ? scope : null
    }
    if (scope.type === 'lesson' && isIdentifier(scope.lessonId)) {
      return db.prepare(`
        SELECT lesson.id
        FROM lessons lesson
        JOIN modules module ON module.id = lesson.module_id AND module.course_id = lesson.course_id
        JOIN courses course ON course.id = lesson.course_id
        WHERE lesson.id = ?
      `).get(scope.lessonId) ? scope : null
    }
    return null
  }

  public searchLexical(
    generationId: string,
    query: string,
    scope: GroundedScope,
    limit: number
  ): Array<RetrievedChunk & { lexicalRank: number }> {
    const { clause, values } = buildScopeFilter(scope)
    const rows = this.requireDatabase().prepare(`
      SELECT c.id, c.generation_id, c.source_kind, c.source_id, c.course_id, c.module_id, c.lesson_id,
             c.resource_id, c.transcript_id, c.note_id, c.source_revision, c.content_revision,
             c.data_type, c.text, c.locator_json, c.start_time, c.end_time, c.created_at,
             bm25(semantic_index_fts) AS lexical_rank
      FROM semantic_index_fts
      JOIN semantic_index_chunks c ON c.rowid = semantic_index_fts.rowid
      WHERE semantic_index_fts MATCH ? AND c.generation_id = ?${clause}
      ORDER BY lexical_rank ASC, c.id ASC
      LIMIT ?
    `).all(query, generationId, ...values, clampCandidateLimit(limit)) as LexicalChunkRow[]
    return rows.map((row) => ({ ...mapRetrievedChunk(row), lexicalRank: row.lexical_rank }))
  }

  public listVectorRows(
    generationId: string,
    scope: GroundedScope,
    limit: number
  ): Array<{
    chunk: RetrievedChunk
    vector: Buffer
    providerId: AiProviderId
    modelId: string
    dimensions: number
  }> {
    const { clause, values } = buildScopeFilter(scope)
    const rows = this.requireDatabase().prepare(`
      SELECT c.id, c.generation_id, c.source_kind, c.source_id, c.course_id, c.module_id, c.lesson_id,
             c.resource_id, c.transcript_id, c.note_id, c.source_revision, c.content_revision,
             c.data_type, c.text, c.locator_json, c.start_time, c.end_time, c.created_at,
             e.vector, e.provider_id, e.model_id, e.dimensions
      FROM semantic_index_chunks c
      JOIN semantic_index_embeddings e ON e.chunk_id = c.id
      WHERE c.generation_id = ?${clause}
      ORDER BY c.id ASC
      LIMIT ?
    `).all(generationId, ...values, clampCandidateLimit(limit)) as VectorChunkRow[]
    return rows.map((row) => ({
      chunk: mapRetrievedChunk(row),
      vector: row.vector,
      providerId: row.provider_id,
      modelId: row.model_id,
      dimensions: row.dimensions
    }))
  }

  public getGenerationCoverage(generationId?: string): IndexCoverage {
    const generation = generationId ? this.getGeneration(generationId) : this.getCurrent()
    if (!generation) return { status: 'none', indexedChunks: 0, indexedSources: 0, failedSources: 0 }
    return {
      generationId: generation.id,
      status: generation.status,
      indexedChunks: generation.indexedChunks,
      indexedSources: generation.discoveredSources,
      failedSources: generation.failedSources
    }
  }

  public setEmbeddingConfig(
    generationId: string,
    providerId: AiProviderId,
    modelId: string,
    dimensions: number
  ): void {
    if (!providerId || !modelId || !Number.isInteger(dimensions) || dimensions <= 0) {
      throw new Error('Invalid semantic index embedding configuration')
    }
    const db = this.requireDatabase()
    const generation = this.getGeneration(generationId)
    if (!generation) throw new Error('Semantic index generation not found')
    const incompatible =
      (generation.providerId && generation.providerId !== providerId) ||
      (generation.modelId && generation.modelId !== modelId) ||
      (generation.dimensions && generation.dimensions !== dimensions)
    if (incompatible) throw new Error('Semantic index embedding configuration is incompatible')
    db.prepare(`
      UPDATE semantic_index_generations
      SET provider_id = ?, model_id = ?, dimensions = ?
      WHERE id = ?
    `).run(providerId, modelId, dimensions, generationId)
  }

  public updateProgress(generationId: string, counters: SemanticGenerationCounters): void {
    const fields: string[] = []
    const values: unknown[] = []
    const add = (column: string, value: number | undefined): void => {
      if (value === undefined) return
      fields.push(`${column} = ?`)
      values.push(Math.max(0, Math.floor(value)))
    }
    add('total_sources', counters.totalSources)
    add('discovered_sources', counters.discoveredSources)
    add('extracted_chunks', counters.extractedChunks)
    add('embedded_chunks', counters.embeddedChunks)
    add('indexed_chunks', counters.indexedChunks)
    add('failed_sources', counters.failedSources)
    if (fields.length === 0) return
    values.push(generationId)
    this.requireDatabase().prepare(`UPDATE semantic_index_generations SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }

  public finalizeGeneration(
    generationId: string,
    status: SemanticIndexGenerationStatus,
    makeCurrent: boolean,
    errorMessage?: string
  ): void {
    const db = this.requireDatabase()
    const transaction = db.transaction(() => {
      if (makeCurrent) db.prepare(`UPDATE semantic_index_generations SET is_current = 0 WHERE id <> ?`).run(generationId)
      db.prepare(`
        UPDATE semantic_index_generations
        SET status = ?, completed_at = ?, is_current = ?, error_message = ?
        WHERE id = ?
      `).run(status, this.now(), makeCurrent ? 1 : 0, errorMessage ?? null, generationId)
    })
    transaction()
    this.refreshStorageMetrics(generationId)
  }

  public getSettings(): SemanticIndexSettings {
    const row = this.requireDatabase().prepare(`
      SELECT include_notes FROM semantic_index_settings WHERE id = 1
    `).get() as { include_notes: number } | undefined
    return { includeNotes: row?.include_notes === 1 }
  }

  public setSettings(updates: Partial<SemanticIndexSettings>): boolean {
    const current = this.getSettings()
    const includeNotes = updates.includeNotes ?? current.includeNotes
    this.requireDatabase().prepare(`
      INSERT INTO semantic_index_settings (id, include_notes) VALUES (1, ?)
      ON CONFLICT(id) DO UPDATE SET include_notes = excluded.include_notes
    `).run(includeNotes ? 1 : 0)
    return true
  }

  public getMetrics(): SemanticIndexMetrics {
    const generation = this.getCurrent() ?? this.getLatest()
    if (!generation) {
      return {
        chunkCount: 0,
        sourceCount: 0,
        failedSources: 0,
        storageTextBytes: 0,
        storageVectorBytes: 0,
        totalStorageBytes: 0
      }
    }
    return {
      ...(generation.isCurrent ? { currentGenerationId: generation.id } : {}),
      status: generation.status,
      ...(generation.providerId ? { providerId: generation.providerId } : {}),
      ...(generation.modelId ? { modelId: generation.modelId } : {}),
      ...(generation.dimensions ? { dimensions: generation.dimensions } : {}),
      chunkCount: generation.indexedChunks,
      sourceCount: generation.discoveredSources,
      failedSources: generation.failedSources,
      storageTextBytes: generation.storageTextBytes,
      storageVectorBytes: generation.storageVectorBytes,
      totalStorageBytes: generation.storageTextBytes + generation.storageVectorBytes
    }
  }

  private refreshStorageMetrics(generationId: string): void {
    const db = this.requireDatabase()
    const metrics = db.prepare(`
      SELECT COUNT(c.id) AS extracted_chunks,
             COUNT(e.chunk_id) AS embedded_chunks,
             COALESCE(SUM(LENGTH(c.text)), 0) AS storage_text_bytes,
             COALESCE(SUM(LENGTH(e.vector)), 0) AS storage_vector_bytes
      FROM semantic_index_chunks c
      LEFT JOIN semantic_index_embeddings e ON e.chunk_id = c.id
      WHERE c.generation_id = ?
    `).get(generationId) as {
      extracted_chunks: number
      embedded_chunks: number
      storage_text_bytes: number
      storage_vector_bytes: number
    }
    db.prepare(`
      UPDATE semantic_index_generations
      SET extracted_chunks = ?, embedded_chunks = ?, indexed_chunks = ?,
          storage_text_bytes = ?, storage_vector_bytes = ?
      WHERE id = ?
    `).run(
      metrics.extracted_chunks,
      metrics.embedded_chunks,
      metrics.embedded_chunks,
      metrics.storage_text_bytes,
      metrics.storage_vector_bytes,
      generationId
    )
  }

  private requireDatabase(): Database.Database {
    const db = this.databaseService.getDatabase()
    if (!db) throw new Error('Database is not connected to any vault.')
    return db
  }
}

function encodeVector(vector: number[]): Buffer {
  return Buffer.from(new Float32Array(vector).buffer)
}

function validateVector(vector: number[], dimensions: number): void {
  if (!Array.isArray(vector) || vector.length !== dimensions || !vector.every((value) => Number.isFinite(value))) {
    throw new Error('Embedding vector has incompatible dimensions')
  }
}

function mapGeneration(row: GenerationRow): SemanticIndexGeneration {
  return {
    id: row.id,
    status: row.status,
    ...(row.provider_id ? { providerId: row.provider_id } : {}),
    ...(row.model_id ? { modelId: row.model_id } : {}),
    ...(row.dimensions ? { dimensions: row.dimensions } : {}),
    chunkingVersion: row.chunking_version,
    createdAt: row.created_at,
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    totalSources: row.total_sources,
    discoveredSources: row.discovered_sources,
    extractedChunks: row.extracted_chunks,
    embeddedChunks: row.embedded_chunks,
    indexedChunks: row.indexed_chunks,
    failedSources: row.failed_sources,
    storageTextBytes: row.storage_text_bytes,
    storageVectorBytes: row.storage_vector_bytes,
    ...(row.error_message ? { errorMessage: row.error_message } : {}),
    isCurrent: row.is_current === 1
  }
}

function mapChunk(row: ChunkRow): SemanticIndexChunk {
  let locator: SemanticIndexChunk['locator'] = {}
  try {
    const parsed: unknown = JSON.parse(row.locator_json)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      locator = parsed as SemanticIndexChunk['locator']
    }
  } catch {
    // Invalid legacy locator data is kept as an empty, safe locator.
  }
  return {
    id: row.id,
    generationId: row.generation_id,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    courseId: row.course_id,
    ...(row.module_id ? { moduleId: row.module_id } : {}),
    ...(row.lesson_id ? { lessonId: row.lesson_id } : {}),
    ...(row.resource_id ? { resourceId: row.resource_id } : {}),
    ...(row.transcript_id ? { transcriptId: row.transcript_id } : {}),
    ...(row.note_id ? { noteId: row.note_id } : {}),
    sourceRevision: row.source_revision,
    contentRevision: row.content_revision,
    dataType: row.data_type,
    text: row.text,
    locator,
    ...(row.start_time === null ? {} : { startTime: row.start_time }),
    ...(row.end_time === null ? {} : { endTime: row.end_time }),
    createdAt: row.created_at
  }
}

function mapRetrievedChunk(row: ChunkRow): RetrievedChunk {
  const chunk = mapChunk(row)
  const locator = {
    ...chunk.locator,
    ...(chunk.startTime === undefined ? {} : { startTime: chunk.startTime }),
    ...(chunk.endTime === undefined ? {} : { endTime: chunk.endTime })
  }
  return {
    chunkId: chunk.id,
    sourceKind: chunk.sourceKind,
    sourceId: chunk.sourceId,
    courseId: chunk.courseId,
    ...(chunk.moduleId ? { moduleId: chunk.moduleId } : {}),
    ...(chunk.lessonId ? { lessonId: chunk.lessonId } : {}),
    ...(chunk.resourceId ? { resourceId: chunk.resourceId } : {}),
    ...(chunk.transcriptId ? { transcriptId: chunk.transcriptId } : {}),
    ...(chunk.noteId ? { noteId: chunk.noteId } : {}),
    sourceRevision: chunk.sourceRevision,
    text: chunk.text,
    locator,
    relevanceScore: 0
  }
}

function buildScopeFilter(scope: GroundedScope): { clause: string; values: string[] } {
  if (scope.type === 'lesson') return { clause: ' AND c.lesson_id = ?', values: [scope.lessonId] }
  if (scope.type === 'module') return { clause: ' AND c.module_id = ?', values: [scope.moduleId] }
  if (scope.type === 'course') return { clause: ' AND c.course_id = ?', values: [scope.courseId] }
  return { clause: '', values: [] }
}

function clampCandidateLimit(limit: number): number {
  return Math.max(1, Math.min(Math.floor(limit), 4000))
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isDatabaseService(value: SemanticIndexRepositoryDependencies | DatabaseService): value is DatabaseService {
  return Boolean(value && typeof value === 'object' && typeof (value as { getDatabase?: unknown }).getDatabase === 'function')
}

export const semanticIndexRepository = new SemanticIndexRepository(databaseService)
