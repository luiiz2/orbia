import type { AiProviderId } from './ai'
import type { SemanticChunkLocator, SemanticSourceKind } from './semantic-index'
import type {
  GroundedScope,
  IndexCoverage,
  RetrievalMoment,
  TranscriptSelection
} from './retrieval'

export type GroundedChatStatus =
  'answered' | 'insufficient_evidence' | 'failed' | 'cancelled'

export interface GroundedChatRequest {
  /** Renderer-generated ID, bounded and validated by Main IPC before use. */
  requestId: string
  question: string
  scope: GroundedScope
  conversationId?: string
  moment?: RetrievalMoment
  selection?: TranscriptSelection
  cloudConsent?: boolean
}

export interface GroundedChatResponse {
  conversationId: string
  messageId: string
  status: GroundedChatStatus
  answer: string
  sources: ChatMessageSource[]
  coverage: IndexCoverage
}

export type ChatMessageRole = 'user' | 'assistant'

export interface ChatConversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface ChatConversationSummary {
  id: string
  title: string
  messageCount: number
  createdAt: number
  updatedAt: number
}

export interface ChatMessage {
  id: string
  conversationId: string
  role: ChatMessageRole
  content: string
  scope?: GroundedScope
  status?: GroundedChatStatus
  providerId?: AiProviderId
  modelId?: string
  sources: ChatMessageSource[]
  createdAt: number
}

export interface ChatMessageSource {
  id: string
  messageId: string
  ordinal: number
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
  locator: SemanticChunkLocator
  displayLabel: string
}

export interface SourceNavigationRequest {
  sourceId: string
}

/** Main derives this target from a validated source snapshot; paths are not accepted. */
export type SourceNavigationTarget =
  | {
      type: 'lesson'
      courseId: string
      moduleId?: string
      lessonId: string
      timestampSeconds?: number
    }
  | {
      type: 'resource'
      courseId: string
      moduleId?: string
      lessonId?: string
      resourceId: string
      /** Only a positive PDF page may be returned by Main. */
      page?: number
    }

export type SourceNavigationResult =
  | { status: 'ok'; target: SourceNavigationTarget }
  | { status: 'unavailable'; reason: string }
