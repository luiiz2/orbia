import type { AiDataType, AiProviderId } from './ai'
import type { TranscriptSegment } from './transcription'

export const SEMANTIC_INDEX_CHUNKING_VERSION = 'semantic-chunk-v1' as const

export type SemanticSourceKind =
  | 'transcript'
  | 'subtitle'
  | 'pdf'
  | 'markdown'
  | 'text'
  | 'code'
  | 'note'
  | 'metadata'

export type SemanticIndexScope =
  | { type: 'lesson'; lessonId: string }
  | { type: 'course'; courseId: string }
  | { type: 'vault' }
  | {
      type: 'selected'
      lessonIds?: string[]
      resourceIds?: string[]
      noteIds?: string[]
    }

export type SemanticIndexGenerationStatus =
  | 'building'
  | 'partial'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface SemanticChunkLocator {
  page?: number
  startLine?: number
  endLine?: number
  fileName?: string
  language?: string
  transcriptId?: string
  resourceId?: string
  noteId?: string
  startTime?: number
  endTime?: number
}

export interface SemanticSourceDescriptor {
  sourceKind: SemanticSourceKind
  /** Stable logical identity; it does not contain a physical path. */
  sourceId: string
  courseId: string
  moduleId?: string
  lessonId?: string
  resourceId?: string
  transcriptId?: string
  noteId?: string
  dataType: AiDataType
  filePath?: string
  fileName?: string
  fileExtension?: string
  language?: string
  sourceRevision?: string
  contentRevision?: string
  text?: string
  segments?: TranscriptSegment[]
  locator: SemanticChunkLocator
}

export interface ExtractedSemanticDocument extends SemanticSourceDescriptor {
  sourceRevision: string
  contentRevision: string
  text: string
}

export interface SemanticChunkDraft {
  sourceKind: SemanticSourceKind
  sourceId: string
  courseId: string
  moduleId?: string
  lessonId?: string
  resourceId?: string
  transcriptId?: string
  noteId?: string
  sourceRevision: string
  contentRevision: string
  dataType: AiDataType
  text: string
  locator: SemanticChunkLocator
  startTime?: number
  endTime?: number
}

export interface SemanticIndexChunk extends SemanticChunkDraft {
  id: string
  generationId: string
  createdAt: number
}

export interface SemanticIndexGeneration {
  id: string
  status: SemanticIndexGenerationStatus
  providerId?: AiProviderId
  modelId?: string
  dimensions?: number
  chunkingVersion: string
  createdAt: number
  completedAt?: number
  totalSources: number
  discoveredSources: number
  extractedChunks: number
  embeddedChunks: number
  indexedChunks: number
  failedSources: number
  storageTextBytes: number
  storageVectorBytes: number
  errorMessage?: string
  isCurrent: boolean
}

export interface SemanticIndexSettings {
  includeNotes: boolean
}

export interface SemanticIndexMetrics {
  currentGenerationId?: string
  status?: SemanticIndexGenerationStatus
  providerId?: AiProviderId
  modelId?: string
  dimensions?: number
  chunkCount: number
  sourceCount: number
  failedSources: number
  storageTextBytes: number
  storageVectorBytes: number
  totalStorageBytes: number
}

export interface SemanticIndexStatus {
  current: SemanticIndexGeneration | null
  latest: SemanticIndexGeneration | null
  settings: SemanticIndexSettings
}

export interface SemanticIndexEnqueueInput {
  scope: SemanticIndexScope
  rebuild?: boolean
  includeNotes?: boolean
  cloudConsent?: boolean
}

export interface SemanticSourceSelection {
  lessonId?: string
  resourceId?: string
  noteId?: string
}

export interface SemanticIndexProgress {
  status: 'indexing' | 'partial' | 'completed' | 'failed' | 'cancelled' | 'queued'
  progressPercent: number
  errorMessage?: string
}
