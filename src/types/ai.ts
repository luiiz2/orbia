export const AI_CAPABILITIES = ['CHAT', 'EMBEDDINGS', 'TRANSCRIPTION', 'STRUCTURED_OUTPUT'] as const
export type AiCapability = (typeof AI_CAPABILITIES)[number]

export const AI_PROVIDER_IDS = ['ollama', 'openai-compatible', 'openai'] as const
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number]
export type AiProviderKind = 'local' | 'cloud'

export const AI_TASKS = ['chat', 'summary', 'embeddings', 'transcription', 'chapters'] as const
export type AiTask = (typeof AI_TASKS)[number]

export const AI_PROMPT_KINDS = ['commit', 'pull_request'] as const
export type AiPromptKind = (typeof AI_PROMPT_KINDS)[number]

export const AI_PRIVACY_MODES = ['LOCAL_ONLY', 'HYBRID', 'CLOUD_ALLOWED'] as const
export type AiPrivacyMode = (typeof AI_PRIVACY_MODES)[number]

export interface AiProviderConfig {
  providerId: AiProviderId
  kind: AiProviderKind
  displayName: string
  baseUrl: string
  enabled: boolean
  /** True when Main has an encrypted credential; the credential itself never crosses IPC. */
  apiKeyConfigured: boolean
}

export interface AiModel {
  id: string
  providerId: AiProviderId
  label?: string
  capabilities: AiCapability[]
}

export interface AiModelAssignment {
  providerId: AiProviderId
  modelId: string
  /** Cached discovery data for renderer display; Main revalidates it before use. */
  capabilities?: AiCapability[]
}

export interface AiRoute {
  primary: AiModelAssignment | null
  fallback: AiModelAssignment | null
}

export interface AiSettingsSnapshot {
  privacyMode: AiPrivacyMode
  /** Data categories explicitly allowed to be sent to cloud providers. */
  allowedCloudDataTypes: AiDataType[]
  providers: Record<AiProviderId, AiProviderConfig>
  routes: Record<AiTask, AiRoute>
}

export interface AiProviderUpdate {
  providerId: AiProviderId
  baseUrl: string
  enabled: boolean
  /** Write-only. Omitted preserves the existing credential; empty clears it. */
  apiKey?: string
}

export interface AiRouteUpdate {
  task: AiTask
  route: AiRoute
}

export type AiDataType =
  | 'transcript'
  | 'notes'
  | 'pdf'
  | 'materials'
  | 'course_name'
  | 'user_metadata'

export const AI_DATA_TYPES = ['transcript', 'notes', 'pdf', 'materials', 'course_name', 'user_metadata'] as const

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AiChatRequest {
  messages: AiChatMessage[]
  promptKind?: AiPromptKind
  structured?: boolean
  dataTypes?: AiDataType[]
  cloudConsent?: boolean
}

export type AiChatInput = AiChatRequest

export interface AiChatResponse {
  providerId: AiProviderId
  modelId: string
  content: string
}

export interface AiEmbeddingRequest {
  input: string | string[]
  dataTypes?: AiDataType[]
  cloudConsent?: boolean
}

export interface AiEmbeddingResponse {
  providerId: AiProviderId
  modelId: string
  embeddings: number[][]
}

export interface AiTranscriptionRequest {
  audio: Uint8Array
  fileName?: string
  mimeType?: string
  language?: string
  autoDetect?: boolean
  cloudConsent?: boolean
  signal?: AbortSignal
}

export interface AiTranscriptionSegment {
  start: number
  end: number
  text: string
}

export interface AiTranscriptionResponse {
  providerId: AiProviderId
  modelId: string
  language?: string
  text: string
  segments: AiTranscriptionSegment[]
}

export type AiProviderHealthStatus =
  | 'AVAILABLE'
  | 'UNAVAILABLE'
  | 'MODEL_MISSING'
  | 'CAPABILITY_UNSUPPORTED'
  | 'CONNECTION_FAILED'
  | 'INVALID_CREDENTIALS'
  | 'DISABLED'

export interface AiProviderHealth {
  providerId: AiProviderId
  status: AiProviderHealthStatus
  modelId?: string
  message?: string
}

export type AiProviderErrorCode =
  | 'CONNECTION_FAILED'
  | 'INVALID_CREDENTIALS'
  | 'MODEL_MISSING'
  | 'CAPABILITY_UNSUPPORTED'
  | 'PRIVACY_BLOCKED'
  | 'ROUTE_NOT_CONFIGURED'
  | 'PROVIDER_DISABLED'
  | 'INVALID_CONFIGURATION'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_ERROR'

export function createDefaultAiSettings(): AiSettingsSnapshot {
  return {
    privacyMode: 'LOCAL_ONLY',
    allowedCloudDataTypes: [],
    providers: {
      ollama: {
        providerId: 'ollama',
        kind: 'local',
        displayName: 'Ollama',
        baseUrl: 'http://127.0.0.1:11434',
        enabled: true,
        apiKeyConfigured: false
      },
      'openai-compatible': {
        providerId: 'openai-compatible',
        kind: 'local',
        displayName: 'Local OpenAI-compatible',
        baseUrl: 'http://127.0.0.1:1234/v1',
        enabled: false,
        apiKeyConfigured: false
      },
      openai: {
        providerId: 'openai',
        kind: 'cloud',
        displayName: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        enabled: false,
        apiKeyConfigured: false
      }
    },
    routes: {
      chat: { primary: null, fallback: null },
      summary: { primary: null, fallback: null },
      embeddings: { primary: null, fallback: null },
      transcription: { primary: null, fallback: null },
      chapters: { primary: null, fallback: null }
    }
  }
}
