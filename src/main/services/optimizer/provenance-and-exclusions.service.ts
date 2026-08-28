import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type {
  OptimizationExclusionRule,
  OptimizationProfile,
  OptimizationRecord
} from '../../../types/optimizer'
import { databaseService } from '../database.service'
import { mediaBackupService } from './media-backup.service'
import { optimizationQueueService } from './optimization-queue.service'

export class ProvenanceAndExclusionsService {
  /**
   * Lists all registered optimization exclusion rules.
   */
  public listExclusions(): OptimizationExclusionRule[] {
    const db = databaseService.getDatabase()
    if (!db) return []

    const rows = db
      .prepare(
        `
      SELECT id, scope_type as scopeType, scope_id as scopeId, is_excluded as isExcluded, created_at as createdAt
      FROM optimization_exclusions
      ORDER BY created_at DESC
    `
      )
      .all() as (Omit<OptimizationExclusionRule, 'isExcluded'> & {
      isExcluded: number
    })[]

    return rows.map((r) => ({ ...r, isExcluded: Boolean(r.isExcluded) }))
  }

  /**
   * Sets or updates an exclusion rule.
   */
  public setExclusion(
    scopeType: OptimizationExclusionRule['scopeType'],
    scopeId: string,
    isExcluded: boolean
  ): boolean {
    const db = databaseService.getDatabase()
    if (!db) return false

    const existing = db
      .prepare(
        `
      SELECT id FROM optimization_exclusions WHERE scope_type = ? AND scope_id = ?
    `
      )
      .get(scopeType, scopeId) as { id: string } | undefined

    if (existing) {
      db.prepare(
        `
        UPDATE optimization_exclusions SET is_excluded = ? WHERE id = ?
      `
      ).run(isExcluded ? 1 : 0, existing.id)
    } else {
      db.prepare(
        `
        INSERT INTO optimization_exclusions (id, scope_type, scope_id, is_excluded, created_at)
        VALUES (?, ?, ?, ?, ?)
      `
      ).run(
        `excl_${crypto.randomUUID()}`,
        scopeType,
        scopeId,
        isExcluded ? 1 : 0,
        Date.now()
      )
    }

    return true
  }

  /**
   * Evaluates if a given media item is excluded based on hierarchical inheritance:
   * Lesson > Module > Course > Vault > Codec / Tag.
   */
  public isExcluded(context: {
    lessonId?: string
    moduleId?: string
    courseId?: string
    folderPath?: string
    codec?: string
    tag?: string
  }): boolean {
    const db = databaseService.getDatabase()
    if (!db) return false

    const exclusions = this.listExclusions()
    if (exclusions.length === 0) return false

    // 1. Check Lesson level (most specific override)
    if (context.lessonId) {
      const rule = exclusions.find(
        (e) => e.scopeType === 'lesson' && e.scopeId === context.lessonId
      )
      if (rule) return rule.isExcluded
    }

    // 2. Check Module level
    if (context.moduleId) {
      const rule = exclusions.find(
        (e) => e.scopeType === 'module' && e.scopeId === context.moduleId
      )
      if (rule) return rule.isExcluded
    }

    // 3. Check Course level
    if (context.courseId) {
      const rule = exclusions.find(
        (e) => e.scopeType === 'course' && e.scopeId === context.courseId
      )
      if (rule) return rule.isExcluded
    }

    // 4. Check Codec or Tag level
    if (context.codec) {
      const rule = exclusions.find(
        (e) =>
          e.scopeType === 'codec' &&
          e.scopeId.toLowerCase() === context.codec!.toLowerCase()
      )
      if (rule) return rule.isExcluded
    }

    if (context.tag) {
      const rule = exclusions.find(
        (e) => e.scopeType === 'tag' && e.scopeId === context.tag
      )
      if (rule) return rule.isExcluded
    }

    return false
  }

