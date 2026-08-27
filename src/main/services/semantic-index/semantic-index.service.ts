import type { AiCoreService } from '../ai/ai-core.service'
import type { AiDataType, AiEmbeddingResponse } from '../../../types/ai'
import type { OptimizationQueueItem } from '../../../types/optimizer'
import type {
  SemanticIndexEnqueueInput,
  SemanticIndexGeneration,
  SemanticIndexProgress,
  SemanticIndexScope,
  SemanticIndexStatus,
  SemanticIndexMetrics,
  SemanticIndexSettings,
  SemanticSourceSelection
} from '../../../types/semantic-index'
import { normalizeSemanticScope, chunkSemanticDocument } from './semantic-chunker'
import {
  SemanticIndexRepository,
  semanticIndexRepository
} from './semantic-index-repository.service'
import {
  ContentExtractorService,
  contentExtractorService
} from './content-extractor.service'
import {
  OptimizationQueueService,
  optimizationQueueService
} from '../optimizer/optimization-queue.service'
import { aiCoreService } from '../ai/ai-core.service'

const EMBEDDING_BATCH_SIZE = 32

export interface SemanticIndexServiceDependencies {
  repository?: SemanticIndexRepository
  extractor?: ContentExtractorService
  aiCore?: Pick<AiCoreService, 'embed'>
  queue?: OptimizationQueueService
}

export interface SemanticIndexProcessOptions {
  /** Called after durable progress has been written. */
  onProgress?: (event: SemanticIndexProgress) => void
  /** Allows the shared worker to yield when playback/resource policy changes. */
  shouldYield?: () => boolean
}

export class SemanticIndexService {
  private readonly repository: SemanticIndexRepository
  private readonly extractor: ContentExtractorService
  private readonly aiCore: Pick<AiCoreService, 'embed'>
  private readonly queue: OptimizationQueueService

  public constructor(dependencies: SemanticIndexServiceDependencies = {}) {
    this.repository = dependencies.repository ?? semanticIndexRepository
    this.extractor = dependencies.extractor ?? contentExtractorService
    this.aiCore = dependencies.aiCore ?? aiCoreService
    this.queue = dependencies.queue ?? optimizationQueueService
  }

  public getStatus(): SemanticIndexStatus {
    return this.repository.getStatus()
  }

  public getMetrics(): SemanticIndexMetrics {
    return this.repository.getMetrics()
  }

  public getSettings(): SemanticIndexSettings {
    return this.repository.getSettings()
  }

  public setSettings(updates: Partial<SemanticIndexSettings>): boolean {
    return this.repository.setSettings(updates)
  }

  public listQueue(): OptimizationQueueItem[] {
    return this.queue.listSemanticIndexQueue()
  }

  public enqueue(input: SemanticIndexEnqueueInput): OptimizationQueueItem {
    const scope = normalizeSemanticScope(input.scope)
    return this.queue.enqueueSemanticIndex({
      scope,
      rebuild: input.rebuild === true,
      includeNotes: input.includeNotes ?? this.repository.getSettings().includeNotes,
      cloudConsent: input.cloudConsent === true
    })
  }

  public enqueueRebuild(input: Omit<SemanticIndexEnqueueInput, 'rebuild'>): OptimizationQueueItem {
    return this.enqueue({ ...input, rebuild: true })
  }

  public refreshSource(
    selection: SemanticSourceSelection,
    options: Omit<SemanticIndexEnqueueInput, 'scope' | 'rebuild'> = {}
  ): OptimizationQueueItem {
    const scope = scopeForSelection(selection)
    return this.enqueue({ ...options, scope, rebuild: false })
  }

  public removeSource(selection: SemanticSourceSelection): boolean {
    const generation = this.repository.getCurrent()
    if (!generation) return false
    const source = singleSelection(selection)
    if (source.kind === 'note') {
      return this.repository.deleteSource(generation.id, 'note', `note:${source.id}`)
    }
    if (source.kind === 'resource') {
      let deleted = false
      for (const sourceKind of ['pdf', 'markdown', 'text', 'code'] as const) {
        deleted = this.repository.deleteSource(generation.id, sourceKind, `resource:${source.id}`) || deleted
      }
      return deleted
    }

    let deleted = false
    deleted = this.repository.deleteSource(generation.id, 'transcript', `lesson:${source.id}:transcript`) || deleted
    deleted = this.repository.deleteSource(generation.id, 'subtitle', `lesson:${source.id}:subtitle`) || deleted
    deleted = this.repository.deleteSource(generation.id, 'metadata', `metadata:lesson:${source.id}`) || deleted
    for (const sourceKind of ['pdf', 'markdown', 'text', 'code'] as const) {
      deleted = this.repository.deleteSource(generation.id, sourceKind, `lesson-file:${source.id}`) || deleted
    }
    return deleted
  }

