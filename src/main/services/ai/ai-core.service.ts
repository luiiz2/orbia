import type { AppConfigService } from '../app-config.service'
import { appConfigService } from '../app-config.service'
import {
  AI_PROVIDER_IDS,
  type AiChatRequest,
  type AiChatResponse,
  type AiEmbeddingRequest,
  type AiEmbeddingResponse,
  type AiTranscriptionRequest,
  type AiTranscriptionResponse,
  type AiModel,
  type AiPrivacyMode,
  type AiProviderHealth,
  type AiProviderId,
  type AiProviderUpdate,
  type AiRoute,
  type AiSettingsSnapshot,
  type AiTask
} from '../../../types/ai'
import {
  ElectronAiCredentialStore,
  aiCredentialStore
} from './ai-credential.service'
import {
  assertPrivacyAllows,
  requiredCapabilityForTask,
  routeAssignments,
  shouldTryAiFallback,
  validateAssignmentCapability,
  validateRouteShape
} from './ai-routing.service'
import {
  AiProviderError,
  AiProviderRegistry,
  isAiProviderError,
  type AiFetch,
  type AiProviderAdapter
} from './ai-provider'
import { createAiProvider } from './providers'
import { buildAiPromptMessages } from './ai-prompts'
import { aiUsageService } from './ai-usage.service'
import type { AiUsageService } from './ai-usage.service'

export interface AiCoreConfig {
  config: Pick<
    AppConfigService,
    | 'getAiSettings'
    | 'updateAiProvider'
    | 'updateAiRoute'
    | 'setAiPrivacyMode'
    | 'setAiAllowedCloudDataTypes'
  >
  credentials: Pick<ElectronAiCredentialStore, 'get' | 'set' | 'clear'>
  providers?: AiProviderRegistry
  fetchImpl?: AiFetch
  usage?: Pick<AiUsageService, 'recordUsage'>
}

export class AiCoreService {
  private readonly registry?: AiProviderRegistry

  constructor(private readonly dependencies: AiCoreConfig) {
    this.registry = dependencies.providers
  }

  public getSettings(): AiSettingsSnapshot {
    return this.dependencies.config.getAiSettings()
  }

  public saveProvider(input: AiProviderUpdate): AiSettingsSnapshot {
    if (!AI_PROVIDER_IDS.includes(input.providerId)) {
      throw new AiProviderError('INVALID_CONFIGURATION', 'Unknown AI provider')
    }
    const current = this.getSettings().providers[input.providerId]
    if (!current)
      throw new AiProviderError('INVALID_CONFIGURATION', 'Unknown AI provider')
    this.validateBaseUrl(input.providerId, input.baseUrl)
    if (typeof input.enabled !== 'boolean') {
      throw new AiProviderError(
        'INVALID_CONFIGURATION',
        'AI provider enabled state is invalid',
        input.providerId
      )
    }
    if (input.apiKey !== undefined) {
      if (typeof input.apiKey !== 'string' || input.apiKey.length > 4096) {
        throw new AiProviderError(
          'INVALID_CONFIGURATION',
          'AI credential is invalid',
          input.providerId
        )
      }
      this.dependencies.credentials.set(input.providerId, input.apiKey)
    }
    return this.dependencies.config.updateAiProvider({
      providerId: input.providerId,
      baseUrl: input.baseUrl.trim().replace(/\/+$/, ''),
      enabled: input.enabled
    })
  }

  public setRoute(task: AiTask, route: AiRoute): AiSettingsSnapshot {
    validateRouteShape(task, route)
    return this.dependencies.config.updateAiRoute(task, route)
  }

  public setPrivacyMode(privacyMode: AiPrivacyMode): AiSettingsSnapshot {
    return this.dependencies.config.setAiPrivacyMode(privacyMode)
  }

  public setAllowedCloudDataTypes(
    dataTypes: readonly import('../../../types/ai').AiDataType[]
  ): AiSettingsSnapshot {
    return this.dependencies.config.setAiAllowedCloudDataTypes(dataTypes)
  }

  public async discoverModels(providerId: AiProviderId): Promise<AiModel[]> {
    const settings = this.getSettings()
    const config = settings.providers[providerId]
    if (!config)
      throw new AiProviderError('INVALID_CONFIGURATION', 'Unknown AI provider')
    assertPrivacyAllows(settings.privacyMode, config, {
      allowUnclassifiedCloud: true
    })
    if (!config.enabled)
      throw new AiProviderError(
        'PROVIDER_DISABLED',
        'AI provider is disabled',
        providerId
      )
    const provider = this.getProvider(providerId)
    return provider.discoverModels()
  }

