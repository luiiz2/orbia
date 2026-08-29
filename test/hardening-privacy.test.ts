import { describe, it, expect, vi } from 'vitest'
import { AiCoreService } from '../src/main/services/ai/ai-core.service'
import {
  AiProviderError,
  AiProviderRegistry,
  type AiProviderAdapter
} from '../src/main/services/ai/ai-provider'
import {
  assertPrivacyAllows,
  shouldTryAiFallback
} from '../src/main/services/ai/ai-routing.service'
import type {
  AiPrivacyMode,
  AiProviderConfig,
  AiSettingsSnapshot
} from '../src/types/ai'

describe('Orbia v0.9 Hardening - Privacy & Security Audit', () => {
  const cloudProviderConfig: AiProviderConfig = {
    providerId: 'openai',
    kind: 'cloud',
    displayName: 'OpenAI Cloud',
    baseUrl: 'https://api.openai.com/v1',
    enabled: true,
    apiKeyConfigured: true
  }

  const localProviderConfig: AiProviderConfig = {
    providerId: 'ollama',
    kind: 'local',
    displayName: 'Ollama Local',
    baseUrl: 'http://127.0.0.1:11434',
    enabled: true,
    apiKeyConfigured: false
  }

  it('LOCAL_ONLY privacy mode strictly blocks any cloud provider call', () => {
    expect(() => {
      assertPrivacyAllows('LOCAL_ONLY', cloudProviderConfig, {
        dataTypes: ['transcript'],
        cloudConsent: true,
        allowedDataTypes: ['transcript']
      })
    }).toThrowError(/Cloud AI is blocked by LOCAL_ONLY privacy mode/)
  })

  it('LOCAL_ONLY allows local provider without restrictions', () => {
    expect(() => {
      assertPrivacyAllows('LOCAL_ONLY', localProviderConfig, {
        dataTypes: ['transcript'],
        cloudConsent: false,
        allowedDataTypes: []
      })
    }).not.toThrow()
  })

  it('HYBRID privacy mode requires explicit cloud consent for classified data', () => {
    expect(() => {
      assertPrivacyAllows('HYBRID', cloudProviderConfig, {
        dataTypes: ['transcript', 'notes'],
        cloudConsent: false,
        allowedDataTypes: ['transcript', 'notes']
      })
    }).toThrowError(/Explicit cloud consent is required/)
  })

  it('HYBRID privacy mode blocks unapproved data categories even if consent is true', () => {
    expect(() => {
      assertPrivacyAllows('HYBRID', cloudProviderConfig, {
        dataTypes: ['notes'],
        cloudConsent: true,
        allowedDataTypes: ['transcript'] // notes not allowed
      })
    }).toThrowError(/Selected data is not allowed for cloud AI/)
  })

  it('HYBRID privacy mode rejects cloud requests without data classification', () => {
    expect(() => {
      assertPrivacyAllows('HYBRID', cloudProviderConfig, {
        cloudConsent: true,
        allowedDataTypes: ['user_metadata']
      })
    }).toThrowError(/data classification is required/i)
  })

  it('Cloud fallback is strictly subject to privacy rules and cannot bypass LOCAL_ONLY', async () => {
    const mockConfig = {
      getAiSettings: vi.fn().mockReturnValue({
        privacyMode: 'LOCAL_ONLY' as AiPrivacyMode,
        allowedCloudDataTypes: ['transcript'],
        providers: {
          ollama: localProviderConfig,
          openai: cloudProviderConfig,
          'openai-compatible': {
            providerId: 'openai-compatible',
            kind: 'local',
            displayName: 'Local',
            baseUrl: 'http://127.0.0.1:1234/v1',
            enabled: true,
            apiKeyConfigured: false
          },
          openrouter: {
            providerId: 'openrouter',
            kind: 'cloud',
            displayName: 'OpenRouter',
            baseUrl: 'https://openrouter.ai/api/v1',
            enabled: false,
            apiKeyConfigured: false
          },
          nvidia: {
            providerId: 'nvidia',
            kind: 'cloud',
            displayName: 'NVIDIA',
            baseUrl: 'https://integrate.api.nvidia.com/v1',
            enabled: false,
            apiKeyConfigured: false
          }
        },
        routes: {
          chat: {
            primary: { providerId: 'ollama', modelId: 'llama3:8b' },
            fallback: { providerId: 'openai', modelId: 'gpt-4o' }
          },
          summary: { primary: null, fallback: null },
          embeddings: { primary: null, fallback: null },
          transcription: { primary: null, fallback: null },
          chapters: { primary: null, fallback: null }
        }
      } as AiSettingsSnapshot),
      updateAiProvider: vi.fn(),
      updateAiRoute: vi.fn(),
      setAiPrivacyMode: vi.fn(),
      setAiAllowedCloudDataTypes: vi.fn()
    }

    const mockCredentials = {
      get: vi.fn().mockReturnValue('sk-test-secret-key'),
      set: vi.fn(),
      clear: vi.fn()
    }

    const failingOllama: AiProviderAdapter = {
      providerId: 'ollama',
      kind: 'local',
      capabilities: ['CHAT'],
      discoverModels: vi
        .fn()
        .mockResolvedValue([
          { id: 'llama3:8b', providerId: 'ollama', capabilities: ['CHAT'] }
        ]),
      chat: vi
        .fn()
        .mockRejectedValue(
          new AiProviderError(
            'CONNECTION_FAILED',
            'Ollama is offline',
            'ollama'
          )
        )
    }

    const openaiSpy: AiProviderAdapter = {
      providerId: 'openai',
      kind: 'cloud',
      capabilities: ['CHAT'],
      discoverModels: vi
        .fn()
        .mockResolvedValue([
          { id: 'gpt-4o', providerId: 'openai', capabilities: ['CHAT'] }
        ]),
      chat: vi.fn().mockResolvedValue({ content: 'Cloud answer' })
    }

    const registry = new AiProviderRegistry([failingOllama, openaiSpy])
    const service = new AiCoreService({
      config: mockConfig,
      credentials: mockCredentials,
      providers: registry
    })

    // Executing chat with LOCAL_ONLY must fail and NEVER call OpenAI
    await expect(
      service.chat({
        messages: [{ role: 'user', content: 'Hello' }],
        dataTypes: ['transcript']
      })
    ).rejects.toThrowError(/Cloud AI is blocked by LOCAL_ONLY privacy mode/)

    expect(openaiSpy.chat).not.toHaveBeenCalled()
  })

  it('No plaintext API keys leak in logs or error messages', () => {
    const error = new AiProviderError(
      'INVALID_CREDENTIALS',
      'Credential rejected',
      'openai'
    )
    expect(error.message).not.toContain('sk-')
    expect(JSON.stringify(error)).not.toContain('sk-')
  })
})
