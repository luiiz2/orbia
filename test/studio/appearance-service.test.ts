import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { DatabaseService } from '../../src/main/services/database.service'
import { libraryAppearanceService } from '../../src/main/services/studio/appearance.service'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('Library Appearance Service', () => {
  let tmpDir: string
  let dbService: DatabaseService
  let db: Database.Database

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-app-test-'))
    dbService = new DatabaseService()
    dbService.connect(tmpDir)
    db = (dbService as unknown as { db: Database.Database }).db
  })

  afterEach(() => {
    dbService.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates reference and lists appearances correctly', () => {
    const courseId = 'course_1'
    const now = Date.now()

    db.prepare(`
      INSERT INTO library_appearances (id, entity_type, entity_id, root_course_id, display_order, is_reference, is_hidden, created_at, updated_at)
      VALUES ('app_1', 'course', ?, ?, 1, 0, 0, ?, ?)
    `).run(courseId, courseId, now, now)

    const ref = libraryAppearanceService.createReference(db, 'lesson', 'lesson_10', courseId)
    expect(ref.isReference).toBe(true)
    expect(ref.rootCourseId).toBe(courseId)

    const list = libraryAppearanceService.listAppearances(db, courseId)
    expect(list).toHaveLength(2)
  })

  it('updates appearance title and tags', () => {
    const now = Date.now()
    db.prepare(`
      INSERT INTO library_appearances (id, entity_type, entity_id, root_course_id, display_order, is_reference, is_hidden, created_at, updated_at)
      VALUES ('app_2', 'lesson', 'less_2', 'course_1', 1, 0, 0, ?, ?)
    `).run(now, now)

    const ok = libraryAppearanceService.updateAppearance(db, 'app_2', {
      customTitle: 'Título Customizado',
      tags: ['Destaque', 'Revisar']
    })
    expect(ok).toBe(true)

    const list = libraryAppearanceService.listAppearances(db, 'course_1')
    expect(list[0].customTitle).toBe('Título Customizado')
    expect(list[0].tags).toEqual(['Destaque', 'Revisar'])
  })

  it('promotes reference to primary when primary appearance is deleted', () => {
    const now = Date.now()
    // Primary appearance
    db.prepare(`
      INSERT INTO library_appearances (id, entity_type, entity_id, root_course_id, display_order, is_reference, is_hidden, created_at, updated_at)
      VALUES ('app_primary', 'lesson', 'less_shared', 'course_1', 1, 0, 0, ?, ?)
    `).run(now, now)

    // Reference in another course
    db.prepare(`
      INSERT INTO library_appearances (id, entity_type, entity_id, root_course_id, display_order, is_reference, is_hidden, created_at, updated_at)
      VALUES ('app_ref', 'lesson', 'less_shared', 'course_2', 1, 1, 0, ?, ?)
    `).run(now + 10, now + 10)

    const res = libraryAppearanceService.deleteAppearance(db, 'app_primary')
    expect(res.success).toBe(true)
    expect(res.promotedAppearanceId).toBe('app_ref')

    const updatedRef = db.prepare(`SELECT is_reference FROM library_appearances WHERE id = 'app_ref'`).get() as { is_reference: number }
    expect(updatedRef.is_reference).toBe(0) // Promoted to primary
  })

  it('hides and unhides appearances in bulk', () => {
    const now = Date.now()
    db.prepare(`
      INSERT INTO library_appearances (id, entity_type, entity_id, root_course_id, display_order, is_reference, is_hidden, created_at, updated_at)
      VALUES ('app_h1', 'lesson', 'less_h1', 'course_1', 1, 0, 0, ?, ?)
    `).run(now, now)

    libraryAppearanceService.setHidden(db, ['app_h1'], true)
    const hiddenList = libraryAppearanceService.listAppearances(db, 'course_1', false)
    expect(hiddenList).toHaveLength(0)

    const allList = libraryAppearanceService.listAppearances(db, 'course_1', true)
    expect(allList).toHaveLength(1)
    expect(allList[0].isHidden).toBe(true)
  })
})
