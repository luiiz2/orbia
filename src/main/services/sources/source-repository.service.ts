import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type {
  CanonicalSourceType,
  SourceAvailability,
  SourceDefinition,
  SourceItem,
  SourceItemLocator,
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
  name: string
  relative_path: string
  locator_json: string
  mime_type: string | null
  size: number | null
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
        id, source_id, source_root_id, provider, name, relative_path, locator_json,
        mime_type, size, revision, checksum, availability, technical_metadata_json, created_at, updated_at
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
        source_items.name, source_items.relative_path, source_items.locator_json, source_items.mime_type,
        source_items.size, source_items.revision, source_items.checksum, source_items.availability,
        source_items.technical_metadata_json, source_items.created_at, source_items.updated_at
      FROM source_items
      JOIN canonical_source_links ON canonical_source_links.source_item_id = source_items.id
      WHERE canonical_source_links.${column} = ?
      ORDER BY source_items.name COLLATE NOCASE, source_items.id
    `
      )
      .all(canonicalId) as SourceItemRow[]

    return rows.map((row) => this.mapItem(row))
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
      db.prepare(`
        INSERT INTO source_sync_runs (
          id, source_id, source_root_id, trigger, status, scanned_items, changed_items, started_at
        ) VALUES (?, ?, ?, ?, 'running', 0, 0, ?)
      `).run(run.id, run.sourceId, run.sourceRootId, run.trigger, run.startedAt)
      db.prepare(`UPDATE source_roots SET availability = 'syncing', updated_at = ? WHERE id = ?`)
        .run(startedAt, root.id)
      db.prepare(`UPDATE content_sources SET availability = 'syncing', updated_at = ? WHERE id = ?`)
        .run(startedAt, root.source_id)
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
        .prepare(`
          SELECT id, provider_item_identity, fingerprint
          FROM source_items
          WHERE source_root_id = ?
        `)
        .all(run.source_root_id) as SourceSyncItemRow[]
      const existingItemsByIdentity = new Map(
        existingItems.map((item) => [item.provider_item_identity, item])
      )
      const unmatchedItems = new Map(existingItems.map((item) => [item.id, item]))
      const matchedItemsByIdentity = new Map<string, SourceSyncItemRow>()

      for (const item of items) {
        const existingItem = existingItemsByIdentity.get(item.providerItemIdentity)
        if (existingItem) {
          matchedItemsByIdentity.set(item.providerItemIdentity, existingItem)
          unmatchedItems.delete(existingItem.id)
        }
      }

      const unmatchedItemsByFingerprint = new Map<string, SourceSyncItemRow[]>()
      for (const item of unmatchedItems.values()) {
        if (!item.fingerprint?.trim()) continue
        const candidates = unmatchedItemsByFingerprint.get(item.fingerprint) ?? []
        candidates.push(item)
        unmatchedItemsByFingerprint.set(item.fingerprint, candidates)
      }
      const unmatchedSnapshotItemsByFingerprint = new Map<string, SourceSnapshotItem[]>()
      for (const item of items) {
        if (matchedItemsByIdentity.has(item.providerItemIdentity) || !item.fingerprint?.trim()) continue
        const candidates = unmatchedSnapshotItemsByFingerprint.get(item.fingerprint) ?? []
        candidates.push(item)
        unmatchedSnapshotItemsByFingerprint.set(item.fingerprint, candidates)
      }
      for (const [fingerprint, snapshotItems] of unmatchedSnapshotItemsByFingerprint) {
        const existingMatches = unmatchedItemsByFingerprint.get(fingerprint)
        if (snapshotItems.length === 1 && existingMatches?.length === 1) {
          const existingItem = existingMatches[0]
          matchedItemsByIdentity.set(snapshotItems[0].providerItemIdentity, existingItem)
          unmatchedItems.delete(existingItem.id)
        }
      }
      let changedItems = 0

      for (const item of items) {
        const existingItem = matchedItemsByIdentity.get(item.providerItemIdentity)

        if (existingItem) {
          db.prepare(`
            UPDATE source_items
            SET provider_item_identity = ?, parent_provider_identity = ?, name = ?, relative_path = ?,
                locator_json = ?, mime_type = ?, size = ?, duration = ?, width = ?, height = ?,
                technical_metadata_json = ?, revision = ?, fingerprint = ?, checksum = ?,
                availability = ?, updated_at = ?
            WHERE id = ?
          `).run(
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
            item.technicalMetadata ? JSON.stringify(item.technicalMetadata) : null,
            item.revision ?? null,
            item.fingerprint ?? null,
            item.checksum ?? null,
            item.availability,
            completedAt,
            existingItem.id
          )
        } else {
          db.prepare(`
            INSERT INTO source_items (
              id, source_id, source_root_id, provider, provider_item_identity, parent_provider_identity,
              name, relative_path, locator_json, mime_type, size, duration, width, height,
              technical_metadata_json, revision, fingerprint, checksum, availability, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
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
            item.technicalMetadata ? JSON.stringify(item.technicalMetadata) : null,
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

      db.prepare(`
        UPDATE source_sync_runs
        SET status = 'completed', scanned_items = ?, changed_items = ?, finished_at = ?, error_message = NULL
        WHERE id = ?
      `).run(items.length, changedItems, completedAt, run.id)
      db.prepare(`
        UPDATE source_roots
        SET availability = 'available', last_synced_at = ?, last_verified_at = ?, updated_at = ?
        WHERE id = ?
      `).run(completedAt, completedAt, completedAt, run.source_root_id)
      db.prepare(`UPDATE content_sources SET availability = 'available', updated_at = ? WHERE id = ?`)
        .run(completedAt, run.source_id)

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
      db.prepare(`
        UPDATE source_sync_runs
        SET status = 'failed', error_message = 'Source synchronization failed', finished_at = ?
        WHERE id = ?
      `).run(completedAt, run.id)
      db.prepare(`UPDATE source_roots SET availability = 'error', updated_at = ? WHERE id = ?`)
        .run(completedAt, run.source_root_id)
      db.prepare(`UPDATE content_sources SET availability = 'error', updated_at = ? WHERE id = ?`)
        .run(completedAt, run.source_id)
    })()
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
      .prepare(`
        SELECT
          id, source_id, source_root_id, trigger, status, cursor_before, cursor_after,
          scanned_items, changed_items, started_at, finished_at, error_message
        FROM source_sync_runs
        WHERE id = ? AND status = 'running'
      `)
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
    const technicalMetadata = parseOptionalObject(row.technical_metadata_json)
    if (!locator)
      throw new Error(`Source item ${row.id} has an invalid locator`)

    return {
      id: row.id,
      sourceId: row.source_id,
      sourceRootId: row.source_root_id,
      provider: row.provider,
      locator,
      relativePath: row.relative_path,
      name: row.name,
      ...(row.mime_type ? { mimeType: row.mime_type } : {}),
      ...(row.size === null ? {} : { size: row.size }),
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
