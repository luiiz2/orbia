import type { AiProviderConfig } from '../../../../types/ai'
import {
  AiProviderError,
  type AiFetch,
  type AiProviderAdapter
} from '../ai-provider'
import { OllamaProvider } from './ollama.provider'
import {
  OpenAICompatibleProvider,
  OpenAIProvider
} from './openai-compatible.provider'

export { OllamaProvider, OpenAICompatibleProvider, OpenAIProvider }
export type { AiFetch }

export function createAiProvider(
  config: AiProviderConfig,
  apiKey?: string,
  fetchImpl?: AiFetch
): AiProviderAdapter {
  switch (config.providerId) {
    case 'ollama':
      return new OllamaProvider(config, fetchImpl)
    case 'openai-compatible':
    case 'openrouter':
    case 'nvidia':
      return new OpenAICompatibleProvider(config, apiKey, fetchImpl)
    case 'openai':
      return new OpenAIProvider(config, apiKey, fetchImpl)
    default:
      throw new AiProviderError('INVALID_CONFIGURATION', 'Unknown AI provider')
  }
}
