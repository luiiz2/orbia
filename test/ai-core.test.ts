import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AppConfigService } from '../src/main/services/app-config.service'
import { AiCoreService } from '../src/main/services/ai/ai-core.service'
import {
  AiProviderError,
  AiProviderRegistry,
  type AiProviderAdapter
} from '../src/main/services/ai/ai-provider'
import type { AiCapability, AiModel, AiProviderId } from '../src/types/ai'

function fakeProvider(
  providerId: AiProviderId,
  kind: 'local' | 'cloud',
  models: AiModel[],
  chat: AiProviderAdapter['chat'],
  capabilities?: AiCapability[],
  transcribe: AiProviderAdapter['transcribe'] = vi.fn().mockResolvedValue({
    providerId,
    modelId: models[0]?.id ?? 'model',
    text: 'transcript',
    segments: [{ start: 0, end: 1, text: 'transcript' }]
  })
): AiProviderAdapter {
  return {
    providerId,
    kind,
    capabilities:
      capabilities ??
      ([
        ...new Set(models.flatMap((model) => model.capabilities))
      ] as AiCapability[]),
    discoverModels: vi.fn().mockResolvedValue(models),
    health: vi.fn().mockResolvedValue({ providerId, status: 'AVAILABLE' }),
    chat,
    embed: vi.fn().mockResolvedValue({
      providerId,
      modelId: models[0]?.id ?? 'model',
      embeddings: [[1]]
    }),
    transcribe
  }
}

