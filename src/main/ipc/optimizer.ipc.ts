import { ipcMain, BrowserWindow } from 'electron'
import {
  optimizerAnalysisService,
  hardwareCapabilityService,
  optimizationQueueService,
  optimizationWorkerService,
  provenanceAndExclusionsService,
  visualComparatorService
} from '../services/optimizer'
import { appConfigService } from '../services/app-config.service'
import { databaseService } from '../services/database.service'
import type {
  OptimizationProfile,
  OptimizationSettings
} from '../../types/optimizer'
import { logger } from '../services/logger.service'

export function registerOptimizerIpc(): void {
  // Start worker and subscribe to progress events
  optimizationWorkerService.start()
  optimizationWorkerService.subscribeProgress((item) => {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('optimizer:progress', item)
      }
    }
  })

  // 1. Analyze Vault
  ipcMain.handle(
    'optimizer:analyze-vault',
    async (_event, profile?: OptimizationProfile) => {
      try {
        return await optimizerAnalysisService.analyzeVault(profile)
      } catch (err) {
        logger.error('[IPC optimizer:analyze-vault]', err)
        throw err
      }
    }
  )

  // 2. Hardware Capabilities
  ipcMain.handle('optimizer:get-hardware-capabilities', async () => {
    try {
      return await hardwareCapabilityService.getCapabilities()
    } catch (err) {
      logger.error('[IPC optimizer:get-hardware-capabilities]', err)
      throw err
    }
  })

  // 3. Queue Vault Optimization
  ipcMain.handle(
    'optimizer:queue-vault-optimization',
    async (
      _event,
      options?: {
        profile?: OptimizationProfile
        excludedLessonIds?: string[]
        allowSharedOptimization?: boolean
      }
    ) => {
      try {
        const analysis = await optimizerAnalysisService.analyzeVault(
          options?.profile
        )
        const excludedSet = new Set(options?.excludedLessonIds || [])

        const candidates = analysis.plans
          .filter((p) => !p.isAlreadyEfficient && !excludedSet.has(p.lessonId))
          .map((p) => ({
            lessonId: p.lessonId,
            courseId: p.courseId,
            sourcePath: p.sourcePath,
            profile: options?.profile || 'balanced',
            targetCodec: p.targetCodec,
            targetResolution: p.targetResolution,
            estimatedSavings: p.estimatedSavingsBytes,
            isSharedFile: p.isSharedFile,
            sharedConfirmationGiven: Boolean(options?.allowSharedOptimization)
          }))

        const queued = optimizationQueueService.enqueueBatch(candidates)
        return { queuedCount: queued.length }
      } catch (err) {
        logger.error('[IPC optimizer:queue-vault-optimization]', err)
        throw err
      }
    }
  )

  // 4. Queue Single Lesson Optimization
  ipcMain.handle(
    'optimizer:queue-lesson-optimization',
    async (
      _event,
      lessonId: string,
      profile?: OptimizationProfile,
      allowShared?: boolean
    ) => {
      try {
        const db = databaseService.getDatabase()
        if (!db) throw new Error('Database not connected.')

        const lesson = db
          .prepare(
            `
          SELECT id, course_id as courseId, file_path as filePath FROM lessons WHERE id = ?
        `
          )
          .get(lessonId) as
          { id: string; courseId: string; filePath: string } | undefined

        if (!lesson) throw new Error('Lesson not found.')

        const item = optimizationQueueService.enqueue({
          lessonId: lesson.id,
          courseId: lesson.courseId,
          sourcePath: lesson.filePath,
          profile: profile || 'balanced',
          sharedConfirmationGiven: allowShared
        })

        return { success: true, jobId: item.id }
      } catch (err) {
        logger.error('[IPC optimizer:queue-lesson-optimization]', err)
        return { success: false }
      }
    }
  )

  // 5. List Queue
  ipcMain.handle('optimizer:list-queue', async () => {
    return optimizationQueueService.listQueue()
  })

  // 6. Queue Controls
  ipcMain.handle('optimizer:pause-job', async (_event, jobId: string) => {
    return optimizationQueueService.pauseJob(jobId)
  })

  ipcMain.handle('optimizer:resume-job', async (_event, jobId: string) => {
    return optimizationQueueService.resumeJob(jobId)
  })

  ipcMain.handle('optimizer:cancel-job', async (_event, jobId: string) => {
    return optimizationQueueService.cancelJob(jobId)
  })

  ipcMain.handle('optimizer:retry-job', async (_event, jobId: string) => {
    return optimizationQueueService.retryJob(jobId)
  })

  ipcMain.handle('optimizer:clear-completed-queue', async () => {
    return optimizationQueueService.clearCompleted()
  })

  ipcMain.handle('optimizer:pause-all', async () => {
    return optimizationQueueService.pauseAll()
  })

  ipcMain.handle('optimizer:resume-all', async () => {
    return optimizationQueueService.resumeAll()
  })

  // 7. Visual Quality Comparator
  ipcMain.handle(
    'optimizer:generate-visual-comparison',
    async (_event, lessonId: string, profile?: OptimizationProfile) => {
      try {
        return await visualComparatorService.generateComparison(
          lessonId,
          profile
        )
      } catch (err) {
        logger.error('[IPC optimizer:generate-visual-comparison]', err)
        throw err
      }
    }
  )

  // 8. Provenance & Restore
  ipcMain.handle('optimizer:list-records', async (_event, limit?: number) => {
    return provenanceAndExclusionsService.listRecords(limit)
  })

  ipcMain.handle(
    'optimizer:restore-original',
    async (_event, recordId: string) => {
      return await provenanceAndExclusionsService.restoreOriginal(recordId)
    }
  )

  ipcMain.handle(
    'optimizer:reoptimize-lesson',
    async (_event, lessonId: string, profile?: OptimizationProfile) => {
      return await provenanceAndExclusionsService.reoptimizeLesson(
        lessonId,
        profile
      )
    }
  )

  // 9. Metrics & Settings
  ipcMain.handle('optimizer:get-metrics', async () => {
    return await optimizerAnalysisService.getMetrics()
  })

  ipcMain.handle('optimizer:get-settings', async () => {
    return appConfigService.getOptimizationSettings()
  })

  ipcMain.handle(
    'optimizer:update-settings',
    async (_event, settings: Partial<OptimizationSettings>) => {
      return appConfigService.updateOptimizationSettings(settings)
    }
  )

  // 10. Exclusions
  ipcMain.handle('optimizer:list-exclusions', async () => {
    return provenanceAndExclusionsService.listExclusions()
  })

  ipcMain.handle(
    'optimizer:set-exclusion',
    async (
      _event,
      scopeType: import('../../types/optimizer').OptimizationExclusionRule['scopeType'],
      scopeId: string,
      isExcluded: boolean
    ) => {
      return provenanceAndExclusionsService.setExclusion(
        scopeType,
        scopeId,
        isExcluded
      )
    }
  )
}
