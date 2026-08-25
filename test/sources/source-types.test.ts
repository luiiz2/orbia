import { describe, expect, it } from 'vitest'
import {
  SOURCE_AVAILABILITY,
  SOURCE_PROVIDERS,
  type SourceDefinition
} from '../../src/types'
import {
  type CanonicalSourceLink,
  type OfflineAsset,
  type SourceItem,
  type SourceItemLocator,
  type SourceMatchCandidate,
  type SourceRoot,
  type SourceRootLocator,
  type SourceSyncRun,
  type SourceTechnicalMetadata
} from '../../src/types/source'

describe('source domain contracts', () => {
  it('exposes the supported providers and availability states', () => {
    expect(SOURCE_PROVIDERS).toEqual([
      'local-folder',
      'removable',
      'google-drive',
      'managed-offline'
    ])
    expect(SOURCE_AVAILABILITY).toEqual([
      'available',
      'offline',
      'disconnected',
      'auth-required',
      'missing',
      'syncing',
      'error',
      'relink-required'
    ])
  })

  it('models provider-neutral records with provider-specific locators', () => {
    const technicalMetadata: SourceTechnicalMetadata = {
      duration: 120,
      width: 1920,
      height: 1080,
      codec: 'h264',
      bitrate: 4_000_000
    }
    const source: SourceDefinition = {
      id: 'source-1',
      provider: 'local-folder',
      displayName: 'Curso local',
      availability: 'available',
      preferenceWeight: 2.5,
      createdAt: 1,
      updatedAt: 1
    }
    const root: SourceRoot = {
      id: 'root-1',
      sourceId: source.id,
      locator: { provider: 'local-folder', path: 'C:/Cursos' },
      availability: 'available',
      stableDeviceId: 'device-1',
      mountHint: 'C:/',
      relativeBase: 'Cursos',
      syncCursor: 'cursor-1',
      syncCorpus: { page: 2 },
      lastSyncedAt: 2,
      lastVerifiedAt: 3,
      providerConfig: { watch: true },
      createdAt: 1,
      updatedAt: 1
    }
    const item: SourceItem = {
      id: 'item-1',
      sourceId: source.id,
      sourceRootId: root.id,
      provider: 'local-folder',
      locator: { provider: 'local-folder', path: 'C:/Cursos/Módulo 1/Aula 1.mp4' },
      relativePath: 'Módulo 1/Aula 1.mp4',
      name: 'Aula 1.mp4',
      availability: 'available',
      technicalMetadata,
      createdAt: 1,
      updatedAt: 1
    }
    const link: CanonicalSourceLink = {
      id: 'link-1',
      sourceItemId: item.id,
      canonicalType: 'lesson',
      canonicalId: 'lesson-1',
      isManual: true,
      isPreferred: true,
      createdAt: 1,
      updatedAt: 1
    }
    const candidate: SourceMatchCandidate = {
      id: 'candidate-1',
      sourceItemId: item.id,
      canonicalType: 'lesson',
      canonicalId: 'lesson-1',
      confidence: 0.9,
      status: 'pending',
      decidedAt: 2,
      createdAt: 1
    }
    const asset: OfflineAsset = {
      id: 'asset-1',
      sourceItemId: 'offline-item-1',
      originalSourceItemId: item.id,
      locator: { provider: 'managed-offline', cacheId: 'cache-1', assetId: 'asset-1', relativePath: 'Offline/asset-1.mp4' },
      vaultRelativePath: 'Offline/asset-1.mp4',
      availability: 'offline',
      isPinned: true,
      policyReason: 'user-pinned',
      size: 1024,
      technicalMetadata: { codec: 'h265', width: 1280, height: 720 },
      optimizerProfile: { profile: 'balanced' },
      validationStatus: 'valid',
      lastValidatedAt: 2,
      lastAccessedAt: 3,
      createdAt: 1,
      updatedAt: 1
    }
    const syncRun: SourceSyncRun = {
      id: 'sync-1',
      sourceId: source.id,
      sourceRootId: root.id,
      trigger: 'manual',
      status: 'completed',
      startedAt: 1,
      completedAt: 2
    }

    expect({ source, root, item, link, candidate, asset, syncRun }).toMatchObject({
      source: { provider: 'local-folder' },
      root: { locator: { provider: 'local-folder' } },
      item: {
        sourceId: 'source-1',
        provider: 'local-folder',
        locator: { provider: 'local-folder' }
      },
      link: { isManual: true, isPreferred: true },
      syncRun: { sourceId: 'source-1', trigger: 'manual' },
      asset: {
        locator: { provider: 'managed-offline' },
        vaultRelativePath: 'Offline/asset-1.mp4',
        optimizerProfile: { profile: 'balanced' }
      }
    })
  })

  it('rejects source items whose provider does not match their locator', () => {
    if (false) {
      const mismatchedItem = {
        id: 'item-2',
        sourceId: 'source-1',
        sourceRootId: 'root-1',
        provider: 'local-folder' as const,
        locator: {
          provider: 'google-drive' as const,
          accountId: 'account-1',
          itemId: 'file-2'
        },
        relativePath: 'Módulo 1/Aula 2.mp4',
        name: 'Aula 2.mp4',
        availability: 'available' as const,
        createdAt: 1,
        updatedAt: 1
      }

      // @ts-expect-error A local-folder item cannot carry a Google Drive locator.
      const rejectedItem: SourceItem = mismatchedItem
      expect(rejectedItem).toBeUndefined()
    }
  })

  it('requires stable volume identity for removable roots and items', () => {
    const source: SourceDefinition = {
      id: 'source-removable',
      provider: 'removable',
      displayName: 'SSD externo',
      availability: 'available',
      createdAt: 1,
      updatedAt: 1
    }
    const root: SourceRoot = {
      id: 'root-removable',
      sourceId: source.id,
      locator: { provider: 'removable', path: 'E:/Cursos', volumeId: 'volume-123' },
      availability: 'available',
      createdAt: 1,
      updatedAt: 1
    }
    const item: SourceItem = {
      id: 'item-removable',
      sourceId: source.id,
      sourceRootId: root.id,
      provider: 'removable',
      locator: {
        provider: 'removable',
        path: 'E:/Cursos/Aula.mp4',
        volumeId: 'volume-123'
      },
      relativePath: 'Aula.mp4',
      name: 'Aula.mp4',
      availability: 'available',
      createdAt: 1,
      updatedAt: 1
    }

    expect({ root, item }).toMatchObject({
      root: { locator: { provider: 'removable', volumeId: 'volume-123' } },
      item: {
        sourceId: 'source-removable',
        provider: 'removable',
        locator: { provider: 'removable', volumeId: 'volume-123' }
      }
    })

    if (false) {
      // @ts-expect-error Removable roots require a stable volume identity.
      const rootWithoutVolume: SourceRootLocator = { provider: 'removable', path: 'E:/Cursos' }
      // @ts-expect-error Removable items require the same stable volume identity.
      const itemWithoutVolume: SourceItemLocator = {
        provider: 'removable',
        path: 'E:/Cursos/Aula.mp4'
      }
      expect({ rootWithoutVolume, itemWithoutVolume }).toBeUndefined()
    }
  })
})
