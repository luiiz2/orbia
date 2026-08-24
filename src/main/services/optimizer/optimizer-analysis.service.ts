import fs from 'node:fs'
import path from 'node:path'
import type {
  OptimizationProfile,
  StorageOptimizerMetrics,
  VaultOptimizationAnalysis
} from '../../../types/optimizer'
import { databaseService } from '../database.service'
import { appConfigService } from '../app-config.service'
import { mediaAnalyzerService } from './media-analyzer.service'
import { optimizationPlannerService } from './optimization-planner.service'
import { provenanceAndExclusionsService } from './provenance-and-exclusions.service'
import { optimizationJournalService } from './optimization-journal.service'
import { mediaBackupService } from './media-backup.service'
import { logger } from '../logger.service'

export class OptimizerAnalysisService {
  /**
   * Performs read-only analysis of all registered media in the Vault,
   * calculating expected savings and per-video recommendations.
   * INVARIANT: NEVER modifies any physical media or database record.
   */
  public async analyzeVault(profile?: OptimizationProfile): Promise<VaultOptimizationAnalysis> {
    const db = databaseService.getDatabase()
    const vaultPath = databaseService.getCurrentVaultPath()
    if (!db || !vaultPath) {
      throw new Error('Database is not connected to any vault.')
    }

    const settings = appConfigService.getOptimizationSettings()
    const selectedProfile = profile || settings.defaultProfile || 'balanced'

    const lessons = db.prepare(`
      SELECT l.id, l.title as lessonTitle, l.course_id as courseId, l.module_id as moduleId,
             l.file_path as filePath, l.file_size as fileSize, l.media_type as mediaType,
             c.title as courseTitle
      FROM lessons l
      JOIN courses c ON c.id = l.course_id
      WHERE l.media_type = 'video'
      ORDER BY c.title ASC, l.order_index ASC
    `).all() as {
      id: string
      lessonTitle: string
      courseId: string
      moduleId: string
      filePath: string
      fileSize: number
      mediaType: string
      courseTitle: string
    }[]

    let totalVideos = 0
    let totalSizeBytes = 0
    let alreadyEfficientCount = 0
    let alreadyEfficientSizeBytes = 0
    let recommendedCount = 0
    let recommendedCurrentSizeBytes = 0
    let estimatedFinalSizeBytes = 0
    let sharedFilesCount = 0
    const plans: import('../../../types/optimizer').OptimizationPlan[] = []

    for (const lesson of lessons) {
      if (!lesson.filePath || !fs.existsSync(lesson.filePath)) continue

      try {
        const stat = fs.statSync(lesson.filePath)
        if (stat.size === 0) continue

        totalVideos++
        totalSizeBytes += stat.size

        // Check exclusions
        const isExcluded = provenanceAndExclusionsService.isExcluded({
          lessonId: lesson.id,
          moduleId: lesson.moduleId,
          courseId: lesson.courseId,
          folderPath: path.dirname(lesson.filePath)
        })

        const metadata = await mediaAnalyzerService.analyze(lesson.filePath)

        // Check if shared across vaults
        const sharedInfo = await optimizationJournalService.getSharedVaults(lesson.filePath)
        if (sharedInfo.isShared) {
          sharedFilesCount++
        }

        const plan = optimizationPlannerService.createPlan(metadata, {
          lessonId: lesson.id,
          courseId: lesson.courseId,
          courseTitle: lesson.courseTitle,
          lessonTitle: lesson.lessonTitle,
          profile: selectedProfile,
          isSharedFile: sharedInfo.isShared,
          sharedVaultNames: sharedInfo.vaultNames,
          minSavingsPercentThreshold: settings.autoOptimizeMinSavingsPercent
        })

        if (isExcluded) {
          plan.isAlreadyEfficient = true
          plan.reason = 'Arquivo excluído da otimização por regra personalizada.'
          plan.estimatedSavingsBytes = 0
          plan.estimatedSavingsPercent = 0
        }

        plans.push(plan)

        if (plan.isAlreadyEfficient) {
          alreadyEfficientCount++
          alreadyEfficientSizeBytes += stat.size
          estimatedFinalSizeBytes += stat.size
        } else {
          recommendedCount++
          recommendedCurrentSizeBytes += stat.size
          estimatedFinalSizeBytes += plan.estimatedTargetSize
        }
      } catch (err) {
        logger.warn(`[OptimizerAnalysis] Error analyzing lesson ${lesson.id}:`, err)
      }
    }

    const estimatedTotalSavingsBytes = Math.max(0, totalSizeBytes - estimatedFinalSizeBytes)
    const estimatedTotalSavingsPercent =
      totalSizeBytes > 0 ? Math.round((estimatedTotalSavingsBytes / totalSizeBytes) * 100) : 0

    return {
      vaultPath,
      totalVideos,
      totalSizeBytes,
      alreadyEfficientCount,
      alreadyEfficientSizeBytes,
      recommendedCount,
      recommendedCurrentSizeBytes,
      estimatedFinalSizeBytes,
      estimatedTotalSavingsBytes,
      estimatedTotalSavingsPercent,
      plans,
      sharedFilesCount,
      analyzedAt: Date.now()
    }
  }

