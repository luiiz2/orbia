import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type {
  OptimizationQueueItem,
  OptimizationSettings
} from '../../../types/optimizer'
import { databaseService } from '../database.service'
import { appConfigService } from '../app-config.service'
import { optimizationQueueService } from './optimization-queue.service'
import { optimizationPlannerService } from './optimization-planner.service'
import { transcodingEngineService } from './transcoding-engine.service'
import { mediaValidatorService } from './media-validator.service'
import { mediaBackupService } from './media-backup.service'
import { optimizationJournalService } from './optimization-journal.service'
import { resourceManagerService } from './resource-manager.service'
import { LocalFileSourceInput } from './media-source-input'
import { logger } from '../logger.service'

export class OptimizationWorkerService {
  private isRunning = false
  private activeJobId: string | null = null
  private currentAbortController: AbortController | null = null
  private progressListeners: ((item: OptimizationQueueItem) => void)[] = []

  public getActiveJobId(): string | null {
    return this.activeJobId
  }

  /**
   * Starts the background queue worker loop.
   */
  public start(): void {
    if (this.isRunning) return
    this.isRunning = true
    optimizationQueueService.recoverInterruptedJobs()
    void this.processLoop()
  }

  /**
   * Stops the worker loop.
   */
  public stop(): void {
    this.isRunning = false
    if (this.currentAbortController) {
      this.currentAbortController.abort()
      this.currentAbortController = null
    }
  }

  public subscribeProgress(listener: (item: OptimizationQueueItem) => void): () => void {
    this.progressListeners.push(listener)
    return () => {
      this.progressListeners = this.progressListeners.filter((l) => l !== listener)
    }
  }

  private notifyProgress(item: OptimizationQueueItem): void {
    for (const listener of this.progressListeners) {
      try {
        listener(item)
      } catch {
        // Ignore listener error
      }
    }
  }

  /**
   * Continuous processing loop for queue consumption.
   */
  private async processLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const vaultPath = databaseService.getCurrentVaultPath()
        if (!vaultPath || !databaseService.isConnected()) {
          await this.sleep(2000)
          continue
        }

        const settings = appConfigService.getOptimizationSettings()

        // Check if resource manager permits processing (battery, player active)
        if (!resourceManagerService.canProcessJobs(settings)) {
          await this.sleep(2000)
          continue
        }

        const job = optimizationQueueService.getNextJob()
        if (!job) {
          await this.sleep(1500)
          continue
        }

