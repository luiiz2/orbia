import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseService } from '../../src/main/services/database.service'
import { SourceRepositoryService } from '../../src/main/services/sources/source-repository.service'
import type {
  SourceMatchEvaluation,
  SourceMatchEvidence
} from '../../src/types/source'

const evidence: SourceMatchEvidence = {
  thresholdVersion: 'source-match-v1',
  courseContext: 'same',
  signals: [{ kind: 'checksum', matched: true, score: 0.65 }],
  strongContentMatch: true,
  technicalMetadataCompatible: true,
  duplicateAcrossCourses: false
}

function createEvaluation(
  overrides: Partial<SourceMatchEvaluation> = {}
): SourceMatchEvaluation {
  return {
    sourceItemId: 'item-unlinked',
    canonicalType: 'lesson',
    canonicalId: 'lesson-1',
    confidence: 0.9,
    action: 'review',
    evidence,
    ...overrides
  }
}

describe('SourceRepositoryService matching and links', () => {
  let vaultPath: string
  let databaseService: DatabaseService
  let repository: SourceRepositoryService

  beforeEach(() => {
    vaultPath = fs.mkdtempSync(
      path.join(os.tmpdir(), 'orbia-source-matching-repository-')
    )
    databaseService = new DatabaseService()
    databaseService.connect(vaultPath)
    repository = new SourceRepositoryService(databaseService)

    const db = databaseService.getDatabase()
    if (!db) throw new Error('Expected connected database')

    db.exec(`
      INSERT INTO courses (id, title, slug, source_type, root_path, created_at, updated_at)
      VALUES ('course-1', 'Course 1', 'course-1', 'folder', 'C:/Course 1', 1, 1);
      INSERT INTO modules (id, course_id, title, order_index, created_at)
      VALUES ('module-1', 'course-1', 'Module 1', 0, 1);
      INSERT INTO lessons (
        id, module_id, course_id, title, order_index, file_path, file_name,
        file_extension, media_type, duration, file_size, availability, created_at
      ) VALUES (
        'lesson-1', 'module-1', 'course-1', 'Aula 01', 0,
        'C:/Course 1/Module 1/Aula 01.mp4', 'Aula 01.mp4', 'mp4', 'video',
        60, 100, 'local', 1
      );
      INSERT INTO content_resources (
        id, course_id, module_id, role, name, file_path, file_extension,
        file_size, resource_type, created_at
      ) VALUES (
        'resource-1', 'course-1', 'module-1', 'resource', 'Guide.pdf',
        'C:/Course 1/Guide.pdf', 'pdf', 20, 'pdf', 1
      );
      INSERT INTO content_sources (
        id, provider, display_name, availability, created_at, updated_at
      ) VALUES ('source-local', 'local-folder', 'Local', 'available', 1, 1);
      INSERT INTO source_roots (
        id, source_id, provider_root_identity, display_name, local_path,
        availability, created_at, updated_at
      ) VALUES ('root-local', 'source-local', 'C:/Course 1', 'Local', 'C:/Course 1', 'available', 1, 1);
      INSERT INTO source_items (
        id, source_id, source_root_id, provider, provider_item_identity, name,
        relative_path, locator_json, size, duration, fingerprint, availability,
        created_at, updated_at
      ) VALUES
        ('item-linked', 'source-local', 'root-local', 'local-folder', 'linked.mp4',
          'linked.mp4', 'Module 1/linked.mp4', '{"provider":"local-folder","path":"C:/Course 1/linked.mp4"}',
          100, 60, 'linked-fingerprint', 'available', 1, 1),
        ('item-unlinked', 'source-local', 'root-local', 'local-folder', 'unlinked.mp4',
          'unlinked.mp4', 'Module 1/unlinked.mp4', '{"provider":"local-folder","path":"C:/Course 1/unlinked.mp4"}',
          100, 60, 'unlinked-fingerprint', 'available', 1, 1);
    `)
  })

  afterEach(() => {
    databaseService.close()
    fs.rmSync(vaultPath, { recursive: true, force: true })
  })

  it('lists lesson and resource targets without absolute paths', () => {
    const targets = repository.listMatchTargets()

    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalType: 'lesson',
          canonicalId: 'lesson-1',
          courseId: 'course-1',
          title: 'Aula 01'
        }),
        expect.objectContaining({
          canonicalType: 'content-resource',
          canonicalId: 'resource-1',
          title: 'Guide.pdf'
        })
      ])
    )
    expect(JSON.stringify(targets)).not.toContain('C:/Course 1')
  })

  it('upserts a path-free candidate and returns it in the pending view', () => {
    const first = repository.upsertMatchCandidate(createEvaluation(), 10)
    const second = repository.upsertMatchCandidate(
      createEvaluation({ confidence: 0.92 }),
      20
    )

    expect(first.id).toBe(second.id)
    expect(repository.listMatchCandidates('pending')).toEqual([
      expect.objectContaining({
        id: first.id,
        sourceItemId: 'item-unlinked',
        sourceName: 'unlinked.mp4',
        canonicalId: 'lesson-1',
        confidence: 0.92,
        status: 'pending'
      })
    ])
    expect(JSON.stringify(repository.listMatchCandidates())).not.toContain(
      'C:/Course 1'
    )
  })

  it('accepts a candidate into a manual source link without changing canonical content', () => {
    const before = databaseService
      .getDatabase()!
      .prepare(
        `SELECT title, file_path, file_size FROM lessons WHERE id = 'lesson-1'`
      )
      .get()
    const candidate = repository.upsertMatchCandidate(createEvaluation(), 10)

    const accepted = repository.reviewMatchCandidate(
      candidate.id,
      'accepted',
      20
    )
    const link = databaseService
      .getDatabase()!
      .prepare(
        `SELECT source_item_id, lesson_id, is_manual FROM canonical_source_links`
      )
      .get()

    expect(accepted.status).toBe('accepted')
    expect(link).toEqual({
      source_item_id: 'item-unlinked',
      lesson_id: 'lesson-1',
      is_manual: 1
    })
    expect(
      databaseService
        .getDatabase()!
        .prepare(
          `SELECT title, file_path, file_size FROM lessons WHERE id = 'lesson-1'`
        )
        .get()
    ).toEqual(before)
  })

  it('links and unlinks only the requested source relationship', () => {
    const link = repository.linkSourceToCanonical(
      'item-linked',
      'content-resource',
      'resource-1',
      10
    )

    expect(link).toMatchObject({
      sourceItemId: 'item-linked',
      canonicalType: 'content-resource',
      canonicalId: 'resource-1',
      isManual: true
    })
    expect(
      repository.unlinkSourceFromCanonical(
        'item-linked',
        'content-resource',
        'resource-1',
        20
      )
    ).toBe(true)
    expect(
      databaseService
        .getDatabase()!
        .prepare(`SELECT id FROM source_items WHERE id = 'item-linked'`)
        .get()
    ).toEqual({ id: 'item-linked' })
  })

  it('rejects conflicting links before changing the existing relationship', () => {
    repository.linkSourceToCanonical('item-linked', 'lesson', 'lesson-1', 10)

    expect(() =>
      repository.linkSourceToCanonical(
        'item-linked',
        'content-resource',
        'resource-1',
        20
      )
    ).toThrow('already linked')
    expect(
      databaseService
        .getDatabase()!
        .prepare(`SELECT lesson_id, resource_id FROM canonical_source_links`)
        .get()
    ).toEqual({ lesson_id: 'lesson-1', resource_id: null })
  })

  it('lists only unlinked source items for matching', () => {
    repository.linkSourceToCanonical('item-linked', 'lesson', 'lesson-1', 10)

    expect(
      repository.listUnlinkedMatchItems('root-local').map((item) => item.id)
    ).toEqual(['item-unlinked'])
  })
})
