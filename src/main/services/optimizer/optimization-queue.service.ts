import crypto from 'node:crypto'
import fs from 'node:fs'
import type {
  OptimizationProfile,
  OptimizationQueueItem
} from '../../../types/optimizer'
import type { SemanticIndexScope } from '../../../types/semantic-index'
import { databaseService, type DatabaseService } from '../database.service'
import { logger } from '../logger.service'
import { normalizeSemanticScope } from '../semantic-index/semantic-chunker'

interface SemanticQueueDbRow {
  id: string
  jobType?: 'semantic_index'
  lessonId?: string | null
  courseId?: string | null
  sourcePath?: string | null
  profile: OptimizationProfile
  targetCodec: string
  estimatedSavings: number
  status: OptimizationQueueItem['status']
  progressPercent: number
  retryCount: number
  errorMessage?: string | null
  semanticScopeJson?: string | null
  semanticRebuild?: number | null
  semanticIncludeNotes?: number | null
  semanticCloudConsent?: number | null
  semanticGenerationId?: string | null
  createdAt: number
  updatedAt: number
}

function parseSemanticScope(value: string): SemanticIndexScope | undefined {
  try {
    return normalizeSemanticScope(JSON.parse(value) as SemanticIndexScope)
  } catch {
    return undefined
  }
}

