import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { DatabaseService } from '../../src/main/services/database.service'
import { courseRelationshipsService } from '../../src/main/services/discovery/relationships.service'

describe('Course Relationships & Journey Sequences', () => {
  let dbService: DatabaseService
  let db: Database.Database
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-rel-test-'))
    dbService = new DatabaseService()
    dbService.connect(tmpDir)
    db = (dbService as unknown as { db: Database.Database }).db
  })

  afterEach(() => {
    dbService.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates, lists, and deletes course relationships', () => {
    const now = Date.now()
    db.prepare(
      `
      INSERT INTO courses (id, title, slug, source_type, root_path, total_duration, module_count, lesson_count, is_favorite, created_at, updated_at)
      VALUES ('c_part1', 'React Básico', 'react-1', 'local-vault', '/r1', 1000, 1, 1, 0, ?, ?),
             ('c_part2', 'React Avançado', 'react-2', 'local-vault', '/r2', 1000, 1, 1, 0, ?, ?)
    `
    ).run(now, now, now, now)

    const rel = courseRelationshipsService.addRelationship(
      db,
      'c_part1',
      'c_part2',
      'sequel'
    )
    expect(rel.id).toBeDefined()
    expect(rel.relationshipType).toBe('sequel')

    const list = courseRelationshipsService.listRelationships(db, 'c_part1')
    expect(list).toHaveLength(1)
    expect(list[0].targetCourseId).toBe('c_part2')

    const okDel = courseRelationshipsService.deleteRelationship(db, rel.id)
    expect(okDel).toBe(true)

    const afterDel = courseRelationshipsService.listRelationships(db, 'c_part1')
    expect(afterDel).toHaveLength(0)
  })
})