  /**
   * Lists provenance records of optimized media files.
   */
  public listRecords(limit = 100): OptimizationRecord[] {
    const db = databaseService.getDatabase()
    if (!db) return []

    const rows = db
      .prepare(
        `
      SELECT
        id, lesson_id as lessonId, original_path as originalPath,
        original_size as originalSize, original_codec as originalCodec,
        original_resolution as originalResolution, original_bitrate as originalBitrate,
        original_fingerprint as originalFingerprint, optimized_path as optimizedPath,
        optimized_size as optimizedSize, optimized_codec as optimizedCodec,
        optimized_resolution as optimizedResolution, backup_path as backupPath,
        profile_used as profileUsed, actual_savings_bytes as actualSavingsBytes,
        created_at as createdAt
      FROM optimization_records
      ORDER BY created_at DESC
      LIMIT ?
    `
      )
      .all(limit) as OptimizationRecord[]

    return rows
  }

  /**
   * Restores an original media file from its recorded backup.
   */
  public async restoreOriginal(
    recordId: string
  ): Promise<{ success: boolean; error?: string }> {
    const db = databaseService.getDatabase()
    if (!db) return { success: false, error: 'Database not connected.' }

    const record = db
      .prepare(
        `
      SELECT
        id, lesson_id as lessonId, original_path as originalPath,
        original_size as originalSize, original_codec as originalCodec,
        original_resolution as originalResolution, original_bitrate as originalBitrate,
        original_fingerprint as originalFingerprint, optimized_path as optimizedPath,
        optimized_size as optimizedSize, optimized_codec as optimizedCodec,
        optimized_resolution as optimizedResolution, backup_path as backupPath,
        profile_used as profileUsed, actual_savings_bytes as actualSavingsBytes,
        created_at as createdAt
      FROM optimization_records
      WHERE id = ?
    `
      )
      .get(recordId) as OptimizationRecord | undefined

    if (!record) {
      return { success: false, error: 'Optimization record not found.' }
    }

    if (!record.backupPath || !fs.existsSync(record.backupPath)) {
      return {
        success: false,
        error: 'Backup file does not exist on disk or has already expired.'
      }
    }

    const restoreResult = await mediaBackupService.restoreBackup(
      record.backupPath,
      record.originalPath
    )

    if (!restoreResult.success) {
      return restoreResult
    }

    // If extension had changed (e.g. .mkv -> .mp4), and optimized path exists, delete optimized file
    if (
      record.optimizedPath !== record.originalPath &&
      fs.existsSync(record.optimizedPath)
    ) {
      try {
        fs.unlinkSync(record.optimizedPath)
      } catch {
        // Ignore
      }
    }

    // Update lesson row in database
    const fileName = path.basename(record.originalPath)
    const fileExt = path.extname(record.originalPath)
    db.prepare(
      `
      UPDATE lessons
      SET file_path = ?, file_name = ?, file_extension = ?, file_size = ?
      WHERE id = ?
    `
    ).run(
      record.originalPath,
      fileName,
      fileExt,
      record.originalSize,
      record.lessonId
    )

    // Remove provenance record
    db.prepare(`DELETE FROM optimization_records WHERE id = ?`).run(recordId)

    return { success: true }
  }

  /**
   * Re-optimizes a lesson. If the original backup is available, uses the backup as the
   * pristine source to prevent generation loss.
   */
  public async reoptimizeLesson(
    lessonId: string,
    profile: OptimizationProfile = 'balanced'
  ): Promise<{ success: boolean; error?: string }> {
    const db = databaseService.getDatabase()
    if (!db) return { success: false, error: 'Database not connected.' }

    const lesson = db
      .prepare(
        `
      SELECT id, course_id as courseId, file_path as filePath FROM lessons WHERE id = ?
    `
      )
      .get(lessonId) as
      { id: string; courseId: string; filePath: string } | undefined

    if (!lesson) {
      return { success: false, error: 'Lesson not found.' }
    }

    const record = db
      .prepare(
        `
      SELECT backup_path as backupPath, original_path as originalPath
      FROM optimization_records
      WHERE lesson_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `
      )
      .get(lessonId) as
      { backupPath?: string; originalPath: string } | undefined

    let sourceToUse = lesson.filePath
    if (record?.backupPath && fs.existsSync(record.backupPath)) {
      sourceToUse = record.backupPath
    }

    optimizationQueueService.enqueue({
      lessonId: lesson.id,
      courseId: lesson.courseId,
      sourcePath: sourceToUse,
      profile
    })

    return { success: true }
  }
}

export const provenanceAndExclusionsService =
  new ProvenanceAndExclusionsService()
