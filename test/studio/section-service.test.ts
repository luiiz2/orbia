import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { DatabaseService } from '../../src/main/services/database.service'
import { librarySectionService } from '../../src/main/services/studio/section.service'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('Library Section Service', () => {
  let tmpDir: string
  let dbService: DatabaseService
  let db: Database.Database

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-sec-test-'))
    dbService = new DatabaseService()
    dbService.connect(tmpDir)
    db = (dbService as unknown as { db: Database.Database }).db
  })

  afterEach(() => {
    dbService.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates, lists, updates, and deletes sections', () => {
    const courseId = 'course_sec_1'
    const now = Date.now()
    db.prepare(`
      INSERT INTO courses (id, title, slug, source_type, root_path, total_duration, module_count, lesson_count, is_favorite, created_at, updated_at)
      VALUES (?, 'Curso Seções', 'curso-secoes', 'local-vault', '/sec', 100, 1, 1, 0, ?, ?)
    `).run(courseId, now, now)

    const section = librarySectionService.createSection(db, courseId, 'Parte 1 — Teoria')
    expect(section.title).toBe('Parte 1 — Teoria')
    expect(section.courseId).toBe(courseId)

    const list = librarySectionService.listSections(db, courseId)
    expect(list).toHaveLength(1)

    const okUpdate = librarySectionService.updateSection(db, section.id, { title: 'Parte 1 — Conceitos Fundamentais' })
    expect(okUpdate).toBe(true)

    const updatedList = librarySectionService.listSections(db, courseId)
    expect(updatedList[0].title).toBe('Parte 1 — Conceitos Fundamentais')

    const okDelete = librarySectionService.deleteSection(db, section.id)
    expect(okDelete).toBe(true)

    const emptyList = librarySectionService.listSections(db, courseId)
    expect(emptyList).toHaveLength(0)
  })
})
