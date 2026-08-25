import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseService } from '../../src/main/services/database.service'
import { SourceRepositoryService } from '../../src/main/services/sources/source-repository.service'

const canonicalTables = [
  'courses',
  'modules',
  'lessons',
  'library_appearances',
  'lesson_progress',
  'lesson_notes',
  'canonical_source_links'
]

function canonicalSnapshot(db: Database.Database): Record<string, unknown[]> {
  return Object.fromEntries(
    canonicalTables.map((table) => [
      table,
      db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()
    ])
  )
}

describe('SourceRepositoryService source synchronization', () => {
  let vaultPath: string
  let databaseService: DatabaseService
  let repository: SourceRepositoryService
  let db: Database.Database

  beforeEach(() => {
    vaultPath = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-source-sync-'))
    databaseService = new DatabaseService()
    databaseService.connect(vaultPath)
    repository = new SourceRepositoryService(databaseService)

    const connectedDatabase = databaseService.getDatabase()
    if (!connectedDatabase) throw new Error('Expected connected database')
    db = connectedDatabase

    db.prepare(`
      INSERT INTO courses (id, title, slug, source_type, root_path, total_duration, module_count, lesson_count, created_at, updated_at)
      VALUES ('course-1', 'Course', 'course', 'folder', 'C:/Course', 6, 1, 1, 1, 1)
    `).run()
    db.prepare(`
      INSERT INTO modules (id, course_id, title, order_index, folder_path, duration, lesson_count, created_at)
      VALUES ('module-1', 'course-1', 'Module', 0, 'C:/Course/Module', 6, 1, 1)
    `).run()
    db.prepare(`
      INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, availability, created_at)
      VALUES ('lesson-1', 'module-1', 'course-1', 'Lesson', 0, 'C:/Course/Module/original.mp4', 'original.mp4', 'mp4', 'video', 6, 6, 'local', 1)
    `).run()
    db.prepare(`
      INSERT INTO library_appearances (
        id, entity_type, entity_id, root_course_id, display_order, is_reference, is_hidden,
        tags, custom_metadata, created_at, updated_at
      ) VALUES ('appearance-1', 'course', 'course-1', 'course-1', 1, 0, 0, '[]', '{}', 1, 1)
    `).run()
    db.prepare(`
      INSERT INTO lesson_progress (lesson_id, course_id, current_time, duration, completed, updated_at)
      VALUES ('lesson-1', 'course-1', 3, 6, 0, 1)
    `).run()
    db.prepare(`
      INSERT INTO lesson_notes (id, lesson_id, course_id, timestamp_seconds, content, created_at, updated_at)
      VALUES ('note-1', 'lesson-1', 'course-1', 3, 'Keep this note', 1, 1)
    `).run()
    db.prepare(`
      INSERT INTO content_sources (id, provider, display_name, availability, created_at, updated_at)
      VALUES ('source-local', 'local-folder', 'Local', 'available', 1, 1)
    `).run()
    db.prepare(`
      INSERT INTO source_roots (
        id, source_id, provider_root_identity, display_name, local_path, availability,
        created_at, updated_at
      ) VALUES ('root-local', 'source-local', 'C:/Course', 'Local', 'C:/Course', 'available', 1, 1)
    `).run()
    db.prepare(`
      INSERT INTO source_items (
        id, source_id, source_root_id, provider, provider_item_identity, name, relative_path,
        locator_json, size, fingerprint, availability, created_at, updated_at
      ) VALUES
        ('item-linked', 'source-local', 'root-local', 'local-folder', 'Module/original.mp4',
          'original.mp4', 'Module/original.mp4',
          '{"provider":"local-folder","path":"C:/Course/Module/original.mp4"}', 6,
          'same-content', 'available', 1, 1),
        ('item-unmatched', 'source-local', 'root-local', 'local-folder', 'Module/unmatched.mp4',
          'unmatched.mp4', 'Module/unmatched.mp4',
          '{"provider":"local-folder","path":"C:/Course/Module/unmatched.mp4"}', 4,
          'unmatched-content', 'available', 1, 1)
    `).run()
    db.prepare(`
      INSERT INTO canonical_source_links (
        id, lesson_id, source_item_id, is_manual, is_preferred, created_at, updated_at
      ) VALUES ('link-1', 'lesson-1', 'item-linked', 1, 1, 1, 1)
    `).run()
  })

  afterEach(() => {
    databaseService.close()
    fs.rmSync(vaultPath, { recursive: true, force: true })
  })

  it('lists source roots', () => {
    expect(repository.listRoots()).toEqual([
      expect.objectContaining({ id: 'root-local', sourceId: 'source-local' })
    ])
  })

  it('atomically preserves a linked item across one unambiguous fingerprint rename', () => {
    const before = canonicalSnapshot(db)
    const run = repository.beginSync('root-local', 'manual', 100)
    const result = repository.completeSync(run.id, [{
      providerItemIdentity: 'Module/renamed.mp4',
      locator: { provider: 'local-folder', path: 'C:/Course/Module/renamed.mp4' },
      name: 'renamed.mp4',
      relativePath: 'Module/renamed.mp4',
      size: 6,
      availability: 'available',
      fingerprint: 'same-content'
    }], 200)

    expect(result).toMatchObject({ sourceId: 'source-local', sourceRootId: 'root-local', scannedItems: 1 })
    expect(db.prepare(`SELECT id, provider_item_identity, relative_path FROM source_items WHERE fingerprint = ?`).get('same-content'))
      .toEqual({ id: 'item-linked', provider_item_identity: 'Module/renamed.mp4', relative_path: 'Module/renamed.mp4' })
    expect(db.prepare(`SELECT source_item_id FROM canonical_source_links WHERE id = 'link-1'`).get())
      .toEqual({ source_item_id: 'item-linked' })
    expect(canonicalSnapshot(db)).toEqual(before)
  })

  it('marks absent items missing without deleting their links', () => {
    const before = canonicalSnapshot(db)
    const run = repository.beginSync('root-local', 'manual', 100)

    repository.completeSync(run.id, [], 200)

    expect(db.prepare(`SELECT availability FROM source_items WHERE id = 'item-linked'`).get())
      .toEqual({ availability: 'missing' })
    expect(db.prepare(`SELECT source_item_id FROM canonical_source_links WHERE id = 'link-1'`).get())
      .toEqual({ source_item_id: 'item-linked' })
    expect(canonicalSnapshot(db)).toEqual(before)
  })

  it('inserts new snapshot items without canonical links', () => {
    const before = canonicalSnapshot(db)
    const run = repository.beginSync('root-local', 'manual', 100)

    repository.completeSync(run.id, [{
      providerItemIdentity: 'Module/new.mp4',
      locator: { provider: 'local-folder', path: 'C:/Course/Module/new.mp4' },
      name: 'new.mp4',
      relativePath: 'Module/new.mp4',
      size: 8,
      availability: 'available'
    }], 200)

    const item = db.prepare(`SELECT id FROM source_items WHERE provider_item_identity = ?`).get('Module/new.mp4') as { id: string }
    expect(item.id).toBeTruthy()
    expect(db.prepare(`SELECT id FROM canonical_source_links WHERE source_item_id = ?`).all(item.id)).toEqual([])
    expect(canonicalSnapshot(db)).toEqual(before)
  })

  it('rejects duplicate provider identities before mutating the snapshot', () => {
    const run = repository.beginSync('root-local', 'manual', 100)
    const before = {
      sources: db.prepare(`SELECT * FROM content_sources ORDER BY id`).all(),
      roots: db.prepare(`SELECT * FROM source_roots ORDER BY id`).all(),
      items: db.prepare(`SELECT * FROM source_items ORDER BY id`).all(),
      runs: db.prepare(`SELECT * FROM source_sync_runs ORDER BY id`).all()
    }

    expect(() => repository.completeSync(run.id, [
      {
        providerItemIdentity: 'Module/duplicate.mp4',
        locator: { provider: 'local-folder', path: 'C:/Course/Module/duplicate.mp4' },
        name: 'duplicate.mp4',
        relativePath: 'Module/duplicate.mp4',
        size: 1,
        availability: 'available'
      },
      {
        providerItemIdentity: 'Module/duplicate.mp4',
        locator: { provider: 'local-folder', path: 'C:/Course/Module/duplicate-2.mp4' },
        name: 'duplicate-2.mp4',
        relativePath: 'Module/duplicate-2.mp4',
        size: 2,
        availability: 'available'
      }
    ], 200)).toThrow('Duplicate snapshot provider item identity')

    expect({
      sources: db.prepare(`SELECT * FROM content_sources ORDER BY id`).all(),
      roots: db.prepare(`SELECT * FROM source_roots ORDER BY id`).all(),
      items: db.prepare(`SELECT * FROM source_items ORDER BY id`).all(),
      runs: db.prepare(`SELECT * FROM source_sync_runs ORDER BY id`).all()
    }).toEqual(before)
  })

  it('creates a new item when duplicate fingerprints make a rename ambiguous', () => {
    db.prepare(`
      INSERT INTO source_items (
        id, source_id, source_root_id, provider, provider_item_identity, name, relative_path,
        locator_json, size, fingerprint, availability, created_at, updated_at
      ) VALUES ('item-ambiguous', 'source-local', 'root-local', 'local-folder', 'Module/other.mp4',
        'other.mp4', 'Module/other.mp4',
        '{"provider":"local-folder","path":"C:/Course/Module/other.mp4"}', 6,
        'same-content', 'available', 1, 1)
    `).run()
    const run = repository.beginSync('root-local', 'manual', 100)

    repository.completeSync(run.id, [{
      providerItemIdentity: 'Module/ambiguous-rename.mp4',
      locator: { provider: 'local-folder', path: 'C:/Course/Module/ambiguous-rename.mp4' },
      name: 'ambiguous-rename.mp4',
      relativePath: 'Module/ambiguous-rename.mp4',
      size: 6,
      availability: 'available',
      fingerprint: 'same-content'
    }], 200)

    expect(db.prepare(`SELECT id, availability FROM source_items WHERE id = 'item-linked'`).get())
      .toEqual({ id: 'item-linked', availability: 'missing' })
    expect(db.prepare(`SELECT id, availability FROM source_items WHERE id = 'item-ambiguous'`).get())
      .toEqual({ id: 'item-ambiguous', availability: 'missing' })
    expect(db.prepare(`SELECT id FROM source_items WHERE provider_item_identity = ?`).get('Module/ambiguous-rename.mp4'))
      .toEqual(expect.objectContaining({ id: expect.any(String) }))
    expect(db.prepare(`SELECT source_item_id FROM canonical_source_links WHERE id = 'link-1'`).get())
      .toEqual({ source_item_id: 'item-linked' })
  })

  it('marks only the run, root, and source when a sync fails', () => {
    const run = repository.beginSync('root-local', 'manual', 100)
    const before = {
      items: db.prepare(`SELECT * FROM source_items ORDER BY id`).all(),
      canonical: canonicalSnapshot(db)
    }

    repository.failSync(run.id, 200)

    expect(db.prepare(`SELECT status, error_message, finished_at FROM source_sync_runs WHERE id = ?`).get(run.id))
      .toEqual({ status: 'failed', error_message: 'Source synchronization failed', finished_at: 200 })
    expect(db.prepare(`SELECT availability FROM source_roots WHERE id = 'root-local'`).get())
      .toEqual({ availability: 'error' })
    expect(db.prepare(`SELECT availability FROM content_sources WHERE id = 'source-local'`).get())
      .toEqual({ availability: 'error' })
    expect(db.prepare(`SELECT * FROM source_items ORDER BY id`).all()).toEqual(before.items)
    expect(canonicalSnapshot(db)).toEqual(before.canonical)
  })
})
