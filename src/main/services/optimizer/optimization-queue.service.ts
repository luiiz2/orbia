import crypto from 'node:crypto'
import fs from 'node:fs'
import type {
  OptimizationProfile,
  OptimizationQueueItem
} from '../../../types/optimizer'
import { databaseService } from '../database.service'
import { logger } from '../logger.service'

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

export class OptimizationQueueService {
  /**
   * Adds an item to the persistent optimization queue.
   */
  public enqueue(input: EnqueueJobInput): OptimizationQueueItem {
    const db = databaseService.getDatabase()
    if (!db) throw new Error('Database is not connected to any vault.')

    const id = `job_${crypto.randomUUID()}`
    const now = Date.now()

    const item: OptimizationQueueItem = {
      id,
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
        id, lesson_id, course_id, source_path, profile, target_codec,
        target_resolution, estimated_savings, status, progress_percent,
        retry_count, is_shared_file, shared_confirmation_given, created_at, updated_at
      ) VALUES (
        @id, @lessonId, @courseId, @sourcePath, @profile, @targetCodec,
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

  /**
   * Adds a batch of items to the persistent optimization queue.
   */
  public enqueueBatch(items: EnqueueJobInput[]): OptimizationQueueItem[] {
    const db = databaseService.getDatabase()
    if (!db) throw new Error('Database is not connected to any vault.')

    const created: OptimizationQueueItem[] = []
    const tx = db.transaction((inputs: EnqueueJobInput[]) => {
      for (const input of inputs) {
        // Skip if there is already an active/pending job for this lesson
        const existing = db.prepare(`
          SELECT id FROM optimization_queue
          WHERE lesson_id = ? AND status IN ('queued', 'analyzing', 'encoding', 'validating', 'backing_up', 'replacing', 'ready')
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
    const db = databaseService.getDatabase()
    if (!db) return []

    const rows = db.prepare(`
      SELECT
        id, lesson_id as lessonId, course_id as courseId, source_path as sourcePath,
        temp_output_path as tempOutputPath, final_output_path as finalOutputPath,
        backup_path as backupPath, profile, target_codec as targetCodec,
        target_resolution as targetResolution, estimated_savings as estimatedSavings,
        actual_savings as actualSavings, status, progress_percent as progressPercent,
        current_fps as currentFps, current_speed as currentSpeed, eta_seconds as etaSeconds,
        retry_count as retryCount, error_message as errorMessage,
        is_shared_file as isSharedFile, shared_confirmation_given as sharedConfirmationGiven,
        created_at as createdAt, updated_at as updatedAt
      FROM optimization_queue
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
      isSharedFile: Boolean(r.isSharedFile),
      sharedConfirmationGiven: Boolean(r.sharedConfirmationGiven)
    }))
  }

  /**
   * Gets the next pending job to be processed.
   */
  public getNextJob(): OptimizationQueueItem | null {
    const db = databaseService.getDatabase()
    if (!db) return null

    const row = db.prepare(`
      SELECT
        id, lesson_id as lessonId, course_id as courseId, source_path as sourcePath,
        temp_output_path as tempOutputPath, final_output_path as finalOutputPath,
        backup_path as backupPath, profile, target_codec as targetCodec,
        target_resolution as targetResolution, estimated_savings as estimatedSavings,
        actual_savings as actualSavings, status, progress_percent as progressPercent,
        current_fps as currentFps, current_speed as currentSpeed, eta_seconds as etaSeconds,
        retry_count as retryCount, error_message as errorMessage,
        is_shared_file as isSharedFile, shared_confirmation_given as sharedConfirmationGiven,
        created_at as createdAt, updated_at as updatedAt
      FROM optimization_queue
      WHERE status IN ('queued', 'ready')
      ORDER BY created_at ASC
      LIMIT 1
    `).get() as (Omit<OptimizationQueueItem, 'isSharedFile' | 'sharedConfirmationGiven'> & {
      isSharedFile: number
      sharedConfirmationGiven: number
    }) | undefined

    if (!row) return null
    return {
      ...row,
      isSharedFile: Boolean(row.isSharedFile),
      sharedConfirmationGiven: Boolean(row.sharedConfirmationGiven)
    }
  }

  /**
   * Updates status and optional progress details of a job.
   */
  public updateJob(id: string, updates: Partial<OptimizationQueueItem>): void {
    const db = databaseService.getDatabase()
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

    values.push(id)
    db.prepare(`UPDATE optimization_queue SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }

  public pauseJob(id: string): boolean {
    const db = databaseService.getDatabase()
    if (!db) return false
    db.prepare(`UPDATE optimization_queue SET status = 'paused', updated_at = ? WHERE id = ? AND status IN ('queued', 'ready', 'waiting_for_resources')`).run(Date.now(), id)
    return true
  }

  public resumeJob(id: string): boolean {
    const db = databaseService.getDatabase()
    if (!db) return false
    db.prepare(`UPDATE optimization_queue SET status = 'queued', updated_at = ? WHERE id = ? AND status = 'paused'`).run(Date.now(), id)
    return true
  }

  public cancelJob(id: string): boolean {
    const db = databaseService.getDatabase()
    if (!db) return false
    db.prepare(`UPDATE optimization_queue SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(Date.now(), id)
    return true
  }

  public retryJob(id: string): boolean {
    const db = databaseService.getDatabase()
    if (!db) return false
    db.prepare(`UPDATE optimization_queue SET status = 'queued', retry_count = 0, error_message = NULL, progress_percent = 0, updated_at = ? WHERE id = ?`).run(Date.now(), id)
    return true
  }

  public clearCompleted(): boolean {
    const db = databaseService.getDatabase()
    if (!db) return false
    db.prepare(`DELETE FROM optimization_queue WHERE status IN ('completed', 'cancelled')`).run()
    return true
  }

  public pauseAll(): boolean {
    const db = databaseService.getDatabase()
    if (!db) return false
    db.prepare(`UPDATE optimization_queue SET status = 'paused', updated_at = ? WHERE status IN ('queued', 'ready', 'waiting_for_resources')`).run(Date.now())
    return true
  }

  public resumeAll(): boolean {
    const db = databaseService.getDatabase()
    if (!db) return false
    db.prepare(`UPDATE optimization_queue SET status = 'queued', updated_at = ? WHERE status = 'paused'`).run(Date.now())
    return true
  }

  /**
   * Reconciles interrupted or crashed jobs on application startup.
   */
  public recoverInterruptedJobs(): void {
    const db = databaseService.getDatabase()
    if (!db) return

    try {
      // Find jobs that were in active processing states during a shutdown or crash
      const interrupted = db.prepare(`
        SELECT id, temp_output_path as tempOutputPath
        FROM optimization_queue
        WHERE status IN ('encoding', 'validating', 'backing_up', 'analyzing', 'waiting_for_resources')
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
