import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { databaseService } from '../src/main/services/database.service'
import { appConfigService } from '../src/main/services/app-config.service'
import { provenanceAndExclusionsService } from '../src/main/services/optimizer/provenance-and-exclusions.service'
import { mediaBackupService } from '../src/main/services/optimizer/media-backup.service'
import { optimizationJournalService } from '../src/main/services/optimizer/optimization-journal.service'

describe('Optimizer Provenance, Backups & Exclusions', () => {
  let tempDir: string
  let vaultDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-optimizer-test-'))
    vaultDir = path.join(tempDir, 'TestVault')
    fs.mkdirSync(vaultDir, { recursive: true })

    const configDbPath = path.join(tempDir, 'config.db')
    appConfigService.init(configDbPath)

    databaseService.connect(vaultDir)
  })

  afterEach(() => {
    try {
      databaseService.close()
    } catch {
      // Ignore
    }
    try {
      appConfigService.close()
    } catch {
      // Ignore
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore
    }
  })

  it('evaluates exclusion rules hierarchically (lesson override > module > course > codec)', () => {
    // Exclude entire course
    provenanceAndExclusionsService.setExclusion('course', 'crs_100', true)

    expect(
      provenanceAndExclusionsService.isExcluded({ courseId: 'crs_100' })
    ).toBe(true)
    expect(
      provenanceAndExclusionsService.isExcluded({ courseId: 'crs_200' })
    ).toBe(false)

    // Module inherits course exclusion unless checked at module level
    expect(
      provenanceAndExclusionsService.isExcluded({
        courseId: 'crs_100',
        moduleId: 'mod_1'
      })
    ).toBe(true)

    // Lesson specific override to NOT exclude (false)
    provenanceAndExclusionsService.setExclusion('lesson', 'les_special', false)

    expect(
      provenanceAndExclusionsService.isExcluded({
        courseId: 'crs_100',
        moduleId: 'mod_1',
        lessonId: 'les_special'
      })
    ).toBe(false)

    // Codec level exclusion
    provenanceAndExclusionsService.setExclusion('codec', 'av1', true)
    expect(provenanceAndExclusionsService.isExcluded({ codec: 'av1' })).toBe(
      true
    )
    expect(provenanceAndExclusionsService.isExcluded({ codec: 'h264' })).toBe(
      false
    )
  })

  it('creates media backup, validates size, and restores on request', async () => {
    const courseDir = path.join(vaultDir, 'Courses', 'MyCourse')
    fs.mkdirSync(courseDir, { recursive: true })
    const sourceVideoPath = path.join(courseDir, 'Lesson1.mp4')
    fs.writeFileSync(sourceVideoPath, Buffer.alloc(1024 * 1024, 0x55)) // 1 MB test file

    // 1. Create backup
    const backupRes = await mediaBackupService.createBackup(
      vaultDir,
      sourceVideoPath
    )
    expect(backupRes.success).toBe(true)
    expect(fs.existsSync(backupRes.backupPath)).toBe(true)

    // Check backup size
    const backupsSize = mediaBackupService.getTotalBackupsSizeBytes(vaultDir)
    expect(backupsSize).toBe(1024 * 1024)

    // 2. Corrupt or delete original file
    fs.unlinkSync(sourceVideoPath)
    expect(fs.existsSync(sourceVideoPath)).toBe(false)

    // 3. Restore backup
    const restoreRes = await mediaBackupService.restoreBackup(
      backupRes.backupPath,
      sourceVideoPath
    )
    expect(restoreRes.success).toBe(true)
    expect(fs.existsSync(sourceVideoPath)).toBe(true)
    expect(fs.statSync(sourceVideoPath).size).toBe(1024 * 1024)
  })

  it('records immutable provenance and restores original via provenance service', async () => {
    const courseDir = path.join(vaultDir, 'Courses', 'MyCourse')
    fs.mkdirSync(courseDir, { recursive: true })
    const sourceVideoPath = path.join(courseDir, 'Lesson1.mp4')
    fs.writeFileSync(sourceVideoPath, 'ORIGINAL_MEDIA_DATA')

    const db = databaseService.getDatabase()!
    db.prepare(
      `
      INSERT INTO courses (id, title, slug, source_type, root_path, created_at, updated_at)
      VALUES ('crs_1', 'Course 1', 'course-1', 'managed', ?, 1, 1)
    `
    ).run(courseDir)

    db.prepare(
      `
      INSERT INTO modules (id, course_id, title, order_index, folder_path, duration, lesson_count, created_at)
      VALUES ('mod_1', 'crs_1', 'Module 1', 1, ?, 300, 1, 1)
    `
    ).run(courseDir)

    db.prepare(
      `
      INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, created_at)
      VALUES ('les_1', 'mod_1', 'crs_1', 'Lesson 1', 1, ?, 'Lesson1.mp4', '.mp4', 'video', 300, 1000, 1)
    `
    ).run(sourceVideoPath)

    // Create backup
    const backupRes = await mediaBackupService.createBackup(
      vaultDir,
      sourceVideoPath
    )

    // Record provenance
    const recordId = 'rec_test_1'
    optimizationJournalService.recordOptimizationProvenance({
      id: recordId,
      lessonId: 'les_1',
      originalPath: sourceVideoPath,
      originalSize: 1000,
      originalCodec: 'h264',
      originalResolution: '1920x1080',
      originalBitrate: 5000000,
      originalFingerprint: '1000_300_5000000',
      optimizedPath: sourceVideoPath,
      optimizedSize: 450,
      optimizedCodec: 'hevc',
      optimizedResolution: '1920x1080',
      backupPath: backupRes.backupPath,
      profileUsed: 'balanced',
      actualSavingsBytes: 550,
      createdAt: Date.now()
    })

    const records = provenanceAndExclusionsService.listRecords()
    expect(records.length).toBe(1)
    expect(records[0].actualSavingsBytes).toBe(550)

    // Mutate source file to simulate optimized version
    fs.writeFileSync(sourceVideoPath, 'OPTIMIZED_MEDIA_DATA')

    // Restore via Provenance Service
    const restoreRes =
      await provenanceAndExclusionsService.restoreOriginal(recordId)
    expect(restoreRes.success).toBe(true)

    // Check that pristine original content was restored
    const restoredContent = fs.readFileSync(sourceVideoPath, 'utf8')
    expect(restoredContent).toBe('ORIGINAL_MEDIA_DATA')

    // Check that record was cleared
    expect(provenanceAndExclusionsService.listRecords().length).toBe(0)
  })
})
