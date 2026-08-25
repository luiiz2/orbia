import type Database from 'better-sqlite3'
import type {
  CanonicalSourceType,
  SourceAvailability,
  SourceDefinition,
  SourceItem,
  SourceItemLocator,
  SourceProvider,
  SourceRoot,
  SourceRootLocator,
  SourceSummary,
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

  private requireDatabase(): Database.Database {
    const database = this.databaseService.getDatabase()
    if (!database)
      throw new Error('Source repository requires a connected Vault database')
    return database
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
