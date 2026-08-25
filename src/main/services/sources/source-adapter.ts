import type { Readable } from 'node:stream'
import path from 'node:path'
import type {
  SourceAvailability,
  SourceItemLocator,
  SourceProvider,
  SourceRootLocator,
  SourceTechnicalMetadata
} from '../../../types/source'

export interface ByteRange {
  start: number
  end: number
}

export interface SourceReadHandle {
  stream: Readable
  status: 200 | 206
  mimeType?: string
  totalSize: number
  contentRange?: ByteRange
  seekable: boolean
}

export interface SourceAdapterItem {
  locator: SourceItemLocator
  name: string
  relativePath: string
  size: number
  availability: SourceAvailability
  mimeType?: string
  technicalMetadata?: SourceTechnicalMetadata
}

export interface SourceChangeBatch {
  items: SourceAdapterItem[]
}

export interface SourceRootIdentity {
  providerRootIdentity: string
  displayName: string
  availability: SourceAvailability
  stableDeviceId?: string
  mountHint?: string
}

export interface SourceAdapter {
  readonly provider: SourceProvider
  identifyRoot(locator: SourceRootLocator): Promise<SourceRootIdentity>
  reconcile(input: {
    root: SourceRootLocator
  }): AsyncIterable<SourceChangeBatch>
  open(item: SourceItemLocator, range?: ByteRange): Promise<SourceReadHandle>
  probe(item: SourceItemLocator): Promise<SourceTechnicalMetadata>
}

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.pdf': 'application/pdf'
}

export function getSourceFileTechnicalMetadata(
  filePath: string,
  fileSize: number
): SourceTechnicalMetadata {
  const mimeType = MIME_TYPES[path.extname(filePath).toLowerCase()]
  return {
    fileSize,
    ...(mimeType ? { mimeType } : {})
  }
}
