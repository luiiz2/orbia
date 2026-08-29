import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { DatabaseService } from '../../src/main/services/database.service'
import { libraryInsightsService } from '../../src/main/services/discovery/insights.service'

describe('Library Insights Analytics', () => {
  let dbService: DatabaseService
  let db: Database.Database
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-insights-test-'))
    dbService = new DatabaseService()
    dbService.connect(tmpDir)
    db = (dbService as unknown as { db: Database.Database }).db
  })

  afterEach(() => {
    dbService.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('aggregates library totals and top tags accurately', () => {
    const now = Date.now()
    db.prepare(
      `
      INSERT INTO courses (id, title, slug, source_type, root_path, total_duration, module_count, lesson_count, is_favorite, created_at, updated_at)
      VALUES ('c_py', 'Python Completo', 'python-completo', 'local-vault', '/py', 7200, 1, 2, 1, ?, ?)
    `
    ).run(now, now)

    db.prepare(
      `
      INSERT INTO library_appearances (id, entity_type, entity_id, root_course_id, display_order, is_reference, is_hidden, tags, custom_metadata, created_at, updated_at)
      VALUES ('app_py', 'course', 'c_py', 'c_py', 1, 0, 0, '["Python", "Backend"]', '{}', ?, ?)
    `
    ).run(now, now)

    db.prepare(
      `
      INSERT INTO modules (id, course_id, title, order_index, folder_path, duration, lesson_count, created_at)
      VALUES ('m_py', 'c_py', 'Módulo 1', 1, '/py', 7200, 2, ?)
    `
    ).run(now)

    db.prepare(
      `
      INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, availability, created_at)
      VALUES ('l_py1', 'm_py', 'c_py', 'Aula 1', 1, '/py1.mp4', 'py1.mp4', '.mp4', 'video', 3600, 100, 'available', ?),
             ('l_py2', 'm_py', 'c_py', 'Aula 2', 2, '/py2.mp4', 'py2.mp4', '.mp4', 'video', 3600, 100, 'available', ?)
    `
    ).run(now, now)

    dbService.addWatchHistory({
      lessonId: 'l_py1',
      courseId: 'c_py',
      lessonTitle: 'Aula 1',
      courseTitle: 'Python Completo',
      duration: 3600,
      currentTime: 1800,
      watchedAt: now
    })

    const insights = libraryInsightsService.getInsights(db)
    expect(insights.totalCourses).toBe(1)
    expect(insights.totalLessons).toBe(2)
    expect(insights.totalDurationHours).toBe(2)
    expect(insights.watchedHoursThisMonth).toBe(0.5)
    expect(insights.topTags.some((t) => t.tag === 'Python')).toBe(true)
  })
})
