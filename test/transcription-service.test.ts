import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseService } from '../src/main/services/database.service'
import { OptimizationQueueService } from '../src/main/services/optimizer/optimization-queue.service'
import { TranscriptRepository } from '../src/main/services/transcription/transcript-repository.service'
import { TranscriptionService } from '../src/main/services/transcription/transcription.service'

describe('TranscriptionService', () => {
  let tempDir: string
  let vaultDir: string
  let mediaPath: string
  let database: DatabaseService
  let repository: TranscriptRepository
  let queue: OptimizationQueueService
  let engine: { transcribe: ReturnType<typeof vi.fn> }
  let service: TranscriptionService

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-transcription-service-'))
    vaultDir = path.join(tempDir, 'vault')
    fs.mkdirSync(vaultDir, { recursive: true })
    mediaPath = path.join(vaultDir, 'lesson.mp4')
    fs.writeFileSync(mediaPath, 'media')
    database = new DatabaseService()
    database.connect(vaultDir)
    const db = database.getDatabase()!
    db.prepare(`INSERT INTO courses (id, title, slug, source_type, root_path, created_at, updated_at) VALUES ('course-1', 'Course', 'course', 'managed', ?, 1, 1)`).run(vaultDir)
    db.prepare(`INSERT INTO modules (id, course_id, title, order_index, duration, lesson_count, created_at) VALUES ('module-1', 'course-1', 'Module', 1, 10, 1, 1)`).run()
    db.prepare(`INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, created_at) VALUES ('lesson-1', 'module-1', 'course-1', 'Lesson', 1, ?, 'lesson.mp4', '.mp4', 'video', 10, 5, 1)`).run(mediaPath)
    repository = new TranscriptRepository(database)
    queue = new OptimizationQueueService(database)
    engine = { transcribe: vi.fn().mockResolvedValue({ providerId: 'openai-compatible', modelId: 'whisper-1', language: 'pt', segments: [{ start: 0, end: 1, text: 'Olá' }] }) }
    service = new TranscriptionService({ repository, queue, engine })
  })

  afterEach(() => {
    database.close()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('enqueues lesson, module, and course requests on demand with active-job deduplication', () => {
    expect(service.enqueueLesson('lesson-1', { language: 'pt', autoDetect: false }).skipped).toBe(false)
    expect(service.enqueueLesson('lesson-1', { language: 'pt', autoDetect: false })).toMatchObject({ skipped: true, reason: 'active_job' })
    expect(service.enqueueModule('module-1').requestedCount).toBe(1)
    expect(service.enqueueCourse('course-1').requestedCount).toBe(1)
  })

  it('reuses a suitable subtitle and never calls the provider', async () => {
    const subtitlePath = path.join(vaultDir, 'lesson.pt.srt')
    fs.writeFileSync(subtitlePath, '1\n00:00:00,000 --> 00:00:01,000\nOlá\n')
    database.getDatabase()!.prepare(`INSERT INTO content_resources (id, course_id, module_id, lesson_id, role, name, file_path, file_extension, file_size, resource_type, language, label, created_at) VALUES ('sub-1', 'course-1', 'module-1', 'lesson-1', 'subtitle', 'lesson.pt.srt', ?, '.srt', 10, 'subtitle', 'pt', 'Português', 1)`).run(subtitlePath)

    const result = service.enqueueLesson('lesson-1', { language: 'pt', autoDetect: false, reuseExistingSubtitle: true })
    const job = queue.getNextBackgroundJob()!
    await service.processJob(job, new AbortController().signal)

    expect(result.skipped).toBe(false)
    expect(engine.transcribe).not.toHaveBeenCalled()
    expect(repository.getCurrent('lesson-1')).toMatchObject({ provider: 'subtitle', segments: [{ text: 'Olá' }] })
  })

  it('does not replace the current transcript when retranscription fails', async () => {
    repository.saveCompleted({ lessonId: 'lesson-1', language: 'pt', provider: 'subtitle', sourceRevision: 'old', settings: {}, segments: [{ sequence: 0, start: 0, end: 1, text: 'Atual' }] })
    engine.transcribe.mockRejectedValueOnce(new Error('provider unavailable'))
    service.enqueueLesson('lesson-1', { retranscribe: true, reuseExistingSubtitle: false })
    const job = queue.getNextBackgroundJob()!
    await service.processJob(job, new AbortController().signal)

    expect(repository.getCurrent('lesson-1')?.segments[0].text).toBe('Atual')
    expect(queue.listTranscriptionQueue()[0].status).toBe('failed')
  })

  it('preserves the canonical lesson ID when the media path changes', () => {
    const movedPath = path.join(vaultDir, 'moved.mp4')
    fs.renameSync(mediaPath, movedPath)
    database.getDatabase()!.prepare(`UPDATE lessons SET file_path = ? WHERE id = 'lesson-1'`).run(movedPath)
    const result = service.enqueueLesson('lesson-1')
    expect(result.lessonId).toBe('lesson-1')
    expect(queue.listTranscriptionQueue()[0].lessonId).toBe('lesson-1')
  })
})