  public async health(
    providerId: AiProviderId,
    modelId?: string
  ): Promise<AiProviderHealth> {
    const settings = this.getSettings()
    const config = settings.providers[providerId]
    if (!config)
      throw new AiProviderError('INVALID_CONFIGURATION', 'Unknown AI provider')
    if (!config.enabled)
      return { providerId, status: 'DISABLED', ...(modelId ? { modelId } : {}) }
    assertPrivacyAllows(settings.privacyMode, config, {
      allowUnclassifiedCloud: true
    })
    try {
      return await this.getProvider(providerId).health(modelId)
    } catch (error) {
      const normalized = this.normalizeError(error, providerId)
      const status =
        normalized.code === 'INVALID_CREDENTIALS'
          ? 'INVALID_CREDENTIALS'
          : normalized.code === 'CONNECTION_FAILED'
            ? 'CONNECTION_FAILED'
            : normalized.code === 'MODEL_MISSING'
              ? 'MODEL_MISSING'
              : normalized.code === 'CAPABILITY_UNSUPPORTED'
                ? 'CAPABILITY_UNSUPPORTED'
                : 'UNAVAILABLE'
      return {
        providerId,
        modelId,
        status,
        message: normalized.message
      }
    }
  }

  public chat(request: AiChatRequest): Promise<AiChatResponse> {
    return this.execute('chat', request, (provider, assignment) =>
      provider.chat({
        modelId: assignment.modelId,
        messages: buildAiPromptMessages(request.messages, request.promptKind),
        structured: request.structured
      })
    )
  }

  public summarize(request: AiChatRequest): Promise<AiChatResponse> {
    const settings = this.getSettings()
    const task: AiTask = settings.routes.summary?.primary ? 'summary' : 'chat'
    return this.execute(task, request, (provider, assignment) =>
      provider.chat({
        modelId: assignment.modelId,
        messages: buildAiPromptMessages(request.messages, request.promptKind),
        structured: request.structured
      })
    )
  }

  public generateChapters(request: AiChatRequest): Promise<AiChatResponse> {
    const settings = this.getSettings()
    const task: AiTask = settings.routes.chapters?.primary ? 'chapters' : 'chat'
    return this.execute(task, request, (provider, assignment) =>
      provider.chat({
        modelId: assignment.modelId,
        messages: buildAiPromptMessages(request.messages, request.promptKind),
        structured: request.structured
      })
    )
  }

  public embed(request: AiEmbeddingRequest): Promise<AiEmbeddingResponse> {
    return this.execute('embeddings', request, (provider, assignment) =>
      provider.embed({ modelId: assignment.modelId, input: request.input })
    )
  }

  public transcribe(
    request: AiTranscriptionRequest
  ): Promise<AiTranscriptionResponse> {
    const classifiedRequest = { ...request, dataTypes: ['transcript' as const] }
    return this.execute(
      'transcription',
      classifiedRequest,
      (provider, assignment) => {
        if (!provider.transcribe) {
          throw new AiProviderError(
            'CAPABILITY_UNSUPPORTED',
            'AI provider does not support transcription',
            assignment.providerId
          )
        }

        return provider.transcribe({
          modelId: assignment.modelId,
          audio: request.audio,
          ...(request.fileName ? { fileName: request.fileName } : {}),
          ...(request.mimeType ? { mimeType: request.mimeType } : {}),
          ...(request.language && !request.autoDetect
            ? { language: request.language }
            : {}),
          ...(request.autoDetect ? { autoDetect: true } : {}),
          ...(request.signal ? { signal: request.signal } : {})
        })
      }
    )
  }

