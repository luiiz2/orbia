import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AiSettingsSnapshot } from '../src/types/ai'

const handlers = new Map<string, (_event: unknown, payload?: unknown) => Promise<unknown> | unknown>()
const core = {
  getSettings: vi.fn(),
  saveProvider: vi.fn(),
  setRoute: vi.fn(),
  setPrivacyMode: vi.fn(),
  setAllowedCloudDataTypes: vi.fn(),
  discoverModels: vi.fn(),
  health: vi.fn(),
  chat: vi.fn(),
  embed: vi.fn()
}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (_event: unknown, payload?: unknown) => unknown) => {
      handlers.set(channel, handler)
    })
  }
}))

vi.mock('../src/main/services/ai/ai-core.service', () => ({ aiCoreService: core }))

describe('AI IPC boundary', () => {
  beforeEach(async () => {
    handlers.clear()
    vi.clearAllMocks()
    core.getSettings.mockReturnValue({} as AiSettingsSnapshot)
    const { registerAiIpc } = await import('../src/main/ipc/ai.ipc')
    registerAiIpc()
  })

  it('registers only the narrow AI bridge handlers', () => {
    expect([...handlers.keys()]).toEqual([
      'ai:get-settings',
      'ai:save-provider',
      'ai:set-route',
      'ai:set-privacy-mode',
      'ai:set-allowed-cloud-data-types',
      'ai:discover-models',
      'ai:health',
      'ai:chat',
      'ai:embed'
    ])
  })

  it('rejects invalid provider and chat payloads before reaching the core', async () => {
    const saveProvider = handlers.get('ai:save-provider')!
    const chat = handlers.get('ai:chat')!

    await expect(saveProvider({}, { providerId: 'evil', baseUrl: 'https://evil.test', enabled: true })).rejects.toThrow('Invalid AI provider')
    await expect(chat({}, { messages: [{ role: 'user', content: 42 }] })).rejects.toThrow('Invalid AI chat request')
    await expect(chat({}, { promptKind: 'unknown', messages: [{ role: 'user', content: 'not yet' }] })).rejects.toThrow('Invalid AI chat request')
    expect(core.saveProvider).not.toHaveBeenCalled()
    expect(core.chat).not.toHaveBeenCalled()
  })

  it('passes a supported Pull Request prompt kind to the core', async () => {
    const chat = handlers.get('ai:chat')!
    core.chat.mockResolvedValue({ providerId: 'ollama', modelId: 'llama3', content: 'TITLE: feat: improve PR prompts' })

    await chat({}, {
      promptKind: 'pull_request',
      messages: [{ role: 'user', content: 'Summarize the actual diff.' }]
    })

    expect(core.chat).toHaveBeenCalledWith(expect.objectContaining({ promptKind: 'pull_request' }))
  })

  it('passes valid operations to the core and never adds credential data to snapshots', async () => {
    const snapshot = { privacyMode: 'LOCAL_ONLY', providers: {}, routes: {} }
    core.getSettings.mockReturnValue(snapshot)
    core.saveProvider.mockReturnValue(snapshot)
    core.chat.mockResolvedValue({ providerId: 'ollama', modelId: 'llama3', content: 'ok' })

    const result = await handlers.get('ai:get-settings')!({})
    await handlers.get('ai:save-provider')!({}, {
      providerId: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      enabled: true,
      apiKey: 'sk-test-secret'
    })
    const chatResult = await handlers.get('ai:chat')!({}, {
      messages: [{ role: 'user', content: 'hello' }]
    })

    expect(result).toEqual(snapshot)
    expect(core.saveProvider).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'sk-test-secret' }))
    expect(chatResult).toEqual({ providerId: 'ollama', modelId: 'llama3', content: 'ok' })
    expect(JSON.stringify(result)).not.toContain('sk-test-secret')
  })
})
