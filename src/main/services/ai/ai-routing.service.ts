import {
  AI_CAPABILITIES,
  AI_PROVIDER_IDS,
  AI_TASKS,
  type AiCapability,
  type AiDataType,
  type AiModelAssignment,
  type AiPrivacyMode,
  type AiProviderConfig,
  type AiRoute,
  type AiSettingsSnapshot,
  type AiTask
} from '../../../types/ai'
import { AiProviderError, type AiProviderAdapter } from './ai-provider'

export function requiredCapabilityForTask(
  task: AiTask,
  structured = false
): AiCapability {
  if (task === 'embeddings') return 'EMBEDDINGS'
  if (task === 'transcription') return 'TRANSCRIPTION'
  if (structured) return 'STRUCTURED_OUTPUT'
  return 'CHAT'
}

export function validateRouteShape(task: AiTask, route: AiRoute): void {
  if (!AI_TASKS.includes(task))
    throw new AiProviderError('INVALID_CONFIGURATION', 'Unknown AI task')
  if (route == null || typeof route !== 'object') {
    throw new AiProviderError('INVALID_CONFIGURATION', 'AI route is invalid')
  }
  if (!route.primary && route.fallback) {
    throw new AiProviderError(
      'INVALID_CONFIGURATION',
      'AI fallback requires a primary route'
    )
  }
  if (route.primary) validateAssignmentShape(route.primary)
  if (route.fallback) validateAssignmentShape(route.fallback)
}

export function validateAssignmentCapability(
  task: AiTask,
  assignment: AiModelAssignment,
  adapter: AiProviderAdapter,
  structured = false
): void {
  const required = requiredCapabilityForTask(task, structured)
  if (!adapter.capabilities.includes(required)) {
    throw new AiProviderError(
      'CAPABILITY_UNSUPPORTED',
      `AI provider does not support ${required}`,
      assignment.providerId
    )
  }
}

export function assertPrivacyAllows(
  privacyMode: AiPrivacyMode,
  provider: AiProviderConfig,
  request: {
    dataTypes?: readonly AiDataType[]
    cloudConsent?: boolean
    allowedDataTypes?: readonly AiDataType[]
    /** Control-plane calls such as health checks carry no user content. */
    allowUnclassifiedCloud?: boolean
  }
): void {
  if (provider.kind !== 'cloud') return
  if (privacyMode === 'LOCAL_ONLY') {
    throw new AiProviderError(
      'PRIVACY_BLOCKED',
      'Cloud AI is blocked by LOCAL_ONLY privacy mode',
      provider.providerId
    )
  }
  if (
    request.allowUnclassifiedCloud !== true &&
    (!request.dataTypes || request.dataTypes.length === 0)
  ) {
    throw new AiProviderError(
      'PRIVACY_BLOCKED',
      'Explicit data classification is required for cloud AI',
      provider.providerId
    )
  }
  if (
    request.dataTypes &&
    request.dataTypes.length > 0 &&
    request.cloudConsent !== true
  ) {
    throw new AiProviderError(
      'PRIVACY_BLOCKED',
      'Explicit cloud consent is required for selected data',
      provider.providerId
    )
  }
  if (request.dataTypes && request.dataTypes.length > 0) {
    const allowed = new Set(request.allowedDataTypes ?? [])
    if (request.dataTypes.some((dataType) => !allowed.has(dataType))) {
      throw new AiProviderError(
        'PRIVACY_BLOCKED',
        'Selected data is not allowed for cloud AI',
        provider.providerId
      )
    }
  }
}

export function shouldTryAiFallback(error: unknown): boolean {
  return (
    error instanceof AiProviderError &&
    [
      'CONNECTION_FAILED',
      'INVALID_CREDENTIALS',
      'MODEL_MISSING',
      'PROVIDER_UNAVAILABLE',
      'PROVIDER_ERROR'
    ].includes(error.code)
  )
}

function validateAssignmentShape(assignment: AiModelAssignment): void {
  if (!AI_PROVIDER_IDS.includes(assignment.providerId)) {
    throw new AiProviderError('INVALID_CONFIGURATION', 'Unknown AI provider')
  }
  if (typeof assignment.modelId !== 'string' || !assignment.modelId.trim()) {
    throw new AiProviderError(
      'INVALID_CONFIGURATION',
      'AI model is required',
      assignment.providerId
    )
  }
  if (assignment.capabilities) {
    for (const capability of assignment.capabilities) {
      if (!AI_CAPABILITIES.includes(capability)) {
        throw new AiProviderError(
          'INVALID_CONFIGURATION',
          'AI model capability is invalid',
          assignment.providerId
        )
      }
    }
  }
}

export function routeAssignments(
  settings: AiSettingsSnapshot,
  task: AiTask
): AiModelAssignment[] {
  validateRouteShape(task, settings.routes[task])
  const route = settings.routes[task]
  return [route.primary, route.fallback].filter(
    (assignment): assignment is AiModelAssignment => Boolean(assignment)
  )
}
