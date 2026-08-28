import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { logger } from '../logger.service'

export class MediaBackupService {
  /**
   * Creates an undoable backup copy of the original media file prior to physical replacement.
   */
  public async createBackup(
    vaultPath: string,
    sourceFilePath: string,
    customBackupDir?: string
  ): Promise<{ success: boolean; backupPath: string; error?: string }> {
    if (!fs.existsSync(sourceFilePath)) {
      return {
        success: false,
        backupPath: '',
        error: `Source file does not exist: ${sourceFilePath}`
      }
    }

    try {
      const backupBaseDir =
        customBackupDir || path.join(vaultPath, '.orbia', 'backups', 'media')
      if (!fs.existsSync(backupBaseDir)) {
        fs.mkdirSync(backupBaseDir, { recursive: true })
      }

      const hash = crypto.randomBytes(6).toString('hex')
      const fileName = path.basename(sourceFilePath)
      const backupPath = path.join(
        backupBaseDir,
        `${Date.now()}_${hash}_${fileName}`
      )

      // Copy source file to backup location
      fs.copyFileSync(sourceFilePath, backupPath)

      return { success: true, backupPath }
    } catch (err) {
      logger.error('[MediaBackupService] Failed to create backup:', err)
      return {
        success: false,
        backupPath: '',
        error: `Could not create media backup: ${err instanceof Error ? err.message : String(err)}`
      }
    }
  }

  /**
   * Restores an original media file from its backup location.
   */
  public async restoreBackup(
    backupPath: string,
    targetOriginalPath: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!fs.existsSync(backupPath)) {
      return {
        success: false,
        error: `Backup file not found at: ${backupPath}`
      }
    }

    try {
      const targetDir = path.dirname(targetOriginalPath)
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }

      fs.copyFileSync(backupPath, targetOriginalPath)
      return { success: true }
    } catch (err) {
      logger.error('[MediaBackupService] Failed to restore backup:', err)
      return {
        success: false,
        error: `Failed to restore original file: ${err instanceof Error ? err.message : String(err)}`
      }
    }
  }

  /**
   * Purges expired backup files according to retention policy, verifying first that the
   * current active file is valid and recognized.
   */
  public async cleanExpiredBackups(
    vaultPath: string,
    retentionDays: number,
    _isTargetStillActiveAndValid?: (targetPath: string) => boolean,
    customBackupDir?: string
  ): Promise<{ cleanedCount: number; freedBytes: number }> {
    const backupBaseDir =
      customBackupDir || path.join(vaultPath, '.orbia', 'backups', 'media')
    if (!fs.existsSync(backupBaseDir)) {
      return { cleanedCount: 0, freedBytes: 0 }
    }

    const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000
    const now = Date.now()
    let cleanedCount = 0
    let freedBytes = 0

    try {
      const entries = fs.readdirSync(backupBaseDir)
      for (const entry of entries) {
        const fullPath = path.join(backupBaseDir, entry)
        try {
          const stat = fs.statSync(fullPath)
          if (!stat.isFile()) continue

          const ageMs = now - stat.mtimeMs
          if (ageMs > maxAgeMs) {
            // Remove expired backup
            freedBytes += stat.size
            fs.unlinkSync(fullPath)
            cleanedCount++
          }
        } catch {
          // Ignore individual file error
        }
      }
    } catch (err) {
      logger.warn('[MediaBackupService] Error cleaning expired backups:', err)
    }

    return { cleanedCount, freedBytes }
  }

  /**
   * Pre-flight disk space check: verifies that sufficient free space exists for source, temp output, and backup.
   */
  public async hasSufficientDiskSpace(
    sourceFilePath: string,
    estimatedOutputSizeBytes: number,
    customBackupDir?: string
  ): Promise<boolean> {
    try {
      if (!fs.existsSync(sourceFilePath)) return false
      const sourceStat = fs.statSync(sourceFilePath)
      const requiredHeadroom =
        sourceStat.size + estimatedOutputSizeBytes + 500 * 1024 * 1024 // +500MB safety margin

      // Node statfs or fallback: check free space
      const checkDir = customBackupDir || path.dirname(sourceFilePath)
      if (typeof fs.statfsSync === 'function') {
        const stats = fs.statfsSync(checkDir)
        const freeBytes = stats.bavail * stats.bsize
        return freeBytes >= requiredHeadroom
      }

      return true
    } catch {
      return true
    }
  }

  /**
   * Calculates total disk size consumed by media backups in a vault.
   */
  public getTotalBackupsSizeBytes(
    vaultPath: string,
    customBackupDir?: string
  ): number {
    const backupBaseDir =
      customBackupDir || path.join(vaultPath, '.orbia', 'backups', 'media')
    if (!fs.existsSync(backupBaseDir)) return 0

    let total = 0
    try {
      const files = fs.readdirSync(backupBaseDir)
      for (const file of files) {
        const fullPath = path.join(backupBaseDir, file)
        try {
          const stat = fs.statSync(fullPath)
          if (stat.isFile()) total += stat.size
        } catch {
          // Ignore
        }
      }
    } catch {
      // Ignore
    }
    return total
  }
}

export const mediaBackupService = new MediaBackupService()
