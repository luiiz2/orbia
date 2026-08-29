import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { DatabaseService } from '../../src/main/services/database.service'
import { studioHistoryService } from '../../src/main/services/studio/history.service'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('Studio History & Transactional Undo Service', () => {
  let tmpDir: string
  let dbService: DatabaseService
  let db: Database.Database

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-hist-test-'))
    dbService = new DatabaseService()
    dbService.connect(tmpDir)
    db = (dbService as unknown as { db: Database.Database }).db
  })

  afterEach(() => {
    dbService.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('records operations and executes full rollback on undo', () => {
    const now = Date.now()
    const appBefore = {
      id: 'app_test',
      entity_type: 'lesson',
      entity_id: 'less_1',
      root_course_id: 'c1',
      custom_title: 'Título Antigo',
      display_order: 1,
      is_reference: 0,
      is_hidden: 0,
      tags: '[]',
      custom_metadata: '{}',
      created_at: now,
      updated_at: now
    }

    db.prepare(
      `
      INSERT INTO library_appearances (id, entity_type, entity_id, root_course_id, custom_title, display_order, is_reference, is_hidden, tags, custom_metadata, created_at, updated_at)
      VALUES (@id, @entity_type, @entity_id, @root_course_id, @custom_title, @display_order, @is_reference, @is_hidden, @tags, @custom_metadata, @created_at, @updated_at)
    `
    ).run(appBefore)

    // Simulate update to new title
    db.prepare(
      `UPDATE library_appearances SET custom_title = 'Título Novo' WHERE id = 'app_test'`
    ).run()

    // Record in history
    const histId = studioHistoryService.recordOperation(
      db,
      'rename',
      'Renomeou aula',
      { appearances: [appBefore] },
      { appearances: [{ ...appBefore, custom_title: 'Título Novo' }] }
    )

    const list = studioHistoryService.listHistory(db)
    expect(list).toHaveLength(1)
    expect(list[0].isUndone).toBe(false)

    // Execute Undo
    const undoRes = studioHistoryService.undoOperation(db, histId)
    expect(undoRes.success).toBe(true)

    // Verify title was restored
    const restoredApp = db
      .prepare(
        `SELECT custom_title FROM library_appearances WHERE id = 'app_test'`
      )
      .get() as { custom_title: string }
    expect(restoredApp.custom_title).toBe('Título Antigo')

    // Second undo should fail safely
    const secondUndo = studioHistoryService.undoOperation(db, histId)
    expect(secondUndo.success).toBe(false)
  })
})
