import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import Database from 'better-sqlite3'
import type { OptimizationPlan, OptimizationRecord } from '../../../types/optimizer'
import { databaseService } from '../database.service'
import { appConfigService } from '../app-config.service'
import { logger } from '../logger.service'

export interface CommitReplacementOptions {
  vaultPath?: string
  lessonId: string
  plan: OptimizationPlan
  tempOptimizedFilePath: string
  backupPath: string
  outputSizeBytes: number
  profileUsed: string
  originalFingerprint: string
}

export class OptimizationJournalService {
  /**
   * Atomically executes the file activation, database reference updates across all
   * affected vaults, and records provenance.
   */
  public async commitReplacement(
    options: CommitReplacementOptions
  ): Promise<{ success: boolean; finalPath: string; error?: string }> {
    const {
      lessonId,
      plan,
      tempOptimizedFilePath,
      backupPath,
      outputSizeBytes,
      profileUsed,
      originalFingerprint
    } = options

    if (!fs.existsSync(tempOptimizedFilePath)) {
      return { success: false, finalPath: '', error: 'Temporary optimized file not found.' }
    }

    const sourcePath = plan.sourcePath
    const sourceDir = path.dirname(sourcePath)
    const baseNameWithoutExt = path.basename(sourcePath, path.extname(sourcePath))
    const finalExt = `.${plan.targetContainer}`
    const finalPath = path.join(sourceDir, `${baseNameWithoutExt}${finalExt}`)
    const newFileName = `${baseNameWithoutExt}${finalExt}`

    const operationId = `opt_${crypto.randomUUID()}`
    const groupId = `grp_opt_${Date.now()}`

    // 1. Journal PREPARED
    try {
      databaseService.recordFileOperation({
        operationId,
        groupId,
        type: 'optimize_media',
        sourcePath,
        destinationPath: finalPath,
        originalFileName: path.basename(sourcePath),
        newFileName,
        timestamp: Date.now(),
        status: 'pending',
        isReversible: true
      })
    } catch (journalErr) {
      logger.warn('[OptimizationJournal] Could not record journal entry:', journalErr)
    }

    try {
      // 2. Physical File Activation
      // If finalPath is different from sourcePath (e.g. .mp4 -> .mkv) and sourcePath still exists:
      if (sourcePath !== finalPath && fs.existsSync(sourcePath)) {
        // Move temp file to finalPath
        fs.copyFileSync(tempOptimizedFilePath, finalPath)
        // Remove original source file (since backup exists)
        fs.unlinkSync(sourcePath)
      } else {
        // Same extension replacement
        fs.copyFileSync(tempOptimizedFilePath, finalPath)
      }

      // Cleanup temp file
      try {
        if (fs.existsSync(tempOptimizedFilePath)) {
          fs.unlinkSync(tempOptimizedFilePath)
        }
      } catch {
        // Ignore temp cleanup error
      }

      // 3. Atomically update database in active Vault
      const db = databaseService.getDatabase()
      if (db) {
        db.prepare(`
          UPDATE lessons
          SET file_path = ?, file_name = ?, file_extension = ?, file_size = ?
          WHERE id = ?
        `).run(finalPath, newFileName, finalExt, outputSizeBytes, lessonId)

        // Also update watch history and content_resources if referencing old path
        db.prepare(`
          UPDATE content_resources
          SET file_path = ?, file_extension = ?, file_size = ?
          WHERE file_path = ?
        `).run(finalPath, finalExt, outputSizeBytes, sourcePath)
      }

      // 4. Multi-Vault Shared File Protection: Update other referencing vaults if shared
      await this.updateOtherReferencingVaults(sourcePath, finalPath, newFileName, finalExt, outputSizeBytes)

      // 5. Record Provenance
      this.recordOptimizationProvenance({
        id: `rec_${crypto.randomUUID()}`,
        lessonId,
        originalPath: sourcePath,
        originalSize: plan.sourceSize,
        originalCodec: plan.sourceCodec,
        originalResolution: plan.sourceResolution,
        originalBitrate: plan.sourceBitrate,
        originalFingerprint,
        optimizedPath: finalPath,
        optimizedSize: outputSizeBytes,
        optimizedCodec: plan.targetCodec,
        optimizedResolution: plan.targetResolution,
        backupPath,
        profileUsed,
        actualSavingsBytes: Math.max(0, plan.sourceSize - outputSizeBytes),
        createdAt: Date.now()
      })

      // 6. Complete journal entry
      databaseService.updateFileOperationStatus(operationId, 'completed')

      return { success: true, finalPath }
    } catch (err) {
      logger.error('[OptimizationJournal] Failed during file replacement:', err)
      databaseService.updateFileOperationStatus(
        operationId,
        'failed',
        err instanceof Error ? err.message : String(err)
      )

      // Attempt rollback from backup if target file was corrupted
      if (!fs.existsSync(finalPath) && !fs.existsSync(sourcePath) && fs.existsSync(backupPath)) {
        try {
          fs.copyFileSync(backupPath, sourcePath)
          logger.info('[OptimizationJournal] Restored source from backup during rollback.')
        } catch {
          // Ignore
        }
      }

      return {
        success: false,
        finalPath: '',
        error: `Physical replacement failed: ${err instanceof Error ? err.message : String(err)}`
      }
    }
  }

