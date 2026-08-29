import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { DatabaseService } from '../../src/main/services/database.service'
import { customFieldsService } from '../../src/main/services/studio/custom-fields.service'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('Custom Fields Service', () => {
  let tmpDir: string
  let dbService: DatabaseService
  let db: Database.Database

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-fields-test-'))
    dbService = new DatabaseService()
    dbService.connect(tmpDir)
    db = (dbService as unknown as { db: Database.Database }).db
  })

  afterEach(() => {
    dbService.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates custom field definition and sets/gets dynamic values', () => {
    const field = customFieldsService.createDefinition(db, 'Professor', 'text')
    expect(field.name).toBe('Professor')
    expect(field.fieldType).toBe('text')

    const list = customFieldsService.listDefinitions(db)
    expect(list).toHaveLength(1)

    const setOk = customFieldsService.setValue(
      db,
      'course_101',
      field.id,
      'Rodrigo Branas'
    )
    expect(setOk).toBe(true)

    const values = customFieldsService.getValues(db, 'course_101')
    expect(values['Professor']).toBe('Rodrigo Branas')
  })
})
