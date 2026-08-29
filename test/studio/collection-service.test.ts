import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { DatabaseService } from '../../src/main/services/database.service'
import { collectionService } from '../../src/main/services/studio/collection.service'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('Collection Service', () => {
  let tmpDir: string
  let dbService: DatabaseService
  let db: Database.Database

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-col-test-'))
    dbService = new DatabaseService()
    dbService.connect(tmpDir)
    db = (dbService as unknown as { db: Database.Database }).db
  })

  afterEach(() => {
    dbService.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates, lists, and adds items to collections', () => {
    const now = Date.now()
    db.prepare(
      `
      INSERT INTO library_appearances (id, entity_type, entity_id, root_course_id, display_order, is_reference, is_hidden, tags, custom_metadata, created_at, updated_at)
      VALUES ('app_1', 'lesson', 'l1', 'c1', 1, 0, 0, '[]', '{}', ?, ?),
             ('app_2', 'lesson', 'l2', 'c1', 2, 0, 0, '[]', '{}', ?, ?)
    `
    ).run(now, now, now, now)

    const col = collectionService.createCollection(
      db,
      'Favoritos de Rust',
      'Meus materiais prediletos',
      '#f97316',
      'Flame'
    )
    expect(col.name).toBe('Favoritos de Rust')

    const cols = collectionService.listCollections(db)
    expect(cols).toHaveLength(1)
    expect(cols[0].name).toBe('Favoritos de Rust')

    const addOk = collectionService.addItemsToCollection(db, col.id, [
      'app_1',
      'app_2'
    ])
    expect(addOk).toBe(true)

    const updatedCols = collectionService.listCollections(db)
    expect(updatedCols[0].itemCount).toBe(2)

    const remOk = collectionService.removeItemsFromCollection(db, col.id, [
      'app_1'
    ])
    expect(remOk).toBe(true)

    const afterRemCols = collectionService.listCollections(db)
    expect(afterRemCols[0].itemCount).toBe(1)
  })
})
