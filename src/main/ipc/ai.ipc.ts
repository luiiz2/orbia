import { ipcMain } from 'electron'
import {
  AI_CAPABILITIES,
  AI_DATA_TYPES,
  AI_PROMPT_KINDS,
  AI_PRIVACY_MODES,
  AI_PROVIDER_IDS,
  AI_TASKS,
  type AiChatInput,
  type AiDataType,
  type AiEmbeddingRequest,
  type AiModelAssignment,
  type AiPromptKind,
  type AiProviderUpdate,
  type AiRouteUpdate
} from '../../types/ai'
import { AiProviderError, aiCoreService, isAiProviderError } from '../services/ai'

export function registerAiIpc(): void {
  ipcMain.handle('ai:get-settings', () => run(() => aiCoreService.getSettings()))

  ipcMain.handle('ai:save-provider', (_event, payload: unknown) =>
    run(() => aiCoreService.saveProvider(parseProviderUpdate(payload)))
  )

  ipcMain.handle('ai:set-route', (_event, payload: unknown) =>
    run(() => {
      const input = parseRouteUpdate(payload)
      return aiCoreService.setRoute(input.task, input.route)
    })
  )

  ipcMain.handle('ai:set-privacy-mode', (_event, payload: unknown) =>
    run(() => aiCoreService.setPrivacyMode(parsePrivacyMode(payload)))
  )

  ipcMain.handle('ai:set-allowed-cloud-data-types', (_event, payload: unknown) =>
    run(() => aiCoreService.setAllowedCloudDataTypes(parseDataTypes(payload) ?? []))
  )

  ipcMain.handle('ai:discover-models', (_event, payload: unknown) =>
    run(() => aiCoreService.discoverModels(parseProviderId(payload)))
  )

  ipcMain.handle('ai:health', (_event, payload: unknown) =>
    run(() => {
      if (!payload || typeof payload !== 'object') throw invalid('Invalid AI health request')
      const value = payload as Record<string, unknown>
      const providerId = parseProviderId(value.providerId)
      if (value.modelId !== undefined && (typeof value.modelId !== 'string' || !value.modelId.trim() || value.modelId.length > 512)) {
        throw invalid('Invalid AI health request')
      }
      return aiCoreService.health(providerId, value.modelId as string | undefined)
    })
  )

  ipcMain.handle('ai:chat', (_event, payload: unknown) =>
    run(() => {
      const input = parseChatInput(payload)
      return aiCoreService.chat(input)
    })
  )

  ipcMain.handle('ai:embed', (_event, payload: unknown) =>
    run(() => aiCoreService.embed(parseEmbeddingRequest(payload)))
  )
}

function parseProviderUpdate(payload: unknown): AiProviderUpdate {
  if (!payload || typeof payload !== 'object') throw invalid('Invalid AI provider configuration')
  const value = payload as Record<string, unknown>
  const providerId = parseProviderId(value.providerId)
  if (typeof value.baseUrl !== 'string' || !value.baseUrl.trim() || value.baseUrl.length > 2048 || typeof value.enabled !== 'boolean') {
    throw invalid('Invalid AI provider configuration')
  }
  if (value.apiKey !== undefined && (typeof value.apiKey !== 'string' || value.apiKey.length > 4096)) {
    throw invalid('Invalid AI provider configuration')
  }
  return {
    providerId,
    baseUrl: value.baseUrl,
    enabled: value.enabled,
    ...(value.apiKey !== undefined ? { apiKey: value.apiKey } : {})
  }
}

function parseRouteUpdate(payload: unknown): AiRouteUpdate {
  if (!payload || typeof payload !== 'object') throw invalid('Invalid AI route configuration')
  const value = payload as Record<string, unknown>
  if (typeof value.task !== 'string' || !AI_TASKS.includes(value.task as AiRouteUpdate['task'])) {
    throw invalid('Invalid AI route configuration')
  }
  if (!value.route || typeof value.route !== 'object' || Array.isArray(value.route)) {
    throw invalid('Invalid AI route configuration')
  }
  const route = value.route as Record<string, unknown>
  return {
    task: value.task as AiRouteUpdate['task'],
    route: {
      primary: parseAssignment(route.primary),
      fallback: parseAssignment(route.fallback)
    }
  }
}

