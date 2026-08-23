import fs from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'
import type { BackupManifest, BackupPreview } from '../../types'
import { databaseService, type DatabaseService } from './database.service'
import { logger } from './logger.service'

export interface CreateBackupOptions {
  vaultPath: string
  targetFilePath: string
  vaultName?: string
}

export interface RestoreBackupOptions {
  vaultPath: string
  backupFilePath: string
}

export class BackupService {
  private readonly db: DatabaseService

  public constructor(db: DatabaseService = databaseService) {
    this.db = db
  }

  /**
   * Creates a lightweight portable .orbia backup archive containing manifest, SQLite database, and covers.
   * INVARIANT: Never copies heavy video files by default.
   */
  public async createBackup(options: CreateBackupOptions): Promise<{ success: boolean; filePath: string; fileSizeBytes: number; error?: string }> {
    try {
      const dbPath = path.join(options.vaultPath, '.orbia', 'library.db')
      if (!fs.existsSync(dbPath)) {
        throw new Error('Vault database not found at .orbia/library.db')
      }

      // Checkpoint WAL if connected
      const rawDb = (this.db as any).db
      if (rawDb) {
        try {
          rawDb.pragma('wal_checkpoint(TRUNCATE)')
        } catch (e) {
          logger.warn('Failed to checkpoint WAL before backup:', e)
        }
      }

      const zip = new AdmZip()
      const now = Date.now()

      // Calculate statistics for manifest
      let courseCount = 0
      let notesCount = 0
      let flashcardsCount = 0
      let bookmarksCount = 0

      if (rawDb) {
        try {
          courseCount = (rawDb.prepare('SELECT count(*) as cnt FROM courses WHERE merged_into_course_id IS NULL').get() as any)?.cnt || 0
          notesCount = (rawDb.prepare('SELECT count(*) as cnt FROM lesson_notes').get() as any)?.cnt || 0
          flashcardsCount = (rawDb.prepare('SELECT count(*) as cnt FROM flashcards').get() as any)?.cnt || 0
          bookmarksCount = (rawDb.prepare('SELECT count(*) as cnt FROM video_bookmarks').get() as any)?.cnt || 0
        } catch {
          // Ignored
        }
      }

      const manifest: BackupManifest = {
        format: 'orbia-backup',
        version: 1,
        appVersion: '0.3.0',
        createdAt: now,
        vaultName: options.vaultName || path.basename(options.vaultPath),
        courseCount,
        notesCount,
        flashcardsCount,
        bookmarksCount,
        includesCourseFiles: false
      }

      // Add manifest
      zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'))

      // Add library.db
      const dbBuffer = fs.readFileSync(dbPath)
      zip.addFile('library.db', dbBuffer)

      // Add covers if present
      const coversDir = path.join(options.vaultPath, '.orbia', 'covers')
      if (fs.existsSync(coversDir)) {
        const coverFiles = fs.readdirSync(coversDir)
        for (const file of coverFiles) {
          const filePath = path.join(coversDir, file)
          if (fs.statSync(filePath).isFile()) {
            zip.addFile(`covers/${file}`, fs.readFileSync(filePath))
          }
        }
      }

      // Ensure directory for target file
      const targetDir = path.dirname(options.targetFilePath)
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }

      zip.writeZip(options.targetFilePath)
      const stats = fs.statSync(options.targetFilePath)

      return {
        success: true,
        filePath: options.targetFilePath,
        fileSizeBytes: stats.size
      }
    } catch (err: any) {
      logger.error('Failed to create backup:', err)
      return {
        success: false,
        filePath: options.targetFilePath,
        fileSizeBytes: 0,
        error: err?.message || String(err)
      }
    }
  }

  /**
   * Inspects a backup file and returns its manifest preview and security assessment.
   * INVARIANT: Strictly rejects path traversal or corrupted archives.
   */
  public async inspectBackup(backupFilePath: string): Promise<BackupPreview> {
    try {
      if (!fs.existsSync(backupFilePath)) {
        return { valid: false, filePath: backupFilePath, fileSizeBytes: 0, error: 'Backup file does not exist.' }
      }

      const stats = fs.statSync(backupFilePath)
      const zip = new AdmZip(backupFilePath)
      const entries = zip.getEntries()

      // Security check: reject path traversal and unexpected entries
      for (const entry of entries) {
        const rawName = entry.entryName.replace(/\\/g, '/')
        if (
          rawName.includes('..') ||
          rawName.startsWith('/') ||
          /^[a-zA-Z]:/.test(rawName) ||
          path.isAbsolute(rawName)
        ) {
          return {
            valid: false,
            filePath: backupFilePath,
            fileSizeBytes: stats.size,
            error: `Security violation: Path traversal detected in entry "${entry.entryName}".`
          }
        }

        const isAllowed =
          rawName === 'manifest.json' ||
          rawName === 'library.db' ||
          rawName.startsWith('covers/') ||
          rawName.startsWith('metadata/')

        if (!isAllowed) {
          return {
            valid: false,
            filePath: backupFilePath,
            fileSizeBytes: stats.size,
            error: `Security violation: Path traversal or unexpected entry "${entry.entryName}".`
          }
        }
      }

      const manifestEntry = entries.find((e) => e.entryName === 'manifest.json')
      const dbEntry = entries.find((e) => e.entryName === 'library.db')

      if (!manifestEntry || !dbEntry) {
        return {
          valid: false,
          filePath: backupFilePath,
          fileSizeBytes: stats.size,
          error: 'Invalid backup file: Missing manifest.json or library.db.'
        }
      }

      const manifestRaw = manifestEntry.getData().toString('utf-8')
      const manifest = JSON.parse(manifestRaw) as BackupManifest

      if (manifest.format !== 'orbia-backup') {
        return {
          valid: false,
          filePath: backupFilePath,
          fileSizeBytes: stats.size,
          error: `Unsupported backup format "${manifest.format}".`
        }
      }

      return {
        valid: true,
        manifest,
        filePath: backupFilePath,
        fileSizeBytes: stats.size
      }
    } catch (err: any) {
      return {
        valid: false,
        filePath: backupFilePath,
        fileSizeBytes: 0,
        error: `Failed to inspect backup: ${err?.message || String(err)}`
      }
    }
  }

  /**
   * Restores a vault from a .orbia backup archive with safety rollback.
   */
  public async restoreBackup(options: RestoreBackupOptions): Promise<{ success: boolean; restoredCoursesCount: number; error?: string }> {
    const preview = await this.inspectBackup(options.backupFilePath)
    if (!preview.valid || !preview.manifest) {
      return { success: false, restoredCoursesCount: 0, error: preview.error || 'Invalid backup file.' }
    }

    const orbiaDir = path.join(options.vaultPath, '.orbia')
    const dbPath = path.join(orbiaDir, 'library.db')
    const safetyBakPath = path.join(orbiaDir, 'library.db.pre-restore-bak')

    try {
      if (!fs.existsSync(orbiaDir)) {
        fs.mkdirSync(orbiaDir, { recursive: true })
      }

      // Step 1: Create safety backup of current database
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, safetyBakPath)
      }

      // Step 2: Disconnect SQLite
      this.db.disconnect()

      // Step 3: Extract files from archive safely
      const zip = new AdmZip(options.backupFilePath)
      const entries = zip.getEntries()

      for (const entry of entries) {
        // Path traversal defense
        const norm = path.normalize(entry.entryName)
        if (norm.startsWith('..') || path.isAbsolute(entry.entryName)) {
          throw new Error(`Unsafe path in backup entry: ${entry.entryName}`)
        }

        if (entry.entryName === 'library.db') {
          fs.writeFileSync(dbPath, entry.getData())
        } else if (entry.entryName.startsWith('covers/')) {
          const relativeName = entry.entryName.replace(/^covers\//, '')
          if (relativeName && !entry.isDirectory) {
            const coversDir = path.join(orbiaDir, 'covers')
            if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir, { recursive: true })
            fs.writeFileSync(path.join(coversDir, relativeName), entry.getData())
          }
        }
      }

      // Step 4: Reconnect SQLite and verify integrity
      this.db.connect(options.vaultPath)
      const rawDb = (this.db as any).db
      if (rawDb) {
        const integrity = rawDb.pragma('integrity_check', { simple: true })
        if (integrity !== 'ok') {
          throw new Error(`Restored database failed integrity check: ${integrity}`)
        }
      }

      // Step 5: Success — clean up safety backup
      if (fs.existsSync(safetyBakPath)) {
        try {
          fs.unlinkSync(safetyBakPath)
        } catch {
          // Ignored
        }
      }

      return {
        success: true,
        restoredCoursesCount: preview.manifest.courseCount
      }
    } catch (err: any) {
      logger.error('Failed to restore backup, rolling back:', err)

      // Rollback
      try {
        this.db.disconnect()
        if (fs.existsSync(safetyBakPath)) {
          fs.copyFileSync(safetyBakPath, dbPath)
          fs.unlinkSync(safetyBakPath)
        }
        this.db.connect(options.vaultPath)
      } catch (rbErr) {
        logger.error('Rollback failed:', rbErr)
      }

      return {
        success: false,
        restoredCoursesCount: 0,
        error: `Restore failed: ${err?.message || String(err)}`
      }
    }
  }
}

export const backupService = new BackupService()
