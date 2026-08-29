import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { DatabaseService } from '../../src/main/services/database.service'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('Database Migration 005: Library Studio & Appearances', () => {
  let tmpDir: string
  let dbService: DatabaseService

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-studio-test-'))
    dbService = new DatabaseService()
    dbService.connect(tmpDir)
  })

  afterEach(() => {
    dbService.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates all v0.5 studio tables and indexes', () => {
    const db = (dbService as unknown as { db: Database.Database }).db
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all() as { name: string }[]
    const tableNames = tables.map((t) => t.name)

    expect(tableNames).toContain('library_appearances')
    expect(tableNames).toContain('library_sections')
    expect(tableNames).toContain('collections')
    expect(tableNames).toContain('collection_items')
    expect(tableNames).toContain('custom_field_definitions')
    expect(tableNames).toContain('custom_field_values')
    expect(tableNames).toContain('automation_rules')
    expect(tableNames).toContain('studio_history')
  })

  it('backfills primary appearances when a course is inserted', () => {
    const courseId = 'course_test_1'
    const now = Date.now()
    const db = (dbService as unknown as { db: Database.Database }).db

    db.prepare(
      `
      INSERT INTO courses (id, title, slug, source_type, root_path, total_duration, module_count, lesson_count, is_favorite, created_at, updated_at)
      VALUES (?, 'Curso Teste', 'curso-teste', 'local-vault', '/test', 100, 1, 1, 0, ?, ?)
    `
    ).run(courseId, now, now)

    db.prepare(
      `
      INSERT INTO modules (id, course_id, title, order_index, folder_path, duration, lesson_count, created_at)
      VALUES ('mod_1', ?, 'Modulo 1', 1, '/test/mod1', 100, 1, ?)
    `
    ).run(courseId, now)

    db.prepare(
      `
      INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, availability, created_at)
      VALUES ('less_1', 'mod_1', ?, 'Aula 1', 1, '/test/mod1/aula1.mp4', 'aula1.mp4', '.mp4', 'video', 100, 1024, 'available', ?)
    `
    ).run(courseId, now)

    // Run backfill
    ;(
      dbService as unknown as { backfillLibraryAppearances: () => void }
    ).backfillLibraryAppearances()

    const appearances = db
      .prepare(`SELECT * FROM library_appearances`)
      .all() as Array<{
      id: string
      entity_type: string
      entity_id: string
      is_reference: number
      is_hidden: number
    }>

    expect(appearances.length).toBe(3) // 1 course, 1 module, 1 lesson
    expect(
      appearances.some(
        (a) => a.entity_type === 'course' && a.entity_id === courseId
      )
    ).toBe(true)
    expect(
      appearances.some(
        (a) => a.entity_type === 'module' && a.entity_id === 'mod_1'
      )
    ).toBe(true)
    expect(
      appearances.some(
        (a) => a.entity_type === 'lesson' && a.entity_id === 'less_1'
      )
    ).toBe(true)
  })
})