function parseAssignment(value: unknown): AiModelAssignment | null {
  if (value == null) return null
  if (typeof value !== 'object' || Array.isArray(value)) throw invalid('Invalid AI route configuration')
  const assignment = value as Record<string, unknown>
  const providerId = parseProviderId(assignment.providerId)
  if (typeof assignment.modelId !== 'string' || !assignment.modelId.trim() || assignment.modelId.length > 512) {
    throw invalid('Invalid AI route configuration')
  }
  if (assignment.capabilities !== undefined) {
    if (!Array.isArray(assignment.capabilities) || assignment.capabilities.some((capability) => !AI_CAPABILITIES.includes(capability))) {
      throw invalid('Invalid AI route configuration')
    }
  }
  return {
    providerId,
    modelId: assignment.modelId.trim(),
    ...(Array.isArray(assignment.capabilities) ? { capabilities: assignment.capabilities } : {})
  }
}

function parsePrivacyMode(value: unknown) {
  if (typeof value !== 'string' || !AI_PRIVACY_MODES.includes(value as typeof AI_PRIVACY_MODES[number])) {
    throw invalid('Invalid AI privacy mode')
  }
  return value as typeof AI_PRIVACY_MODES[number]
}

function parseProviderId(value: unknown) {
  if (typeof value !== 'string' || !AI_PROVIDER_IDS.includes(value as typeof AI_PROVIDER_IDS[number])) {
    throw invalid('Invalid AI provider')
  }
  return value as typeof AI_PROVIDER_IDS[number]
}

function parseChatInput(payload: unknown): AiChatInput {
  if (!payload || typeof payload !== 'object') throw invalid('Invalid AI chat request')
  const value = payload as Record<string, unknown>
  if (value.task !== undefined) {
    throw invalid('Invalid AI chat request')
  }
  if (value.promptKind !== undefined && (typeof value.promptKind !== 'string' || !AI_PROMPT_KINDS.includes(value.promptKind as AiPromptKind))) {
    throw invalid('Invalid AI chat request')
  }
  if (!Array.isArray(value.messages) || value.messages.length === 0 || value.messages.length > 100) {
    throw invalid('Invalid AI chat request')
  }
  const messages = value.messages.map((message) => {
    if (!message || typeof message !== 'object') throw invalid('Invalid AI chat request')
    const item = message as Record<string, unknown>
    if (!['system', 'user', 'assistant'].includes(String(item.role)) || typeof item.content !== 'string' || item.content.length > 200_000) {
      throw invalid('Invalid AI chat request')
    }
    return { role: item.role as 'system' | 'user' | 'assistant', content: item.content }
  })
  if (value.structured !== undefined && typeof value.structured !== 'boolean') throw invalid('Invalid AI chat request')
  const dataTypes = parseDataTypes(value.dataTypes)
  if (value.cloudConsent !== undefined && typeof value.cloudConsent !== 'boolean') throw invalid('Invalid AI chat request')
  return {
    messages,
    ...(value.promptKind !== undefined ? { promptKind: value.promptKind as AiPromptKind } : {}),
    ...(value.structured !== undefined ? { structured: value.structured } : {}),
    ...(dataTypes ? { dataTypes } : {}),
    ...(value.cloudConsent !== undefined ? { cloudConsent: value.cloudConsent } : {})
  }
}

function parseEmbeddingRequest(payload: unknown): AiEmbeddingRequest {
  if (!payload || typeof payload !== 'object') throw invalid('Invalid AI embedding request')
  const value = payload as Record<string, unknown>
  const input = value.input
  if (typeof input !== 'string' && (!Array.isArray(input) || input.length === 0 || input.length > 100 || input.some((item) => typeof item !== 'string'))) {
    throw invalid('Invalid AI embedding request')
  }
  if ((typeof input === 'string' && input.length > 200_000) || (Array.isArray(input) && input.some((item) => item.length > 200_000))) {
    throw invalid('Invalid AI embedding request')
  }
  const dataTypes = parseDataTypes(value.dataTypes)
  if (value.cloudConsent !== undefined && typeof value.cloudConsent !== 'boolean') throw invalid('Invalid AI embedding request')
  return {
    input: input as string | string[],
    ...(dataTypes ? { dataTypes } : {}),
    ...(value.cloudConsent !== undefined ? { cloudConsent: value.cloudConsent } : {})
  }
}

function parseDataTypes(value: unknown) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((item) => !AI_DATA_TYPES.includes(item))) throw invalid('Invalid AI data classification')
  return value as AiDataType[]
}

function invalid(message: string): AiProviderError {
  return new AiProviderError('INVALID_CONFIGURATION', message)
}

async function run<T>(operation: () => T | Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (isAiProviderError(error)) throw error
    throw new AiProviderError('PROVIDER_ERROR', 'AI request failed')
  }
}
