import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseService } from '../src/main/services/database.service'
import { TranscriptRepository } from '../src/main/services/transcription/transcript-repository.service'

describe('TranscriptRepository', () => {
  let tempDir: string
  let vaultDir: string
  let mediaPath: string
  let database: DatabaseService
  let repository: TranscriptRepository

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-transcript-storage-'))
    vaultDir = path.join(tempDir, 'vault')
    fs.mkdirSync(vaultDir, { recursive: true })
    mediaPath = path.join(vaultDir, 'lesson.mp4')
    fs.writeFileSync(mediaPath, 'media')
    database = new DatabaseService()
    database.connect(vaultDir)
    const db = database.getDatabase()!
    db.prepare(`INSERT INTO courses (id, title, slug, source_type, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'course-1', 'Course', 'course', 'managed', vaultDir, 1, 1
    )
    db.prepare(`INSERT INTO modules (id, course_id, title, order_index, duration, lesson_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'module-1', 'course-1', 'Module', 1, 10, 1, 1
    )
    db.prepare(`INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'lesson-1', 'module-1', 'course-1', 'Lesson', 1, mediaPath, 'lesson.mp4', '.mp4', 'video', 10, 5, 1
    )
    repository = new TranscriptRepository(database)
  })

  afterEach(() => {
    database.close()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('stores timestamped segments and atomically replaces the current version', () => {
    const first = repository.saveCompleted({
      lessonId: 'lesson-1',
      language: 'pt',
      provider: 'subtitle',
      sourceRevision: 'revision-1',
      settings: { reusedExistingSubtitle: true },
      segments: [{ sequence: 0, start: 0, end: 2, text: 'Primeira versão' }]
    })
    const second = repository.saveCompleted({
      lessonId: 'lesson-1',
      language: 'pt',
      provider: 'openai',
      model: 'whisper-1',
      sourceRevision: 'revision-1',
      settings: {},
      segments: [{ sequence: 0, start: 0, end: 2, text: 'Versão final' }]
    })

    expect(first.version).toBe(1)
    expect(second.version).toBe(2)
    expect(repository.getCurrent('lesson-1')).toMatchObject({
      id: second.id,
      isCurrent: true,
      provider: 'openai',
      segments: [{ sequence: 0, start: 0, end: 2, text: 'Versão final' }]
    })

    const rows = database.getDatabase()!.prepare(`SELECT is_current FROM transcripts WHERE id = ?`).get(first.id) as { is_current: number }
    expect(rows.is_current).toBe(0)
  })

  it('derives a path-independent source revision from canonical lesson metadata', () => {
    const original = repository.getLessonSource('lesson-1')!
    const movedPath = path.join(vaultDir, 'moved-lesson.mp4')
    fs.renameSync(mediaPath, movedPath)
    database.getDatabase()!.prepare(`UPDATE lessons SET file_path = ?, file_name = ? WHERE id = ?`).run(movedPath, 'moved-lesson.mp4', 'lesson-1')

    expect(repository.getLessonSource('lesson-1')!.sourceRevision).toBe(original.sourceRevision)
  })

  it('reads vault and course automatic-transcription settings with opt-in defaults', () => {
    expect(repository.getSettings().autoTranscribeNewLessons).toBe(false)
    expect(repository.setSettings({ autoTranscribeNewLessons: true })).toBe(true)
    expect(repository.getSettings().autoTranscribeNewLessons).toBe(true)
    expect(repository.getCourseAutoTranscribe('course-1')).toBe(false)
    expect(repository.setCourseAutoTranscribe('course-1', true)).toBe(true)
    expect(repository.getCourseAutoTranscribe('course-1')).toBe(true)
  })
})