  private async execute<T>(
    task: AiTask,
    request: {
      dataTypes?: readonly import('../../../types/ai').AiDataType[]
      cloudConsent?: boolean
      structured?: boolean
    },
    operation: (
      provider: AiProviderAdapter,
      assignment: import('../../../types/ai').AiModelAssignment
    ) => Promise<T>
  ): Promise<T> {
    const settings = this.getSettings()
    const assignments = routeAssignments(settings, task)
    if (assignments.length === 0) {
      throw new AiProviderError(
        'ROUTE_NOT_CONFIGURED',
        `No AI route configured for ${task}`
      )
    }

    let lastError: AiProviderError | null = null
    for (const assignment of assignments) {
      try {
        const providerConfig = settings.providers[assignment.providerId]
        if (!providerConfig)
          throw new AiProviderError(
            'INVALID_CONFIGURATION',
            'Unknown AI provider',
            assignment.providerId
          )
        assertPrivacyAllows(settings.privacyMode, providerConfig, {
          ...request,
          allowedDataTypes: settings.allowedCloudDataTypes
        })
        if (!providerConfig.enabled) {
          throw new AiProviderError(
            'PROVIDER_DISABLED',
            'AI provider is disabled',
            assignment.providerId
          )
        }
        const provider = this.getProvider(assignment.providerId)
        validateAssignmentCapability(
          task,
          assignment,
          provider,
          request.structured === true
        )
        const models = await provider.discoverModels()
        const model = models.find(
          (candidate) => candidate.id === assignment.modelId
        )
        if (!model)
          throw new AiProviderError(
            'MODEL_MISSING',
            'AI model was not found',
            assignment.providerId
          )
        if (
          !model.capabilities.includes(
            requiredCapabilityForTask(task, request.structured === true)
          )
        ) {
          throw new AiProviderError(
            'CAPABILITY_UNSUPPORTED',
            'AI model does not support the requested task',
            assignment.providerId
          )
        }
        const result = await operation(provider, assignment)
        if (result && typeof result === 'object') {
          const rec = result as Record<string, unknown>
          const usage = rec.usage as
            { promptTokens?: number; completionTokens?: number } | undefined
          ;(this.dependencies.usage ?? aiUsageService).recordUsage({
            promptTokens:
              typeof usage?.promptTokens === 'number'
                ? usage.promptTokens
                : undefined,
            completionTokens:
              typeof usage?.completionTokens === 'number'
                ? usage.completionTokens
                : undefined,
            transcriptionSeconds:
              typeof rec.durationSeconds === 'number'
                ? rec.durationSeconds
                : undefined,
            embeddedChunks: Array.isArray(rec.embeddings)
              ? rec.embeddings.length
              : undefined
          })
        }
        return result
      } catch (error) {
        lastError = this.normalizeError(error, assignment.providerId)
        if (
          !shouldTryAiFallback(lastError) ||
          assignment === assignments[assignments.length - 1]
        )
          throw lastError
      }
    }

    throw (
      lastError ?? new AiProviderError('PROVIDER_ERROR', 'AI operation failed')
    )
  }

  private getProvider(providerId: AiProviderId): AiProviderAdapter {
    const registered = this.registry?.get(providerId)
    if (registered) return registered
    const config = this.getSettings().providers[providerId]
    if (!config)
      throw new AiProviderError(
        'INVALID_CONFIGURATION',
        'Unknown AI provider',
        providerId
      )
    let credential: string | undefined
    try {
      credential = this.dependencies.credentials.get(providerId) ?? undefined
    } catch (error) {
      throw this.normalizeError(error, providerId)
    }
    return createAiProvider(config, credential, this.dependencies.fetchImpl)
  }

  private normalizeError(
    error: unknown,
    providerId: AiProviderId
  ): AiProviderError {
    if (isAiProviderError(error)) return error
    if (
      error instanceof Error &&
      error.message === 'Secure credential storage unavailable'
    ) {
      return new AiProviderError(
        'INVALID_CREDENTIALS',
        'Secure AI credential storage unavailable',
        providerId
      )
    }
    return new AiProviderError(
      'PROVIDER_ERROR',
      'AI provider operation failed',
      providerId
    )
  }

  private validateBaseUrl(providerId: AiProviderId, baseUrl: string): void {
    if (
      typeof baseUrl !== 'string' ||
      baseUrl.length === 0 ||
      baseUrl.length > 2048
    ) {
      throw new AiProviderError(
        'INVALID_CONFIGURATION',
        'AI provider URL is invalid',
        providerId
      )
    }
    try {
      const parsed = new URL(baseUrl)
      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
      )
        throw new Error()
      if (
        providerId === 'openai' &&
        (parsed.protocol !== 'https:' || parsed.hostname !== 'api.openai.com')
      )
        throw new Error()
      if (
        providerId === 'openrouter' &&
        (parsed.protocol !== 'https:' || parsed.hostname !== 'openrouter.ai')
      )
        throw new Error()
      if (
        providerId === 'nvidia' &&
        (parsed.protocol !== 'https:' ||
          parsed.hostname !== 'integrate.api.nvidia.com')
      )
        throw new Error()
      if (!['openai', 'openrouter', 'nvidia'].includes(providerId)) {
        const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()
        if (!['localhost', '127.0.0.1', '::1'].includes(hostname))
          throw new Error()
      }
    } catch {
      throw new AiProviderError(
        'INVALID_CONFIGURATION',
        'AI provider URL is invalid',
        providerId
      )
    }
  }
}

export const aiCoreService = new AiCoreService({
  config: appConfigService,
  credentials: aiCredentialStore
})