  public pause(jobId: string): boolean {
    return this.queue.pauseJob(jobId)
  }

  public resume(jobId: string): boolean {
    return this.queue.resumeJob(jobId)
  }

  public cancel(jobId: string): boolean {
    return this.queue.cancelJob(jobId)
  }

  public retry(jobId: string): boolean {
    return this.queue.retryJob(jobId)
  }

  public async processJob(
    job: OptimizationQueueItem,
    signal: AbortSignal,
    options: SemanticIndexProcessOptions = {}
  ): Promise<void> {
    if (job.jobType !== 'semantic_index' || !job.semanticScope) {
      throw new Error('Invalid semantic index job')
    }

    const scope = normalizeSemanticScope(job.semanticScope)
    const emit = (event: SemanticIndexProgress): void => {
      try {
        options.onProgress?.(event)
      } catch {
        // Progress observers must not interrupt durable indexing.
      }
    }

    let generation: SemanticIndexGeneration | null = null
    let ownsGeneration = false
    try {
      const includeNotes = job.semanticIncludeNotes ?? this.repository.getSettings().includeNotes
      const sources = this.extractor.listSources(scope, includeNotes)
      const current = this.repository.getCurrent()
      const needsNewGeneration = job.semanticRebuild === true || !current
      const resumedGeneration = job.semanticGenerationId
        ? this.repository.getGeneration(job.semanticGenerationId)
        : null

      if (needsNewGeneration) {
        if (resumedGeneration?.status === 'building') {
          generation = resumedGeneration
          this.repository.updateProgress(generation.id, {
            totalSources: sources.length,
            discoveredSources: sources.length
          })
        } else {
          generation = this.repository.createGeneration({ totalSources: sources.length })
          ownsGeneration = true
          this.queue.updateJob(job.id, { semanticGenerationId: generation.id })
        }
      } else {
        generation = current
      }

      if (!generation) throw new Error('Semantic index generation could not be created')
      this.repository.updateProgress(generation.id, {
        totalSources: needsNewGeneration ? sources.length : generation.totalSources,
        discoveredSources: needsNewGeneration ? sources.length : generation.discoveredSources
      })
      this.queue.updateJob(job.id, { status: 'indexing', progressPercent: 0 })
      emit({ status: 'indexing', progressPercent: 0 })

      const totalSources = sources.length
      let processedSources = 0
      let failedSources = needsNewGeneration ? generation.failedSources : generation.failedSources
      let firstFailure: string | undefined

      for (const source of sources) {
        if (this.isCancelled(job.id, signal)) {
          this.finishCancelled(job, generation, ownsGeneration, emit, progressPercent(processedSources, totalSources))
          return
        }
        if (this.queue.isPaused(job.id)) {
          emit({ status: 'queued', progressPercent: progressPercent(processedSources, totalSources) })
          return
        }
        if (options.shouldYield?.()) {
          this.queue.updateJob(job.id, {
            status: 'queued',
            progressPercent: progressPercent(processedSources, totalSources)
          })
          emit({ status: 'queued', progressPercent: progressPercent(processedSources, totalSources) })
          return
        }

        try {
          const documents = await this.extractor.extractSource(source)
          const chunks = documents.flatMap((document) => chunkSemanticDocument(document))
          if (chunks.length === 0) {
            this.repository.deleteSource(generation.id, source.sourceKind, source.sourceId)
          } else {
            const embeddings = await this.embedChunks(chunks, generation.id, job)
            this.repository.insertSourceChunks(generation.id, chunks, embeddings)
          }
        } catch (error) {
          if (this.isCancelled(job.id, signal)) {
            this.finishCancelled(job, generation, ownsGeneration, emit, progressPercent(processedSources, totalSources))
            return
          }
          failedSources += 1
          firstFailure ??= errorMessage(error)
        }

        processedSources += 1
        this.repository.updateProgress(generation.id, {
          failedSources,
          ...(needsNewGeneration ? { discoveredSources: totalSources } : {})
        })
        const progress = progressPercent(processedSources, totalSources)
        this.queue.updateJob(job.id, { status: 'indexing', progressPercent: progress })
        emit({ status: 'indexing', progressPercent: progress, ...(firstFailure ? { errorMessage: firstFailure } : {}) })
      }

      const status = failedSources > 0 ? 'partial' : 'completed'
      const makeCurrent = needsNewGeneration ? status === 'completed' : true
      this.repository.finalizeGeneration(generation.id, status, makeCurrent, firstFailure)
      this.queue.updateJob(job.id, {
        status,
        progressPercent: 100,
        ...(firstFailure ? { errorMessage: firstFailure } : {})
      })
      emit({ status, progressPercent: 100, ...(firstFailure ? { errorMessage: firstFailure } : {}) })
    } catch (error) {
      const message = errorMessage(error)
      if (generation && ownsGeneration) this.repository.finalizeGeneration(generation.id, 'failed', false, message)
      if (this.isCancelled(job.id, signal)) {
        this.queue.updateJob(job.id, { status: 'cancelled', errorMessage: message })
        emit({ status: 'cancelled', progressPercent: 0, errorMessage: message })
        return
      }
      const retryCount = job.retryCount + 1
      const status = retryCount >= 3 ? 'requires_review' : 'failed'
      this.queue.updateJob(job.id, {
        status,
        retryCount,
        errorMessage: message
      })
      emit({ status: 'failed', progressPercent: 0, errorMessage: message })
    }
  }