  /**
   * Retrieves live metrics of vault storage, optimization savings, queue load, and backups.
   */
  public async getMetrics(): Promise<StorageOptimizerMetrics> {
    const db = databaseService.getDatabase()
    const vaultPath = databaseService.getCurrentVaultPath()
    if (!db || !vaultPath) {
      return {
        totalVaultSizeBytes: 0,
        potentialSavingsBytes: 0,
        alreadySavedBytes: 0,
        totalVideosCount: 0,
        optimizedVideosCount: 0,
        queuePendingCount: 0,
        queueActiveCount: 0,
        queueFailedCount: 0,
        requiresReviewCount: 0,
        backupsSizeBytes: 0
      }
    }

    const videoStats = db.prepare(`
      SELECT count(*) as count, coalesce(sum(file_size), 0) as totalSize
      FROM lessons
      WHERE media_type = 'video'
    `).get() as { count: number; totalSize: number }

    const recordStats = db.prepare(`
      SELECT count(*) as count, coalesce(sum(actual_savings_bytes), 0) as totalSaved
      FROM optimization_records
    `).get() as { count: number; totalSaved: number }

    const queueStats = db.prepare(`
      SELECT
        count(CASE WHEN status IN ('queued', 'ready') THEN 1 END) as pendingCount,
        count(CASE WHEN status IN ('encoding', 'validating', 'backing_up', 'replacing', 'analyzing') THEN 1 END) as activeCount,
        count(CASE WHEN status = 'failed' THEN 1 END) as failedCount,
        count(CASE WHEN status = 'requires_review' THEN 1 END) as reviewCount,
        coalesce(sum(CASE WHEN status IN ('queued', 'ready', 'encoding') THEN estimated_savings ELSE 0 END), 0) as potentialSavings
      FROM optimization_queue
    `).get() as {
      pendingCount: number
      activeCount: number
      failedCount: number
      reviewCount: number
      potentialSavings: number
    }

    const settings = appConfigService.getOptimizationSettings()
    const backupsSize = mediaBackupService.getTotalBackupsSizeBytes(
      vaultPath,
      settings.customBackupDirectory
    )

    return {
      totalVaultSizeBytes: videoStats?.totalSize || 0,
      potentialSavingsBytes: queueStats?.potentialSavings || 0,
      alreadySavedBytes: recordStats?.totalSaved || 0,
      totalVideosCount: videoStats?.count || 0,
      optimizedVideosCount: recordStats?.count || 0,
      queuePendingCount: queueStats?.pendingCount || 0,
      queueActiveCount: queueStats?.activeCount || 0,
      queueFailedCount: queueStats?.failedCount || 0,
      requiresReviewCount: queueStats?.reviewCount || 0,
      backupsSizeBytes: backupsSize
    }
  }
}

export const optimizerAnalysisService = new OptimizerAnalysisService()
