export const SOURCE_PROVIDERS = [
  'local-folder',
  'removable',
  'google-drive',
  'managed-offline'
] as const

export type SourceProvider = (typeof SOURCE_PROVIDERS)[number]

export const SOURCE_AVAILABILITY = [
  'available',
  'offline',
  'disconnected',
  'auth-required',
  'missing',
  'syncing',
  'error',
  'relink-required'
] as const

export type SourceAvailability = (typeof SOURCE_AVAILABILITY)[number]

export interface SourceSummary {
  id: string
  provider: SourceProvider
  displayName: string
  availability: SourceAvailability
  preferenceWeight: number
  itemCount: number
  linkedItemCount: number
  availableItemCount: number
  missingItemCount: number
  lastSyncedAt?: number
}

export interface LocalFolderSourceRootLocator {
  provider: 'local-folder'
  path: string
}

export interface RemovableSourceRootLocator {
  provider: 'removable'
  path: string
  volumeId: string
}

export interface GoogleDriveSourceRootLocator {
  provider: 'google-drive'
  accountId: string
  folderId: string
  driveId?: string
}

export interface ManagedOfflineSourceRootLocator {
  provider: 'managed-offline'
  cacheId: string
}

export type SourceRootLocator =
  | LocalFolderSourceRootLocator
  | RemovableSourceRootLocator
  | GoogleDriveSourceRootLocator
  | ManagedOfflineSourceRootLocator

export interface LocalFolderSourceItemLocator {
  provider: 'local-folder'
  path: string
}

export interface RemovableSourceItemLocator {
  provider: 'removable'
  path: string
  volumeId: string
}

export interface GoogleDriveSourceItemLocator {
  provider: 'google-drive'
  accountId: string
  itemId: string
  driveId?: string
}

export interface ManagedOfflineSourceItemLocator {
  provider: 'managed-offline'
  cacheId: string
  assetId: string
  relativePath: string
}

export type SourceItemLocator =
  | LocalFolderSourceItemLocator
  | RemovableSourceItemLocator
  | GoogleDriveSourceItemLocator
  | ManagedOfflineSourceItemLocator

export interface SourceTechnicalMetadata {
  fileSize?: number
  mimeType?: string
  duration?: number
  width?: number
  height?: number
  codec?: string
  audioCodec?: string
  bitrate?: number
}

export interface SourceDefinition {
  id: string
  provider: SourceProvider
  displayName: string
  availability: SourceAvailability
  accountId?: string
  preferenceWeight?: number
  createdAt: number
  updatedAt: number
}

export interface SourceRoot {
  id: string
  sourceId: string
  locator: SourceRootLocator
  availability: SourceAvailability
  stableDeviceId?: string
  mountHint?: string
  relativeBase?: string
  syncCursor?: string
  syncCorpus?: Record<string, unknown>
  lastSyncedAt?: number
  lastVerifiedAt?: number
  providerConfig?: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

interface SourceItemBase {
  id: string
  sourceId: string
  sourceRootId: string
  relativePath: string
  name: string
  mimeType?: string
  size?: number
  revision?: string
  checksum?: string
  availability: SourceAvailability
  technicalMetadata?: SourceTechnicalMetadata
  createdAt: number
  updatedAt: number
}

export type SourceItem = SourceItemBase &
  (
    | { provider: 'local-folder'; locator: LocalFolderSourceItemLocator }
    | { provider: 'removable'; locator: RemovableSourceItemLocator }
    | { provider: 'google-drive'; locator: GoogleDriveSourceItemLocator }
    | { provider: 'managed-offline'; locator: ManagedOfflineSourceItemLocator }
  )

export type CanonicalSourceType = 'lesson' | 'content-resource'

export interface CanonicalSourceLink {
  id: string
  sourceItemId: string
  canonicalType: CanonicalSourceType
  canonicalId: string
  isManual: boolean
  isPreferred: boolean
  createdAt: number
  updatedAt: number
}

export type SourceMatchStatus = 'pending' | 'accepted' | 'rejected'

export interface SourceMatchCandidate {
  id: string
  sourceItemId: string
  canonicalType: CanonicalSourceType
  canonicalId: string
  confidence: number
  evidence?: Record<string, unknown>
  status: SourceMatchStatus
  decidedAt?: number
  createdAt: number
}

export type OfflineAssetValidationStatus = 'pending' | 'valid' | 'invalid'

export interface OfflineAsset {
  id: string
  sourceItemId: string
  originalSourceItemId?: string
  locator: ManagedOfflineSourceItemLocator
  vaultRelativePath: string
  availability: SourceAvailability
  isPinned?: boolean
  policyReason?: string
  size?: number
  technicalMetadata?: SourceTechnicalMetadata
  optimizerProfile?: Record<string, unknown>
  validationStatus?: OfflineAssetValidationStatus
  lastValidatedAt?: number
  lastAccessedAt?: number
  createdAt: number
  updatedAt: number
}

export type SourceSyncRunStatus =
  'running' | 'completed' | 'failed' | 'cancelled'

export type SourceSyncTrigger = 'manual' | 'startup' | 'periodic' | 'watch'

export interface SourceSyncResult {
  runId: string
  sourceId: string
  sourceRootId: string
  scannedItems: number
  changedItems: number
  completedAt: number
}

export interface SourceSnapshotItem {
  providerItemIdentity: string
  parentProviderIdentity?: string
  locator: SourceItemLocator
  name: string
  relativePath: string
  size: number
  availability: SourceAvailability
  mimeType?: string
  fingerprint?: string
  revision?: string
  checksum?: string
  technicalMetadata?: SourceTechnicalMetadata
}

export interface SourceSyncRun {
  id: string
  sourceId: string
  sourceRootId: string
  trigger: SourceSyncTrigger
  cursorBefore?: string
  cursorAfter?: string
  status: SourceSyncRunStatus
  scannedItems?: number
  changedItems?: number
  startedAt: number
  completedAt?: number
  error?: string
}
