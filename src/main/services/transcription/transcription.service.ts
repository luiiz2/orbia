import type { OptimizationQueueItem } from '../../../types/optimizer'
import type {
  Transcript,
  TranscriptProgressEvent,
  TranscriptionBatchResult,
  TranscriptionEnqueueResult,
  TranscriptionOptions,
  TranscriptionSettings
} from '../../../types/transcription'
import { optimizationQueueService, type EnqueueTranscriptionJobInput } from '../optimizer/optimization-queue.service'
import { transcriptRepository, type TranscriptRepository } from './transcript-repository.service'
import { transcriptionEngineService, type TranscriptionEngine } from './transcription-engine.service'

export interface TranscriptionServiceDependencies {
  repository?: TranscriptRepository
  queue?: typeof optimizationQueueService
  engine?: TranscriptionEngine
}

export class TranscriptionService {
  private readonly repository: TranscriptRepository
  private readonly queue: typeof optimizationQueueService
  private readonly engine: TranscriptionEngine
  private readonly progressListeners: Array<(event: TranscriptProgressEvent) => void> = []

  public constructor(dependencies: TranscriptionServiceDependencies = {}) {
    this.repository = dependencies.repository ?? transcriptRepository
    this.queue = dependencies.queue ?? optimizationQueueService
    this.engine = dependencies.engine ?? transcriptionEngineService
  }

  public getCurrent(lessonId: string): Transcript | null {
    return this.repository.getCurrent(lessonId)
  }

  public listVersions(lessonId: string) {
    return this.repository.listVersions(lessonId)
  }

  public getSubtitleCandidate(lessonId: string, language?: string) {
    return this.repository.getSubtitleCandidate(lessonId, language)
  }

  public getSettings(): TranscriptionSettings {
    return this.repository.getSettings()
  }

  public setSettings(updates: Partial<TranscriptionSettings>): boolean {
    return this.repository.setSettings(updates)
  }

  public getCourseAutoTranscribe(courseId: string): boolean {
    return this.repository.getCourseAutoTranscribe(courseId)
  }

  public setCourseAutoTranscribe(courseId: string, enabled: boolean): boolean {
    return this.repository.setCourseAutoTranscribe(courseId, enabled)
  }

  public enqueueAutomaticallyIfEnabled(courseId: string): TranscriptionBatchResult | null {
    const vaultSettings = this.repository.getSettings()
    if (!vaultSettings.autoTranscribeNewLessons && !this.repository.getCourseAutoTranscribe(courseId)) return null
    return this.enqueueCourse(courseId, { reuseExistingSubtitle: true })
  }

  public listQueue(): OptimizationQueueItem[] {
    return this.queue.listTranscriptionQueue()
  }

  public pauseJob(jobId: string): boolean {
    return this.queue.pauseJob(jobId)
  }

  public resumeJob(jobId: string): boolean {
    return this.queue.resumeJob(jobId)
  }

  public cancelJob(jobId: string): boolean {
    return this.queue.cancelJob(jobId)
  }

  public retryJob(jobId: string): boolean {
    return this.queue.retryJob(jobId)
  }

  public enqueueLesson(lessonId: string, options: TranscriptionOptions = {}): TranscriptionEnqueueResult {
    const source = this.repository.getLessonSource(lessonId)
    if (!source) return { lessonId, skipped: true, reason: 'missing_lesson' }
    if (source.mediaType !== 'video' && source.mediaType !== 'audio') {
      return { lessonId, skipped: true, reason: 'unsupported_media' }
    }

    const active = this.queue.listTranscriptionQueue().find((job) =>
      job.lessonId === lessonId && ['queued', 'extracting', 'transcribing', 'waiting_for_resources', 'paused'].includes(job.status)
    )
    if (active) {
      return { lessonId, skipped: true, reason: 'active_job', jobId: active.id }
    }

    const current = this.repository.getCurrent(lessonId)
    if (current && !options.retranscribe && current.sourceRevision === source.sourceRevision) {
      return { lessonId, skipped: true, reason: 'already_current' }
    }

    const input: EnqueueTranscriptionJobInput = {
      lessonId,
      courseId: source.courseId,
      sourcePath: source.filePath,
      sourceRevision: source.sourceRevision,
      ...(options.language ? { language: options.language } : {}),
      ...(options.autoDetect === undefined ? {} : { autoDetect: options.autoDetect }),
      ...(options.reuseExistingSubtitle === undefined ? {} : { reuseExistingSubtitle: options.reuseExistingSubtitle }),
      ...(options.retranscribe === undefined ? {} : { retranscribe: options.retranscribe }),
      ...(options.cloudConsent === undefined ? {} : { cloudConsent: options.cloudConsent })
    }
    const job = this.queue.enqueueTranscription(input)
    return { lessonId, skipped: false, jobId: job.id }
  }

