import type {
  AiCapability,
  AiChatMessage,
  AiChatResponse,
  AiTranscriptionResponse,
  AiEmbeddingResponse,
  AiModel,
  AiProviderConfig,
  AiProviderErrorCode,
  AiProviderHealth,
  AiProviderId,
  AiProviderUsage
} from '../../../types/ai'

const AI_REQUEST_TIMEOUT_MS = 15_000

export type AiFetch = typeof fetch

export interface AiProviderChatRequest {
  modelId: string
  messages: AiChatMessage[]
  structured?: boolean
}

export interface AiProviderEmbeddingRequest {
  modelId: string
  input: string | string[]
}

export interface AiProviderTranscriptionRequest {
  modelId: string
  audio: Uint8Array
  fileName?: string
  mimeType?: string
  language?: string
  autoDetect?: boolean
  signal?: AbortSignal
}

export interface AiProviderAdapter {
  readonly providerId: AiProviderId
  readonly kind: AiProviderConfig['kind']
  readonly capabilities: readonly AiCapability[]
  discoverModels(): Promise<AiModel[]>
  health(modelId?: string): Promise<AiProviderHealth>
  chat(request: AiProviderChatRequest): Promise<AiChatResponse>
  embed(request: AiProviderEmbeddingRequest): Promise<AiEmbeddingResponse>
  transcribe?(
    request: AiProviderTranscriptionRequest
  ): Promise<AiTranscriptionResponse>
}

export class AiProviderRegistry {
  private readonly providers = new Map<AiProviderId, AiProviderAdapter>()

  constructor(adapters: AiProviderAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter)
  }

  public register(adapter: AiProviderAdapter): void {
    this.providers.set(adapter.providerId, adapter)
  }

  public get(providerId: AiProviderId): AiProviderAdapter | undefined {
    return this.providers.get(providerId)
  }

  public list(): AiProviderAdapter[] {
    return [...this.providers.values()]
  }
}

export class AiProviderError extends Error {
  public readonly name = 'AiProviderError'

  constructor(
    public readonly code: AiProviderErrorCode,
    message: string,
    public readonly providerId?: AiProviderId,
    public readonly status?: number
  ) {
    super(message)
  }
}

export function isAiProviderError(error: unknown): error is AiProviderError {
  return error instanceof AiProviderError
}

export function normalizeModelCapabilities(
  raw: unknown,
  fallback: readonly AiCapability[]
): AiCapability[] {
  if (!Array.isArray(raw)) return [...fallback]

  const capabilities = new Set<AiCapability>()
  for (const value of raw) {
    if (typeof value !== 'string') continue
    const capability = value.toUpperCase().replace(/[-\s]/g, '_')
    if (
      capability === 'CHAT' ||
      capability === 'COMPLETION' ||
      capability === 'GENERATE'
    ) {
      capabilities.add('CHAT')
    } else if (capability === 'EMBEDDING' || capability === 'EMBEDDINGS') {
      capabilities.add('EMBEDDINGS')
    } else if (capability === 'TRANSCRIPTION' || capability === 'TRANSCRIBE') {
      capabilities.add('TRANSCRIPTION')
    } else if (
      capability === 'STRUCTURED_OUTPUT' ||
      capability === 'STRUCTURED'
    ) {
      capabilities.add('STRUCTURED_OUTPUT')
    }
  }

  return capabilities.size > 0 ? [...capabilities] : [...fallback]
}

export function normalizeContent(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && 'text' in part) {
          const text = (part as { text?: unknown }).text
          return typeof text === 'string' ? text : ''
        }
        return ''
      })
      .join('')
  }
  return value == null ? '' : JSON.stringify(value)
}

export function normalizeProviderUsage(
  payload: unknown
): AiProviderUsage | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const root = payload as Record<string, unknown>
  const nested =
    root.usage && typeof root.usage === 'object'
      ? (root.usage as Record<string, unknown>)
      : {}
  const promptTokens = nonNegativeNumber(
    nested.prompt_tokens ?? nested.promptTokens ?? root.prompt_eval_count
  )
  const completionTokens = nonNegativeNumber(
    nested.completion_tokens ?? nested.completionTokens ?? root.eval_count
  )
  const explicitTotal = nonNegativeNumber(
    nested.total_tokens ?? nested.totalTokens
  )
  const totalTokens =
    explicitTotal ??
    (promptTokens !== undefined || completionTokens !== undefined
      ? (promptTokens ?? 0) + (completionTokens ?? 0)
      : undefined)
  if (
    promptTokens === undefined &&
    completionTokens === undefined &&
    totalTokens === undefined
  )
    return undefined
  return {
    ...(promptTokens === undefined ? {} : { promptTokens }),
    ...(completionTokens === undefined ? {} : { completionTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens })
  }
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined
}

