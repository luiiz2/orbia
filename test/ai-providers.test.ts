import { describe, it, expect, vi } from 'vitest'
import {
  OllamaProvider,
  OpenAICompatibleProvider,
  type AiFetch
} from '../src/main/services/ai/providers'
import type { AiProviderConfig } from '../src/types/ai'

function providerConfig(providerId: AiProviderConfig['providerId'], baseUrl: string): AiProviderConfig {
  return {
    providerId,
    kind: providerId === 'openai' ? 'cloud' : 'local',
    displayName: providerId,
    baseUrl,
    enabled: true,
    apiKeyConfigured: providerId === 'openai'
  }
}

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body))
  } as unknown as Response
}

describe('AI provider adapters', () => {
  it('discovers Ollama models and maps model capabilities', async () => {
    const fetchImpl = vi.fn<AiFetch>().mockResolvedValue(
      response(200, {
        models: [
          { name: 'llama3', capabilities: ['completion'] },
          { name: 'nomic-embed-text', capabilities: ['embedding'] }
        ]
      })
    )
    const provider = new OllamaProvider(providerConfig('ollama', 'http://127.0.0.1:11434'), fetchImpl)

    const models = await provider.discoverModels()

    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:11434/api/tags', expect.any(Object))
    expect(models).toEqual([
      { id: 'llama3', providerId: 'ollama', capabilities: ['CHAT'] },
      { id: 'nomic-embed-text', providerId: 'ollama', capabilities: ['EMBEDDINGS'] }
    ])
  })

  it('calls Ollama chat and embeddings endpoints without requiring a cloud credential', async () => {
    const fetchImpl = vi
      .fn<AiFetch>()
      .mockResolvedValueOnce(response(200, { message: { content: 'hello' } }))
      .mockResolvedValueOnce(response(200, { embeddings: [[0.1, 0.2]] }))
    const provider = new OllamaProvider(providerConfig('ollama', 'http://127.0.0.1:11434'), fetchImpl)

    await expect(provider.chat({ modelId: 'llama3', messages: [{ role: 'user', content: 'hi' }] })).resolves.toEqual({
      providerId: 'ollama',
      modelId: 'llama3',
      content: 'hello'
    })
    await expect(provider.embed({ modelId: 'nomic-embed-text', input: 'hello' })).resolves.toEqual({
      providerId: 'ollama',
      modelId: 'nomic-embed-text',
      embeddings: [[0.1, 0.2]]
    })
    expect(fetchImpl.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/chat')
    expect(fetchImpl.mock.calls[1][0]).toBe('http://127.0.0.1:11434/api/embed')
  })

  it('sends OpenAI-compatible transcription as multipart verbose_json and normalizes timestamped segments', async () => {
    const fetchImpl = vi.fn<AiFetch>().mockResolvedValue(response(200, {
      text: 'Olá mundo',
      language: 'pt',
      segments: [{ start: 0, end: 1.25, text: 'Olá mundo' }]
    }))
    const provider = new OpenAICompatibleProvider(
      providerConfig('openai-compatible', 'http://127.0.0.1:1234/v1'),
      'local-secret',
      fetchImpl
    )
    const audio = new Uint8Array([1, 2, 3])

    await expect(provider.transcribe({
      modelId: 'whisper-1',
      audio,
      fileName: 'lesson.wav',
      mimeType: 'audio/wav',
      language: 'pt'
    })).resolves.toEqual({
      providerId: 'openai-compatible',
      modelId: 'whisper-1',
      language: 'pt',
      text: 'Olá mundo',
      segments: [{ start: 0, end: 1.25, text: 'Olá mundo' }]
    })

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:1234/v1/audio/transcriptions')
    const form = init?.body as FormData
    expect(form).toBeInstanceOf(FormData)
    expect(form.get('model')).toBe('whisper-1')
    expect(form.get('response_format')).toBe('verbose_json')
    expect(form.get('language')).toBe('pt')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer local-secret')
    expect(new Headers(init?.headers).get('content-type')).toBeNull()

    const file = form.get('file') as Blob & { name?: string }
    expect(file).toBeInstanceOf(Blob)
    expect(file.name).toBe('lesson.wav')
    expect(file.type).toBe('audio/wav')
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(audio)
  })

  it('omits language from OpenAI-compatible transcription requests for autodetect', async () => {
    const fetchImpl = vi.fn<AiFetch>().mockResolvedValue(response(200, {
      text: 'Detected language',
      segments: [{ start: 0, end: 1, text: 'Detected language' }]
    }))
    const provider = new OpenAICompatibleProvider(
      providerConfig('openai-compatible', 'http://127.0.0.1:1234/v1'),
      undefined,
      fetchImpl
    )

    await provider.transcribe({ modelId: 'whisper-1', audio: new Uint8Array([1]) })

    const form = fetchImpl.mock.calls[0][1]?.body as FormData
    expect(form.has('language')).toBe(false)
  })

  it.each([
    ['missing segments', { text: 'partial transcript' }],
    ['empty segments', { text: 'partial transcript', segments: [] }],
    ['incomplete segment', { text: 'partial transcript', segments: [{ start: 0, end: 1 }] }]
  ])('rejects %s transcription responses instead of returning a false transcript', async (_case, body) => {
    const fetchImpl = vi.fn<AiFetch>().mockResolvedValue(response(200, body))
    const provider = new OpenAICompatibleProvider(
      providerConfig('openai-compatible', 'http://127.0.0.1:1234/v1'),
      undefined,
      fetchImpl
    )

    await expect(provider.transcribe({ modelId: 'whisper-1', audio: new Uint8Array([1]) })).rejects.toMatchObject({
      code: 'PROVIDER_ERROR'
    })
  })

  it('does not advertise or invoke transcription for Ollama without a real endpoint', async () => {
    const fetchImpl = vi.fn<AiFetch>()
    const provider = new OllamaProvider(providerConfig('ollama', 'http://127.0.0.1:11434'), fetchImpl)

    expect(provider.capabilities).not.toContain('TRANSCRIPTION')
    await expect(provider.transcribe({ modelId: 'llama3', audio: new Uint8Array([1]) })).rejects.toMatchObject({
      code: 'CAPABILITY_UNSUPPORTED'
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('discovers OpenAI-compatible models and maps embedding-only capabilities', async () => {
    const fetchImpl = vi.fn<AiFetch>().mockResolvedValue(
      response(200, {
        data: [
          { id: 'local-chat', capabilities: ['chat'] },
          { id: 'local-embed', capabilities: ['embedding'] }
        ]
      })
    )
    const provider = new OpenAICompatibleProvider(
      providerConfig('openai-compatible', 'http://127.0.0.1:1234/v1'),
      undefined,
      fetchImpl
    )

    const models = await provider.discoverModels()

    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:1234/v1/models', expect.any(Object))
    expect(models[1]).toEqual({ id: 'local-embed', providerId: 'openai-compatible', capabilities: ['EMBEDDINGS'] })
  })

  it('does not claim embeddings or structured output when discovery omits capabilities', async () => {
    const fetchImpl = vi.fn<AiFetch>().mockResolvedValue(response(200, { data: [{ id: 'local-chat' }] }))
    const provider = new OpenAICompatibleProvider(
      providerConfig('openai-compatible', 'http://127.0.0.1:1234/v1'),
      undefined,
      fetchImpl
    )

    await expect(provider.discoverModels()).resolves.toEqual([
      { id: 'local-chat', providerId: 'openai-compatible', capabilities: ['CHAT'] }
    ])
  })

  it('normalizes connection failures and invalid credentials', async () => {
    const connectionFailure = vi.fn<AiFetch>().mockRejectedValue(new Error('ECONNREFUSED'))
    const localProvider = new OllamaProvider(providerConfig('ollama', 'http://127.0.0.1:11434'), connectionFailure)
    await expect(localProvider.discoverModels()).rejects.toMatchObject({ code: 'CONNECTION_FAILED' })

    const unauthorized = vi.fn<AiFetch>().mockResolvedValue(response(401, { error: 'bad key' }))
    const cloudProvider = new OpenAICompatibleProvider(
      providerConfig('openai', 'https://api.openai.com/v1'),
      'sk-test-secret',
      unauthorized
    )
    await expect(cloudProvider.discoverModels()).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    await expect(cloudProvider.discoverModels()).rejects.not.toThrow('sk-test-secret')
  })

  it('reports a local provider as connection-failed without crashing the caller', async () => {
    const connectionFailure = vi.fn<AiFetch>().mockRejectedValue(new Error('ECONNREFUSED'))
    const provider = new OllamaProvider(providerConfig('ollama', 'http://127.0.0.1:11434'), connectionFailure)

    await expect(provider.health()).resolves.toMatchObject({ providerId: 'ollama', status: 'CONNECTION_FAILED' })
  })

  it('does not call a cloud endpoint when its credential is missing', async () => {
    const fetchImpl = vi.fn<AiFetch>()
    const provider = new OpenAICompatibleProvider(
      providerConfig('openai', 'https://api.openai.com/v1'),
      undefined,
      fetchImpl
    )

    await expect(provider.discoverModels()).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('maps malformed provider responses to a provider error', async () => {
    const malformed = {
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new Error('invalid json'))
    } as unknown as Response
    const fetchImpl = vi.fn<AiFetch>().mockResolvedValue(malformed)
    const provider = new OllamaProvider(providerConfig('ollama', 'http://127.0.0.1:11434'), fetchImpl)

    await expect(provider.discoverModels()).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
  })

  it('bounds a hanging provider request and reports a connection failure', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi.fn<AiFetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      }))
      const provider = new OllamaProvider(providerConfig('ollama', 'http://127.0.0.1:11434'), fetchImpl)
      const request = provider.discoverModels()
      const assertion = expect(request).rejects.toMatchObject({ code: 'CONNECTION_FAILED' })

      await vi.advanceTimersByTimeAsync(15_000)

      await assertion
    } finally {
      vi.useRealTimers()
    }
  })
})
