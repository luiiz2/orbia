import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseService } from '../../src/main/services/database.service'
import { SourceMatcher } from '../../src/main/services/sources/source-matcher'
import { SourceMatchingService } from '../../src/main/services/sources/source-matching.service'
import { SourceRepositoryService } from '../../src/main/services/sources/source-repository.service'

describe('SourceMatchingService', () => {
  let vaultPath: string
  let databaseService: DatabaseService
  let repository: SourceRepositoryService
  let matchingService: SourceMatchingService

  beforeEach(() => {
    vaultPath = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-source-matching-'))
    databaseService = new DatabaseService()
    databaseService.connect(vaultPath)
    repository = new SourceRepositoryService(databaseService)
    matchingService = new SourceMatchingService(
      repository,
      new SourceMatcher(),
      () => 100
    )

    const db = databaseService.getDatabase()
    if (!db) throw new Error('Expected connected database')

    db.exec(`
      INSERT INTO courses (id, title, slug, source_type, root_path, created_at, updated_at)
      VALUES
        ('course-1', 'Course 1', 'course-1', 'folder', 'C:/Course 1', 1, 1),
        ('course-2', 'Course 2', 'course-2', 'folder', 'C:/Course 2', 1, 1);
      INSERT INTO modules (id, course_id, title, order_index, created_at)
      VALUES
        ('module-1', 'course-1', 'Module 1', 0, 1),
        ('module-2', 'course-2', 'Module 2', 0, 1);
      INSERT INTO lessons (
        id, module_id, course_id, title, order_index, file_path, file_name,
        file_extension, media_type, duration, file_size, availability, created_at
      ) VALUES
        ('lesson-1', 'module-1', 'course-1', 'Aula 01', 0,
          'C:/Course 1/Module 1/Aula 01.mp4', 'Aula 01.mp4', 'mp4', 'video',
          60, 100, 'local', 1),
        ('lesson-2', 'module-2', 'course-2', 'Outra Aula', 0,
          'C:/Course 2/Module 2/Outra Aula.mp4', 'Outra Aula.mp4', 'mp4', 'video',
          90, 200, 'local', 1);
      UPDATE lessons SET fingerprint_signature = 'strong-fingerprint' WHERE id = 'lesson-1';
      UPDATE lessons SET fingerprint_signature = 'cross-course-fingerprint' WHERE id = 'lesson-2';
      INSERT INTO content_sources (id, provider, display_name, availability, created_at, updated_at)
      VALUES ('source-local', 'local-folder', 'Local', 'available', 1, 1);
      INSERT INTO source_roots (
        id, source_id, provider_root_identity, display_name, local_path,
        availability, created_at, updated_at
      ) VALUES ('root-local', 'source-local', 'C:/Course 1', 'Local', 'C:/Course 1', 'available', 1, 1);
      INSERT INTO source_items (
        id, source_id, source_root_id, provider, provider_item_identity, name,
        relative_path, locator_json, size, duration, fingerprint, availability,
        technical_metadata_json, created_at, updated_at
      ) VALUES
        ('item-strong', 'source-local', 'root-local', 'local-folder', 'strong.mp4',
          'Aula 01.mp4', 'Module 1/Aula 01.mp4', '{"provider":"local-folder","path":"C:/Course 1/Module 1/Aula 01.mp4"}',
          100, 60, 'strong-fingerprint', 'available', '{"duration":60}', 1, 1),
        ('item-medium', 'source-local', 'root-local', 'local-folder', 'medium.mp4',
          'Different Name.mp4', 'Other/Different Name.mp4', '{"provider":"local-folder","path":"C:/Course 1/Other/Different Name.mp4"}',
          100, 60, NULL, 'available', '{"duration":60}', 1, 1),
        ('item-cross', 'source-local', 'root-local', 'local-folder', 'cross.mp4',
          'Outra Aula.mp4', 'Module 2/Outra Aula.mp4', '{"provider":"local-folder","path":"C:/Course 1/Module 2/Outra Aula.mp4"}',
          200, 90, 'cross-course-fingerprint', 'available', '{"duration":90}', 1, 1),
        ('item-unrelated', 'source-local', 'root-local', 'local-folder', 'unrelated.mp4',
          'Unrelated.mp4', 'Unrelated.mp4', '{"provider":"local-folder","path":"C:/Course 1/Unrelated.mp4"}',
          1, 2, NULL, 'available', '{"duration":2}', 1, 1);
    `)
  })

  afterEach(() => {
    databaseService.close()
    fs.rmSync(vaultPath, { recursive: true, force: true })
  })

  it('auto-links only an unambiguous same-course strong match', async () => {
    const summary = await matchingService.matchRoot('root-local')
    const db = databaseService.getDatabase()!

    expect(summary).toEqual({
      evaluated: 4,
      autoLinked: 1,
      pending: 1,
      duplicates: 1
    })
    expect(
      db
        .prepare(
          `SELECT source_item_id, lesson_id, is_manual FROM canonical_source_links`
        )
        .all()
    ).toEqual([
      { source_item_id: 'item-strong', lesson_id: 'lesson-1', is_manual: 0 }
    ])
    expect(
      db
        .prepare(
          `SELECT source_item_id, lesson_id FROM canonical_source_links WHERE source_item_id = 'item-medium'`
        )
        .all()
    ).toEqual([])
  })

  it('persists medium candidates and cross-course duplicate evidence without linking', async () => {
    await matchingService.matchRoot('root-local')
    const candidates = repository.listMatchCandidates()

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceItemId: 'item-medium',
          canonicalId: 'lesson-1',
          status: 'pending'
        }),
        expect.objectContaining({
          sourceItemId: 'item-cross',
          canonicalId: 'lesson-2',
          status: 'rejected',
          evidence: expect.objectContaining({
            duplicateAcrossCourses: true,
            courseContext: 'different'
          })
        })
      ])
    )
  })

  it('is idempotent and does not duplicate candidates or links', async () => {
    await matchingService.matchRoot('root-local')
    const firstCandidates = repository.listMatchCandidates()
    const firstLinks = databaseService
      .getDatabase()!
      .prepare(`SELECT * FROM canonical_source_links ORDER BY id`)
      .all()

    await matchingService.matchRoot('root-local')

    expect(repository.listMatchCandidates()).toHaveLength(
      firstCandidates.length
    )
    expect(
      databaseService
        .getDatabase()!
        .prepare(`SELECT * FROM canonical_source_links ORDER BY id`)
        .all()
    ).toEqual(firstLinks)
  })

  it('keeps an unknown course context in review instead of auto-linking or dropping it', async () => {
    const db = databaseService.getDatabase()!
    db.prepare(
      `UPDATE source_roots SET local_path = 'C:/Unmapped Root' WHERE id = 'root-local'`
    ).run()

    const summary = await matchingService.matchRoot('root-local')

    expect(summary.autoLinked).toBe(0)
    expect(summary.pending).toBeGreaterThan(0)
    expect(
      repository
        .listMatchCandidates('pending')
        .some((candidate) => candidate.evidence.courseContext === 'unknown')
    ).toBe(true)
    expect(
      db.prepare(`SELECT count(*) AS count FROM canonical_source_links`).get()
    ).toEqual({ count: 0 })
  })
})
