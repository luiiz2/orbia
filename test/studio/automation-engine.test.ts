import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { DatabaseService } from '../../src/main/services/database.service'
import { automationEngine } from '../../src/main/services/studio/automation-engine'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('Local Deterministic Automation Engine', () => {
  let tmpDir: string
  let dbService: DatabaseService
  let db: Database.Database

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-auto-test-'))
    dbService = new DatabaseService()
    dbService.connect(tmpDir)
    db = (dbService as unknown as { db: Database.Database }).db
  })

  afterEach(() => {
    dbService.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('saves and executes automation rules deterministically', () => {
    const now = Date.now()
    db.prepare(
      `
      INSERT INTO library_appearances (id, entity_type, entity_id, root_course_id, display_order, is_reference, is_hidden, tags, custom_metadata, created_at, updated_at)
      VALUES ('app_1', 'lesson', 'less_1', 'course_1', 1, 0, 0, '[]', '{}', ?, ?)
    `
    ).run(now, now)

    const rule = automationEngine.saveRule(db, {
      name: 'Adicionar Tag Revisado para Aulas',
      priority: 10,
      isActive: true,
      executionMode: 'manual',
      triggerEvent: 'onManualTrigger',
      conditions: [
        { field: 'entity_type', operator: 'equals', value: 'lesson' }
      ],
      actions: [{ actionType: 'add_tag', params: { tag: 'Revisado' } }]
    })

    expect(rule.name).toBe('Adicionar Tag Revisado para Aulas')

    const execRes = automationEngine.executeRule(db, rule.id)
    expect(execRes.success).toBe(true)
    expect(execRes.affectedCount).toBe(1)

    const updatedApp = db
      .prepare(`SELECT tags FROM library_appearances WHERE id = 'app_1'`)
      .get() as { tags: string }
    expect(JSON.parse(updatedApp.tags)).toContain('Revisado')
  })
})