  public enqueueModule(moduleId: string, options: TranscriptionOptions = {}): TranscriptionBatchResult {
    return this.enqueueMany(this.repository.listLessonIdsForModule(moduleId), options)
  }

  public enqueueCourse(courseId: string, options: TranscriptionOptions = {}): TranscriptionBatchResult {
    return this.enqueueMany(this.repository.listLessonIdsForCourse(courseId), options)
  }

  public async reuseSubtitle(lessonId: string, language?: string): Promise<Transcript | null> {
    const source = this.repository.getLessonSource(lessonId)
    const candidate = this.repository.getSubtitleCandidate(lessonId, language)
    if (!source || !candidate) return null
    return this.repository.saveCompleted({
      lessonId,
      language: candidate.language ?? language ?? 'und',
      provider: 'subtitle',
      sourceRevision: source.sourceRevision,
      settings: {
        reusedExistingSubtitle: true,
        subtitleResourceId: candidate.resourceId,
        subtitlePath: candidate.filePath
      },
      segments: candidate.segments
    })
  }

  public subscribeProgress(listener: (event: TranscriptProgressEvent) => void): () => void {
    this.progressListeners.push(listener)
    return () => {
      const index = this.progressListeners.indexOf(listener)
      if (index >= 0) this.progressListeners.splice(index, 1)
    }
  }

  public async processJob(
    job: OptimizationQueueItem,
    signal: AbortSignal,
    notify?: (event: TranscriptProgressEvent) => void
  ): Promise<void> {
    const emit = (status: TranscriptProgressEvent['status'], progressPercent: number, errorMessage?: string): void => {
      this.queue.updateJob(job.id, {
        status,
        progressPercent,
        ...(errorMessage ? { errorMessage } : {})
      })
      const event: TranscriptProgressEvent = {
        jobId: job.id,
        lessonId: job.lessonId,
        status,
        progressPercent,
        ...(errorMessage ? { errorMessage } : {})
      }
      notify?.(event)
      for (const listener of this.progressListeners) listener(event)
    }

    if (this.queue.isCancelled(job.id)) return
    const source = this.repository.getLessonSource(job.lessonId)
    if (!source) {
      emit('failed', 0, 'Source unavailable')
      return
    }

    try {
      const shouldReuse = job.transcriptionReuseExistingSubtitle !== false && !job.transcriptionRetranscribe
      if (shouldReuse) {
        const reused = await this.reuseSubtitle(job.lessonId, job.transcriptionLanguage)
        if (reused) {
          emit('completed', 100)
          return
        }
      }

      if (source.mediaType !== 'video' && source.mediaType !== 'audio') {
        emit('failed', 0, 'Unsupported media for transcription')
        return
      }
      if (signal.aborted) return

      emit('extracting', 5)
      const result = await this.engine.transcribe(
        source.filePath,
        source.fileName,
        {
          ...(job.transcriptionLanguage ? { language: job.transcriptionLanguage } : {}),
          autoDetect: job.transcriptionAutoDetect !== false,
          cloudConsent: Boolean(job.transcriptionCloudConsent)
        },
        signal,
        (progressPercent) => emit('extracting', Math.min(34, Math.max(5, progressPercent)))
      )
      if (signal.aborted || this.queue.isCancelled(job.id)) return

      emit('transcribing', 40)
      const saved = this.repository.saveCompleted({
        lessonId: job.lessonId,
        language: result.language,
        provider: result.providerId,
        model: result.modelId,
        sourceRevision: source.sourceRevision,
        settings: {
          requestedLanguage: job.transcriptionLanguage ?? null,
          autoDetect: job.transcriptionAutoDetect !== false,
          retranscribe: Boolean(job.transcriptionRetranscribe),
          reuseExistingSubtitle: job.transcriptionReuseExistingSubtitle !== false,
          cloudConsent: Boolean(job.transcriptionCloudConsent)
        },
        segments: result.segments
      })
      if (!saved || saved.status !== 'completed') throw new Error('Transcript was not committed')
      emit('completed', 100)
    } catch (error) {
      if (signal.aborted && !this.queue.isCancelled(job.id)) return
      const message = error instanceof Error ? error.message : String(error)
      const status: TranscriptProgressEvent['status'] = this.queue.isCancelled(job.id) ? 'cancelled' : 'failed'
      emit(status, 0, message)
    }
  }

  private enqueueMany(lessonIds: string[], options: TranscriptionOptions): TranscriptionBatchResult {
    const jobs: TranscriptionEnqueueResult[] = lessonIds.map((lessonId) => this.enqueueLesson(lessonId, options))
    return {
      requestedCount: lessonIds.length,
      enqueuedCount: jobs.filter((job) => !job.skipped).length,
      skippedCount: jobs.filter((job) => job.skipped).length,
      jobs
    }
  }
}

export const transcriptionService = new TranscriptionService()