describe('AI core routing and privacy', () => {
  let tempDir: string
  let config: AppConfigService
  let localChat: ReturnType<typeof vi.fn>
  let localTranscribe: ReturnType<typeof vi.fn>
  let localDiscover: ReturnType<typeof vi.fn>
  let localHealth: ReturnType<typeof vi.fn>
  let cloudChat: ReturnType<typeof vi.fn>
  let cloudEmbed: ReturnType<typeof vi.fn>
  let cloudTranscribe: ReturnType<typeof vi.fn>
  let cloudDiscover: ReturnType<typeof vi.fn>
  let recordUsage: ReturnType<typeof vi.fn>
  let service: AiCoreService

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-ai-core-'))
    config = new AppConfigService(path.join(tempDir, 'config.db'))
    config.init()
    localChat = vi.fn().mockResolvedValue({
      providerId: 'ollama',
      modelId: 'local-chat',
      content: 'local',
      usage: { promptTokens: 8, completionTokens: 4, totalTokens: 12 }
    })
    localTranscribe = vi.fn().mockResolvedValue({
      providerId: 'ollama',
      modelId: 'local-chat',
      text: 'local transcript',
      segments: [{ start: 0, end: 1, text: 'local transcript' }],
      durationSeconds: 1
    })
    const localProvider = fakeProvider(
      'ollama',
      'local',
      [
        {
          id: 'local-chat',
          providerId: 'ollama',
          capabilities: ['CHAT', 'TRANSCRIPTION']
        }
      ],
      localChat,
      undefined,
      localTranscribe
    )
    localDiscover = localProvider.discoverModels as ReturnType<typeof vi.fn>
    localHealth = localProvider.health as ReturnType<typeof vi.fn>
    cloudChat = vi.fn().mockResolvedValue({
      providerId: 'openai',
      modelId: 'cloud-chat',
      content: 'cloud'
    })
    cloudTranscribe = vi.fn().mockResolvedValue({
      providerId: 'openai',
      modelId: 'cloud-chat',
      text: 'cloud transcript',
      segments: [{ start: 0, end: 1, text: 'cloud transcript' }]
    })
    const cloudProvider = fakeProvider(
      'openai',
      'cloud',
      [
        {
          id: 'cloud-chat',
          providerId: 'openai',
          capabilities: ['CHAT', 'TRANSCRIPTION']
        }
      ],
      cloudChat,
      ['CHAT', 'EMBEDDINGS', 'TRANSCRIPTION', 'STRUCTURED_OUTPUT'],
      cloudTranscribe
    )
    cloudDiscover = cloudProvider.discoverModels as ReturnType<typeof vi.fn>
    cloudEmbed = cloudProvider.embed as ReturnType<typeof vi.fn>

    const registry = new AiProviderRegistry([
      localProvider,
      cloudProvider,
      fakeProvider(
        'openai-compatible',
        'local',
        [
          {
            id: 'local-embed',
            providerId: 'openai-compatible',
            capabilities: ['EMBEDDINGS']
          }
        ],
        vi.fn()
      )
    ])

    recordUsage = vi.fn()
    service = new AiCoreService({
      config,
      credentials: { get: vi.fn().mockReturnValue('configured') },
      providers: registry,
      usage: { recordUsage }
    })
    service.saveProvider({
      providerId: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      enabled: true
    })
    service.saveProvider({
      providerId: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      enabled: true
    })
  })

  afterEach(() => {
    config.close()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('blocks cloud invocation in LOCAL_ONLY before calling the adapter', async () => {
    service.setPrivacyMode('LOCAL_ONLY')
    service.setRoute('chat', {
      primary: {
        providerId: 'openai',
        modelId: 'cloud-chat',
        capabilities: ['CHAT']
      },
      fallback: null
    })

    await expect(
      service.chat({ messages: [{ role: 'user', content: 'secret' }] })
    ).rejects.toMatchObject({
      code: 'PRIVACY_BLOCKED'
    })
    expect(cloudChat).not.toHaveBeenCalled()
  })

  it('blocks both grounded retrieval embeddings and grounded answers in LOCAL_ONLY', async () => {
    service.setPrivacyMode('LOCAL_ONLY')
    service.setRoute('embeddings', {
      primary: {
        providerId: 'openai',
        modelId: 'cloud-chat',
        capabilities: ['EMBEDDINGS']
      },
      fallback: null
    })
    service.setRoute('chat', {
      primary: {
        providerId: 'openai',
        modelId: 'cloud-chat',
        capabilities: ['CHAT']
      },
      fallback: null
    })

    await expect(
      service.embed({ input: 'indexed transcript', dataTypes: ['transcript'] })
    ).rejects.toMatchObject({
      code: 'PRIVACY_BLOCKED'
    })
    await expect(
      service.chat({
        messages: [{ role: 'user', content: 'grounded question' }],
        dataTypes: ['transcript']
      })
    ).rejects.toMatchObject({ code: 'PRIVACY_BLOCKED' })

    expect(cloudEmbed).not.toHaveBeenCalled()
    expect(cloudChat).not.toHaveBeenCalled()
  })

  it('does not use a cloud fallback in LOCAL_ONLY after a local failure', async () => {
    localChat.mockRejectedValueOnce(
      new AiProviderError(
        'CONNECTION_FAILED',
        'AI provider connection failed',
        'ollama'
      )
    )
    service.setPrivacyMode('LOCAL_ONLY')
    service.setRoute('chat', {
      primary: {
        providerId: 'ollama',
        modelId: 'local-chat',
        capabilities: ['CHAT']
      },
      fallback: {
        providerId: 'openai',
        modelId: 'cloud-chat',
        capabilities: ['CHAT']
      }
    })

    await expect(
      service.chat({ messages: [{ role: 'user', content: 'hello' }] })
    ).rejects.toMatchObject({
      code: 'PRIVACY_BLOCKED'
    })
    expect(cloudChat).not.toHaveBeenCalled()
  })

  it('allows an explicitly configured cloud route in HYBRID mode', async () => {
    service.setPrivacyMode('HYBRID')
    service.setRoute('chat', {
      primary: {
        providerId: 'openai',
        modelId: 'cloud-chat',
        capabilities: ['CHAT']
      },
      fallback: null
    })

    await expect(
      service.chat({ messages: [{ role: 'user', content: 'hello' }] })
    ).resolves.toMatchObject({ content: 'cloud' })
    expect(cloudChat).toHaveBeenCalledOnce()
  })

  it('uses an explicitly configured fallback after a provider failure', async () => {
    localChat.mockRejectedValueOnce(
      new AiProviderError(
        'CONNECTION_FAILED',
        'AI provider connection failed',
        'ollama'
      )
    )
    service.setPrivacyMode('HYBRID')
    service.setRoute('chat', {
      primary: {
        providerId: 'ollama',
        modelId: 'local-chat',
        capabilities: ['CHAT']
      },
      fallback: {
        providerId: 'openai',
        modelId: 'cloud-chat',
        capabilities: ['CHAT']
      }
    })

    await expect(
      service.chat({ messages: [{ role: 'user', content: 'hello' }] })
    ).resolves.toMatchObject({ content: 'cloud' })
    expect(localChat).toHaveBeenCalledOnce()
    expect(cloudChat).toHaveBeenCalledOnce()
  })

  it('routes transcription through the configured provider and forwards language', async () => {
    service.setRoute('transcription', {
      primary: {
        providerId: 'ollama',
        modelId: 'local-chat',
        capabilities: ['TRANSCRIPTION']
      },
      fallback: null
    })
    const audio = new Uint8Array([1, 2])

    await expect(
      service.transcribe({ audio, language: 'pt-BR' })
    ).resolves.toMatchObject({
      providerId: 'ollama',
      text: 'local transcript'
    })
    expect(localTranscribe).toHaveBeenCalledWith({
      modelId: 'local-chat',
      audio,
      language: 'pt-BR'
    })
    expect(recordUsage).toHaveBeenCalledWith({
      promptTokens: undefined,
      completionTokens: undefined,
      transcriptionSeconds: 1,
      embeddedChunks: undefined
    })
  })

  it('classifies transcription as transcript before allowing a cloud request', async () => {
    service.setPrivacyMode('HYBRID')
    service.setRoute('transcription', {
      primary: {
        providerId: 'openai',
        modelId: 'cloud-chat',
        capabilities: ['TRANSCRIPTION']
      },
      fallback: null
    })
    const request = {
      audio: new Uint8Array([1]),
      language: 'en',
      cloudConsent: true
    }

    await expect(service.transcribe(request)).rejects.toMatchObject({
      code: 'PRIVACY_BLOCKED'
    })
    expect(cloudTranscribe).not.toHaveBeenCalled()

    service.setAllowedCloudDataTypes(['transcript'])
    await expect(service.transcribe(request)).resolves.toMatchObject({
      text: 'cloud transcript'
    })
    expect(cloudTranscribe).toHaveBeenCalledWith({
      modelId: 'cloud-chat',
      audio: request.audio,
      language: 'en'
    })
  })

  it('uses an explicitly configured transcription fallback after a provider failure', async () => {
    localTranscribe.mockRejectedValueOnce(
      new AiProviderError('PROVIDER_ERROR', 'transcription failed', 'ollama')
    )
    service.setPrivacyMode('HYBRID')
    service.setAllowedCloudDataTypes(['transcript'])
    service.setRoute('transcription', {
      primary: {
        providerId: 'ollama',
        modelId: 'local-chat',
        capabilities: ['TRANSCRIPTION']
      },
      fallback: {
        providerId: 'openai',
        modelId: 'cloud-chat',
        capabilities: ['TRANSCRIPTION']
      }
    })

    await expect(
      service.transcribe({ audio: new Uint8Array([1]), cloudConsent: true })
    ).resolves.toMatchObject({
      providerId: 'openai',
      text: 'cloud transcript'
    })
    expect(localTranscribe).toHaveBeenCalledOnce()
    expect(cloudTranscribe).toHaveBeenCalledOnce()
  })

  it('rejects transcription when discovered model capabilities omit TRANSCRIPTION', async () => {
    localDiscover.mockResolvedValueOnce([
      { id: 'local-chat', providerId: 'ollama', capabilities: ['CHAT'] }
    ])
    service.setRoute('transcription', {
      primary: {
        providerId: 'ollama',
        modelId: 'local-chat',
        capabilities: ['TRANSCRIPTION']
      },
      fallback: null
    })

    await expect(
      service.transcribe({ audio: new Uint8Array([1]) })
    ).rejects.toMatchObject({
      code: 'CAPABILITY_UNSUPPORTED'
    })
    expect(localTranscribe).not.toHaveBeenCalled()
  })

  it('rejects a model whose discovered capability cannot satisfy chat', async () => {
    service.saveProvider({
      providerId: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:1234/v1',
      enabled: true
    })
    service.setRoute('chat', {
      primary: {
        providerId: 'openai-compatible',
        modelId: 'local-embed',
        capabilities: ['EMBEDDINGS']
      },
      fallback: null
    })

    await expect(
      service.chat({ messages: [{ role: 'user', content: 'hello' }] })
    ).rejects.toMatchObject({
      code: 'CAPABILITY_UNSUPPORTED'
    })
  })

  it('rejects execution when no route is configured', async () => {
    await expect(
      service.chat({ messages: [{ role: 'user', content: 'hello' }] })
    ).rejects.toMatchObject({
      code: 'ROUTE_NOT_CONFIGURED'
    })
  })

  it('requires explicit consent before sending classified data to cloud', async () => {
    service.setPrivacyMode('HYBRID')
    service.setRoute('chat', {
      primary: {
        providerId: 'openai',
        modelId: 'cloud-chat',
        capabilities: ['CHAT']
      },
      fallback: null
    })

    await expect(
      service.chat({
        messages: [{ role: 'user', content: 'notes' }],
        dataTypes: ['notes']
      })
    ).rejects.toMatchObject({ code: 'PRIVACY_BLOCKED' })
    expect(cloudChat).not.toHaveBeenCalled()
  })

  it('requires a persisted cloud data-type permission in addition to request consent', async () => {
    service.setPrivacyMode('HYBRID')
    service.setRoute('chat', {
      primary: {
        providerId: 'openai',
        modelId: 'cloud-chat',
        capabilities: ['CHAT']
      },
      fallback: null
    })

    await expect(
      service.chat({
        messages: [{ role: 'user', content: 'notes' }],
        dataTypes: ['notes'],
        cloudConsent: true
      })
    ).rejects.toMatchObject({ code: 'PRIVACY_BLOCKED' })

    service.setAllowedCloudDataTypes(['notes'])
    await expect(
      service.chat({
        messages: [{ role: 'user', content: 'notes' }],
        dataTypes: ['notes'],
        cloudConsent: true
      })
    ).resolves.toMatchObject({ content: 'cloud' })
  })

  it('requires structured-output capability for structured chat requests', async () => {
    service.setPrivacyMode('HYBRID')
    service.setRoute('chat', {
      primary: {
        providerId: 'openai',
        modelId: 'cloud-chat',
        capabilities: ['CHAT']
      },
      fallback: null
    })
    cloudDiscover.mockResolvedValueOnce([
      { id: 'cloud-chat', providerId: 'openai', capabilities: ['CHAT'] }
    ])

    await expect(
      service.chat({
        messages: [{ role: 'user', content: 'json' }],
        structured: true
      })
    ).rejects.toMatchObject({ code: 'CAPABILITY_UNSUPPORTED' })
    expect(cloudChat).not.toHaveBeenCalled()
  })

  it('rejects a local provider endpoint that is not loopback', () => {
    expect(() =>
      service.saveProvider({
        providerId: 'ollama',
        baseUrl: 'https://example.com',
        enabled: true
      })
    ).toThrow('AI provider URL is invalid')
  })

  it('does not trust renderer-supplied capabilities over discovered model capabilities', async () => {
    service.setPrivacyMode('HYBRID')
    service.setRoute('chat', {
      primary: {
        providerId: 'openai',
        modelId: 'cloud-chat',
        capabilities: ['CHAT']
      },
      fallback: null
    })
    cloudDiscover.mockResolvedValueOnce([
      { id: 'cloud-chat', providerId: 'openai', capabilities: ['EMBEDDINGS'] }
    ])

    await expect(
      service.chat({ messages: [{ role: 'user', content: 'hello' }] })
    ).rejects.toMatchObject({
      code: 'CAPABILITY_UNSUPPORTED'
    })
    expect(cloudChat).not.toHaveBeenCalled()
    expect(cloudDiscover).toHaveBeenCalledOnce()
  })

  it('blocks cloud discovery in LOCAL_ONLY before contacting the provider', async () => {
    service.setPrivacyMode('LOCAL_ONLY')

    await expect(service.discoverModels('openai')).rejects.toMatchObject({
      code: 'PRIVACY_BLOCKED'
    })
    await expect(service.health('openai')).rejects.toMatchObject({
      code: 'PRIVACY_BLOCKED'
    })
    expect(cloudDiscover).not.toHaveBeenCalled()
  })

  it('preserves connection failure in the provider health result', async () => {
    localHealth.mockRejectedValueOnce(
      new AiProviderError('CONNECTION_FAILED', 'connection failed', 'ollama')
    )

    await expect(service.health('ollama')).resolves.toMatchObject({
      providerId: 'ollama',
      status: 'CONNECTION_FAILED'
    })
  })

  it('sends the specialized commit instructions to the configured provider', async () => {
    service.setRoute('chat', {
      primary: {
        providerId: 'ollama',
        modelId: 'local-chat',
        capabilities: ['CHAT']
      },
      fallback: null
    })

    await service.chat({
      promptKind: 'commit',
      messages: [
        { role: 'user', content: 'The parser now preserves PDF resources.' }
      ]
    })

    expect(localChat).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'local-chat',
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining(
              'Do not end the title with a period'
            )
          })
        ])
      })
    )
    expect(recordUsage).toHaveBeenCalledWith({
      promptTokens: 8,
      completionTokens: 4,
      transcriptionSeconds: undefined,
      embeddedChunks: undefined
    })
  })
})
