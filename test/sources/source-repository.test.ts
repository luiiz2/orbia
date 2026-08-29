import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseService } from '../../src/main/services/database.service'
import { SourceRepositoryService } from '../../src/main/services/sources/source-repository.service'

describe('SourceRepositoryService', () => {
  let vaultPath: string
  let databaseService: DatabaseService
  let repository: SourceRepositoryService

  beforeEach(() => {
    vaultPath = fs.mkdtempSync(
      path.join(os.tmpdir(), 'orbia-source-repository-')
    )
    databaseService = new DatabaseService()
    databaseService.connect(vaultPath)
    repository = new SourceRepositoryService(databaseService)

    const db = databaseService.getDatabase()
    if (!db) throw new Error('Expected connected database')

    db.prepare(
      `
      INSERT INTO courses (id, title, slug, source_type, root_path, total_duration, module_count, lesson_count, created_at, updated_at)
      VALUES ('course-1', 'Course', 'course', 'folder', 'C:/Course', 0, 1, 2, 1, 1)
    `
    ).run()
    db.prepare(
      `
      INSERT INTO modules (id, course_id, title, order_index, folder_path, duration, lesson_count, created_at)
      VALUES ('module-1', 'course-1', 'Module', 0, 'C:/Course/Module', 0, 2, 1)
    `
    ).run()
    db.prepare(
      `
      INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, availability, created_at)
      VALUES
        ('lesson-1', 'module-1', 'course-1', 'One', 0, 'C:/Course/Module/one.mp4', 'one.mp4', 'mp4', 'video', 0, 100, 'local', 1),
        ('lesson-2', 'module-1', 'course-1', 'Two', 1, 'C:/Course/Module/two.mp4', 'two.mp4', 'mp4', 'video', 0, 100, 'local', 1)
    `
    ).run()
    db.prepare(
      `
      INSERT INTO content_sources (id, provider, display_name, preference_weight, availability, created_at, updated_at)
      VALUES
        ('source-local', 'local-folder', 'Local Library', 3, 'available', 1, 1),
        ('source-offline', 'managed-offline', 'Offline Cache', 0, 'offline', 1, 1)
    `
    ).run()
    db.prepare(
      `
      INSERT INTO source_roots (id, source_id, provider_root_identity, display_name, local_path, availability, last_synced_at, created_at, updated_at)
      VALUES
        ('root-local', 'source-local', 'C:/Course', 'Local Library', 'C:/Course', 'available', 100, 1, 1),
        ('root-offline', 'source-offline', 'cache-1', 'Offline Cache', NULL, 'offline', NULL, 1, 1)
    `
    ).run()
    db.prepare(
      `
      INSERT INTO source_items (
        id, source_id, source_root_id, provider, provider_item_identity, name, relative_path,
        locator_json, size, availability, created_at, updated_at
      ) VALUES
        ('item-available', 'source-local', 'root-local', 'local-folder', 'one.mp4', 'one.mp4', 'Module/one.mp4',
          '{"provider":"local-folder","path":"C:/Course/Module/one.mp4"}', 100, 'available', 1, 1),
        ('item-missing', 'source-local', 'root-local', 'local-folder', 'two.mp4', 'two.mp4', 'Module/two.mp4',
          '{"provider":"local-folder","path":"C:/Course/Module/two.mp4"}', 100, 'missing', 1, 1),
        ('item-offline', 'source-offline', 'root-offline', 'managed-offline', 'asset-1', 'cached.mp4', 'cached.mp4',
          '{"provider":"managed-offline","cacheId":"cache-1","assetId":"asset-1"}', 100, 'offline', 1, 1)
    `
    ).run()
    db.prepare(
      `
      INSERT INTO canonical_source_links (id, lesson_id, source_item_id, is_manual, is_preferred, created_at, updated_at)
      VALUES
        ('link-1', 'lesson-1', 'item-available', 0, 1, 1, 1),
        ('link-2', 'lesson-2', 'item-available', 0, 0, 1, 1)
    `
    ).run()
  })

  afterEach(() => {
    databaseService.close()
    fs.rmSync(vaultPath, { recursive: true, force: true })
  })

  it('maps source rows and aggregates distinct item counts without exposing locators', () => {
    expect(repository.listSummaries()).toEqual([
      expect.objectContaining({
        id: 'source-local',
        provider: 'local-folder',
        itemCount: 2,
        linkedItemCount: 1,
        availableItemCount: 1,
        missingItemCount: 1,
        lastSyncedAt: 100
      }),
      expect.objectContaining({
        id: 'source-offline',
        provider: 'managed-offline',
        itemCount: 1,
        linkedItemCount: 0,
        availableItemCount: 0,
        missingItemCount: 0
      })
    ])
    expect(Object.keys(repository.listSummaries()[0])).not.toContain(
      'localPath'
    )
    expect(Object.keys(repository.listSummaries()[0])).not.toContain('locator')
  })
})
