import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type {
  CanonicalSourceLink,
  CanonicalSourceType,
  SourceAvailability,
  SourceDefinition,
  SourceItem,
  SourceItemLocator,
  SourceMatchCandidate,
  SourceMatchCandidateView,
  SourceMatchEvaluation,
  SourceMatchEvidence,
  SourceMatchStatus,
  SourceMatchTarget,
  SourceProvider,
  SourceRoot,
  SourceRootLocator,
  SourceSnapshotItem,
  SourceSummary,
  SourceSyncResult,
  SourceSyncRun,
  SourceSyncTrigger,
  SourceTechnicalMetadata
} from '../../../types/source'
import { DatabaseService } from '../database.service'

interface SourceRow {
  id: string
  provider: SourceProvider
  display_name: string
  account_identity: string | null
  preference_weight: number
  availability: SourceAvailability
  created_at: number
  updated_at: number
}

interface SourceRootRow {
  id: string
  source_id: string
  provider_root_identity: string
  display_name: string
  local_path: string | null
  stable_device_id: string | null
  mount_hint: string | null
  relative_base: string | null
  sync_cursor: string | null
  sync_corpus_json: string | null
  availability: SourceAvailability
  last_synced_at: number | null
  last_verified_at: number | null
  provider_config_json: string | null
  created_at: number
  updated_at: number
  provider: SourceProvider
  account_identity: string | null
}

interface SourceItemRow {
  id: string
  source_id: string
  source_root_id: string
  provider: SourceProvider
  provider_item_identity: string
  parent_provider_identity: string | null
  name: string
  relative_path: string
  locator_json: string
  mime_type: string | null
  size: number | null
  duration: number | null
  fingerprint: string | null
  revision: string | null
  checksum: string | null
  availability: SourceAvailability
  technical_metadata_json: string | null
  created_at: number
  updated_at: number
}

interface SourceSyncItemRow {
  id: string
  provider_item_identity: string
  fingerprint: string | null
}

interface SourceSyncRunRow {
  id: string
  source_id: string
  source_root_id: string
  trigger: SourceSyncTrigger
  status: SourceSyncRun['status']
  cursor_before: string | null
  cursor_after: string | null
  scanned_items: number
  changed_items: number
  started_at: number
  finished_at: number | null
  error_message: string | null
}

interface SourceSummaryRow {
  id: string
  provider: SourceProvider
  display_name: string
  availability: SourceAvailability
  preference_weight: number
  item_count: number
  linked_item_count: number
  available_item_count: number
  missing_item_count: number
  last_synced_at: number | null
}

interface MatchTargetRow {
  canonical_type: CanonicalSourceType
  canonical_id: string
  course_id: string
  course_root_path: string
  title: string
  file_name: string
  file_path: string
  file_size: number | null
  duration: number | null
  content_hash: string | null
  fingerprint_signature: string | null
}

interface MatchCandidateRow {
  id: string
  source_item_id: string
  source_name: string
  source_provider: SourceProvider
  canonical_type: CanonicalSourceType
  canonical_id: string
  canonical_title: string
  confidence: number
  evidence_json: string
  review_status: SourceMatchStatus
  decided_at: number | null
  created_at: number
}

interface CanonicalLinkRow {
  id: string
  source_item_id: string
  lesson_id: string | null
  resource_id: string | null
  is_manual: number
  is_preferred: number
  created_at: number
  updated_at: number
}