function mapSemanticQueueRow(row: SemanticQueueDbRow): OptimizationQueueItem {
  const scope = row.semanticScopeJson ? parseSemanticScope(row.semanticScopeJson) : undefined
  return {
    id: row.id,
    jobType: 'semantic_index',
    lessonId: row.lessonId ?? '',
    courseId: row.courseId ?? undefined,
    sourcePath: row.sourcePath ?? '',
    profile: row.profile,
    targetCodec: row.targetCodec,
    estimatedSavings: row.estimatedSavings,
    status: row.status,
    progressPercent: row.progressPercent,
    retryCount: row.retryCount,
    errorMessage: row.errorMessage ?? undefined,
    ...(scope ? { semanticScope: scope } : {}),
    ...(row.semanticRebuild === null || row.semanticRebuild === undefined
      ? {}
      : { semanticRebuild: Boolean(row.semanticRebuild) }),
    ...(row.semanticIncludeNotes === null || row.semanticIncludeNotes === undefined
      ? {}
      : { semanticIncludeNotes: Boolean(row.semanticIncludeNotes) }),
    ...(row.semanticCloudConsent === null || row.semanticCloudConsent === undefined
      ? {}
      : { semanticCloudConsent: Boolean(row.semanticCloudConsent) }),
    ...(row.semanticGenerationId ? { semanticGenerationId: row.semanticGenerationId } : {}),
    isSharedFile: false,
    sharedConfirmationGiven: false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export interface EnqueueJobInput {
  lessonId: string
  courseId?: string
  sourcePath: string
  profile: OptimizationProfile
  targetCodec?: string
  targetResolution?: string
  estimatedSavings?: number
  isSharedFile?: boolean
  sharedConfirmationGiven?: boolean
}

export interface EnqueueTranscriptionJobInput {
  lessonId: string
  courseId?: string
  sourcePath: string
  sourceRevision: string
  language?: string
  autoDetect?: boolean
  reuseExistingSubtitle?: boolean
  retranscribe?: boolean
  cloudConsent?: boolean
}

export interface EnqueueSemanticIndexJobInput {
  scope: SemanticIndexScope
  rebuild?: boolean
  includeNotes?: boolean
  cloudConsent?: boolean
}

type QueueDbRow = Omit<
  OptimizationQueueItem,
  | 'isSharedFile'
  | 'sharedConfirmationGiven'
  | 'transcriptionAutoDetect'
  | 'transcriptionReuseExistingSubtitle'
  | 'transcriptionRetranscribe'
  | 'transcriptionCloudConsent'
  | 'semanticScope'
  | 'semanticRebuild'
  | 'semanticIncludeNotes'
  | 'semanticCloudConsent'
  | 'semanticGenerationId'
> & {
  isSharedFile: number
  sharedConfirmationGiven: number
  transcriptionAutoDetect?: number
  transcriptionReuseExistingSubtitle?: number
  transcriptionRetranscribe?: number
  transcriptionCloudConsent?: number
  semanticScopeJson?: string | null
  semanticRebuild?: number | null
  semanticIncludeNotes?: number | null
  semanticCloudConsent?: number | null
  semanticGenerationId?: string | null
}

export class OptimizationQueueService {
  private readonly cancellationListeners = new Set<(jobId: string) => void>()

  public constructor(private readonly database: DatabaseService = databaseService) {}

  public subscribeCancellation(listener: (jobId: string) => void): () => void {
    this.cancellationListeners.add(listener)
    return () => this.cancellationListeners.delete(listener)
  }

  /**
   * Adds an item to the persistent optimization queue.
   */
  public enqueue(input: EnqueueJobInput): OptimizationQueueItem {
    const db = this.database.getDatabase()
    if (!db) throw new Error('Database is not connected to any vault.')

    const id = `job_${crypto.randomUUID()}`
    const now = Date.now()

    const item: OptimizationQueueItem = {
      id,
      jobType: 'optimization',
      lessonId: input.lessonId,
      courseId: input.courseId,
      sourcePath: input.sourcePath,
      profile: input.profile || 'balanced',
      targetCodec: input.targetCodec || 'hevc',
      targetResolution: input.targetResolution,
      estimatedSavings: input.estimatedSavings || 0,
      status: 'queued',
      progressPercent: 0,
      retryCount: 0,
      isSharedFile: Boolean(input.isSharedFile),
      sharedConfirmationGiven: Boolean(input.sharedConfirmationGiven),
      createdAt: now,
      updatedAt: now
    }

    db.prepare(`
      INSERT INTO optimization_queue (
        id, job_type, lesson_id, course_id, source_path, profile, target_codec,
        target_resolution, estimated_savings, status, progress_percent,
        retry_count, is_shared_file, shared_confirmation_given, created_at, updated_at
      ) VALUES (
        @id, 'optimization', @lessonId, @courseId, @sourcePath, @profile, @targetCodec,
        @targetResolution, @estimatedSavings, @status, @progressPercent,
        @retryCount, @isSharedFile, @sharedConfirmationGiven, @createdAt, @updatedAt
      )
    `).run({
      ...item,
      isSharedFile: item.isSharedFile ? 1 : 0,
      sharedConfirmationGiven: item.sharedConfirmationGiven ? 1 : 0
    })

    return item
  }

  /** Adds a transcription request to the same durable queue used by optimization. */
  public enqueueTranscription(input: EnqueueTranscriptionJobInput): OptimizationQueueItem {
    const db = this.database.getDatabase()
    if (!db) throw new Error('Database is not connected to any vault.')

    const existing = db.prepare(`
      SELECT id, job_type as jobType, lesson_id as lessonId, course_id as courseId, source_path as sourcePath,
             transcription_language as transcriptionLanguage, transcription_auto_detect as transcriptionAutoDetect,
             transcription_reuse_subtitle as transcriptionReuseExistingSubtitle,
             transcription_retranscribe as transcriptionRetranscribe,
             transcription_cloud_consent as transcriptionCloudConsent,
             source_revision as sourceRevision, profile, target_codec as targetCodec,
             estimated_savings as estimatedSavings, status, progress_percent as progressPercent,
             retry_count as retryCount, created_at as createdAt, updated_at as updatedAt
      FROM optimization_queue
      WHERE job_type = 'transcription' AND lesson_id = ?
        AND status IN ('queued', 'extracting', 'transcribing', 'waiting_for_resources', 'paused')
      ORDER BY created_at DESC
      LIMIT 1
    `).get(input.lessonId) as {
      id: string
      jobType: 'transcription'
      lessonId: string
      courseId?: string
      sourcePath: string
      transcriptionLanguage?: string
      transcriptionAutoDetect: number
      transcriptionReuseExistingSubtitle: number
      transcriptionRetranscribe: number
      transcriptionCloudConsent: number
      sourceRevision?: string
      profile: OptimizationProfile
      targetCodec: string
      estimatedSavings: number
      status: OptimizationQueueItem['status']
      progressPercent: number
      retryCount: number
      createdAt: number
      updatedAt: number
    } | undefined
    if (existing) {
      return {
        ...existing,
        isSharedFile: false,
        sharedConfirmationGiven: false,
        transcriptionAutoDetect: Boolean(existing.transcriptionAutoDetect),
        transcriptionReuseExistingSubtitle: Boolean(existing.transcriptionReuseExistingSubtitle),
        transcriptionRetranscribe: Boolean(existing.transcriptionRetranscribe),
        transcriptionCloudConsent: Boolean(existing.transcriptionCloudConsent)
      }
    }

    const id = `job_${crypto.randomUUID()}`
    const now = Date.now()
    const item: OptimizationQueueItem = {
      id,
      jobType: 'transcription',
      lessonId: input.lessonId,
      courseId: input.courseId,
      sourcePath: input.sourcePath,
      profile: 'balanced',
      targetCodec: 'none',
      estimatedSavings: 0,
      status: 'queued',
      progressPercent: 0,
      retryCount: 0,
      isSharedFile: false,
      sharedConfirmationGiven: false,
      transcriptionLanguage: input.language,
      transcriptionAutoDetect: input.autoDetect !== false,
      transcriptionReuseExistingSubtitle: input.reuseExistingSubtitle !== false,
      transcriptionRetranscribe: Boolean(input.retranscribe),
      transcriptionCloudConsent: Boolean(input.cloudConsent),
      sourceRevision: input.sourceRevision,
      createdAt: now,
      updatedAt: now
    }

    db.prepare(`
      INSERT INTO optimization_queue (
        id, job_type, lesson_id, course_id, source_path, profile, target_codec,
        status, progress_percent, retry_count, transcription_language,
        transcription_auto_detect, transcription_reuse_subtitle,
        transcription_retranscribe, transcription_cloud_consent, source_revision,
        created_at, updated_at
      ) VALUES (
        @id, 'transcription', @lessonId, @courseId, @sourcePath, 'balanced', 'none',
        'queued', 0, 0, @transcriptionLanguage, @transcriptionAutoDetect,
        @transcriptionReuseExistingSubtitle, @transcriptionRetranscribe,
        @transcriptionCloudConsent, @sourceRevision, @createdAt, @updatedAt
      )
    `).run({
      ...item,
      transcriptionAutoDetect: item.transcriptionAutoDetect ? 1 : 0,
      transcriptionReuseExistingSubtitle: item.transcriptionReuseExistingSubtitle ? 1 : 0,
      transcriptionRetranscribe: item.transcriptionRetranscribe ? 1 : 0,
      transcriptionCloudConsent: item.transcriptionCloudConsent ? 1 : 0
    })
    return item
  }

  /** Adds a semantic-index request to the shared durable background queue. */
  public enqueueSemanticIndex(input: EnqueueSemanticIndexJobInput): OptimizationQueueItem {
    const db = this.database.getDatabase()
    if (!db) throw new Error('Database is not connected to any vault.')

    const scope = normalizeSemanticScope(input.scope)
    const scopeJson = JSON.stringify(scope)
    const rebuild = input.rebuild === true ? 1 : 0
    const includeNotes = input.includeNotes === true ? 1 : 0
    const cloudConsent = input.cloudConsent === true ? 1 : 0
    const existing = db.prepare(`
      SELECT id, job_type as jobType, lesson_id as lessonId, course_id as courseId,
             source_path as sourcePath, profile, target_codec as targetCodec,
             estimated_savings as estimatedSavings, status,
             progress_percent as progressPercent, retry_count as retryCount,
             error_message as errorMessage, semantic_scope as semanticScopeJson,
             semantic_rebuild as semanticRebuild, semantic_include_notes as semanticIncludeNotes,
             semantic_cloud_consent as semanticCloudConsent,
             semantic_generation_id as semanticGenerationId,
             created_at as createdAt, updated_at as updatedAt
      FROM optimization_queue
      WHERE job_type = 'semantic_index'
        AND semantic_scope = ?
        AND semantic_rebuild = ?
        AND semantic_include_notes = ?
        AND semantic_cloud_consent = ?
        AND status IN ('queued', 'indexing', 'waiting_for_resources', 'paused')
      ORDER BY created_at DESC
      LIMIT 1
    `).get(scopeJson, rebuild, includeNotes, cloudConsent) as SemanticQueueDbRow | undefined
    if (existing) return mapSemanticQueueRow(existing)

    const id = `job_${crypto.randomUUID()}`
    const now = Date.now()
    const item: OptimizationQueueItem = {
      id,
      jobType: 'semantic_index',
      lessonId: '',
      courseId: scope.type === 'course' ? scope.courseId : undefined,
      sourcePath: '',
      profile: 'balanced',
      targetCodec: 'none',
      estimatedSavings: 0,
      status: 'queued',
      progressPercent: 0,
      retryCount: 0,
      semanticScope: scope,
      semanticRebuild: rebuild === 1,
      semanticIncludeNotes: includeNotes === 1,
      semanticCloudConsent: cloudConsent === 1,
      createdAt: now,
      updatedAt: now
    }

    db.prepare(`
      INSERT INTO optimization_queue (
        id, job_type, lesson_id, course_id, source_path, profile, target_codec,
        estimated_savings, status, progress_percent, retry_count,
        semantic_scope, semantic_rebuild, semantic_include_notes,
        semantic_cloud_consent, created_at, updated_at
      ) VALUES (?, 'semantic_index', NULL, ?, '', 'balanced', 'none', 0, 'queued', 0, 0, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      item.courseId ?? null,
      scopeJson,
      rebuild,
      includeNotes,
      cloudConsent,
      now,
      now
    )
    return item
  }

  /**
   * Adds a batch of items to the persistent optimization queue.
   */
  public enqueueBatch(items: EnqueueJobInput[]): OptimizationQueueItem[] {
    const db = this.database.getDatabase()
    if (!db) throw new Error('Database is not connected to any vault.')

    const created: OptimizationQueueItem[] = []
    const tx = db.transaction((inputs: EnqueueJobInput[]) => {
      for (const input of inputs) {
        // Skip if there is already an active/pending job for this lesson
        const existing = db.prepare(`
          SELECT id FROM optimization_queue
          WHERE job_type = 'optimization' AND lesson_id = ? AND status IN ('queued', 'analyzing', 'encoding', 'validating', 'backing_up', 'replacing', 'ready')
        `).get(input.lessonId)

        if (!existing) {
          created.push(this.enqueue(input))
        }
      }
    })

    tx(items)
    return created
  }

  /**
   * Retrieves all items from the optimization queue.
   */
  public listQueue(): OptimizationQueueItem[] {
    const db = this.database.getDatabase()
    if (!db) return []

    const rows = db.prepare(`
      SELECT
        id, job_type as jobType, lesson_id as lessonId, course_id as courseId, source_path as sourcePath,
        temp_output_path as tempOutputPath, final_output_path as finalOutputPath,
        backup_path as backupPath, profile, target_codec as targetCodec,
        target_resolution as targetResolution, estimated_savings as estimatedSavings,
        actual_savings as actualSavings, status, progress_percent as progressPercent,
        current_fps as currentFps, current_speed as currentSpeed, eta_seconds as etaSeconds,
        retry_count as retryCount, error_message as errorMessage,
        transcription_language as transcriptionLanguage,
        transcription_auto_detect as transcriptionAutoDetect,
        transcription_reuse_subtitle as transcriptionReuseExistingSubtitle,
        transcription_retranscribe as transcriptionRetranscribe,
        transcription_cloud_consent as transcriptionCloudConsent,
        source_revision as sourceRevision,
        is_shared_file as isSharedFile, shared_confirmation_given as sharedConfirmationGiven,
        created_at as createdAt, updated_at as updatedAt
      FROM optimization_queue
      WHERE job_type = 'optimization'
      ORDER BY
        CASE status
          WHEN 'encoding' THEN 1
          WHEN 'validating' THEN 2
          WHEN 'backing_up' THEN 3
          WHEN 'replacing' THEN 4
          WHEN 'analyzing' THEN 5
          WHEN 'ready' THEN 6
          WHEN 'queued' THEN 7
          WHEN 'waiting_for_resources' THEN 8
          WHEN 'paused' THEN 9
          WHEN 'requires_review' THEN 10
          WHEN 'failed' THEN 11
          WHEN 'completed' THEN 12
          WHEN 'cancelled' THEN 13
          ELSE 14
        END,
        created_at ASC
    `).all() as (Omit<OptimizationQueueItem, 'isSharedFile' | 'sharedConfirmationGiven'> & {
      isSharedFile: number
      sharedConfirmationGiven: number
    })[]

    return rows.map((r) => ({
      ...r,
      jobType: r.jobType ?? 'optimization',
      isSharedFile: Boolean(r.isSharedFile),
      sharedConfirmationGiven: Boolean(r.sharedConfirmationGiven)
    }))
  }

  /**
   * Gets the next pending job to be processed.
   */
  public getNextJob(): OptimizationQueueItem | null {
    const db = this.database.getDatabase()
    if (!db) return null

    const row = db.prepare(`
      SELECT
        id, job_type as jobType, lesson_id as lessonId, course_id as courseId, source_path as sourcePath,
        temp_output_path as tempOutputPath, final_output_path as finalOutputPath,
        backup_path as backupPath, profile, target_codec as targetCodec,
        target_resolution as targetResolution, estimated_savings as estimatedSavings,
        actual_savings as actualSavings, status, progress_percent as progressPercent,
        current_fps as currentFps, current_speed as currentSpeed, eta_seconds as etaSeconds,
        retry_count as retryCount, error_message as errorMessage,
        transcription_language as transcriptionLanguage,
        transcription_auto_detect as transcriptionAutoDetect,
        transcription_reuse_subtitle as transcriptionReuseExistingSubtitle,
        transcription_retranscribe as transcriptionRetranscribe,
        transcription_cloud_consent as transcriptionCloudConsent,
        source_revision as sourceRevision,
        is_shared_file as isSharedFile, shared_confirmation_given as sharedConfirmationGiven,
        created_at as createdAt, updated_at as updatedAt
      FROM optimization_queue
      WHERE job_type = 'optimization' AND status IN ('queued', 'ready')
      ORDER BY created_at ASC
      LIMIT 1
    `).get() as (Omit<OptimizationQueueItem, 'isSharedFile' | 'sharedConfirmationGiven'> & {
      isSharedFile: number
      sharedConfirmationGiven: number
    }) | undefined

    if (!row) return null
    return {
      ...row,
      jobType: row.jobType ?? 'optimization',
      isSharedFile: Boolean(row.isSharedFile),
      sharedConfirmationGiven: Boolean(row.sharedConfirmationGiven)
    }
  }

  public listTranscriptionQueue(): OptimizationQueueItem[] {
    const db = this.database.getDatabase()
    if (!db) return []
    const rows = db.prepare(`
      SELECT
        id, job_type as jobType, lesson_id as lessonId, course_id as courseId, source_path as sourcePath,
        temp_output_path as tempOutputPath, status, progress_percent as progressPercent,
        retry_count as retryCount, error_message as errorMessage,
        transcription_language as transcriptionLanguage,
        transcription_auto_detect as transcriptionAutoDetect,
        transcription_reuse_subtitle as transcriptionReuseExistingSubtitle,
        transcription_retranscribe as transcriptionRetranscribe,
        transcription_cloud_consent as transcriptionCloudConsent,
        source_revision as sourceRevision, created_at as createdAt, updated_at as updatedAt
      FROM optimization_queue
      WHERE job_type = 'transcription'
      ORDER BY created_at ASC
    `).all() as Array<OptimizationQueueItem & {
      transcriptionAutoDetect?: number
      transcriptionReuseExistingSubtitle?: number
      transcriptionRetranscribe?: number
      transcriptionCloudConsent?: number
    }>
    return rows.map((row) => ({
      ...row,
      jobType: 'transcription',
      transcriptionAutoDetect: Boolean(row.transcriptionAutoDetect),
      transcriptionReuseExistingSubtitle: Boolean(row.transcriptionReuseExistingSubtitle),
      transcriptionRetranscribe: Boolean(row.transcriptionRetranscribe),
      transcriptionCloudConsent: Boolean(row.transcriptionCloudConsent)
    }))
  }

  public listSemanticIndexQueue(): OptimizationQueueItem[] {
    const db = this.database.getDatabase()
    if (!db) return []
    const rows = db.prepare(`
      SELECT id, job_type as jobType, lesson_id as lessonId, course_id as courseId,
             source_path as sourcePath, profile, target_codec as targetCodec,
             estimated_savings as estimatedSavings, status,
             progress_percent as progressPercent, retry_count as retryCount,
             error_message as errorMessage, semantic_scope as semanticScopeJson,
             semantic_rebuild as semanticRebuild, semantic_include_notes as semanticIncludeNotes,
             semantic_cloud_consent as semanticCloudConsent,
             semantic_generation_id as semanticGenerationId,
             created_at as createdAt, updated_at as updatedAt
      FROM optimization_queue
      WHERE job_type = 'semantic_index'
      ORDER BY created_at ASC
    `).all() as SemanticQueueDbRow[]
    return rows.map(mapSemanticQueueRow)
  }

  public getNextBackgroundJob(): OptimizationQueueItem | null {
    const db = this.database.getDatabase()
    if (!db) return null
    const row = db.prepare(`
      SELECT
        id, job_type as jobType, lesson_id as lessonId, course_id as courseId, source_path as sourcePath,
        temp_output_path as tempOutputPath, final_output_path as finalOutputPath,
        backup_path as backupPath, profile, target_codec as targetCodec,
        target_resolution as targetResolution, estimated_savings as estimatedSavings,
        actual_savings as actualSavings, status, progress_percent as progressPercent,
        current_fps as currentFps, current_speed as currentSpeed, eta_seconds as etaSeconds,
        retry_count as retryCount, error_message as errorMessage,
        transcription_language as transcriptionLanguage,
        transcription_auto_detect as transcriptionAutoDetect,
        transcription_reuse_subtitle as transcriptionReuseExistingSubtitle,
        transcription_retranscribe as transcriptionRetranscribe,
        transcription_cloud_consent as transcriptionCloudConsent,
        source_revision as sourceRevision,
        semantic_scope as semanticScopeJson,
        semantic_rebuild as semanticRebuild,
        semantic_include_notes as semanticIncludeNotes,
        semantic_cloud_consent as semanticCloudConsent,
        semantic_generation_id as semanticGenerationId,
        is_shared_file as isSharedFile, shared_confirmation_given as sharedConfirmationGiven,
        created_at as createdAt, updated_at as updatedAt
      FROM optimization_queue
      WHERE status IN ('queued', 'ready')
      ORDER BY
        CASE
          WHEN job_type = 'transcription' AND status = 'queued' THEN 1
          WHEN status = 'encoding' THEN 2
          WHEN status = 'validating' THEN 3
          WHEN status = 'backing_up' THEN 4
          WHEN status = 'replacing' THEN 5
          WHEN status = 'analyzing' THEN 6
          WHEN status = 'ready' THEN 7
          WHEN status = 'queued' THEN 8
          ELSE 9
        END,
        created_at ASC
      LIMIT 1
    `).get() as QueueDbRow | undefined
    if (!row) return null
    const {
      isSharedFile,
      sharedConfirmationGiven,
      transcriptionAutoDetect,
      transcriptionReuseExistingSubtitle,
      transcriptionRetranscribe,
      transcriptionCloudConsent,
      semanticScopeJson,
      semanticRebuild,
      semanticIncludeNotes,
      semanticCloudConsent,
      semanticGenerationId,
      ...rest
    } = row
    return {
      ...rest,
      lessonId: rest.lessonId ?? '',
      sourcePath: rest.sourcePath ?? '',
      jobType: rest.jobType ?? 'optimization',
      isSharedFile: Boolean(isSharedFile),
      sharedConfirmationGiven: Boolean(sharedConfirmationGiven),
      ...(transcriptionAutoDetect === undefined ? {} : { transcriptionAutoDetect: Boolean(transcriptionAutoDetect) }),
      ...(transcriptionReuseExistingSubtitle === undefined ? {} : { transcriptionReuseExistingSubtitle: Boolean(transcriptionReuseExistingSubtitle) }),
      ...(transcriptionRetranscribe === undefined ? {} : { transcriptionRetranscribe: Boolean(transcriptionRetranscribe) }),
      ...(transcriptionCloudConsent === undefined ? {} : { transcriptionCloudConsent: Boolean(transcriptionCloudConsent) }),
      ...(semanticScopeJson ? { semanticScope: parseSemanticScope(semanticScopeJson) } : {}),
      ...(semanticRebuild === undefined || semanticRebuild === null ? {} : { semanticRebuild: Boolean(semanticRebuild) }),
      ...(semanticIncludeNotes === undefined || semanticIncludeNotes === null ? {} : { semanticIncludeNotes: Boolean(semanticIncludeNotes) }),
      ...(semanticCloudConsent === undefined || semanticCloudConsent === null ? {} : { semanticCloudConsent: Boolean(semanticCloudConsent) }),
      ...(semanticGenerationId ? { semanticGenerationId } : {})
    }
  }

  /**
   * Updates status and optional progress details of a job.
   */
  public updateJob(id: string, updates: Partial<OptimizationQueueItem>): void {
    const db = this.database.getDatabase()
    if (!db) return

    const now = Date.now()
    const fields: string[] = ['updated_at = ?']
    const values: unknown[] = [now]

    if (updates.status !== undefined) {
      fields.push('status = ?')
      values.push(updates.status)
    }
    if (updates.progressPercent !== undefined) {
      fields.push('progress_percent = ?')
      values.push(updates.progressPercent)
    }
    if (updates.currentFps !== undefined) {
      fields.push('current_fps = ?')
      values.push(updates.currentFps)
    }
    if (updates.currentSpeed !== undefined) {
      fields.push('current_speed = ?')
      values.push(updates.currentSpeed)
    }
    if (updates.etaSeconds !== undefined) {
      fields.push('eta_seconds = ?')
      values.push(updates.etaSeconds)
    }
    if (updates.tempOutputPath !== undefined) {
      fields.push('temp_output_path = ?')
      values.push(updates.tempOutputPath)
    }
    if (updates.finalOutputPath !== undefined) {
      fields.push('final_output_path = ?')
      values.push(updates.finalOutputPath)
    }
    if (updates.backupPath !== undefined) {
      fields.push('backup_path = ?')
      values.push(updates.backupPath)
    }
    if (updates.actualSavings !== undefined) {
      fields.push('actual_savings = ?')
      values.push(updates.actualSavings)
    }
    if (updates.retryCount !== undefined) {
      fields.push('retry_count = ?')
      values.push(updates.retryCount)
    }
    if (updates.errorMessage !== undefined) {
      fields.push('error_message = ?')
      values.push(updates.errorMessage)
    }
    if (updates.sharedConfirmationGiven !== undefined) {
      fields.push('shared_confirmation_given = ?')
      values.push(updates.sharedConfirmationGiven ? 1 : 0)
    }
    if (updates.transcriptionLanguage !== undefined) {
      fields.push('transcription_language = ?')
      values.push(updates.transcriptionLanguage)
    }
    if (updates.transcriptionAutoDetect !== undefined) {
      fields.push('transcription_auto_detect = ?')
      values.push(updates.transcriptionAutoDetect ? 1 : 0)
    }
    if (updates.transcriptionReuseExistingSubtitle !== undefined) {
      fields.push('transcription_reuse_subtitle = ?')
      values.push(updates.transcriptionReuseExistingSubtitle ? 1 : 0)
    }
    if (updates.transcriptionRetranscribe !== undefined) {
      fields.push('transcription_retranscribe = ?')
      values.push(updates.transcriptionRetranscribe ? 1 : 0)
    }
    if (updates.transcriptionCloudConsent !== undefined) {
      fields.push('transcription_cloud_consent = ?')
      values.push(updates.transcriptionCloudConsent ? 1 : 0)
    }
    if (updates.sourceRevision !== undefined) {
      fields.push('source_revision = ?')
      values.push(updates.sourceRevision)
    }
    if (updates.semanticGenerationId !== undefined) {
      fields.push('semantic_generation_id = ?')
      values.push(updates.semanticGenerationId)
    }

    values.push(id)
    db.prepare(`UPDATE optimization_queue SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }

  public pauseJob(id: string): boolean {
    const db = this.database.getDatabase()
    if (!db) return false
    db.prepare(`UPDATE optimization_queue SET status = 'paused', updated_at = ? WHERE id = ? AND status IN ('queued', 'ready', 'waiting_for_resources')`).run(Date.now(), id)
    return true
  }

  public resumeJob(id: string): boolean {
    const db = this.database.getDatabase()
    if (!db) return false
    db.prepare(`UPDATE optimization_queue SET status = 'queued', updated_at = ? WHERE id = ? AND status = 'paused'`).run(Date.now(), id)
    return true
  }

  public cancelJob(id: string): boolean {
    const db = this.database.getDatabase()
    if (!db) return false
    const result = db.prepare(`UPDATE optimization_queue SET status = 'cancelled', updated_at = ? WHERE id = ? AND status NOT IN ('completed', 'cancelled')`).run(Date.now(), id)
    if (result.changes > 0) {
      for (const listener of this.cancellationListeners) listener(id)
    }
    return true
  }

  public isCancelled(id: string): boolean {
    const db = this.database.getDatabase()
    if (!db) return false
    const row = db.prepare(`SELECT status FROM optimization_queue WHERE id = ?`).get(id) as { status?: string } | undefined
    return row?.status === 'cancelled'
  }

  public isPaused(id: string): boolean {
    const db = this.database.getDatabase()
    if (!db) return false
    const row = db.prepare(`SELECT status FROM optimization_queue WHERE id = ?`).get(id) as { status?: string } | undefined
    return row?.status === 'paused'
  }

  public retryJob(id: string): boolean {
    const db = this.database.getDatabase()
    if (!db) return false
    db.prepare(`UPDATE optimization_queue SET status = 'queued', retry_count = 0, error_message = NULL, progress_percent = 0, updated_at = ? WHERE id = ?`).run(Date.now(), id)
    return true
  }

  public clearCompleted(): boolean {
    const db = this.database.getDatabase()
    if (!db) return false
    db.prepare(`DELETE FROM optimization_queue WHERE status IN ('completed', 'cancelled')`).run()
    return true
  }

  public pauseAll(): boolean {
    const db = this.database.getDatabase()
    if (!db) return false
    db.prepare(`UPDATE optimization_queue SET status = 'paused', updated_at = ? WHERE status IN ('queued', 'ready', 'waiting_for_resources')`).run(Date.now())
    return true
  }

  public resumeAll(): boolean {
    const db = this.database.getDatabase()
    if (!db) return false
    db.prepare(`UPDATE optimization_queue SET status = 'queued', updated_at = ? WHERE status = 'paused'`).run(Date.now())
    return true
  }

  /**
   * Reconciles interrupted or crashed jobs on application startup.
   */
  public recoverInterruptedJobs(): void {
    const db = this.database.getDatabase()
    if (!db) return

    try {
      // Find jobs that were in active processing states during a shutdown or crash
      const interrupted = db.prepare(`
        SELECT id, temp_output_path as tempOutputPath
        FROM optimization_queue
        WHERE status IN ('encoding', 'validating', 'backing_up', 'analyzing', 'waiting_for_resources', 'extracting', 'transcribing', 'indexing')
      `).all() as { id: string; tempOutputPath?: string }[]

      for (const job of interrupted) {
        // Clean partial temp file
        if (job.tempOutputPath && fs.existsSync(job.tempOutputPath)) {
          try {
            fs.unlinkSync(job.tempOutputPath)
          } catch {
            // Ignore
          }
        }
        // Reset to queued so it can be resumed safely
        this.updateJob(job.id, {
          status: 'queued',
          progressPercent: 0,
          currentFps: undefined,
          currentSpeed: undefined,
          etaSeconds: undefined
        })
      }
    } catch (err) {
      logger.warn('[OptimizationQueue] Error recovering interrupted jobs:', err)
    }
  }
}

export const optimizationQueueService = new OptimizationQueueService()