        await this.processJob(job, vaultPath, settings)
      } catch (err) {
        logger.error('[OptimizationWorker] Error in process loop:', err)
        await this.sleep(3000)
      }
    }
  }

  /**
   * Processes a single optimization job through all safe lifecycle stages.
   */
  private async processJob(
    job: OptimizationQueueItem,
    vaultPath: string,
    settings: OptimizationSettings
  ): Promise<void> {
    this.activeJobId = job.id
    this.currentAbortController = new AbortController()

    try {
      // 1. Check Source File Existence
      if (!fs.existsSync(job.sourcePath)) {
        optimizationQueueService.updateJob(job.id, {
          status: 'failed',
          errorMessage: `Arquivo de origem não encontrado: ${job.sourcePath}`
        })
        return
      }

      // 2. Multi-Vault Shared File Check
      if (job.isSharedFile && !job.sharedConfirmationGiven) {
        optimizationQueueService.updateJob(job.id, {
          status: 'requires_review',
          errorMessage: 'Arquivo compartilhado entre múltiplos Vaults requer confirmação explícita.'
        })
        return
      }

      // 3. Stage: ANALYZING
      optimizationQueueService.updateJob(job.id, { status: 'analyzing', progressPercent: 0 })
      this.notifyProgress({ ...job, status: 'analyzing', progressPercent: 0 })

      const input = new LocalFileSourceInput(job.sourcePath)
      const metadata = await input.getMetadata()

      // 4. Create Plan
      const plan = optimizationPlannerService.createPlan(metadata, {
        lessonId: job.lessonId,
        courseId: job.courseId || '',
        courseTitle: '',
        lessonTitle: path.basename(job.sourcePath),
        profile: job.profile,
        isSharedFile: job.isSharedFile,
        minSavingsPercentThreshold: settings.autoOptimizeMinSavingsPercent
      })

      // If already efficient, mark completed immediately
      if (plan.isAlreadyEfficient) {
        optimizationQueueService.updateJob(job.id, {
          status: 'completed',
          actualSavings: 0,
          progressPercent: 100,
          errorMessage: plan.reason
        })
        this.notifyProgress({
          ...job,
          status: 'completed',
          actualSavings: 0,
          progressPercent: 100
        })
        return
      }

      // 5. Pre-flight Disk Space Check
      const hasSpace = await mediaBackupService.hasSufficientDiskSpace(
        job.sourcePath,
        plan.estimatedTargetSize,
        settings.customBackupDirectory
      )
      if (!hasSpace) {
        optimizationQueueService.updateJob(job.id, {
          status: 'waiting_for_resources',
          errorMessage: 'Espaço em disco insuficiente para arquivo temporário e backup.'
        })
        return
      }

      // 6. Stage: ENCODING
      const tempDir = path.join(vaultPath, '.orbia', 'temp')
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }
      const tempFileName = `opt_${crypto.randomUUID()}.${plan.targetContainer}`
      const tempOutputPath = path.join(tempDir, tempFileName)

      optimizationQueueService.updateJob(job.id, {
        status: 'encoding',
        tempOutputPath,
        progressPercent: 0
      })
      this.notifyProgress({ ...job, status: 'encoding', tempOutputPath, progressPercent: 0 })

      let lastNotifyTime = 0
      const encodeResult = await transcodingEngineService.transcode(
        input,
        plan,
        tempOutputPath,
        (progress) => {
          const now = Date.now()
          if (now - lastNotifyTime >= 250 || progress.percent === 100) {
            lastNotifyTime = now
            optimizationQueueService.updateJob(job.id, {
              progressPercent: progress.percent,
              currentFps: progress.fps,
              currentSpeed: progress.speed,
              etaSeconds: progress.etaSeconds
            })
            this.notifyProgress({
              ...job,
              status: 'encoding',
              progressPercent: progress.percent,
              currentFps: progress.fps,
              currentSpeed: progress.speed,
              etaSeconds: progress.etaSeconds
            })
          }
        },
        this.currentAbortController.signal
      )

      if (!encodeResult.success) {
        throw new Error(encodeResult.error || 'Transcoding failed')
      }

      // 7. Stage: VALIDATING
      optimizationQueueService.updateJob(job.id, { status: 'validating', progressPercent: 95 })
      this.notifyProgress({ ...job, status: 'validating', progressPercent: 95 })

      const validation = await mediaValidatorService.validate(metadata, plan, tempOutputPath)
      if (!validation.isValid) {
        throw new Error(`Validação falhou: ${validation.errors.join(' | ')}`)
      }

      // 8. Stage: BACKING_UP
      optimizationQueueService.updateJob(job.id, { status: 'backing_up', progressPercent: 98 })
      this.notifyProgress({ ...job, status: 'backing_up', progressPercent: 98 })

      const backupResult = await mediaBackupService.createBackup(
        vaultPath,
        job.sourcePath,
        settings.customBackupDirectory
      )
      if (!backupResult.success) {
        throw new Error(`Criação de backup falhou: ${backupResult.error}`)
      }

      // 9. Stage: REPLACING & ATOMIC ACTIVATION
      optimizationQueueService.updateJob(job.id, {
        status: 'replacing',
        backupPath: backupResult.backupPath,
        progressPercent: 99
      })
      this.notifyProgress({ ...job, status: 'replacing', progressPercent: 99 })

      const originalFingerprint = `${metadata.fileSizeBytes}_${metadata.durationSeconds}_${metadata.overallBitrate}`

      const commitResult = await optimizationJournalService.commitReplacement({
        vaultPath,
        lessonId: job.lessonId,
        plan,
        tempOptimizedFilePath: tempOutputPath,
        backupPath: backupResult.backupPath,
        outputSizeBytes: encodeResult.outputSize,
        profileUsed: job.profile,
        originalFingerprint
      })

      if (!commitResult.success) {
        throw new Error(`Substituição atômica falhou: ${commitResult.error}`)
      }

      // 10. Stage: COMPLETED
      const actualSavings = Math.max(0, plan.sourceSize - encodeResult.outputSize)
      optimizationQueueService.updateJob(job.id, {
        status: 'completed',
        finalOutputPath: commitResult.finalPath,
        actualSavings,
        progressPercent: 100,
        errorMessage: undefined
      })
      this.notifyProgress({
        ...job,
        status: 'completed',
        finalOutputPath: commitResult.finalPath,
        actualSavings,
        progressPercent: 100
      })
    } catch (jobErr) {
      const errMsg = jobErr instanceof Error ? jobErr.message : String(jobErr)
      logger.error(`[OptimizationWorker] Job ${job.id} failed:`, errMsg)

      const nextRetryCount = job.retryCount + 1
      const isReviewRequired = nextRetryCount >= 3

      optimizationQueueService.updateJob(job.id, {
        status: isReviewRequired ? 'requires_review' : 'failed',
        retryCount: nextRetryCount,
        errorMessage: errMsg,
        progressPercent: 0
      })
      this.notifyProgress({
        ...job,
        status: isReviewRequired ? 'requires_review' : 'failed',
        retryCount: nextRetryCount,
        errorMessage: errMsg,
        progressPercent: 0
      })
    } finally {
      this.activeJobId = null
      this.currentAbortController = null
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

export const optimizationWorkerService = new OptimizationWorkerService()
