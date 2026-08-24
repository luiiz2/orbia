import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { DatabaseService } from '../../src/main/services/database.service'
import { timeMatcherService } from '../../src/main/services/discovery/time-matcher.service'

describe('Time Matcher Service (How much time do you have?)', () => {
  let dbService: DatabaseService
  let db: Database.Database
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-timematcher-test-'))
    dbService = new DatabaseService()
    dbService.connect(tmpDir)
    db = (dbService as unknown as { db: Database.Database }).db
  })

  afterEach(() => {
    dbService.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('matches lessons that can be finished within target minutes', () => {
    const now = Date.now()
    db.prepare(`
      INSERT INTO courses (id, title, slug, source_type, root_path, total_duration, module_count, lesson_count, is_favorite, created_at, updated_at)
      VALUES ('c_web', 'Web Dev', 'web-dev', 'local-vault', '/web', 7200, 1, 3, 0, ?, ?)
    `).run(now, now)

    db.prepare(`
      INSERT INTO modules (id, course_id, title, order_index, folder_path, duration, lesson_count, created_at)
      VALUES ('m_web', 'c_web', 'Módulo 1', 1, '/web', 7200, 3, ?)
    `).run(now)

    // Lesson 1: 15 min (900s)
    // Lesson 2: 45 min (2700s)
    // Lesson 3: 60 min (3600s)
    db.prepare(`
      INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, availability, created_at)
      VALUES ('l_15', 'm_web', 'c_web', 'Aula 15 min', 1, '/15.mp4', '15.mp4', '.mp4', 'video', 900, 100, 'available', ?),
             ('l_45', 'm_web', 'c_web', 'Aula 45 min', 2, '/45.mp4', '45.mp4', '.mp4', 'video', 2700, 100, 'available', ?),
             ('l_60', 'm_web', 'c_web', 'Aula 60 min', 3, '/60.mp4', '60.mp4', '.mp4', 'video', 3600, 100, 'available', ?)
    `).run(now, now, now)

    // Query 20 minutes
    const recs20 = timeMatcherService.getRecommendationsForTimeWindow(db, 20)
    expect(recs20.length).toBe(1)
    expect(recs20[0].lessonId).toBe('l_15')

    // Query 50 minutes (should return l_15 and l_45)
    const recs50 = timeMatcherService.getRecommendationsForTimeWindow(db, 50)
    expect(recs50.length).toBe(2)
  })
})
