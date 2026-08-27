import type {
  SemanticChunkLocator,
  SemanticIndexGenerationStatus,
  SemanticSourceKind
} from './semantic-index'

export type GroundedScope =
  | { type: 'lesson'; lessonId: string }
  | { type: 'module'; moduleId: string }
  | { type: 'course'; courseId: string }
  | { type: 'vault' }

export interface RetrievalMoment {
  lessonId: string
  timestampSeconds: number
}

export interface TranscriptSelection {
  lessonId: string
  text: string
  startTime?: number
  endTime?: number
}

export interface HybridRetrievalRequest {
  query: string
  scope: GroundedScope
  moment?: RetrievalMoment
  selection?: TranscriptSelection
  limit?: number
  cloudConsent?: boolean
}

export interface RetrievedChunk {
  chunkId: string
  sourceKind: SemanticSourceKind
  sourceId: string
  courseId: string
  moduleId?: string
  lessonId?: string
  resourceId?: string
  transcriptId?: string
  noteId?: string
  sourceRevision: string
  text: string
  locator: SemanticChunkLocator
  lexicalScore?: number
  semanticScore?: number
  relevanceScore: number
}

export interface IndexCoverage {
  generationId?: string
  status: SemanticIndexGenerationStatus | 'none'
  indexedChunks: number
  indexedSources: number
  failedSources: number
}

export interface HybridRetrievalResult {
  sources: RetrievedChunk[]
  coverage: IndexCoverage
  semanticUsed: boolean
}
