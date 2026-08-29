import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseService } from '../src/main/services/database.service'

describe('Phase 4 grounded chat vault migration', () => {
  let vaultPath: string
  let database: DatabaseService

  beforeEach(() => {
    vaultPath = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-grounded-chat-'))
    database = new DatabaseService()
    database.connect(vaultPath)
  })

  afterEach(() => {
    database.close()
    fs.rmSync(vaultPath, { recursive: true, force: true })
  })

  it('creates the lexical index and local conversation tables without duplicating source text', () => {
    const db = database.getDatabase()
    if (!db) throw new Error('Expected connected database')

    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type IN ('table', 'virtual table')
       AND name IN ('semantic_index_fts', 'chat_conversations', 'chat_messages', 'chat_message_sources')
       ORDER BY name`
      )
      .all() as Array<{ name: string }>

    expect(tables.map((row) => row.name)).toEqual([
      'chat_conversations',
      'chat_message_sources',
      'chat_messages',
      'semantic_index_fts'
    ])
    expect(
      db
        .prepare(
          `SELECT sql FROM sqlite_master WHERE name = 'semantic_index_fts'`
        )
        .get()
    ).toMatchObject({
      sql: expect.stringContaining("content='semantic_index_chunks'")
    })
    expect(
      db
        .prepare(
          `SELECT sql FROM sqlite_master WHERE name = 'semantic_index_fts'`
        )
        .get()
    ).toMatchObject({
      sql: expect.stringContaining("tokenize='unicode61 remove_diacritics 2'")
    })

    const triggers = db
      .prepare(
        `SELECT name FROM sqlite_master
       WHERE type = 'trigger' AND name LIKE 'semantic_index_chunks_fts_%'
       ORDER BY name`
      )
      .all() as Array<{ name: string }>
    expect(triggers.map((row) => row.name)).toEqual([
      'semantic_index_chunks_fts_ad',
      'semantic_index_chunks_fts_ai',
      'semantic_index_chunks_fts_au'
    ])

    expect(
      db
        .prepare(`SELECT id FROM _migrations WHERE id = ?`)
        .get('010_v09_grounded_chat')
    ).toBeTruthy()
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)

    const sourceColumns = db
      .prepare(`PRAGMA table_info(chat_message_sources)`)
      .all() as Array<{ name: string }>
    expect(sourceColumns.map((column) => column.name)).not.toContain('text')
    expect(
      db
        .prepare(
          `SELECT sql FROM sqlite_master WHERE name = 'chat_message_sources'`
        )
        .get()
    ).toMatchObject({
      sql: expect.not.stringContaining('REFERENCES semantic_index_chunks')
    })

    const indices = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'index'
       AND name IN ('idx_chat_conversations_updated', 'idx_chat_messages_conversation', 'idx_chat_message_sources_message')
       ORDER BY name`
      )
      .all() as Array<{ name: string }>
    expect(indices.map((row) => row.name)).toEqual([
      'idx_chat_conversations_updated',
      'idx_chat_message_sources_message',
      'idx_chat_messages_conversation'
    ])
  })

  it('keeps the FTS index synchronized with Phase 3 chunk inserts, updates and deletes', () => {
    const db = database.getDatabase()
    if (!db) throw new Error('Expected connected database')

    db.prepare(
      `
      INSERT INTO courses (id, title, slug, source_type, root_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run('course-1', 'Course', 'course', 'managed', vaultPath, 1, 1)
    db.prepare(
      `
      INSERT INTO semantic_index_generations (id, status, chunking_version, created_at)
      VALUES (?, ?, ?, ?)
    `
    ).run('generation-1', 'completed', 'semantic-chunk-v1', 1)
    db.prepare(
      `
      INSERT INTO semantic_index_chunks (
        id, generation_id, source_kind, source_id, course_id, source_revision,
        content_revision, data_type, text, locator_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      'chunk-1',
      'generation-1',
      'text',
      'resource:guide',
      'course-1',
      'revision-1',
      'content-1',
      'materials',
      'Dependency injection keeps construction separate from behavior.',
      '{}',
      1
    )

    const search = (term: string) =>
      db
        .prepare(
          `
      SELECT chunk.id, chunk.text
      FROM semantic_index_fts AS fts
      JOIN semantic_index_chunks AS chunk ON chunk.rowid = fts.rowid
      WHERE fts.semantic_index_fts MATCH ?
      ORDER BY chunk.id
    `
        )
        .all(term) as Array<{ id: string; text: string }>

    expect(search('dependency')).toEqual([
      {
        id: 'chunk-1',
        text: 'Dependency injection keeps construction separate from behavior.'
      }
    ])

    db.prepare(`UPDATE semantic_index_chunks SET text = ? WHERE id = ?`).run(
      'Replacement text documents the local boundary.',
      'chunk-1'
    )
    expect(search('dependency')).toEqual([])
    expect(search('replacement')).toEqual([
      {
        id: 'chunk-1',
        text: 'Replacement text documents the local boundary.'
      }
    ])

    db.prepare(`DELETE FROM semantic_index_chunks WHERE id = ?`).run('chunk-1')
    expect(search('replacement')).toEqual([])
  })

  it('rebuilds a pre-existing Phase 3 chunk once when the Phase 4 schema is recreated', () => {
    const db = database.getDatabase()
    if (!db) throw new Error('Expected connected database')

    db.prepare(
      `
      INSERT INTO courses (id, title, slug, source_type, root_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      'course-legacy',
      'Legacy course',
      'legacy-course',
      'managed',
      vaultPath,
      1,
      1
    )
    db.prepare(
      `
      INSERT INTO semantic_index_generations (id, status, chunking_version, created_at)
      VALUES (?, ?, ?, ?)
    `
    ).run('generation-legacy', 'completed', 'semantic-chunk-v1', 1)
    db.prepare(
      `
      INSERT INTO semantic_index_chunks (
        id, generation_id, source_kind, source_id, course_id, source_revision,
        content_revision, data_type, text, locator_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      'chunk-legacy',
      'generation-legacy',
      'text',
      'resource:legacy-guide',
      'course-legacy',
      'revision-legacy',
      'content-legacy',
      'materials',
      'Legacy migration evidence remains searchable after a rebuild.',
      '{}',
      1
    )

    db.exec(`
      DROP TRIGGER IF EXISTS semantic_index_chunks_fts_ai;
      DROP TRIGGER IF EXISTS semantic_index_chunks_fts_ad;
      DROP TRIGGER IF EXISTS semantic_index_chunks_fts_au;
      DROP TABLE IF EXISTS semantic_index_fts;
      DROP TABLE IF EXISTS chat_message_sources;
      DROP TABLE IF EXISTS chat_messages;
      DROP TABLE IF EXISTS chat_conversations;
    `)
    db.prepare(`DELETE FROM _migrations WHERE id = ?`).run(
      '010_v09_grounded_chat'
    )
    expect(
      db
        .prepare(`SELECT id FROM semantic_index_chunks WHERE id = ?`)
        .get('chunk-legacy')
    ).toBeTruthy()

    database.close()
    database.connect(vaultPath)
    const firstMigration = database.getDatabase()
    if (!firstMigration) throw new Error('Expected reconnected database')

    const search = () =>
      firstMigration
        .prepare(
          `
      SELECT chunk.id
      FROM semantic_index_fts AS fts
      JOIN semantic_index_chunks AS chunk ON chunk.rowid = fts.rowid
      WHERE fts.semantic_index_fts MATCH ?
    `
        )
        .all('legacy') as Array<{ id: string }>
    const phaseFourObjects = () =>
      firstMigration
        .prepare(
          `
      SELECT type, name
      FROM sqlite_master
      WHERE name IN (
        'semantic_index_fts',
        'semantic_index_chunks_fts_ai',
        'semantic_index_chunks_fts_ad',
        'semantic_index_chunks_fts_au',
        'chat_conversations',
        'chat_messages',
        'chat_message_sources',
        'idx_chat_conversations_updated',
        'idx_chat_messages_conversation',
        'idx_chat_message_sources_message'
      )
      ORDER BY type, name
    `
        )
        .all() as Array<{ type: string; name: string }>

    expect(search()).toEqual([{ id: 'chunk-legacy' }])
    expect(
      firstMigration
        .prepare(`SELECT COUNT(*) AS count FROM semantic_index_fts`)
        .get()
    ).toEqual({ count: 1 })
    expect(
      firstMigration
        .prepare(`SELECT COUNT(*) AS count FROM _migrations WHERE id = ?`)
        .get('010_v09_grounded_chat')
    ).toEqual({ count: 1 })
    const firstSchema = phaseFourObjects()
    expect(firstSchema).toHaveLength(10)

    database.close()
    database.connect(vaultPath)
    const secondMigration = database.getDatabase()
    if (!secondMigration)
      throw new Error('Expected second reconnected database')

    expect(
      secondMigration
        .prepare(
          `
      SELECT chunk.id
      FROM semantic_index_fts AS fts
      JOIN semantic_index_chunks AS chunk ON chunk.rowid = fts.rowid
      WHERE fts.semantic_index_fts MATCH ?
    `
        )
        .all('legacy')
    ).toEqual([{ id: 'chunk-legacy' }])
    expect(
      secondMigration
        .prepare(`SELECT COUNT(*) AS count FROM semantic_index_fts`)
        .get()
    ).toEqual({ count: 1 })
    expect(
      secondMigration
        .prepare(`SELECT COUNT(*) AS count FROM _migrations WHERE id = ?`)
        .get('010_v09_grounded_chat')
    ).toEqual({ count: 1 })
    expect(
      secondMigration
        .prepare(
          `
      SELECT type, name
      FROM sqlite_master
      WHERE name IN (
        'semantic_index_fts',
        'semantic_index_chunks_fts_ai',
        'semantic_index_chunks_fts_ad',
        'semantic_index_chunks_fts_au',
        'chat_conversations',
        'chat_messages',
        'chat_message_sources',
        'idx_chat_conversations_updated',
        'idx_chat_messages_conversation',
        'idx_chat_message_sources_message'
      )
      ORDER BY type, name
    `
        )
        .all()
    ).toEqual(firstSchema)
  })

  it('enforces chat role and status checks while preserving source snapshot provenance', () => {
    const db = database.getDatabase()
    if (!db) throw new Error('Expected connected database')

    const now = 1_700_000_000_000
    db.prepare(
      `
      INSERT INTO chat_conversations (id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `
    ).run('conversation-1', 'Study session', now, now)
    db.prepare(
      `
      INSERT INTO chat_messages (
        id, conversation_id, role, content, scope_json, status, provider_id, model_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      'message-1',
      'conversation-1',
      'assistant',
      'The indexed answer.',
      JSON.stringify({ type: 'course', courseId: 'course-1' }),
      'answered',
      'ollama',
      'local-chat',
      now
    )
    db.prepare(
      `
      INSERT INTO chat_message_sources (
        id, message_id, ordinal, chunk_id, source_kind, source_id, course_id,
        module_id, lesson_id, resource_id, transcript_id, note_id, source_revision,
        locator_json, display_label, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      'message-source-1',
      'message-1',
      0,
      'chunk-1',
      'transcript',
      'lesson:lesson-1:transcript',
      'course-1',
      'module-1',
      'lesson-1',
      null,
      'transcript-1',
      null,
      'revision-1',
      JSON.stringify({ startTime: 42, endTime: 49 }),
      'Lesson 1 · 00:42–00:49',
      now
    )

    expect(
      db
        .prepare(
          `
      SELECT id, message_id, chunk_id, source_id, source_revision, locator_json, display_label
      FROM chat_message_sources WHERE id = ?
    `
        )
        .get('message-source-1')
    ).toEqual({
      id: 'message-source-1',
      message_id: 'message-1',
      chunk_id: 'chunk-1',
      source_id: 'lesson:lesson-1:transcript',
      source_revision: 'revision-1',
      locator_json: JSON.stringify({ startTime: 42, endTime: 49 }),
      display_label: 'Lesson 1 · 00:42–00:49'
    })

    expect(() =>
      db
        .prepare(
          `
      INSERT INTO chat_messages (id, conversation_id, role, content, created_at)
      VALUES (?, ?, ?, ?, ?)
    `
        )
        .run('invalid-role', 'conversation-1', 'system', 'Not persisted', now)
    ).toThrow()
    expect(() =>
      db
        .prepare(
          `
      INSERT INTO chat_messages (id, conversation_id, role, content, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `
        )
        .run(
          'invalid-status',
          'conversation-1',
          'assistant',
          'Not persisted',
          'unknown',
          now
        )
    ).toThrow()
  })
})
