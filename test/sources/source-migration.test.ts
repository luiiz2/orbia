import { afterEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseService } from '../../src/main/services/database.service'

const sourceTables = [
  'content_sources',
  'source_roots',
  'source_items',
  'canonical_source_links',
  'source_match_candidates',
  'offline_assets',
  'source_sync_runs'
]

const sourceIndexes = [
  'idx_source_roots_source',
  'idx_source_items_identity',
  'idx_source_items_availability',
  'idx_canonical_source_links_lesson',
  'idx_canonical_source_links_resource',
  'idx_source_match_candidates_pending',
  'idx_offline_assets_state',
  'idx_source_sync_runs_history'
]

const legacyRowTables = [
  'courses',
  'modules',
  'lessons',
  'content_resources',
  'lesson_progress',
  'lesson_notes',
  'video_bookmarks',
  'flashcards',
  'library_appearances',
  'recommendation_feedback',
  'optimization_records'
]

function createVault(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-source-migration-'))
}

function getDb(service: DatabaseService): Database.Database {
  const db = service.getDatabase()
  if (!db) throw new Error('Expected connected database')
  return db
}

function snapshotRows(db: Database.Database): Record<string, unknown[]> {
  return Object.fromEntries(
    legacyRowTables.map((table) => [
      table,
      db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()
    ])
  )
}