function parseOptionalObject(
  value: string | null
): Record<string, unknown> | undefined {
  if (!value) return undefined

  try {
    const parsed: unknown = JSON.parse(value)
    return parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

export class SourceRepositoryService {
  public constructor(private readonly databaseService: DatabaseService) {}

  public listSummaries(): SourceSummary[] {
    const rows = this.requireDatabase()
      .prepare(
        `
      SELECT
        content_sources.id,
        content_sources.provider,
        content_sources.display_name,
        content_sources.availability,
        content_sources.preference_weight,
        COUNT(DISTINCT source_items.id) AS item_count,
        COUNT(DISTINCT CASE WHEN canonical_source_links.id IS NOT NULL THEN source_items.id END) AS linked_item_count,
        COUNT(DISTINCT CASE WHEN source_items.availability = 'available' THEN source_items.id END) AS available_item_count,
        COUNT(DISTINCT CASE WHEN source_items.availability = 'missing' THEN source_items.id END) AS missing_item_count,
        MAX(source_roots.last_synced_at) AS last_synced_at
      FROM content_sources
      LEFT JOIN source_roots ON source_roots.source_id = content_sources.id
      LEFT JOIN source_items ON source_items.source_root_id = source_roots.id
      LEFT JOIN canonical_source_links ON canonical_source_links.source_item_id = source_items.id
      GROUP BY
        content_sources.id,
        content_sources.provider,
        content_sources.display_name,
        content_sources.availability,
        content_sources.preference_weight
      ORDER BY content_sources.display_name COLLATE NOCASE, content_sources.id
    `
      )
      .all() as SourceSummaryRow[]

    return rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      displayName: row.display_name,
      availability: row.availability,
      preferenceWeight: row.preference_weight,
      itemCount: row.item_count,
      linkedItemCount: row.linked_item_count,
      availableItemCount: row.available_item_count,
      missingItemCount: row.missing_item_count,
      ...(row.last_synced_at === null
        ? {}
        : { lastSyncedAt: row.last_synced_at })
    }))
  }

  public getSource(id: string): SourceDefinition | null {
    const row = this.requireDatabase()
      .prepare(
        `
      SELECT id, provider, display_name, account_identity, preference_weight, availability, created_at, updated_at
      FROM content_sources
      WHERE id = ?
    `
      )
      .get(id) as SourceRow | undefined

    return row ? this.mapSource(row) : null
  }

  public getRoot(id: string): SourceRoot | null {
    const row = this.requireDatabase()
      .prepare(
        `
      SELECT
        source_roots.*,
        content_sources.provider,
        content_sources.account_identity
      FROM source_roots
      JOIN content_sources ON content_sources.id = source_roots.source_id
      WHERE source_roots.id = ?
    `
      )
      .get(id) as SourceRootRow | undefined

    return row ? this.mapRoot(row) : null
  }

  public listRoots(): SourceRoot[] {
    const rows = this.requireDatabase()
      .prepare(
        `
      SELECT
        source_roots.*,
        content_sources.provider,
        content_sources.account_identity
      FROM source_roots
      JOIN content_sources ON content_sources.id = source_roots.source_id
      ORDER BY content_sources.display_name COLLATE NOCASE, source_roots.display_name COLLATE NOCASE, source_roots.id
    `
      )
      .all() as SourceRootRow[]

    return rows.map((row) => this.mapRoot(row))
  }

  public getItem(id: string): SourceItem | null {
    const row = this.requireDatabase()
      .prepare(
        `
      SELECT
        id, source_id, source_root_id, provider, provider_item_identity,
        parent_provider_identity, name, relative_path, locator_json, mime_type,
        size, duration, fingerprint, revision, checksum, availability,
        technical_metadata_json, created_at, updated_at
      FROM source_items
      WHERE id = ?
    `
      )
      .get(id) as SourceItemRow | undefined

    return row ? this.mapItem(row) : null
  }

  public listItemsForCanonical(
    canonicalType: CanonicalSourceType,
    canonicalId: string
  ): SourceItem[] {
    const column = canonicalType === 'lesson' ? 'lesson_id' : 'resource_id'
    const rows = this.requireDatabase()
      .prepare(
        `
      SELECT
        source_items.id, source_items.source_id, source_items.source_root_id, source_items.provider,
        source_items.provider_item_identity, source_items.parent_provider_identity,
        source_items.name, source_items.relative_path, source_items.locator_json, source_items.mime_type,
        source_items.size, source_items.duration, source_items.fingerprint, source_items.revision,
        source_items.checksum, source_items.availability, source_items.technical_metadata_json,
        source_items.created_at, source_items.updated_at
      FROM source_items
      JOIN canonical_source_links ON canonical_source_links.source_item_id = source_items.id
      WHERE canonical_source_links.${column} = ?
      ORDER BY source_items.name COLLATE NOCASE, source_items.id
    `
      )
      .all(canonicalId) as SourceItemRow[]

    return rows.map((row) => this.mapItem(row))
  }

  public listMatchTargets(): SourceMatchTarget[] {
    const rows = this.requireDatabase()
      .prepare(
        `
        SELECT
          'lesson' AS canonical_type,
          lessons.id AS canonical_id,
          lessons.course_id,
          courses.root_path AS course_root_path,
          lessons.title,
          lessons.file_name,
          lessons.file_path,
          lessons.file_size,
          lessons.duration,
          lessons.content_hash,
          lessons.fingerprint_signature
        FROM lessons
        JOIN courses ON courses.id = lessons.course_id
        UNION ALL
        SELECT
          'content-resource' AS canonical_type,
          content_resources.id AS canonical_id,
          content_resources.course_id,
          courses.root_path AS course_root_path,
          content_resources.name AS title,
          content_resources.name AS file_name,
          content_resources.file_path,
          content_resources.file_size,
          NULL AS duration,
          NULL AS content_hash,
          NULL AS fingerprint_signature
        FROM content_resources
        JOIN courses ON courses.id = content_resources.course_id
        ORDER BY title COLLATE NOCASE, canonical_id
      `
      )
      .all() as MatchTargetRow[]

    return rows.map((row) => ({
      canonicalType: row.canonical_type,
      canonicalId: row.canonical_id,
      courseId: row.course_id,
      title: row.title,
      fileName: row.file_name,
      relativePath: relativePathFromRoot(
        row.course_root_path,
        row.file_path,
        row.file_name
      ),
      ...(row.file_size === null ? {} : { size: row.file_size }),
      ...(row.duration === null ? {} : { duration: row.duration }),
      ...((row.fingerprint_signature ?? row.content_hash)
        ? { fingerprint: row.fingerprint_signature ?? row.content_hash! }
        : {}),
      ...(row.duration === null
        ? {}
        : { technicalMetadata: { duration: row.duration } })
    }))
  }

  public listUnlinkedMatchItems(rootId: string): SourceItem[] {
    const rows = this.requireDatabase()
      .prepare(
        `
        SELECT
          source_items.id,
          source_items.source_id,
          source_items.source_root_id,
          source_items.provider,
          source_items.provider_item_identity,
          source_items.parent_provider_identity,
          source_items.name,
          source_items.relative_path,
          source_items.locator_json,
          source_items.mime_type,
          source_items.size,
          source_items.duration,
          source_items.fingerprint,
          source_items.revision,
          source_items.checksum,
          source_items.availability,
          source_items.technical_metadata_json,
          source_items.created_at,
          source_items.updated_at
        FROM source_items
        LEFT JOIN canonical_source_links
          ON canonical_source_links.source_item_id = source_items.id
        WHERE source_items.source_root_id = ?
          AND canonical_source_links.id IS NULL
        ORDER BY source_items.relative_path COLLATE NOCASE, source_items.id
      `
      )
      .all(rootId) as SourceItemRow[]

    return rows.map((row) => this.mapItem(row))
  }

  public getRootMatchCourseId(rootId: string): string | undefined {
    const db = this.requireDatabase()
    const root = db
      .prepare(`SELECT local_path FROM source_roots WHERE id = ?`)
      .get(rootId) as { local_path: string | null } | undefined
    if (!root?.local_path) return undefined

    const courses = db
      .prepare(`SELECT id, root_path FROM courses`)
      .all() as Array<{ id: string; root_path: string }>
    return courses.find((course) =>
      pathsEqual(course.root_path, root.local_path!)
    )?.id
  }

  public upsertMatchCandidate(
    evaluation: SourceMatchEvaluation,
    now: number
  ): SourceMatchCandidate {
    const db = this.requireDatabase()
    const status = actionToMatchStatus(evaluation.action)
    const targetColumn = canonicalTargetColumn(evaluation.canonicalType)

    return db.transaction(() => {
      this.assertSourceItemExists(db, evaluation.sourceItemId)
      this.assertCanonicalTargetExists(
        db,
        evaluation.canonicalType,
        evaluation.canonicalId
      )

      const existing = db
        .prepare(
          `
          SELECT id
          FROM source_match_candidates
          WHERE source_item_id = ? AND ${targetColumn} = ?
        `
        )
        .get(evaluation.sourceItemId, evaluation.canonicalId) as
        { id: string } | undefined
      const decidedAt = status === 'pending' ? null : now
      const evidence = JSON.stringify(evaluation.evidence)

      if (existing) {
        db.prepare(
          `
          UPDATE source_match_candidates
          SET confidence = ?, evidence_json = ?, review_status = ?, decided_at = ?, updated_at = ?
          WHERE id = ?
        `
        ).run(
          evaluation.confidence,
          evidence,
          status,
          decidedAt,
          now,
          existing.id
        )
        if (status === 'accepted') {
          this.linkSourceToCanonicalInTransaction(
            db,
            evaluation.sourceItemId,
            evaluation.canonicalType,
            evaluation.canonicalId,
            false,
            now
          )
        }
        return this.mapCandidate(db, this.requireCandidateRow(db, existing.id))
      }

      const id = randomUUID()
      db.prepare(
        `
        INSERT INTO source_match_candidates (
          id, lesson_id, resource_id, source_item_id, confidence, evidence_json,
          review_status, decided_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        id,
        evaluation.canonicalType === 'lesson' ? evaluation.canonicalId : null,
        evaluation.canonicalType === 'content-resource'
          ? evaluation.canonicalId
          : null,
        evaluation.sourceItemId,
        evaluation.confidence,
        evidence,
        status,
        decidedAt,
        now,
        now
      )
      if (status === 'accepted') {
        this.linkSourceToCanonicalInTransaction(
          db,
          evaluation.sourceItemId,
          evaluation.canonicalType,
          evaluation.canonicalId,
          false,
          now
        )
      }
      return this.mapCandidate(db, this.requireCandidateRow(db, id))
    })()
  }

  public listMatchCandidates(
    status?: SourceMatchStatus
  ): SourceMatchCandidateView[] {
    const rows = this.requireDatabase()
      .prepare(
        `
        SELECT
          source_match_candidates.id,
          source_match_candidates.source_item_id,
          source_items.name AS source_name,
          source_items.provider AS source_provider,
          CASE
            WHEN source_match_candidates.lesson_id IS NOT NULL THEN 'lesson'
            ELSE 'content-resource'
          END AS canonical_type,
          COALESCE(source_match_candidates.lesson_id, source_match_candidates.resource_id) AS canonical_id,
          COALESCE(lessons.title, content_resources.name) AS canonical_title,
          source_match_candidates.confidence,
          source_match_candidates.evidence_json,
          source_match_candidates.review_status,
          source_match_candidates.decided_at,
          source_match_candidates.created_at
        FROM source_match_candidates
        JOIN source_items ON source_items.id = source_match_candidates.source_item_id
        LEFT JOIN lessons ON lessons.id = source_match_candidates.lesson_id
        LEFT JOIN content_resources ON content_resources.id = source_match_candidates.resource_id
        WHERE (? IS NULL OR source_match_candidates.review_status = ?)
        ORDER BY source_match_candidates.created_at, source_match_candidates.id
      `
      )
      .all(status ?? null, status ?? null) as MatchCandidateRow[]

    return rows.map((row) => this.mapCandidateView(row))
  }

  public linkSourceToCanonical(
    sourceItemId: string,
    canonicalType: CanonicalSourceType,
    canonicalId: string,
    now: number
  ): CanonicalSourceLink {
    return this.requireDatabase().transaction(() =>
      this.linkSourceToCanonicalInTransaction(
        this.requireDatabase(),
        sourceItemId,
        canonicalType,
        canonicalId,
        true,
        now
      )
    )()
  }

  public unlinkSourceFromCanonical(
    sourceItemId: string,
    canonicalType: CanonicalSourceType,
    canonicalId: string,
    now: number
  ): boolean {
    const db = this.requireDatabase()
    const targetColumn = canonicalTargetColumn(canonicalType)
    return db.transaction(() => {
      const result = db
        .prepare(
          `
          DELETE FROM canonical_source_links
          WHERE source_item_id = ? AND ${targetColumn} = ?
        `
        )
        .run(sourceItemId, canonicalId)
      if (result.changes > 0) {
        db.prepare(
          `
          UPDATE source_match_candidates
          SET review_status = 'rejected', decided_at = ?, updated_at = ?
          WHERE source_item_id = ? AND ${targetColumn} = ?
        `
        ).run(now, now, sourceItemId, canonicalId)
      }
      return result.changes > 0
    })()
  }

  public reviewMatchCandidate(
    candidateId: string,
    decision: Exclude<SourceMatchStatus, 'pending'>,
    now: number
  ): SourceMatchCandidateView {
    const db = this.requireDatabase()
    return db.transaction(() => {
      const candidate = this.requireCandidateRow(db, candidateId)
      const canonicalType = candidate.canonical_type
      const canonicalId = candidate.canonical_id
      if (decision === 'accepted') {
        this.linkSourceToCanonicalInTransaction(
          db,
          candidate.source_item_id,
          canonicalType,
          canonicalId,
          true,
          now
        )
      }
      db.prepare(
        `
        UPDATE source_match_candidates
        SET review_status = ?, decided_at = ?, updated_at = ?
        WHERE id = ?
      `
      ).run(decision, now, now, candidateId)
      return this.mapCandidateView(this.requireCandidateRow(db, candidateId))
    })()
  }

  public beginSync(
    rootId: string,
    trigger: SourceSyncTrigger,
    startedAt: number
  ): SourceSyncRun {
    const db = this.requireDatabase()
    const root = db
      .prepare(`SELECT id, source_id FROM source_roots WHERE id = ?`)
      .get(rootId) as { id: string; source_id: string } | undefined
    if (!root) throw new Error(`Unknown source root: ${rootId}`)

    const run: SourceSyncRun = {
      id: randomUUID(),
      sourceId: root.source_id,
      sourceRootId: root.id,
      trigger,
      status: 'running',
      scannedItems: 0,
      changedItems: 0,
      startedAt
    }

    db.transaction(() => {
      db.prepare(
        `
        INSERT INTO source_sync_runs (
          id, source_id, source_root_id, trigger, status, scanned_items, changed_items, started_at
        ) VALUES (?, ?, ?, ?, 'running', 0, 0, ?)
      `
      ).run(run.id, run.sourceId, run.sourceRootId, run.trigger, run.startedAt)
      db.prepare(
        `UPDATE source_roots SET availability = 'syncing', updated_at = ? WHERE id = ?`
      ).run(startedAt, root.id)
      db.prepare(
        `UPDATE content_sources SET availability = 'syncing', updated_at = ? WHERE id = ?`
      ).run(startedAt, root.source_id)
    })()

    return run
  }

  public completeSync(
    runId: string,
    items: SourceSnapshotItem[],
    completedAt: number
  ): SourceSyncResult {
    this.validateSnapshot(items)
    const db = this.requireDatabase()

    return db.transaction(() => {
      const run = this.requireRunningSyncRun(db, runId)
      const existingItems = db
        .prepare(
          `
          SELECT id, provider_item_identity, fingerprint
          FROM source_items
          WHERE source_root_id = ?
        `
        )
        .all(run.source_root_id) as SourceSyncItemRow[]
      const existingItemsByIdentity = new Map(
        existingItems.map((item) => [item.provider_item_identity, item])
      )
      const unmatchedItems = new Map(
        existingItems.map((item) => [item.id, item])
      )
      const matchedItemsByIdentity = new Map<string, SourceSyncItemRow>()

      for (const item of items) {
        const existingItem = existingItemsByIdentity.get(
          item.providerItemIdentity
        )
        if (existingItem) {
          matchedItemsByIdentity.set(item.providerItemIdentity, existingItem)
          unmatchedItems.delete(existingItem.id)
        }
      }

      const unmatchedItemsByFingerprint = new Map<string, SourceSyncItemRow[]>()
      for (const item of unmatchedItems.values()) {
        if (!item.fingerprint?.trim()) continue
        const candidates =
          unmatchedItemsByFingerprint.get(item.fingerprint) ?? []
        candidates.push(item)
        unmatchedItemsByFingerprint.set(item.fingerprint, candidates)
      }
      const unmatchedSnapshotItemsByFingerprint = new Map<
        string,
        SourceSnapshotItem[]
      >()
      for (const item of items) {
        if (
          matchedItemsByIdentity.has(item.providerItemIdentity) ||
          !item.fingerprint?.trim()
        )
          continue
        const candidates =
          unmatchedSnapshotItemsByFingerprint.get(item.fingerprint) ?? []
        candidates.push(item)
        unmatchedSnapshotItemsByFingerprint.set(item.fingerprint, candidates)
      }
      for (const [
        fingerprint,
        snapshotItems
      ] of unmatchedSnapshotItemsByFingerprint) {
        const existingMatches = unmatchedItemsByFingerprint.get(fingerprint)
        if (snapshotItems.length === 1 && existingMatches?.length === 1) {
          const existingItem = existingMatches[0]
          matchedItemsByIdentity.set(
            snapshotItems[0].providerItemIdentity,
            existingItem
          )
          unmatchedItems.delete(existingItem.id)
        }
      }
      let changedItems = 0

      for (const item of items) {
        const existingItem = matchedItemsByIdentity.get(
          item.providerItemIdentity
        )

        if (existingItem) {
          db.prepare(
            `
            UPDATE source_items
            SET provider_item_identity = ?, parent_provider_identity = ?, name = ?, relative_path = ?,
                locator_json = ?, mime_type = ?, size = ?, duration = ?, width = ?, height = ?,
                technical_metadata_json = ?, revision = ?, fingerprint = ?, checksum = ?,
                availability = ?, updated_at = ?
            WHERE id = ?
          `
          ).run(
            item.providerItemIdentity,
            item.parentProviderIdentity ?? null,
            item.name,
            item.relativePath,
            JSON.stringify(item.locator),
            item.mimeType ?? null,
            item.size,
            item.technicalMetadata?.duration ?? null,
            item.technicalMetadata?.width ?? null,
            item.technicalMetadata?.height ?? null,
            item.technicalMetadata
              ? JSON.stringify(item.technicalMetadata)
              : null,
            item.revision ?? null,
            item.fingerprint ?? null,
            item.checksum ?? null,
            item.availability,
            completedAt,
            existingItem.id
          )
        } else {
          db.prepare(
            `
            INSERT INTO source_items (
              id, source_id, source_root_id, provider, provider_item_identity, parent_provider_identity,
              name, relative_path, locator_json, mime_type, size, duration, width, height,
              technical_metadata_json, revision, fingerprint, checksum, availability, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
          ).run(
            randomUUID(),
            run.source_id,
            run.source_root_id,
            item.locator.provider,
            item.providerItemIdentity,
            item.parentProviderIdentity ?? null,
            item.name,
            item.relativePath,
            JSON.stringify(item.locator),
            item.mimeType ?? null,
            item.size,
            item.technicalMetadata?.duration ?? null,
            item.technicalMetadata?.width ?? null,
            item.technicalMetadata?.height ?? null,
            item.technicalMetadata
              ? JSON.stringify(item.technicalMetadata)
              : null,
            item.revision ?? null,
            item.fingerprint ?? null,
            item.checksum ?? null,
            item.availability,
            completedAt,
            completedAt
          )
        }
        changedItems += 1
      }

      const markMissing = db.prepare(`
        UPDATE source_items
        SET availability = 'missing', updated_at = ?
        WHERE id = ? AND availability <> 'missing'
      `)
      for (const item of unmatchedItems.values()) {
        changedItems += markMissing.run(completedAt, item.id).changes
      }

      db.prepare(
        `
        UPDATE source_sync_runs
        SET status = 'completed', scanned_items = ?, changed_items = ?, finished_at = ?, error_message = NULL
        WHERE id = ?
      `
      ).run(items.length, changedItems, completedAt, run.id)
      db.prepare(
        `
        UPDATE source_roots
        SET availability = 'available', last_synced_at = ?, last_verified_at = ?, updated_at = ?
        WHERE id = ?
      `
      ).run(completedAt, completedAt, completedAt, run.source_root_id)
      db.prepare(
        `UPDATE content_sources SET availability = 'available', updated_at = ? WHERE id = ?`
      ).run(completedAt, run.source_id)

      return {
        runId: run.id,
        sourceId: run.source_id,
        sourceRootId: run.source_root_id,
        scannedItems: items.length,
        changedItems,
        completedAt
      }
    })()
  }

  public failSync(runId: string, completedAt: number): void {
    const db = this.requireDatabase()

    db.transaction(() => {
      const run = this.requireRunningSyncRun(db, runId)
      db.prepare(
        `
        UPDATE source_sync_runs
        SET status = 'failed', error_message = 'Source synchronization failed', finished_at = ?
        WHERE id = ?
      `
      ).run(completedAt, run.id)
      db.prepare(
        `UPDATE source_roots SET availability = 'error', updated_at = ? WHERE id = ?`
      ).run(completedAt, run.source_root_id)
      db.prepare(
        `UPDATE content_sources SET availability = 'error', updated_at = ? WHERE id = ?`
      ).run(completedAt, run.source_id)
    })()
  }

  private linkSourceToCanonicalInTransaction(
    db: Database.Database,
    sourceItemId: string,
    canonicalType: CanonicalSourceType,
    canonicalId: string,
    isManual: boolean,
    now: number
  ): CanonicalSourceLink {
    this.assertSourceItemExists(db, sourceItemId)
    this.assertCanonicalTargetExists(db, canonicalType, canonicalId)
    const targetColumn = canonicalTargetColumn(canonicalType)
    const existingLinks = db
      .prepare(
        `
        SELECT id, source_item_id, lesson_id, resource_id, is_manual, is_preferred, created_at, updated_at
        FROM canonical_source_links
        WHERE source_item_id = ?
      `
      )
      .all(sourceItemId) as CanonicalLinkRow[]
    const existing = existingLinks.find(
      (link) => link[targetColumn] === canonicalId
    )
    if (existing) {
      if (isManual && existing.is_manual === 0) {
        db.prepare(
          `UPDATE canonical_source_links SET is_manual = 1, updated_at = ? WHERE id = ?`
        ).run(now, existing.id)
        existing.is_manual = 1
        existing.updated_at = now
      }
      return this.mapCanonicalLink(existing)
    }
    if (existingLinks.length > 0) {
      throw new Error('Source item already linked to another canonical item')
    }

    const link: CanonicalLinkRow = {
      id: randomUUID(),
      source_item_id: sourceItemId,
      lesson_id: canonicalType === 'lesson' ? canonicalId : null,
      resource_id: canonicalType === 'content-resource' ? canonicalId : null,
      is_manual: isManual ? 1 : 0,
      is_preferred: 0,
      created_at: now,
      updated_at: now
    }
    db.prepare(
      `
      INSERT INTO canonical_source_links (
        id, lesson_id, resource_id, source_item_id, is_manual, is_preferred, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      link.id,
      link.lesson_id,
      link.resource_id,
      link.source_item_id,
      link.is_manual,
      link.is_preferred,
      link.created_at,
      link.updated_at
    )
    return this.mapCanonicalLink(link)
  }

  private assertSourceItemExists(
    db: Database.Database,
    sourceItemId: string
  ): void {
    const row = db
      .prepare(`SELECT id FROM source_items WHERE id = ?`)
      .get(sourceItemId)
    if (!row) throw new Error('Unknown source item')
  }

  private assertCanonicalTargetExists(
    db: Database.Database,
    canonicalType: CanonicalSourceType,
    canonicalId: string
  ): void {
    const table = canonicalType === 'lesson' ? 'lessons' : 'content_resources'
    const row = db
      .prepare(`SELECT id FROM ${table} WHERE id = ?`)
      .get(canonicalId)
    if (!row) throw new Error('Unknown canonical target')
  }

  private requireCandidateRow(
    db: Database.Database,
    candidateId: string
  ): MatchCandidateRow {
    const row = db
      .prepare(
        `
        SELECT
          source_match_candidates.id,
          source_match_candidates.source_item_id,
          source_items.name AS source_name,
          source_items.provider AS source_provider,
          CASE
            WHEN source_match_candidates.lesson_id IS NOT NULL THEN 'lesson'
            ELSE 'content-resource'
          END AS canonical_type,
          COALESCE(source_match_candidates.lesson_id, source_match_candidates.resource_id) AS canonical_id,
          COALESCE(lessons.title, content_resources.name) AS canonical_title,
          source_match_candidates.confidence,
          source_match_candidates.evidence_json,
          source_match_candidates.review_status,
          source_match_candidates.decided_at,
          source_match_candidates.created_at
        FROM source_match_candidates
        JOIN source_items ON source_items.id = source_match_candidates.source_item_id
        LEFT JOIN lessons ON lessons.id = source_match_candidates.lesson_id
        LEFT JOIN content_resources ON content_resources.id = source_match_candidates.resource_id
        WHERE source_match_candidates.id = ?
      `
      )
      .get(candidateId) as MatchCandidateRow | undefined
    if (!row) throw new Error('Unknown source match candidate')
    return row
  }

  private mapCandidate(
    _db: Database.Database,
    row: MatchCandidateRow
  ): SourceMatchCandidate {
    const evidence = parseMatchEvidence(row.evidence_json)
    return {
      id: row.id,
      sourceItemId: row.source_item_id,
      canonicalType: row.canonical_type,
      canonicalId: row.canonical_id,
      confidence: row.confidence,
      evidence,
      status: row.review_status,
      ...(row.decided_at === null ? {} : { decidedAt: row.decided_at }),
      createdAt: row.created_at
    }
  }

  private mapCandidateView(row: MatchCandidateRow): SourceMatchCandidateView {
    return {
      id: row.id,
      sourceItemId: row.source_item_id,
      sourceName: row.source_name,
      sourceProvider: row.source_provider,
      canonicalType: row.canonical_type,
      canonicalId: row.canonical_id,
      canonicalTitle: row.canonical_title,
      confidence: row.confidence,
      evidence: parseMatchEvidence(row.evidence_json),
      status: row.review_status,
      ...(row.decided_at === null ? {} : { decidedAt: row.decided_at }),
      createdAt: row.created_at
    }
  }

  private mapCanonicalLink(row: CanonicalLinkRow): CanonicalSourceLink {
    return {
      id: row.id,
      sourceItemId: row.source_item_id,
      canonicalType: row.lesson_id ? 'lesson' : 'content-resource',
      canonicalId: row.lesson_id ?? row.resource_id!,
      isManual: row.is_manual === 1,
      isPreferred: row.is_preferred === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  private requireDatabase(): Database.Database {
    const database = this.databaseService.getDatabase()
    if (!database)
      throw new Error('Source repository requires a connected Vault database')
    return database
  }

  private validateSnapshot(items: SourceSnapshotItem[]): void {
    const identities = new Set<string>()
    for (const item of items) {
      if (!item.providerItemIdentity.trim()) {
        throw new Error('Snapshot provider item identity must be non-empty')
      }
      if (identities.has(item.providerItemIdentity)) {
        throw new Error('Duplicate snapshot provider item identity')
      }
      identities.add(item.providerItemIdentity)
    }
  }

  private requireRunningSyncRun(
    db: Database.Database,
    runId: string
  ): SourceSyncRunRow {
    const run = db
      .prepare(
        `
        SELECT
          id, source_id, source_root_id, trigger, status, cursor_before, cursor_after,
          scanned_items, changed_items, started_at, finished_at, error_message
        FROM source_sync_runs
        WHERE id = ? AND status = 'running'
      `
      )
      .get(runId) as SourceSyncRunRow | undefined
    if (!run) throw new Error(`No running source sync found: ${runId}`)
    return run
  }

  private mapSource(row: SourceRow): SourceDefinition {
    return {
      id: row.id,
      provider: row.provider,
      displayName: row.display_name,
      availability: row.availability,
      ...(row.account_identity ? { accountId: row.account_identity } : {}),
      preferenceWeight: row.preference_weight,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  private mapRoot(row: SourceRootRow): SourceRoot {
    const syncCorpus = parseOptionalObject(row.sync_corpus_json)
    const providerConfig = parseOptionalObject(row.provider_config_json)

    return {
      id: row.id,
      sourceId: row.source_id,
      locator: this.mapRootLocator(row),
      availability: row.availability,
      ...(row.stable_device_id ? { stableDeviceId: row.stable_device_id } : {}),
      ...(row.mount_hint ? { mountHint: row.mount_hint } : {}),
      ...(row.relative_base ? { relativeBase: row.relative_base } : {}),
      ...(row.sync_cursor ? { syncCursor: row.sync_cursor } : {}),
      ...(syncCorpus ? { syncCorpus } : {}),
      ...(row.last_synced_at === null
        ? {}
        : { lastSyncedAt: row.last_synced_at }),
      ...(row.last_verified_at === null
        ? {}
        : { lastVerifiedAt: row.last_verified_at }),
      ...(providerConfig ? { providerConfig } : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  private mapRootLocator(row: SourceRootRow): SourceRootLocator {
    switch (row.provider) {
      case 'local-folder':
        if (!row.local_path)
          throw new Error(`Source root ${row.id} is missing its local path`)
        return { provider: 'local-folder', path: row.local_path }
      case 'removable':
        if (!row.local_path || !row.stable_device_id)
          throw new Error(
            `Source root ${row.id} is missing removable media identity`
          )
        return {
          provider: 'removable',
          path: row.local_path,
          volumeId: row.stable_device_id
        }
      case 'google-drive':
        if (!row.account_identity)
          throw new Error(
            `Source root ${row.id} is missing its Google Drive account identity`
          )
        return {
          provider: 'google-drive',
          accountId: row.account_identity,
          folderId: row.provider_root_identity
        }
      case 'managed-offline':
        return {
          provider: 'managed-offline',
          cacheId: row.provider_root_identity
        }
    }
  }

  private mapItem(row: SourceItemRow): SourceItem {
    const locator = parseOptionalObject(row.locator_json) as
      SourceItemLocator | undefined
    const parsedTechnicalMetadata = parseOptionalObject(
      row.technical_metadata_json
    )
    const technicalMetadata =
      row.duration === null && !parsedTechnicalMetadata
        ? undefined
        : {
            ...(parsedTechnicalMetadata ?? {}),
            ...(row.duration === null ? {} : { duration: row.duration })
          }
    if (!locator)
      throw new Error(`Source item ${row.id} has an invalid locator`)

    return {
      id: row.id,
      sourceId: row.source_id,
      sourceRootId: row.source_root_id,
      provider: row.provider,
      locator,
      ...(row.provider_item_identity
        ? { providerItemIdentity: row.provider_item_identity }
        : {}),
      ...(row.parent_provider_identity
        ? { parentProviderIdentity: row.parent_provider_identity }
        : {}),
      relativePath: row.relative_path,
      name: row.name,
      ...(row.mime_type ? { mimeType: row.mime_type } : {}),
      ...(row.size === null ? {} : { size: row.size }),
      ...(row.fingerprint ? { fingerprint: row.fingerprint } : {}),
      ...(row.revision ? { revision: row.revision } : {}),
      ...(row.checksum ? { checksum: row.checksum } : {}),
      availability: row.availability,
      ...(technicalMetadata
        ? { technicalMetadata: technicalMetadata as SourceTechnicalMetadata }
        : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    } as SourceItem
  }
}

function actionToMatchStatus(
  action: SourceMatchEvaluation['action']
): SourceMatchStatus {
  if (action === 'auto-link') return 'accepted'
  if (action === 'review') return 'pending'
  return 'rejected'
}

function canonicalTargetColumn(
  canonicalType: CanonicalSourceType
): 'lesson_id' | 'resource_id' {
  if (canonicalType === 'lesson') return 'lesson_id'
  if (canonicalType === 'content-resource') return 'resource_id'
  throw new Error('Invalid canonical source type')
}

function parseMatchEvidence(value: string): SourceMatchEvidence {
  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as SourceMatchEvidence
    }
  } catch {
    // Use a fixed safe fallback for legacy rows.
  }
  return {
    thresholdVersion: 'unknown',
    courseContext: 'unknown',
    signals: [],
    strongContentMatch: false,
    technicalMetadataCompatible: false,
    duplicateAcrossCourses: false
  }
}

function relativePathFromRoot(
  rootPath: string,
  filePath: string,
  fallback: string
): string {
  const normalizedRoot = normalizePath(rootPath)
  const normalizedFile = normalizePath(filePath)
  if (
    normalizedFile.startsWith(`${normalizedRoot}/`) &&
    normalizedFile.length > normalizedRoot.length + 1
  ) {
    return normalizedFile.slice(normalizedRoot.length + 1)
  }
  return normalizeRelativePath(fallback)
}

function pathsEqual(left: string, right: string): boolean {
  return normalizePath(left) === normalizePath(right)
}

function normalizePath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
    .toLocaleLowerCase()
}

function normalizeRelativePath(value: string): string {
  const normalized = value
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '')
  return normalized.includes('..') || /^[a-z]:\//i.test(normalized)
    ? (normalized.split('/').pop() ?? 'unknown')
    : normalized
}
