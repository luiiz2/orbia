import type { AiCapability, AiModel, AiProviderConfig, AiProviderHealth, AiTranscriptionResponse } from '../../../../types/ai'
import {
  AiProviderError,
  HttpAiProvider,
  normalizeContent,
  normalizeModelCapabilities,
  type AiFetch,
  type AiProviderChatRequest,
  type AiProviderEmbeddingRequest,
  type AiProviderTranscriptionRequest
} from '../ai-provider'

const OPENAI_COMPATIBLE_CAPABILITIES = ['CHAT', 'EMBEDDINGS', 'TRANSCRIPTION', 'STRUCTURED_OUTPUT'] as const satisfies readonly AiCapability[]
const UNKNOWN_MODEL_CAPABILITIES = ['CHAT'] as const satisfies readonly AiCapability[]

function isCloudConfig(config: AiProviderConfig): boolean {
  return config.kind === 'cloud' || config.providerId === 'openai'
}

export class OpenAICompatibleProvider extends HttpAiProvider {
  public readonly providerId: AiProviderConfig['providerId']
  public readonly kind: AiProviderConfig['kind']
  public readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES

  constructor(config: AiProviderConfig, apiKey?: string, fetchImpl?: AiFetch) {
    super(config, apiKey, fetchImpl)
    this.providerId = config.providerId
    this.kind = config.kind
  }

  public async discoverModels(): Promise<AiModel[]> {
    if (isCloudConfig(this.config) && !this.apiKey) {
      throw new AiProviderError('INVALID_CREDENTIALS', 'AI provider credentials are not configured', this.providerId)
    }
    const payload = (await this.requestJson('/models')) as { data?: unknown }
    if (!Array.isArray(payload.data)) return []

    return payload.data.flatMap((value): AiModel[] => {
      if (!value || typeof value !== 'object') return []
      const model = value as Record<string, unknown>
      const id = typeof model.id === 'string' ? model.id.trim() : ''
      if (!id) return []
      const metadata = model.metadata && typeof model.metadata === 'object' ? (model.metadata as Record<string, unknown>) : undefined
      const rawCapabilities = model.capabilities ?? metadata?.capabilities
      return [{
        id,
        providerId: this.providerId,
        capabilities: normalizeModelCapabilities(rawCapabilities, UNKNOWN_MODEL_CAPABILITIES)
      }]
    })
  }

  public async health(modelId?: string): Promise<AiProviderHealth> {
    if (!this.config.enabled) return { providerId: this.providerId, status: 'DISABLED', ...(modelId ? { modelId } : {}) }
    if (isCloudConfig(this.config) && !this.apiKey) {
      return { providerId: this.providerId, status: 'INVALID_CREDENTIALS', ...(modelId ? { modelId } : {}), message: 'AI provider credentials are not configured' }
    }
    try {
      const models = await this.discoverModels()
      if (modelId && !models.some((model) => model.id === modelId)) {
        return { providerId: this.providerId, status: 'MODEL_MISSING', modelId, message: 'AI model was not found' }
      }
      return { providerId: this.providerId, status: 'AVAILABLE', ...(modelId ? { modelId } : {}) }
    } catch (error) {
      return this.healthFromError(error, modelId)
    }
  }

  public async chat(request: AiProviderChatRequest) {
    const payload = await this.requestJson(
      '/chat/completions',
      {
        method: 'POST',
        body: JSON.stringify({
          model: request.modelId,
          messages: request.messages,
          ...(request.structured ? { response_format: { type: 'json_object' } } : {})
        })
      },
      'model'
    )
    const choices = payload && typeof payload === 'object' && Array.isArray((payload as { choices?: unknown }).choices)
      ? (payload as { choices: unknown[] }).choices
      : []
    const first = choices[0]
    const message = first && typeof first === 'object' ? (first as { message?: unknown }).message : undefined
    const content = normalizeContent(message && typeof message === 'object' && 'content' in message ? (message as { content?: unknown }).content : undefined)
    if (!content) throw new AiProviderError('PROVIDER_ERROR', 'AI provider returned an empty response', this.providerId)
    return { providerId: this.providerId, modelId: request.modelId, content }
  }

  public async embed(request: AiProviderEmbeddingRequest) {
    const payload = await this.requestJson(
      '/embeddings',
      {
        method: 'POST',
        body: JSON.stringify({ model: request.modelId, input: request.input })
      },
      'model'
    )
    const data = payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : []
    const embeddings = data
      .map((item) => item && typeof item === 'object' ? (item as { embedding?: unknown }).embedding : undefined)
      .filter((embedding): embedding is number[] => Array.isArray(embedding) && embedding.every((item) => typeof item === 'number'))
    if (embeddings.length !== data.length) {
      throw new AiProviderError('PROVIDER_ERROR', 'AI provider returned invalid embeddings', this.providerId)
    }
    return { providerId: this.providerId, modelId: request.modelId, embeddings }
  }

  public async transcribe(request: AiProviderTranscriptionRequest): Promise<AiTranscriptionResponse> {
    const form = new FormData()
    const fileName = request.fileName?.trim() || 'audio.wav'
    const mimeType = request.mimeType?.trim() || 'audio/wav'
    form.append('file', new Blob([request.audio as unknown as BlobPart], { type: mimeType }), fileName)
    form.append('model', request.modelId)
    form.append('response_format', 'verbose_json')
    if (request.language && !request.autoDetect) form.append('language', request.language)

    const payload = await this.requestMultipart('/audio/transcriptions', form, request.signal)
    const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
    const text = typeof record.text === 'string' ? record.text.trim() : ''
    const language = typeof record.language === 'string' ? record.language : undefined
    const rawSegments = Array.isArray(record.segments) ? record.segments : []
    const segments = rawSegments.map((value) => {
      if (!value || typeof value !== 'object') return null
      const segment = value as Record<string, unknown>
      const start = typeof segment.start === 'number' ? segment.start : Number(segment.start)
      const end = typeof segment.end === 'number' ? segment.end : Number(segment.end)
      const segmentText = typeof segment.text === 'string' ? segment.text.trim() : ''
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || !segmentText) return null
      return { start, end, text: segmentText }
    })

    if (!text || segments.length === 0 || segments.some((segment) => segment === null)) {
      throw new AiProviderError('PROVIDER_ERROR', 'AI provider returned incomplete transcription segments', this.providerId)
    }

    return {
      providerId: this.providerId,
      modelId: request.modelId,
      ...(language ? { language } : {}),
      text,
      segments: segments as NonNullable<(typeof segments)[number]>[]
    }
  }
}

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor(config: AiProviderConfig, apiKey: string | undefined, fetchImpl?: AiFetch) {
    super({ ...config, providerId: 'openai', kind: 'cloud' }, apiKey, fetchImpl)
  }
}