function createLegacyContent(
  db: Database.Database,
  lessonPath: string,
  rootPath = String.raw`E:\Legacy Course`,
  resourcePath = String.raw`E:\Legacy Course\materials\guide.pdf`
): void {
  const createdAt = 1_725_000_000_000

  db.prepare(
    `
    INSERT INTO courses (
      id, title, slug, source_type, root_path, total_duration, module_count, lesson_count,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    'course-legacy',
    'Legacy Course',
    'legacy-course',
    'external-legacy',
    rootPath,
    120,
    1,
    1,
    createdAt,
    createdAt + 1
  )
  db.prepare(
    `
    INSERT INTO modules (id, course_id, title, order_index, folder_path, duration, lesson_count, created_at)
    VALUES ('module-legacy', 'course-legacy', 'Module', 1, ?, 120, 1, ?)
  `
  ).run(`${rootPath}/Module`, createdAt)
  db.prepare(
    `
    INSERT INTO lessons (
      id, module_id, course_id, title, order_index, file_path, file_name, file_extension,
      media_type, duration, file_size, availability, created_at
    ) VALUES ('lesson-legacy', 'module-legacy', 'course-legacy', 'Lesson', 1, ?, 'lesson.mp4', '.mp4', 'video', 120, 512, 'local', ?)
  `
  ).run(lessonPath, createdAt)
  db.prepare(
    `
    INSERT INTO content_resources (
      id, course_id, module_id, lesson_id, role, name, file_path, file_extension,
      file_size, resource_type, created_at
    ) VALUES ('resource-legacy', 'course-legacy', 'module-legacy', 'lesson-legacy', 'resource', 'Guide', ?, '.pdf', 128, 'document', ?)
  `
  ).run(resourcePath, createdAt)
  db.prepare(
    `
    INSERT INTO lesson_progress (lesson_id, course_id, current_time, duration, completed, updated_at)
    VALUES ('lesson-legacy', 'course-legacy', 36, 120, 0, ?)
  `
  ).run(createdAt + 2)
  db.prepare(
    `
    INSERT INTO lesson_notes (id, lesson_id, course_id, timestamp_seconds, content, created_at, updated_at)
    VALUES ('note-legacy', 'lesson-legacy', 'course-legacy', 36, 'Preserve this note', ?, ?)
  `
  ).run(createdAt + 3, createdAt + 4)
  db.prepare(
    `
    INSERT INTO video_bookmarks (id, course_id, lesson_id, timestamp, title, color, created_at, updated_at)
    VALUES ('bookmark-legacy', 'course-legacy', 'lesson-legacy', 42, 'Remember this', 'blue', ?, ?)
  `
  ).run(createdAt + 5, createdAt + 6)
  db.prepare(
    `
    INSERT INTO flashcards (
      id, course_id, module_id, lesson_id, timestamp, question, answer, state, due_at,
      interval_days, success_count, created_at, updated_at
    ) VALUES ('flashcard-legacy', 'course-legacy', 'module-legacy', 'lesson-legacy', 42, 'Question?', 'Answer', 'NEW', ?, 0, 0, ?, ?)
  `
  ).run(createdAt + 7, createdAt + 8, createdAt + 9)
  db.prepare(
    `
    INSERT INTO library_appearances (
      id, entity_type, entity_id, root_course_id, display_order, is_reference, is_hidden,
      tags, custom_metadata, created_at, updated_at
    ) VALUES ('appearance-legacy', 'course', 'course-legacy', 'course-legacy', 1, 0, 0, '[]', '{}', ?, ?)
  `
  ).run(createdAt + 10, createdAt + 11)
  db.prepare(
    `
    INSERT INTO recommendation_feedback (profile_id, course_id, feedback_type, updated_at)
    VALUES ('profile-legacy', 'course-legacy', 'like', ?)
  `
  ).run(createdAt + 12)
  db.prepare(
    `
    INSERT INTO optimization_records (
      id, lesson_id, original_path, original_size, original_codec, original_resolution,
      original_bitrate, original_fingerprint, optimized_path, optimized_size, optimized_codec,
      optimized_resolution, backup_path, profile_used, actual_savings_bytes, created_at
    ) VALUES ('optimization-legacy', 'lesson-legacy', ?, 512, 'h264', '1920x1080', 1000, 'fingerprint', ?, 256, 'hevc', '1920x1080', ?, 'balanced', 256, ?)
  `
  ).run(
    lessonPath,
    lessonPath,
    String.raw`E:\Legacy Course\lesson.mp4.bak`,
    createdAt + 13
  )
}

function removeSourceMigration(db: Database.Database): void {
  db.pragma('foreign_keys = OFF')
  for (const table of [...sourceTables].reverse()) {
    db.exec(`DROP TABLE IF EXISTS ${table}`)
  }
  db.prepare(
    `DELETE FROM _migrations WHERE id = '007_v08_connected_library'`
  ).run()
  db.pragma('foreign_keys = ON')
}

function initializeLegacyVault(
  vault: string,
  lessonPath = String.raw`E:\Legacy Course\Module\lesson.mp4`,
  rootPath = String.raw`E:\Legacy Course`,
  resourcePath = String.raw`E:\Legacy Course\materials\guide.pdf`
): Record<string, unknown[]> {
  const service = new DatabaseService()
  service.connect(vault)
  const db = getDb(service)
  createLegacyContent(db, lessonPath, rootPath, resourcePath)
  removeSourceMigration(db)
  const snapshot = snapshotRows(db)
  service.close()
  return snapshot
}

function insertMatchCandidates(db: Database.Database): void {
  db.prepare(
    `
    INSERT INTO source_match_candidates (
      id, lesson_id, resource_id, source_item_id, confidence, evidence_json,
      review_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 0.9, '{}', 'pending', 1, 1)
  `
  ).run(
    'candidate-lesson',
    'lesson-legacy',
    null,
    'legacy-lesson:lesson-legacy'
  )
  db.prepare(
    `
    INSERT INTO source_match_candidates (
      id, lesson_id, resource_id, source_item_id, confidence, evidence_json,
      review_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 0.9, '{}', 'pending', 1, 1)
  `
  ).run(
    'candidate-resource',
    null,
    'resource-legacy',
    'legacy-resource:resource-legacy'
  )
}

function insertTwoSourcesAndRoots(db: Database.Database): void {
  const insertSource = db.prepare(`
    INSERT INTO content_sources (id, provider, display_name, availability, created_at, updated_at)
    VALUES (?, 'local-folder', ?, 'available', 1, 1)
  `)
  const insertRoot = db.prepare(`
    INSERT INTO source_roots (
      id, source_id, provider_root_identity, display_name, local_path,
      availability, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'available', 1, 1)
  `)

  insertSource.run('source-a', 'Source A')
  insertSource.run('source-b', 'Source B')
  insertRoot.run('root-a', 'source-a', 'root-a', 'Root A', 'A:/')
  insertRoot.run('root-b', 'source-b', 'root-b', 'Root B', 'B:/')
}

describe(
  'DatabaseService v0.8 connected-library migration',
  { timeout: 30000 },
  () => {
    const vaults: string[] = []

    afterEach(() => {
      for (const vault of vaults.splice(0)) {
        fs.rmSync(vault, { recursive: true, force: true })
      }
    })

    it('creates the fresh source schema, constraints, indexes, and marker without a backup', () => {
      const vault = createVault()
      vaults.push(vault)
      const service = new DatabaseService()

      try {
        service.connect(vault)
        const db = getDb(service)
        const names = db
          .prepare(
            `SELECT name FROM sqlite_master WHERE type IN ('table', 'index')`
          )
          .all() as Array<{ name: string }>
        const schemaNames = names.map(({ name }) => name)

        expect(schemaNames).toEqual(
          expect.arrayContaining([...sourceTables, ...sourceIndexes])
        )
        expect(
          db
            .prepare(
              `SELECT id FROM _migrations WHERE id = '007_v08_connected_library'`
            )
            .get()
        ).toEqual({ id: '007_v08_connected_library' })
        expect(
          fs.existsSync(path.join(vault, '.orbia', 'library.db.v0.8.bak'))
        ).toBe(false)

        expect(() =>
          db
            .prepare(
              `
        INSERT INTO content_sources (id, provider, display_name, availability, created_at, updated_at)
        VALUES ('invalid-provider', 'dropbox', 'Invalid', 'available', 1, 1)
      `
            )
            .run()
        ).toThrow()
        expect(() =>
          db
            .prepare(
              `
        INSERT INTO content_sources (id, provider, display_name, availability, created_at, updated_at)
        VALUES ('invalid-availability', 'local-folder', 'Invalid', 'unknown', 1, 1)
      `
            )
            .run()
        ).toThrow()
      } finally {
        service.close()
      }
    })

    it('round-trips every foundational source field and enforces its value constraints', () => {
      const vault = createVault()
      vaults.push(vault)
      const service = new DatabaseService()

      try {
        service.connect(vault)
        const db = getDb(service)
        createLegacyContent(
          db,
          'C:/Library/Lesson.mp4',
          'C:/Library',
          'C:/Library/Guide.pdf'
        )
        db.prepare(
          `
        INSERT INTO content_sources (
          id, provider, display_name, account_identity, preference_weight,
          availability, created_at, updated_at
        ) VALUES ('source-fields', 'managed-offline', 'Managed', 'account-1', 2.5, 'offline', 1, 2)
      `
        ).run()
        db.prepare(
          `
        INSERT INTO source_roots (
          id, source_id, provider_root_identity, display_name, local_path,
          stable_device_id, mount_hint, relative_base, sync_cursor, sync_corpus_json,
          availability, last_synced_at, last_verified_at, provider_config_json,
          created_at, updated_at
        ) VALUES (
          'root-fields', 'source-fields', 'provider-root-1', 'Managed root', NULL,
          'device-1', 'D:/', 'Courses', 'cursor-1', '{"page":2}',
          'offline', 3, 4, '{"cache":"primary"}', 1, 2
        )
      `
        ).run()
        db.prepare(
          `
        INSERT INTO source_items (
          id, source_id, source_root_id, provider, provider_item_identity,
          name, relative_path, locator_json, mime_type, size, duration, width, height,
          technical_metadata_json, availability, created_at, updated_at
        ) VALUES (
          'item-fields', 'source-fields', 'root-fields', 'managed-offline', 'provider-item-1',
          'Lesson.mp4', 'Module/Lesson.mp4', '{"provider":"managed-offline"}',
          'video/mp4', 2048, 120.5, 1920, 1080, '{"codec":"h264"}', 'offline', 1, 2
        )
      `
        ).run()
        db.prepare(
          `
        INSERT INTO canonical_source_links (
          id, lesson_id, source_item_id, is_manual, is_preferred, created_at, updated_at
        ) VALUES ('link-fields', 'lesson-legacy', 'item-fields', 1, 1, 5, 6)
      `
        ).run()
        db.prepare(
          `
        INSERT INTO source_match_candidates (
          id, lesson_id, source_item_id, confidence, review_status, decided_at, created_at, updated_at
        ) VALUES ('candidate-fields', 'lesson-legacy', 'item-fields', 0.75, 'accepted', 7, 5, 6)
      `
        ).run()
        db.prepare(
          `
        INSERT INTO offline_assets (
          id, source_item_id, original_source_item_id, cache_id, asset_id,
          vault_relative_path, availability, state, is_pinned, policy_reason,
          codec, width, height, size, optimizer_profile_json,
          last_validated_at, last_accessed_at, created_at, updated_at
        ) VALUES (
          'asset-fields', 'item-fields', 'item-fields', 'cache-1', 'asset-1',
          'Offline/asset-1.mp4', 'offline', 'valid', 1, 'user-pinned',
          'h265', 1280, 720, 1024, '{"profile":"balanced"}',
          8, 9, 5, 6
        )
      `
        ).run()

        expect(
          db
            .prepare(
              `
        SELECT preference_weight FROM content_sources WHERE id = 'source-fields'
      `
            )
            .get()
        ).toEqual({ preference_weight: 2.5 })
        expect(
          db
            .prepare(
              `
        SELECT stable_device_id, mount_hint, relative_base, sync_cursor, sync_corpus_json,
               last_synced_at, last_verified_at, provider_config_json
        FROM source_roots WHERE id = 'root-fields'
      `
            )
            .get()
        ).toEqual({
          stable_device_id: 'device-1',
          mount_hint: 'D:/',
          relative_base: 'Courses',
          sync_cursor: 'cursor-1',
          sync_corpus_json: '{"page":2}',
          last_synced_at: 3,
          last_verified_at: 4,
          provider_config_json: '{"cache":"primary"}'
        })
        expect(
          db
            .prepare(
              `
        SELECT mime_type, size, duration, width, height, technical_metadata_json
        FROM source_items WHERE id = 'item-fields'
      `
            )
            .get()
        ).toEqual({
          mime_type: 'video/mp4',
          size: 2048,
          duration: 120.5,
          width: 1920,
          height: 1080,
          technical_metadata_json: '{"codec":"h264"}'
        })
        expect(
          db
            .prepare(
              `
        SELECT is_manual, is_preferred, created_at, updated_at
        FROM canonical_source_links WHERE id = 'link-fields'
      `
            )
            .get()
        ).toEqual({
          is_manual: 1,
          is_preferred: 1,
          created_at: 5,
          updated_at: 6
        })
        expect(
          db
            .prepare(
              `
        SELECT decided_at FROM source_match_candidates WHERE id = 'candidate-fields'
      `
            )
            .get()
        ).toEqual({ decided_at: 7 })
        expect(
          db
            .prepare(
              `
        SELECT original_source_item_id, cache_id, asset_id, vault_relative_path,
               availability, state, is_pinned, policy_reason, codec, width, height, size,
               optimizer_profile_json, last_validated_at, last_accessed_at
        FROM offline_assets WHERE id = 'asset-fields'
      `
            )
            .get()
        ).toEqual({
          original_source_item_id: 'item-fields',
          cache_id: 'cache-1',
          asset_id: 'asset-1',
          vault_relative_path: 'Offline/asset-1.mp4',
          availability: 'offline',
          state: 'valid',
          is_pinned: 1,
          policy_reason: 'user-pinned',
          codec: 'h265',
          width: 1280,
          height: 720,
          size: 1024,
          optimizer_profile_json: '{"profile":"balanced"}',
          last_validated_at: 8,
          last_accessed_at: 9
        })

        expect(() =>
          db
            .prepare(
              `UPDATE canonical_source_links SET is_manual = 2 WHERE id = 'link-fields'`
            )
            .run()
        ).toThrow()
        expect(() =>
          db
            .prepare(
              `UPDATE source_items SET width = 0 WHERE id = 'item-fields'`
            )
            .run()
        ).toThrow()
        expect(() =>
          db
            .prepare(
              `UPDATE offline_assets SET availability = 'unknown' WHERE id = 'asset-fields'`
            )
            .run()
        ).toThrow()
      } finally {
        service.close()
      }
    })

    it('backs up and losslessly migrates a simulated v0.7 library with deterministic source links', () => {
      const vault = createVault()
      vaults.push(vault)
      const legacyService = new DatabaseService()
      const courseRoot = path.join(vault, 'Legacy Course')
      const lessonPath = path.join(courseRoot, 'Module', 'lesson.mp4')
      const resourcePath = path.join(courseRoot, 'materials', 'guide.pdf')
      fs.mkdirSync(path.dirname(lessonPath), { recursive: true })
      fs.mkdirSync(path.dirname(resourcePath), { recursive: true })
      fs.writeFileSync(lessonPath, 'lesson')
      fs.writeFileSync(resourcePath, 'guide')

      legacyService.connect(vault)
      const legacyDb = getDb(legacyService)
      createLegacyContent(legacyDb, lessonPath, courseRoot, resourcePath)
      removeSourceMigration(legacyDb)
      const before = snapshotRows(legacyDb)
      expect(
        legacyDb.prepare(`SELECT count(*) AS count FROM file_operations`).get()
      ).toEqual({ count: 0 })
      legacyService.close()

      const migratedService = new DatabaseService()
      try {
        migratedService.connect(vault)
        const db = getDb(migratedService)
        const backupPath = path.join(vault, '.orbia', 'library.db.v0.8.bak')

        expect(fs.existsSync(backupPath)).toBe(true)
        expect(snapshotRows(db)).toEqual(before)
        expect(
          db.prepare(`SELECT count(*) AS count FROM file_operations`).get()
        ).toEqual({ count: 0 })
        expect(db.prepare(`PRAGMA foreign_key_check`).all()).toEqual([])
        expect(
          db.prepare(`SELECT id, availability FROM content_sources`).all()
        ).toEqual([
          { id: 'legacy-source:course-legacy', availability: 'available' }
        ])
        expect(
          db
            .prepare(
              `SELECT id, source_id, provider_root_identity, local_path, availability FROM source_roots`
            )
            .all()
        ).toEqual([
          {
            id: 'legacy-root:course-legacy',
            source_id: 'legacy-source:course-legacy',
            provider_root_identity: 'legacy-root:course-legacy',
            local_path: courseRoot,
            availability: 'available'
          }
        ])
        expect(
          db
            .prepare(
              `SELECT id, locator_json, availability FROM source_items ORDER BY id`
            )
            .all()
        ).toEqual([
          {
            id: 'legacy-lesson:lesson-legacy',
            locator_json: JSON.stringify({
              provider: 'local-folder',
              path: lessonPath
            }),
            availability: 'available'
          },
          {
            id: 'legacy-resource:resource-legacy',
            locator_json: JSON.stringify({
              provider: 'local-folder',
              path: resourcePath
            }),
            availability: 'available'
          }
        ])
        expect(
          db
            .prepare(
              `
        SELECT id, lesson_id, resource_id, is_preferred, created_at, updated_at
        FROM canonical_source_links
        ORDER BY id
      `
            )
            .all()
        ).toEqual([
          {
            id: 'legacy-link-lesson:lesson-legacy',
            lesson_id: 'lesson-legacy',
            resource_id: null,
            is_preferred: 1,
            created_at: 1_725_000_000_000,
            updated_at: 1_725_000_000_000
          },
          {
            id: 'legacy-link-resource:resource-legacy',
            lesson_id: null,
            resource_id: 'resource-legacy',
            is_preferred: 1,
            created_at: 1_725_000_000_000,
            updated_at: 1_725_000_000_000
          }
        ])
        expect(
          db
            .prepare(
              `SELECT legacy_source_type, legacy_config_json FROM content_sources`
            )
            .get()
        ).toEqual({
          legacy_source_type: 'external-legacy',
          legacy_config_json: JSON.stringify({ sourceType: 'external-legacy' })
        })
        expect(
          db
            .prepare(
              `SELECT source_type, root_path FROM courses WHERE id = 'course-legacy'`
            )
            .get()
        ).toEqual({
          source_type: 'external-legacy',
          root_path: courseRoot
        })

        const backupDb = new Database(backupPath, {
          readonly: true,
          fileMustExist: true
        })
        try {
          expect(backupDb.pragma('integrity_check', { simple: true })).toBe(
            'ok'
          )
          expect(snapshotRows(backupDb)).toEqual(before)
        } finally {
          backupDb.close()
        }

        migratedService.close()
        migratedService.connect(vault)
        const reopenedDb = getDb(migratedService)
        expect(
          reopenedDb.prepare(`SELECT count(*) AS count FROM source_items`).get()
        ).toEqual({ count: 2 })
        expect(
          reopenedDb
            .prepare(`SELECT count(*) AS count FROM canonical_source_links`)
            .get()
        ).toEqual({ count: 2 })

        reopenedDb
          .prepare(
            `DELETE FROM content_sources WHERE id = 'legacy-source:course-legacy'`
          )
          .run()
        expect(
          reopenedDb
            .prepare(`SELECT id FROM lessons WHERE id = 'lesson-legacy'`)
            .get()
        ).toEqual({ id: 'lesson-legacy' })
        expect(
          reopenedDb
            .prepare(
              `SELECT id FROM content_resources WHERE id = 'resource-legacy'`
            )
            .get()
        ).toEqual({ id: 'resource-legacy' })
      } finally {
        migratedService.close()
      }
    })

    it('marks an empty legacy locator as relink-required without deleting canonical content', () => {
      const vault = createVault()
      vaults.push(vault)
      const legacyService = new DatabaseService()

      legacyService.connect(vault)
      const legacyDb = getDb(legacyService)
      createLegacyContent(legacyDb, '')
      removeSourceMigration(legacyDb)
      legacyService.close()

      const migratedService = new DatabaseService()
      try {
        migratedService.connect(vault)
        const db = getDb(migratedService)
        expect(
          db
            .prepare(
              `SELECT locator_json, availability FROM source_items WHERE id = 'legacy-lesson:lesson-legacy'`
            )
            .get()
        ).toEqual({
          locator_json: JSON.stringify({ provider: 'local-folder', path: '' }),
          availability: 'relink-required'
        })
        expect(
          db
            .prepare(
              `SELECT id, file_path FROM lessons WHERE id = 'lesson-legacy'`
            )
            .get()
        ).toEqual({
          id: 'lesson-legacy',
          file_path: ''
        })
        expect(db.prepare(`PRAGMA foreign_key_check`).all()).toEqual([])
      } finally {
        migratedService.close()
      }
    })

    it('marks non-empty unreachable legacy paths as missing without changing canonical paths', () => {
      const vault = createVault()
      vaults.push(vault)
      const missingRoot = path.join(vault, 'missing-root')
      const missingLesson = path.join(missingRoot, 'Module', 'lesson.mp4')
      const missingResource = path.join(missingRoot, 'materials', 'guide.pdf')
      initializeLegacyVault(vault, missingLesson, missingRoot, missingResource)
      const service = new DatabaseService()

      try {
        service.connect(vault)
        const db = getDb(service)
        expect(
          db.prepare(`SELECT availability FROM content_sources`).get()
        ).toEqual({ availability: 'missing' })
        expect(
          db.prepare(`SELECT local_path, availability FROM source_roots`).get()
        ).toEqual({
          local_path: missingRoot,
          availability: 'missing'
        })
        expect(
          db
            .prepare(`SELECT id, availability FROM source_items ORDER BY id`)
            .all()
        ).toEqual([
          { id: 'legacy-lesson:lesson-legacy', availability: 'missing' },
          { id: 'legacy-resource:resource-legacy', availability: 'missing' }
        ])
        expect(
          db
            .prepare(`SELECT file_path FROM lessons WHERE id = 'lesson-legacy'`)
            .get()
        ).toEqual({
          file_path: missingLesson
        })
        expect(
          db
            .prepare(
              `SELECT file_path FROM content_resources WHERE id = 'resource-legacy'`
            )
            .get()
        ).toEqual({
          file_path: missingResource
        })
      } finally {
        service.close()
      }
    })

    it('derives contained Windows and POSIX relative paths with normalized separators', () => {
      const cases = [
        {
          rootPath: String.raw`C:\Courses\Course`,
          lessonPath: String.raw`C:\Courses\Course\Module\Lesson.mp4`,
          resourcePath: String.raw`C:\Courses\Course\Materials\Guide.pdf`,
          expectedLesson: 'Module/Lesson.mp4',
          expectedResource: 'Materials/Guide.pdf'
        },
        {
          rootPath: '/mnt/courses/course',
          lessonPath: '/mnt/courses/course/module/lesson.mp4',
          resourcePath: '/mnt/courses/course/materials/guide.pdf',
          expectedLesson: 'module/lesson.mp4',
          expectedResource: 'materials/guide.pdf'
        }
      ]

      for (const entry of cases) {
        const vault = createVault()
        vaults.push(vault)
        initializeLegacyVault(
          vault,
          entry.lessonPath,
          entry.rootPath,
          entry.resourcePath
        )
        const service = new DatabaseService()
        try {
          service.connect(vault)
          expect(
            getDb(service)
              .prepare(`SELECT id, relative_path FROM source_items ORDER BY id`)
              .all()
          ).toEqual([
            {
              id: 'legacy-lesson:lesson-legacy',
              relative_path: entry.expectedLesson
            },
            {
              id: 'legacy-resource:resource-legacy',
              relative_path: entry.expectedResource
            }
          ])
        } finally {
          service.close()
        }
      }
    }, 15_000)

    it('falls back to untrusted names when legacy paths are outside the course root', () => {
      const vault = createVault()
      vaults.push(vault)
      const rootPath = String.raw`C:\Courses\Course`
      initializeLegacyVault(
        vault,
        String.raw`C:\Courses\Other\lesson.mp4`,
        rootPath,
        '/srv/other/guide.pdf'
      )
      const service = new DatabaseService()

      try {
        service.connect(vault)
        const rows = getDb(service)
          .prepare(`SELECT id, relative_path FROM source_items ORDER BY id`)
          .all()
        expect(rows).toEqual([
          { id: 'legacy-lesson:lesson-legacy', relative_path: 'lesson.mp4' },
          { id: 'legacy-resource:resource-legacy', relative_path: 'Guide' }
        ])
        expect(JSON.stringify(rows)).not.toContain('..')
      } finally {
        service.close()
      }
    })

    it('allows deleteLesson to cascade source links and candidates without deleting source items', () => {
      const vault = createVault()
      vaults.push(vault)
      initializeLegacyVault(vault)
      const service = new DatabaseService()

      try {
        service.connect(vault)
        const db = getDb(service)
        insertMatchCandidates(db)

        expect(service.deleteLesson('lesson-legacy')).toEqual({ success: true })
        expect(
          db.prepare(`SELECT id FROM lessons WHERE id = 'lesson-legacy'`).get()
        ).toBeUndefined()
        expect(
          db
            .prepare(`SELECT count(*) AS count FROM canonical_source_links`)
            .get()
        ).toEqual({ count: 0 })
        expect(
          db
            .prepare(`SELECT count(*) AS count FROM source_match_candidates`)
            .get()
        ).toEqual({ count: 0 })
        expect(
          db.prepare(`SELECT count(*) AS count FROM source_items`).get()
        ).toEqual({ count: 2 })
      } finally {
        service.close()
      }
    })

    it('allows deleteCourse to cascade source links and candidates without deleting source items', () => {
      const vault = createVault()
      vaults.push(vault)
      initializeLegacyVault(vault)
      const service = new DatabaseService()

      try {
        service.connect(vault)
        const db = getDb(service)
        insertMatchCandidates(db)

        service.deleteCourse('course-legacy')
        expect(
          db.prepare(`SELECT id FROM courses WHERE id = 'course-legacy'`).get()
        ).toBeUndefined()
        expect(
          db
            .prepare(`SELECT count(*) AS count FROM canonical_source_links`)
            .get()
        ).toEqual({ count: 0 })
        expect(
          db
            .prepare(`SELECT count(*) AS count FROM source_match_candidates`)
            .get()
        ).toEqual({ count: 0 })
        expect(
          db.prepare(`SELECT count(*) AS count FROM source_items`).get()
        ).toEqual({ count: 2 })
      } finally {
        service.close()
      }
    })

    it('rejects source items whose root belongs to another source', () => {
      const vault = createVault()
      vaults.push(vault)
      const service = new DatabaseService()

      try {
        service.connect(vault)
        const db = getDb(service)
        insertTwoSourcesAndRoots(db)

        expect(() =>
          db
            .prepare(
              `
        INSERT INTO source_items (
          id, source_id, source_root_id, provider, provider_item_identity, name,
          relative_path, locator_json, availability, created_at, updated_at
        ) VALUES ('item-mismatch', 'source-a', 'root-b', 'local-folder', 'item-mismatch',
          'Mismatch', 'Mismatch', '{}', 'available', 1, 1)
      `
            )
            .run()
        ).toThrow()
      } finally {
        service.close()
      }
    })

    it('rejects sync runs whose root belongs to another source', () => {
      const vault = createVault()
      vaults.push(vault)
      const service = new DatabaseService()

      try {
        service.connect(vault)
        const db = getDb(service)
        insertTwoSourcesAndRoots(db)

        expect(() =>
          db
            .prepare(
              `
        INSERT INTO source_sync_runs (
          id, source_id, source_root_id, trigger, status, started_at
        ) VALUES ('sync-mismatch', 'source-a', 'root-b', 'manual', 'running', 1)
      `
            )
            .run()
        ).toThrow()
      } finally {
        service.close()
      }
    })

    it('backs up a vault containing only Studio user data', () => {
      const vault = createVault()
      vaults.push(vault)
      const initialService = new DatabaseService()
      initialService.connect(vault)
      const initialDb = getDb(initialService)
      initialDb
        .prepare(
          `
      INSERT INTO collections (id, name, description, color, icon, created_at)
      VALUES ('collection-only', 'Only user data', 'Preserve me', 'blue', 'book', 1)
    `
        )
        .run()
      removeSourceMigration(initialDb)
      initialService.close()

      const service = new DatabaseService()
      try {
        service.connect(vault)
        const backupPath = path.join(vault, '.orbia', 'library.db.v0.8.bak')
        expect(fs.existsSync(backupPath)).toBe(true)
        const backupDb = new Database(backupPath, {
          readonly: true,
          fileMustExist: true
        })
        try {
          expect(
            backupDb.prepare(`SELECT id, name FROM collections`).get()
          ).toEqual({
            id: 'collection-only',
            name: 'Only user data'
          })
        } finally {
          backupDb.close()
        }
      } finally {
        service.close()
      }
    })

    it('aborts before backup and migration when the WAL checkpoint is busy', () => {
      const vault = createVault()
      vaults.push(vault)
      initializeLegacyVault(vault)
      const dbPath = path.join(vault, '.orbia', 'library.db')
      const reader = new Database(dbPath)
      const writer = new Database(dbPath)
      const service = new DatabaseService()

      try {
        reader.pragma('journal_mode = WAL')
        reader.exec('BEGIN')
        reader.prepare(`SELECT id FROM courses`).get()
        writer.pragma('journal_mode = WAL')
        writer
          .prepare(
            `
        INSERT INTO collections (id, name, created_at)
        VALUES ('checkpoint-blocker', 'Checkpoint blocker', 1)
      `
          )
          .run()

        expect(() => service.connect(vault)).toThrow(/checkpoint/i)
        expect(fs.existsSync(`${dbPath}.v0.8.bak`)).toBe(false)
        expect(
          reader
            .prepare(
              `SELECT id FROM _migrations WHERE id = '007_v08_connected_library'`
            )
            .get()
        ).toBeUndefined()
      } finally {
        service.close()
        writer.close()
        reader.exec('ROLLBACK')
        reader.close()
      }
    }, 10_000)

    it('rejects an existing backup that is not a valid SQLite database', () => {
      const vault = createVault()
      vaults.push(vault)
      initializeLegacyVault(vault)
      const dbPath = path.join(vault, '.orbia', 'library.db')
      fs.writeFileSync(`${dbPath}.v0.8.bak`, 'not a sqlite database')
      const service = new DatabaseService()

      try {
        expect(() => service.connect(vault)).toThrow(/backup/i)
        expect(service.isConnected()).toBe(false)
        expect(service.getCurrentVaultPath()).toBeNull()
        const db = new Database(dbPath, { readonly: true })
        try {
          expect(
            db
              .prepare(
                `SELECT id FROM _migrations WHERE id = '007_v08_connected_library'`
              )
              .get()
          ).toBeUndefined()
        } finally {
          db.close()
        }
      } finally {
        service.close()
      }
    })

    it('rejects a valid existing backup whose middle row differs', () => {
      const vault = createVault()
      vaults.push(vault)
      initializeLegacyVault(vault)
      const dbPath = path.join(vault, '.orbia', 'library.db')
      const backupPath = `${dbPath}.v0.8.bak`
      const liveDb = new Database(dbPath)
      const insertCollection = liveDb.prepare(`
      INSERT INTO collections (id, name, created_at) VALUES (?, ?, ?)
    `)
      insertCollection.run('collection-first', 'First', 1)
      insertCollection.run('collection-middle', 'Middle', 2)
      insertCollection.run('collection-last', 'Last', 3)
      liveDb.pragma('wal_checkpoint(TRUNCATE)')
      liveDb.close()
      fs.copyFileSync(dbPath, backupPath)
      const staleBackup = new Database(backupPath)
      staleBackup
        .prepare(
          `UPDATE collections SET name = 'Stale middle' WHERE id = 'collection-middle'`
        )
        .run()
      staleBackup.close()
      const staleBackupBytes = fs.readFileSync(backupPath)
      const service = new DatabaseService()

      try {
        expect(() => service.connect(vault)).toThrow(/row validation/i)
        expect(service.isConnected()).toBe(false)
        expect(fs.readFileSync(backupPath).equals(staleBackupBytes)).toBe(true)
        const db = new Database(dbPath, { readonly: true })
        try {
          expect(
            db
              .prepare(
                `SELECT id FROM _migrations WHERE id = '007_v08_connected_library'`
              )
              .get()
          ).toBeUndefined()
        } finally {
          db.close()
        }
      } finally {
        service.close()
      }
    })

    it('creates a compact openable integrity-clean SQLite snapshot', () => {
      const vault = createVault()
      vaults.push(vault)
      initializeLegacyVault(vault)
      const dbPath = path.join(vault, '.orbia', 'library.db')
      const liveDb = new Database(dbPath)
      const insertCollection = liveDb.prepare(`
      INSERT INTO collections (id, name, description, created_at) VALUES (?, ?, ?, ?)
    `)
      liveDb.transaction(() => {
        for (let index = 0; index < 32; index++) {
          insertCollection.run(
            `large-${index.toString().padStart(2, '0')}`,
            `Large ${index}`,
            `${index}:${'x'.repeat(32_768)}`,
            index
          )
        }
        liveDb.prepare(`DELETE FROM collections WHERE id <> 'large-00'`).run()
      })()
      liveDb.pragma('wal_checkpoint(TRUNCATE)')
      liveDb.close()
      const mainSize = fs.statSync(dbPath).size
      const service = new DatabaseService()

      try {
        service.connect(vault)
        const backupPath = `${dbPath}.v0.8.bak`
        expect(fs.statSync(backupPath).size).toBeLessThan(mainSize)
        const backupDb = new Database(backupPath, {
          readonly: true,
          fileMustExist: true
        })
        try {
          expect(backupDb.pragma('integrity_check', { simple: true })).toBe(
            'ok'
          )
          expect(backupDb.prepare(`PRAGMA foreign_key_check`).all()).toEqual([])
          expect(
            backupDb.prepare(`SELECT count(*) AS count FROM collections`).get()
          ).toEqual({ count: 1 })
        } finally {
          backupDb.close()
        }
      } finally {
        service.close()
      }
    })

    it('removes an unpublished snapshot after failure and retries on the same instance', () => {
      const vault = createVault()
      vaults.push(vault)
      initializeLegacyVault(vault)
      const dbPath = path.join(vault, '.orbia', 'library.db')
      const backupPath = `${dbPath}.v0.8.bak`
      const originalRenameSync = fs.renameSync
      let temporaryBackupPath: string | null = null
      let temporaryBackupExistedAtPublish = false
      const renameSpy = vi
        .spyOn(fs, 'renameSync')
        .mockImplementation((oldPath, newPath) => {
          if (path.resolve(String(newPath)) === path.resolve(backupPath)) {
            temporaryBackupPath = String(oldPath)
            temporaryBackupExistedAtPublish = fs.existsSync(oldPath)
            throw new Error('injected backup publication failure')
          }
          return originalRenameSync(oldPath, newPath)
        })
      const service = new DatabaseService()

      try {
        try {
          expect(() => service.connect(vault)).toThrow(
            /injected backup publication failure/i
          )
        } finally {
          renameSpy.mockRestore()
        }

        expect(service.isConnected()).toBe(false)
        expect(service.getCurrentVaultPath()).toBeNull()
        expect(temporaryBackupExistedAtPublish).toBe(true)
        expect(temporaryBackupPath).not.toBeNull()
        expect(path.dirname(temporaryBackupPath!)).toBe(
          path.dirname(backupPath)
        )
        expect(path.basename(temporaryBackupPath!)).toMatch(
          /^library\.db\.v0\.8\.bak\..+\.tmp$/
        )
        expect(fs.existsSync(temporaryBackupPath!)).toBe(false)
        expect(fs.existsSync(backupPath)).toBe(false)

        service.connect(vault)
        expect(
          getDb(service)
            .prepare(
              `SELECT id FROM _migrations WHERE id = '007_v08_connected_library'`
            )
            .get()
        ).toEqual({
          id: '007_v08_connected_library'
        })
        const backupDb = new Database(backupPath, {
          readonly: true,
          fileMustExist: true
        })
        try {
          expect(backupDb.pragma('integrity_check', { simple: true })).toBe(
            'ok'
          )
          expect(backupDb.prepare(`PRAGMA foreign_key_check`).all()).toEqual([])
        } finally {
          backupDb.close()
        }
      } finally {
        renameSpy.mockRestore()
        service.close()
      }
    })

    it('cleans a failed connection and reuses its validated backup on same-instance retry', () => {
      const vault = createVault()
      vaults.push(vault)
      const before = initializeLegacyVault(vault)
      const dbPath = path.join(vault, '.orbia', 'library.db')
      const collisionDb = new Database(dbPath)
      collisionDb.exec(`CREATE TABLE content_sources (id TEXT PRIMARY KEY)`)
      collisionDb.close()

      const service = new DatabaseService()
      try {
        expect(() => service.connect(vault)).toThrow()
        expect(service.isConnected()).toBe(false)
        expect(service.getCurrentVaultPath()).toBeNull()

        const backupPath = `${dbPath}.v0.8.bak`
        expect(fs.existsSync(backupPath)).toBe(true)
        const backupBeforeRetry = fs.readFileSync(backupPath)
        const repairDb = new Database(dbPath)
        expect(
          repairDb
            .prepare(
              `SELECT id FROM _migrations WHERE id = '007_v08_connected_library'`
            )
            .get()
        ).toBeUndefined()
        repairDb.exec(`DROP TABLE content_sources`)
        repairDb.close()

        service.connect(vault)
        const db = getDb(service)
        expect(
          db
            .prepare(
              `SELECT id FROM _migrations WHERE id = '007_v08_connected_library'`
            )
            .get()
        ).toEqual({
          id: '007_v08_connected_library'
        })
        expect(snapshotRows(db)).toEqual(before)
        expect(fs.readFileSync(backupPath).equals(backupBeforeRetry)).toBe(true)
      } finally {
        service.close()
      }
    })
  }
)