  private async embedChunks(
    chunks: ReturnType<typeof chunkSemanticDocument>,
    generationId: string,
    job: OptimizationQueueItem
  ): Promise<number[][]> {
    const vectors: number[][] = []
    for (let offset = 0; offset < chunks.length; offset += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(offset, offset + EMBEDDING_BATCH_SIZE)
      const dataTypes = [...new Set(batch.map((chunk) => chunk.dataType))] as AiDataType[]
      const response = await this.aiCore.embed({
        input: batch.map((chunk) => chunk.text),
        dataTypes,
        cloudConsent: job.semanticCloudConsent === true
      })
      validateEmbeddingResponse(response, batch.length)
      this.repository.setEmbeddingConfig(
        generationId,
        response.providerId,
        response.modelId,
        response.embeddings[0].length
      )
      vectors.push(...response.embeddings)
    }
    return vectors
  }

  private isCancelled(jobId: string, signal: AbortSignal): boolean {
    return signal.aborted || this.queue.isCancelled(jobId)
  }

  private finishCancelled(
    job: OptimizationQueueItem,
    generation: SemanticIndexGeneration,
    ownsGeneration: boolean,
    emit: (event: SemanticIndexProgress) => void,
    progress: number
  ): void {
    if (ownsGeneration) this.repository.finalizeGeneration(generation.id, 'cancelled', false, 'Indexing cancelled')
    this.queue.updateJob(job.id, { status: 'cancelled', progressPercent: progress, errorMessage: 'Indexing cancelled' })
    emit({ status: 'cancelled', progressPercent: progress, errorMessage: 'Indexing cancelled' })
  }
}

function scopeForSelection(selection: SemanticSourceSelection): SemanticIndexScope {
  const source = singleSelection(selection)
  if (source.kind === 'lesson') return { type: 'lesson', lessonId: source.id }
  if (source.kind === 'resource') return { type: 'selected', resourceIds: [source.id] }
  return { type: 'selected', noteIds: [source.id] }
}

function singleSelection(selection: SemanticSourceSelection): { kind: 'lesson' | 'resource' | 'note'; id: string } {
  const entries = [
    ...(selection.lessonId?.trim() ? [{ kind: 'lesson' as const, id: selection.lessonId.trim() }] : []),
    ...(selection.resourceId?.trim() ? [{ kind: 'resource' as const, id: selection.resourceId.trim() }] : []),
    ...(selection.noteId?.trim() ? [{ kind: 'note' as const, id: selection.noteId.trim() }] : [])
  ]
  if (entries.length !== 1) throw new Error('Select exactly one semantic source')
  return entries[0]
}

function validateEmbeddingResponse(response: AiEmbeddingResponse, expectedCount: number): void {
  if (!response || response.embeddings.length !== expectedCount || response.embeddings.length === 0) {
    throw new Error('Embedding result count does not match chunk count')
  }
  const dimensions = response.embeddings[0].length
  if (!Number.isInteger(dimensions) || dimensions <= 0) throw new Error('Embedding vector has incompatible dimensions')
  if (response.embeddings.some((vector) => vector.length !== dimensions || !vector.every((value) => Number.isFinite(value)))) {
    throw new Error('Embedding vector has incompatible dimensions')
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function progressPercent(processed: number, total: number): number {
  return total === 0 ? 100 : Math.min(100, Math.round((processed / total) * 100))
}

export const semanticIndexService = new SemanticIndexService()