export abstract class HttpAiProvider implements AiProviderAdapter {
  public abstract readonly providerId: AiProviderId
  public abstract readonly kind: AiProviderConfig['kind']
  public abstract readonly capabilities: readonly AiCapability[]

  protected readonly baseUrl: string
  protected readonly apiKey?: string
  protected readonly fetchImpl: AiFetch

  protected constructor(
    protected readonly config: AiProviderConfig,
    apiKey: string | undefined,
    fetchImpl?: AiFetch
  ) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.apiKey = apiKey
    this.fetchImpl = fetchImpl ?? fetch
  }

  public abstract discoverModels(): Promise<AiModel[]>
  public abstract health(modelId?: string): Promise<AiProviderHealth>
  public abstract chat(request: AiProviderChatRequest): Promise<AiChatResponse>
  public abstract embed(
    request: AiProviderEmbeddingRequest
  ): Promise<AiEmbeddingResponse>

  public async transcribe(
    _request: AiProviderTranscriptionRequest
  ): Promise<AiTranscriptionResponse> {
    void _request
    throw new AiProviderError(
      'CAPABILITY_UNSUPPORTED',
      'AI provider does not support transcription',
      this.providerId
    )
  }

  protected async requestJson(
    path: string,
    init: RequestInit = {},
    context: 'discovery' | 'model' = 'discovery'
  ): Promise<unknown> {
    let response: Response
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS)
    try {
      const headers = new Headers(init.headers)
      headers.set('accept', 'application/json')
      if (init.body) headers.set('content-type', 'application/json')
      if (this.apiKey) headers.set('authorization', `Bearer ${this.apiKey}`)

      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal
      })
    } catch (error) {
      if (isAiProviderError(error)) throw error
      throw new AiProviderError(
        'CONNECTION_FAILED',
        'AI provider connection failed',
        this.providerId
      )
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      throw new AiProviderError(
        response.status === 401 || response.status === 403
          ? 'INVALID_CREDENTIALS'
          : context === 'model' && response.status === 404
            ? 'MODEL_MISSING'
            : 'PROVIDER_ERROR',
        this.publicErrorForStatus(response.status, context),
        this.providerId,
        response.status
      )
    }

    try {
      return await response.json()
    } catch {
      throw new AiProviderError(
        'PROVIDER_ERROR',
        'AI provider returned an invalid response',
        this.providerId,
        response.status
      )
    }
  }

  protected async requestMultipart(
    path: string,
    body: FormData,
    signal?: AbortSignal
  ): Promise<unknown> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS)
    const abortFromCaller = (): void => controller.abort()

    if (signal?.aborted) controller.abort()
    signal?.addEventListener('abort', abortFromCaller, { once: true })

    let response: Response
    try {
      const headers = new Headers({ accept: 'application/json' })
      if (this.apiKey) headers.set('authorization', `Bearer ${this.apiKey}`)
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        body,
        headers,
        signal: controller.signal
      })
    } catch (error) {
      if (isAiProviderError(error)) throw error
      if (signal?.aborted)
        throw new AiProviderError(
          'PROVIDER_ERROR',
          'AI transcription was cancelled',
          this.providerId
        )
      throw new AiProviderError(
        'CONNECTION_FAILED',
        'AI provider connection failed',
        this.providerId
      )
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abortFromCaller)
    }

    if (!response.ok) {
      throw new AiProviderError(
        response.status === 401 || response.status === 403
          ? 'INVALID_CREDENTIALS'
          : response.status === 404
            ? 'MODEL_MISSING'
            : 'PROVIDER_ERROR',
        this.publicErrorForStatus(response.status, 'model'),
        this.providerId,
        response.status
      )
    }

    try {
      return await response.json()
    } catch {
      throw new AiProviderError(
        'PROVIDER_ERROR',
        'AI provider returned an invalid response',
        this.providerId,
        response.status
      )
    }
  }

  protected healthFromError(
    error: unknown,
    modelId?: string
  ): AiProviderHealth {
    if (isAiProviderError(error)) {
      const status =
        error.code === 'INVALID_CREDENTIALS'
          ? 'INVALID_CREDENTIALS'
          : error.code === 'MODEL_MISSING'
            ? 'MODEL_MISSING'
            : error.code === 'CONNECTION_FAILED'
              ? 'CONNECTION_FAILED'
              : 'UNAVAILABLE'
      return {
        providerId: this.providerId,
        status,
        ...(modelId ? { modelId } : {}),
        message: error.message
      }
    }
    return {
      providerId: this.providerId,
      status: 'UNAVAILABLE',
      ...(modelId ? { modelId } : {}),
      message: 'AI provider unavailable'
    }
  }

  private publicErrorForStatus(
    status: number,
    context: 'discovery' | 'model'
  ): string {
    if (status === 401 || status === 403)
      return 'AI provider credentials were rejected'
    if (context === 'model' && status === 404) return 'AI model was not found'
    return 'AI provider request failed'
  }
}
