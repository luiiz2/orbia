import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { DatabaseService } from '../../src/main/services/database.service'
import {
  SourceSyncService,
  type SourceAdapterResolver
} from '../../src/main/services/sources/source-sync.service'
import type {
  ByteRange,
  SourceAdapter,
  SourceAdapterItem,
  SourceReadHandle
} from '../../src/main/services/sources/source-adapter'
import { SourceManagerService } from '../../src/main/services/sources/source-manager.service'
import { SourceRepositoryService } from '../../src/main/services/sources/source-repository.service'
import type {
  SourceItemLocator,
  SourceTechnicalMetadata
} from '../../src/types/source'

describe('SourceSyncService', () => {
  let vaultPath: string
  let databaseService: DatabaseService
  let repository: SourceRepositoryService

  beforeEach(() => {
    vaultPath = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-source-sync-service-'))
    databaseService = new DatabaseService()
    databaseService.connect(vaultPath)
    repository = new SourceRepositoryService(databaseService)

    const db = databaseService.getDatabase()
    if (!db) throw new Error('Expected connected database')
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
  })

  afterEach(() => {
    databaseService.close()
    fs.rmSync(vaultPath, { recursive: true, force: true })
  })

  it('accumulates async batches into one snapshot and returns only the sync result', async () => {
    const batches: SourceAdapterItem[][] = [
      [createLocalItem('Guide.pdf', 'guide-fingerprint')],
      [createLocalItem('Module/Lesson.mp4', 'lesson-fingerprint')]
    ]
    let reconcileCalls = 0
    const adapter = createAdapter(async function* ({ root }) {
      reconcileCalls += 1
      expect(root).toEqual({ provider: 'local-folder', path: 'C:/Course' })
      for (const items of batches) {
        await Promise.resolve()
        yield { items }
      }
    })
    const service = new SourceSyncService(
      repository,
      () => adapter,
      () => 200
    )

    const result = await service.syncRoot('root-local', 'manual')
    const db = databaseService.getDatabase()
    if (!db) throw new Error('Expected connected database')

    expect(reconcileCalls).toBe(1)
    expect(result).toMatchObject({
      sourceId: 'source-local',
      sourceRootId: 'root-local',
      scannedItems: 2,
      completedAt: 200
    })
    expect(result).not.toHaveProperty('locator')
    expect(result).not.toHaveProperty('path')
    expect(db.prepare(`
      SELECT provider_item_identity, fingerprint, availability
      FROM source_items
      ORDER BY relative_path
    `).all()).toEqual([
      {
        provider_item_identity: 'Guide.pdf',
        fingerprint: 'guide-fingerprint',
        availability: 'available'
      },
      {
        provider_item_identity: 'Module/Lesson.mp4',
        fingerprint: 'lesson-fingerprint',
        availability: 'available'
      }
    ])
    expect(db.prepare(`SELECT status, scanned_items, changed_items, error_message FROM source_sync_runs`).get())
      .toMatchObject({
        status: 'completed',
        scanned_items: 2,
        changed_items: 2,
        error_message: null
      })
  })

  it('records one sanitized failed run when an adapter errors', async () => {
    const adapter = createAdapter(async function* () {
      yield { items: [createLocalItem('Guide.pdf', 'guide-fingerprint')] }
      throw new Error('raw adapter failure at C:/private/secret.mp4')
    })
    const service = new SourceSyncService(
      repository,
      () => adapter,
      () => 300
    )

    await expect(service.syncRoot('root-local', 'manual')).rejects.toThrow(
      'Source synchronization failed'
    )
    const db = databaseService.getDatabase()
    if (!db) throw new Error('Expected connected database')

    expect(db.prepare(`SELECT COUNT(*) AS count FROM source_sync_runs`).get()).toEqual({ count: 1 })
    expect(db.prepare(`
      SELECT status, error_message, scanned_items, changed_items
      FROM source_sync_runs
    `).get()).toEqual({
      status: 'failed',
      error_message: 'Source synchronization failed',
      scanned_items: 0,
      changed_items: 0
    })
    expect(db.prepare(`SELECT COUNT(*) AS count FROM source_items`).get()).toEqual({ count: 0 })
  })

  it('calls failSync once when completeSync errors after beginSync', async () => {
    const beginSyncSpy = vi.spyOn(repository, 'beginSync')
    const completeSyncSpy = vi
      .spyOn(repository, 'completeSync')
      .mockImplementation(() => {
        expect(beginSyncSpy).toHaveBeenCalledOnce()
        throw new Error('raw complete failure at C:/private/secret.mp4')
      })
    const failSyncSpy = vi.spyOn(repository, 'failSync')
    const adapter = createAdapter(async function* () {
      yield { items: [createLocalItem('Guide.pdf', 'guide-fingerprint')] }
    })
    const service = new SourceSyncService(repository, () => adapter, () => 350)

    await expect(service.syncRoot('root-local', 'manual')).rejects.toMatchObject({
      message: 'Source synchronization failed'
    })

    expect(completeSyncSpy).toHaveBeenCalledOnce()
    expect(failSyncSpy).toHaveBeenCalledOnce()
    const db = databaseService.getDatabase()
    if (!db) throw new Error('Expected connected database')

    expect(db.prepare(`
      SELECT status, error_message, scanned_items, changed_items, finished_at
      FROM source_sync_runs
    `).get()).toEqual({
      status: 'failed',
      error_message: 'Source synchronization failed',
      scanned_items: 0,
      changed_items: 0,
      finished_at: 350
    })
  })

  it('fails before beginSync for an unknown root or an unregistered provider', async () => {
    const adapterResolver: SourceAdapterResolver = () => {
      throw new Error('No source adapter registered for provider: google-drive')
    }
    const service = new SourceSyncService(repository, adapterResolver, () => 400)
    const db = databaseService.getDatabase()
    if (!db) throw new Error('Expected connected database')

    await expect(service.syncRoot('missing-root', 'manual')).rejects.toThrow(
      'Unknown source root'
    )
    expect(db.prepare(`SELECT COUNT(*) AS count FROM source_sync_runs`).get()).toEqual({ count: 0 })

    db.prepare(`
      INSERT INTO content_sources (id, provider, display_name, account_identity, availability, created_at, updated_at)
      VALUES ('source-drive', 'google-drive', 'Drive', 'account-1', 'available', 1, 1)
    `).run()
    db.prepare(`
      INSERT INTO source_roots (
        id, source_id, provider_root_identity, display_name, availability, created_at, updated_at
      ) VALUES ('root-drive', 'source-drive', 'folder-1', 'Drive', 'available', 1, 1)
    `).run()

    await expect(service.syncRoot('root-drive', 'manual')).rejects.toThrow(
      'No source adapter registered for provider: google-drive'
    )
    expect(db.prepare(`SELECT COUNT(*) AS count FROM source_sync_runs`).get()).toEqual({ count: 0 })
  })

  it('lets the manager sync through its registered adapter lookup', async () => {
    const adapter = createAdapter(async function* () {
      yield { items: [createLocalItem('Guide.pdf', 'guide-fingerprint')] }
    })
    const manager = new SourceManagerService(repository)
    manager.register(adapter)

    const result = await manager.syncRoot('root-local')

    expect(result).toMatchObject({
      sourceId: 'source-local',
      sourceRootId: 'root-local',
      scannedItems: 1
    })
  })
})

function createLocalItem(
  providerItemIdentity: string,
  fingerprint: string
): SourceAdapterItem {
  return {
    providerItemIdentity,
    locator: {
      provider: 'local-folder',
      path: `C:/Course/${providerItemIdentity}`
    },
    name: path.posix.basename(providerItemIdentity),
    relativePath: providerItemIdentity,
    size: 10,
    availability: 'available',
    fingerprint
  }
}

function createAdapter(
  reconcile: SourceAdapter['reconcile']
): SourceAdapter {
  return {
    provider: 'local-folder',
    identifyRoot: async () => ({
      providerRootIdentity: 'C:/Course',
      displayName: 'Local',
      availability: 'available'
    }),
    reconcile,
    open: async (_item: SourceItemLocator, range?: ByteRange): Promise<SourceReadHandle> => ({
      stream: Readable.from([]),
      status: range ? 206 : 200,
      totalSize: 0,
      ...(range ? { contentRange: range } : {}),
      seekable: true
    }),
    probe: async (): Promise<SourceTechnicalMetadata> => ({})
  }
}
