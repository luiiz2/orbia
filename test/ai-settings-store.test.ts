import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAiSettingsStore } from '../src/renderer/src/stores/useAiSettingsStore'
import {
  createDefaultAiSettings,
  type AiModel,
  type AiProviderHealth,
  type AiSettingsSnapshot
} from '../src/types/ai'

const snapshot: AiSettingsSnapshot = createDefaultAiSettings()
const aiApi = {
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

describe('AI settings store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    aiApi.getSettings.mockResolvedValue(snapshot)
    aiApi.saveProvider.mockResolvedValue(snapshot)
    aiApi.setRoute.mockResolvedValue(snapshot)
    aiApi.setPrivacyMode.mockResolvedValue(snapshot)
    aiApi.setAllowedCloudDataTypes.mockResolvedValue(snapshot)
    aiApi.discoverModels.mockResolvedValue([] as AiModel[])
    aiApi.health.mockResolvedValue({
      providerId: 'ollama',
      status: 'AVAILABLE'
    } as AiProviderHealth)
    ;(
      globalThis as unknown as { window: { api: { ai: typeof aiApi } } }
    ).window = { api: { ai: aiApi } }
    useAiSettingsStore.setState({
      settings: null,
      models: {},
      health: {},
      isLoading: false,
      error: null
    })
  })

  it('loads settings and persists privacy changes through the AI bridge', async () => {
    await useAiSettingsStore.getState().init()
    expect(useAiSettingsStore.getState().settings).toEqual(snapshot)

    const updated = { ...snapshot, privacyMode: 'HYBRID' as const }
    aiApi.setPrivacyMode.mockResolvedValueOnce(updated)
    await useAiSettingsStore.getState().setPrivacyMode('HYBRID')

    expect(aiApi.setPrivacyMode).toHaveBeenCalledWith('HYBRID')
    expect(useAiSettingsStore.getState().settings?.privacyMode).toBe('HYBRID')
  })

  it('refreshes model discovery and retains a local unavailable health state', async () => {
    const discovered = [
      { id: 'llama3', providerId: 'ollama', capabilities: ['CHAT'] }
    ] as AiModel[]
    aiApi.discoverModels.mockResolvedValueOnce(discovered)
    aiApi.health.mockResolvedValueOnce({
      providerId: 'ollama',
      status: 'CONNECTION_FAILED'
    } as AiProviderHealth)

    await useAiSettingsStore.getState().discoverModels('ollama')
    await useAiSettingsStore.getState().checkHealth('ollama')

    expect(useAiSettingsStore.getState().models.ollama).toEqual(discovered)
    expect(useAiSettingsStore.getState().health.ollama?.status).toBe(
      'CONNECTION_FAILED'
    )
    expect(useAiSettingsStore.getState().error).toBeNull()
  })

  it('records bridge errors without crashing the settings view', async () => {
    aiApi.discoverModels.mockRejectedValueOnce(
      new Error('AI provider unavailable')
    )

    await useAiSettingsStore.getState().discoverModels('ollama')

    expect(useAiSettingsStore.getState().error).toBe('AI provider unavailable')
    expect(useAiSettingsStore.getState().isLoading).toBe(false)
  })
})
