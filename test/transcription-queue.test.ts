import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { databaseService } from '../src/main/services/database.service'
import { optimizationQueueService } from '../src/main/services/optimizer/optimization-queue.service'

describe('shared background queue transcription jobs', () => {
  let tempDir: string
  let vaultDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-transcription-queue-'))
    vaultDir = path.join(tempDir, 'vault')
    fs.mkdirSync(vaultDir, { recursive: true })
    databaseService.connect(vaultDir)
    const db = databaseService.getDatabase()!
    db.prepare(`INSERT INTO courses (id, title, slug, source_type, root_path, created_at, updated_at) VALUES ('course-1', 'Course', 'course', 'managed', ?, 1, 1)`).run(vaultDir)
    db.prepare(`INSERT INTO modules (id, course_id, title, order_index, duration, lesson_count, created_at) VALUES ('module-1', 'course-1', 'Module', 1, 10, 1, 1)`).run()
    db.prepare(`INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, created_at) VALUES ('lesson-1', 'module-1', 'course-1', 'Lesson', 1, ?, 'lesson.mp4', '.mp4', 'video', 10, 10, 1)`).run(path.join(vaultDir, 'lesson.mp4'))
  })

  afterEach(() => {
    databaseService.close()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('persists transcription jobs, deduplicates active work, and leaves optimizer listing unchanged', () => {
    const first = optimizationQueueService.enqueueTranscription({
      lessonId: 'lesson-1',
      courseId: 'course-1',
      sourcePath: path.join(vaultDir, 'lesson.mp4'),
      sourceRevision: 'revision-1',
      language: 'pt-BR',
      autoDetect: false,
      reuseExistingSubtitle: true
    })
    const duplicate = optimizationQueueService.enqueueTranscription({
      lessonId: 'lesson-1',
      courseId: 'course-1',
      sourcePath: path.join(vaultDir, 'lesson.mp4'),
      sourceRevision: 'revision-1'
    })

    expect(first.jobType).toBe('transcription')
    expect(first.transcriptionLanguage).toBe('pt-BR')
    expect(duplicate.id).toBe(first.id)
    expect(optimizationQueueService.listQueue()).toEqual([])
    expect(optimizationQueueService.listTranscriptionQueue()).toHaveLength(1)
    expect(optimizationQueueService.getNextBackgroundJob()?.id).toBe(first.id)
  })

  it('recovers interrupted transcription work and supports shared controls', () => {
    const job = optimizationQueueService.enqueueTranscription({
      lessonId: 'lesson-1',
      sourcePath: path.join(vaultDir, 'lesson.mp4'),
      sourceRevision: 'revision-1'
    })
    const tempOutputPath = path.join(vaultDir, '.orbia', 'transcription.partial.wav')
    fs.writeFileSync(tempOutputPath, 'partial')
    optimizationQueueService.updateJob(job.id, {
      status: 'transcribing',
      tempOutputPath,
      progressPercent: 55
    })

    optimizationQueueService.recoverInterruptedJobs()
    expect(fs.existsSync(tempOutputPath)).toBe(false)
    expect(optimizationQueueService.listTranscriptionQueue()[0]).toMatchObject({ status: 'queued', progressPercent: 0 })

    expect(optimizationQueueService.pauseJob(job.id)).toBe(true)
    expect(optimizationQueueService.resumeJob(job.id)).toBe(true)
    expect(optimizationQueueService.cancelJob(job.id)).toBe(true)
    expect(optimizationQueueService.retryJob(job.id)).toBe(true)
    expect(optimizationQueueService.listTranscriptionQueue()[0]).toMatchObject({ status: 'queued', retryCount: 0 })
  })
})

