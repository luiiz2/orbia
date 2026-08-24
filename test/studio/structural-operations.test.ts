import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { DatabaseService } from '../../src/main/services/database.service'
import { structuralOperationsService } from '../../src/main/services/studio/structural-operations.service'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('Structural Operations Service (Course/Module conversions & Selections)', () => {
  let tmpDir: string
  let dbService: DatabaseService
  let db: Database.Database

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-struct-test-'))
    dbService = new DatabaseService()
    dbService.connect(tmpDir)
    db = (dbService as unknown as { db: Database.Database }).db
  })

  afterEach(() => {
    dbService.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('converts a Course into a Module of a target Course preserving lessons', () => {
    const now = Date.now()
    // Course A
    db.prepare(`
      INSERT INTO courses (id, title, slug, source_type, root_path, total_duration, module_count, lesson_count, is_favorite, created_at, updated_at)
      VALUES ('course_a', 'Curso A', 'curso-a', 'local-vault', '/a', 500, 1, 2, 0, ?, ?)
    `).run(now, now)
    db.prepare(`
      INSERT INTO modules (id, course_id, title, order_index, folder_path, duration, lesson_count, created_at)
      VALUES ('mod_a', 'course_a', 'Modulo A', 1, '/a', 500, 2, ?)
    `).run(now)
    db.prepare(`
      INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, availability, created_at)
      VALUES ('less_a1', 'mod_a', 'course_a', 'Aula A1', 1, '/a/1.mp4', '1.mp4', '.mp4', 'video', 250, 1024, 'available', ?),
             ('less_a2', 'mod_a', 'course_a', 'Aula A2', 2, '/a/2.mp4', '2.mp4', '.mp4', 'video', 250, 1024, 'available', ?)
    `).run(now, now)

    // Course B (Target)
    db.prepare(`
      INSERT INTO courses (id, title, slug, source_type, root_path, total_duration, module_count, lesson_count, is_favorite, created_at, updated_at)
      VALUES ('course_b', 'Curso B', 'curso-b', 'local-vault', '/b', 100, 1, 1, 0, ?, ?)
    `).run(now, now)

    const res = structuralOperationsService.courseToModule(db, 'course_a', 'course_b')
    expect(res.success).toBe(true)
    expect(res.newModuleId).toBeDefined()

    // Course A is gone from courses
    const courseA = db.prepare(`SELECT * FROM courses WHERE id = 'course_a'`).get()
    expect(courseA).toBeUndefined()

    // Lessons now belong to course B and new module
    const lessons = db.prepare(`SELECT * FROM lessons WHERE course_id = 'course_b'`).all()
    expect(lessons).toHaveLength(2) // 2 moved lessons
  })

  it('converts a Module into an independent Course', () => {
    const now = Date.now()
    db.prepare(`
      INSERT INTO courses (id, title, slug, source_type, root_path, total_duration, module_count, lesson_count, is_favorite, created_at, updated_at)
      VALUES ('course_main', 'Curso Principal', 'curso-main', 'local-vault', '/main', 300, 2, 2, 0, ?, ?)
    `).run(now, now)

    db.prepare(`
      INSERT INTO modules (id, course_id, title, order_index, folder_path, duration, lesson_count, created_at)
      VALUES ('mod_sub', 'course_main', 'Modulo Especial', 1, '/main/sub', 300, 2, ?)
    `).run(now)

    db.prepare(`
      INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, availability, created_at)
      VALUES ('less_sub1', 'mod_sub', 'course_main', 'Aula Sub 1', 1, '/main/sub/1.mp4', '1.mp4', '.mp4', 'video', 300, 1024, 'available', ?)
    `).run(now)

    const res = structuralOperationsService.moduleToCourse(db, 'mod_sub', 'Curso Desmembrado')
    expect(res.success).toBe(true)
    expect(res.newCourseId).toBeDefined()

    const newCourse = db.prepare(`SELECT * FROM courses WHERE id = ?`).get(res.newCourseId) as { title: string }
    expect(newCourse.title).toBe('Curso Desmembrado')

    const lesson = db.prepare(`SELECT course_id FROM lessons WHERE id = 'less_sub1'`).get() as { course_id: string }
    expect(lesson.course_id).toBe(res.newCourseId)
  })

  it('creates a new Course from a selection of appearances', () => {
    const now = Date.now()
    db.prepare(`
      INSERT INTO courses (id, title, slug, source_type, root_path, total_duration, module_count, lesson_count, is_favorite, created_at, updated_at)
      VALUES ('c1', 'C1', 'c1', 'local-vault', '/c1', 100, 1, 2, 0, ?, ?)
    `).run(now, now)

    db.prepare(`
      INSERT INTO modules (id, course_id, title, order_index, folder_path, duration, lesson_count, created_at)
      VALUES ('m1', 'c1', 'Modulo 1', 1, '/c1', 100, 1, ?)
    `).run(now)

    db.prepare(`
      INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, availability, created_at)
      VALUES ('l1', 'm1', 'c1', 'Aula 1', 1, '/c1/1.mp4', '1.mp4', '.mp4', 'video', 100, 1024, 'available', ?)
    `).run(now)

    db.prepare(`
      INSERT INTO library_appearances (id, entity_type, entity_id, root_course_id, display_order, is_reference, is_hidden, created_at, updated_at)
      VALUES ('app_l1', 'lesson', 'l1', 'c1', 1, 0, 0, ?, ?)
    `).run(now, now)

    const res = structuralOperationsService.createCourseFromSelection(db, ['app_l1'], 'Meu Combo de Aulas')
    expect(res.success).toBe(true)
    expect(res.newCourse?.title).toBe('Meu Combo de Aulas')

    const newCourseId = res.newCourse?.id
    const movedLesson = db.prepare(`SELECT course_id FROM lessons WHERE id = 'l1'`).get() as { course_id: string }
    expect(movedLesson.course_id).toBe(newCourseId)
  })
})
