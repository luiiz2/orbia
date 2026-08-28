import type {
  AiCapability,
  AiModel,
  AiProviderConfig,
  AiProviderHealth
} from '../../../../types/ai'
import {
  AiProviderError,
  HttpAiProvider,
  normalizeContent,
  normalizeModelCapabilities,
  normalizeProviderUsage,
  type AiFetch,
  type AiProviderChatRequest,
  type AiProviderEmbeddingRequest
} from '../ai-provider'

const OLLAMA_CAPABILITIES = [
  'CHAT',
  'EMBEDDINGS',
  'STRUCTURED_OUTPUT'
] as const satisfies readonly AiCapability[]
const UNKNOWN_MODEL_CAPABILITIES = [
  'CHAT'
] as const satisfies readonly AiCapability[]

export class OllamaProvider extends HttpAiProvider {
  public readonly providerId = 'ollama' as const
  public readonly kind = 'local' as const
  public readonly capabilities = OLLAMA_CAPABILITIES

  constructor(config: AiProviderConfig, fetchImpl?: AiFetch) {
    super(config, undefined, fetchImpl)
  }

  public async discoverModels(): Promise<AiModel[]> {
    const payload = (await this.requestJson('/api/tags')) as {
      models?: unknown
    }
    if (!Array.isArray(payload.models)) return []

    return payload.models.flatMap((value): AiModel[] => {
      if (!value || typeof value !== 'object') return []
      const model = value as Record<string, unknown>
      const id = typeof model.name === 'string' ? model.name.trim() : ''
      if (!id) return []
      const details =
        model.details && typeof model.details === 'object'
          ? (model.details as Record<string, unknown>)
          : undefined
      const rawCapabilities = model.capabilities ?? details?.capabilities
      return [
        {
          id,
          providerId: this.providerId,
          capabilities: normalizeModelCapabilities(
            rawCapabilities,
            UNKNOWN_MODEL_CAPABILITIES
          )
        }
      ]
    })
  }

  public async health(modelId?: string): Promise<AiProviderHealth> {
    if (!this.config.enabled)
      return {
        providerId: this.providerId,
        status: 'DISABLED',
        ...(modelId ? { modelId } : {})
      }
    try {
      const models = await this.discoverModels()
      if (modelId && !models.some((model) => model.id === modelId)) {
        return {
          providerId: this.providerId,
          status: 'MODEL_MISSING',
          modelId,
          message: 'AI model was not found'
        }
      }
      return {
        providerId: this.providerId,
        status: 'AVAILABLE',
        ...(modelId ? { modelId } : {})
      }
    } catch (error) {
      return this.healthFromError(error, modelId)
    }
  }

  public async chat(request: AiProviderChatRequest) {
    const payload = await this.requestJson(
      '/api/chat',
      {
        method: 'POST',
        body: JSON.stringify({
          model: request.modelId,
          messages: request.messages,
          stream: false,
          ...(request.structured ? { format: 'json' } : {})
        })
      },
      'model'
    )
    const message =
      payload && typeof payload === 'object'
        ? (payload as { message?: unknown }).message
        : undefined
    const content = normalizeContent(
      message && typeof message === 'object' && 'content' in message
        ? (message as { content?: unknown }).content
        : undefined
    )
    if (!content)
      throw new AiProviderError(
        'PROVIDER_ERROR',
        'AI provider returned an empty response',
        this.providerId
      )
    const usage = normalizeProviderUsage(payload)
    return {
      providerId: this.providerId,
      modelId: request.modelId,
      content,
      ...(usage ? { usage } : {})
    }
  }

  public async embed(request: AiProviderEmbeddingRequest) {
    const payload = await this.requestJson(
      '/api/embed',
      {
        method: 'POST',
        body: JSON.stringify({ model: request.modelId, input: request.input })
      },
      'model'
    )
    const value =
      payload && typeof payload === 'object'
        ? (payload as { embeddings?: unknown; embedding?: unknown })
        : {}
    const embeddings = Array.isArray(value.embeddings)
      ? value.embeddings
      : Array.isArray(value.embedding)
        ? [value.embedding]
        : []
    if (
      !embeddings.every(
        (embedding) =>
          Array.isArray(embedding) &&
          embedding.every((item) => typeof item === 'number')
      )
    ) {
      throw new AiProviderError(
        'PROVIDER_ERROR',
        'AI provider returned invalid embeddings',
        this.providerId
      )
    }
    const usage = normalizeProviderUsage(payload)
    return {
      providerId: this.providerId,
      modelId: request.modelId,
      embeddings: embeddings as number[][],
      ...(usage ? { usage } : {})
    }
  }
}