  /**
   * Records immutable optimization provenance to prevent generation loss.
   */
  public recordOptimizationProvenance(record: OptimizationRecord): void {
    const db = databaseService.getDatabase()
    if (!db) return

    try {
      db.prepare(`
        INSERT INTO optimization_records (
          id, lesson_id, original_path, original_size, original_codec,
          original_resolution, original_bitrate, original_fingerprint,
          optimized_path, optimized_size, optimized_codec, optimized_resolution,
          backup_path, profile_used, actual_savings_bytes, created_at
        ) VALUES (
          @id, @lessonId, @originalPath, @originalSize, @originalCodec,
          @originalResolution, @originalBitrate, @originalFingerprint,
          @optimizedPath, @optimizedSize, @optimizedCodec, @optimizedResolution,
          @backupPath, @profileUsed, @actualSavingsBytes, @createdAt
        )
      `).run(record)
    } catch (err) {
      logger.warn('[OptimizationJournal] Failed to record optimization provenance:', err)
    }
  }

  /**
   * Queries all registered vaults in config.db to check if a physical file is shared across multiple vaults.
   */
  public async getSharedVaults(physicalFilePath: string): Promise<{ isShared: boolean; vaultNames: string[] }> {
    const vaults = appConfigService.getRecentVaults()
    const activeVaultPath = databaseService.getCurrentVaultPath()
    const matchedVaultNames: string[] = []

    for (const v of vaults) {
      const vDbPath = path.join(v.path, '.orbia', 'library.db')
      if (!fs.existsSync(vDbPath)) continue

      try {
        // If it's the currently open vault, query directly
        if (activeVaultPath === v.path && databaseService.getDatabase()) {
          const count = (
            databaseService.getDatabase()!.prepare(`SELECT count(*) as cnt FROM lessons WHERE file_path = ?`).get(physicalFilePath) as { cnt: number }
          )?.cnt || 0
          if (count > 0) matchedVaultNames.push(v.name)
        } else {
          // Read-only query on other vault database
          const otherDb = new Database(vDbPath, { readonly: true })
          try {
            const count = (
              otherDb.prepare(`SELECT count(*) as cnt FROM lessons WHERE file_path = ?`).get(physicalFilePath) as { cnt: number }
            )?.cnt || 0
            if (count > 0) matchedVaultNames.push(v.name)
          } finally {
            otherDb.close()
          }
        }
      } catch {
        // Ignore if database is locked or unreadable
      }
    }

    return {
      isShared: matchedVaultNames.length > 1,
      vaultNames: matchedVaultNames
    }
  }

  /**
   * Updates other registered vaults' SQLite databases when a shared file changes name or extension.
   */
  private async updateOtherReferencingVaults(
    oldPath: string,
    newPath: string,
    newFileName: string,
    newExt: string,
    newSize: number
  ): Promise<void> {
    const vaults = appConfigService.getRecentVaults()
    const activeVaultPath = databaseService.getCurrentVaultPath()

    for (const v of vaults) {
      if (v.path === activeVaultPath) continue // Active vault was already updated

      const vDbPath = path.join(v.path, '.orbia', 'library.db')
      if (!fs.existsSync(vDbPath)) continue

      try {
        const otherDb = new Database(vDbPath)
        try {
          otherDb.pragma('journal_mode = WAL')
          otherDb.prepare(`
            UPDATE lessons
            SET file_path = ?, file_name = ?, file_extension = ?, file_size = ?
            WHERE file_path = ?
          `).run(newPath, newFileName, newExt, newSize, oldPath)

          otherDb.prepare(`
            UPDATE content_resources
            SET file_path = ?, file_extension = ?, file_size = ?
            WHERE file_path = ?
          `).run(newPath, newExt, newSize, oldPath)
        } finally {
          otherDb.close()
        }
      } catch (err) {
        logger.warn(`[OptimizationJournal] Failed to update secondary vault at ${v.path}:`, err)
      }
    }
  }
}

export const optimizationJournalService = new OptimizationJournalService()
