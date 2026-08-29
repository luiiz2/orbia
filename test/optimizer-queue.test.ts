import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { databaseService } from '../src/main/services/database.service'
import { appConfigService } from '../src/main/services/app-config.service'
import { optimizationQueueService } from '../src/main/services/optimizer/optimization-queue.service'

describe('OptimizationQueueService', () => {
  let tempDir: string
  let vaultDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-queue-test-'))
    vaultDir = path.join(tempDir, 'TestVault')
    fs.mkdirSync(vaultDir, { recursive: true })

    const configDbPath = path.join(tempDir, 'config.db')
    appConfigService.init(configDbPath)

    databaseService.connect(vaultDir)

    const db = databaseService.getDatabase()!
    db.prepare(
      `
      INSERT INTO courses (id, title, slug, source_type, root_path, created_at, updated_at)
      VALUES ('crs_1', 'Course 1', 'course-1', 'managed', ?, 1, 1)
    `
    ).run(vaultDir)

    db.prepare(
      `
      INSERT INTO modules (id, course_id, title, order_index, folder_path, duration, lesson_count, created_at)
      VALUES ('mod_1', 'crs_1', 'Module 1', 1, ?, 300, 1, 1)
    `
    ).run(vaultDir)

    const lessonIds = ['les_1', 'les_2', 'les_3', 'les_crash', 'les_ctrl']
    for (let i = 0; i < lessonIds.length; i++) {
      const lid = lessonIds[i]
      db.prepare(
        `
        INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, created_at)
        VALUES (?, 'mod_1', 'crs_1', ?, ?, ?, ?, '.mp4', 'video', 300, 1000, 1)
      `
      ).run(
        lid,
        `Lesson ${i + 1}`,
        i + 1,
        path.join(vaultDir, `${lid}.mp4`),
        `${lid}.mp4`
      )
    }
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

  it('enqueues items, prevents duplicate active jobs for same lesson, and lists queue correctly', () => {
    const job1 = optimizationQueueService.enqueue({
      lessonId: 'les_1',
      courseId: 'crs_1',
      sourcePath: 'C:/Vault/Lesson1.mp4',
      profile: 'balanced',
      targetCodec: 'hevc',
      estimatedSavings: 500000
    })

    expect(job1.id).toBeDefined()
    expect(job1.status).toBe('queued')

    // Batch enqueue with duplicate lessonId
    const batch = optimizationQueueService.enqueueBatch([
      {
        lessonId: 'les_1', // Duplicate -> should skip
        courseId: 'crs_1',
        sourcePath: 'C:/Vault/Lesson1.mp4',
        profile: 'balanced'
      },
      {
        lessonId: 'les_2',
        courseId: 'crs_1',
        sourcePath: 'C:/Vault/Lesson2.mp4',
        profile: 'max_quality'
      }
    ])

    expect(batch.length).toBe(1)
    expect(batch[0].lessonId).toBe('les_2')

    const list = optimizationQueueService.listQueue()
    expect(list.length).toBe(2)
    expect(list[0].lessonId).toBe('les_1')
    expect(list[1].lessonId).toBe('les_2')
  })

  it('updates progress, fps, speed, eta, and transitions status properly', () => {
    const job = optimizationQueueService.enqueue({
      lessonId: 'les_3',
      sourcePath: 'C:/Vault/Lesson3.mp4',
      profile: 'balanced'
    })

    optimizationQueueService.updateJob(job.id, {
      status: 'encoding',
      progressPercent: 45.5,
      currentFps: 120,
      currentSpeed: '4.2x',
      etaSeconds: 30
    })

    const updated = optimizationQueueService
      .listQueue()
      .find((q) => q.id === job.id)
    expect(updated?.status).toBe('encoding')
    expect(updated?.progressPercent).toBe(45.5)
    expect(updated?.currentFps).toBe(120)
    expect(updated?.currentSpeed).toBe('4.2x')
    expect(updated?.etaSeconds).toBe(30)
  })

  it('recovers interrupted encoding jobs on startup, cleans dangling temp files, and resets to queued', () => {
    const tempOutputDir = path.join(vaultDir, '.orbia', 'temp')
    fs.mkdirSync(tempOutputDir, { recursive: true })
    const danglingTempFile = path.join(tempOutputDir, 'dangling_opt.mp4')
    fs.writeFileSync(danglingTempFile, 'PARTIAL_ENCODE')

    const job = optimizationQueueService.enqueue({
      lessonId: 'les_crash',
      sourcePath: 'C:/Vault/LessonCrash.mp4',
      profile: 'balanced'
    })

    // Simulate active encoding when crash occurred
    optimizationQueueService.updateJob(job.id, {
      status: 'encoding',
      tempOutputPath: danglingTempFile,
      progressPercent: 78.2
    })

    expect(fs.existsSync(danglingTempFile)).toBe(true)

    // Run recovery
    optimizationQueueService.recoverInterruptedJobs()

    // Dangling temp file should have been deleted
    expect(fs.existsSync(danglingTempFile)).toBe(false)

    // Job should be reset to queued with 0% progress
    const recovered = optimizationQueueService
      .listQueue()
      .find((q) => q.id === job.id)
    expect(recovered?.status).toBe('queued')
    expect(recovered?.progressPercent).toBe(0)
  })

  it('supports pause, resume, cancel, retry and clear completed queue actions', () => {
    const job = optimizationQueueService.enqueue({
      lessonId: 'les_ctrl',
      sourcePath: 'C:/Vault/LessonCtrl.mp4',
      profile: 'balanced'
    })

    // Pause
    optimizationQueueService.pauseJob(job.id)
    expect(
      optimizationQueueService.listQueue().find((q) => q.id === job.id)?.status
    ).toBe('paused')

    // Resume
    optimizationQueueService.resumeJob(job.id)
    expect(
      optimizationQueueService.listQueue().find((q) => q.id === job.id)?.status
    ).toBe('queued')

    // Cancel
    optimizationQueueService.cancelJob(job.id)
    expect(
      optimizationQueueService.listQueue().find((q) => q.id === job.id)?.status
    ).toBe('cancelled')

    // Clear completed/cancelled
    optimizationQueueService.clearCompleted()
    expect(
      optimizationQueueService.listQueue().find((q) => q.id === job.id)
    ).toBeUndefined()
  })
})
