import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useSettingsStore } from '../src/renderer/src/stores/useSettingsStore'
import type { AppSettings } from '../src/types'

describe('Settings & Theme Engine', () => {
  let mockMatchMedia: ReturnType<typeof vi.fn>
  let classListSet: Set<string>

  beforeEach(() => {
    classListSet = new Set<string>()

    const mockDocument = {
      documentElement: {
        className: '',
        style: { colorScheme: '' },
        setAttribute: vi.fn(),
        classList: {
          add: (cls: string) => classListSet.add(cls),
          remove: (cls: string) => classListSet.delete(cls),
          contains: (cls: string) => classListSet.has(cls)
        }
      }
    }

    mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('light') ? false : true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))

    // Provide window and document globals in node test environment
    const mockWindow = {
      matchMedia: mockMatchMedia,
      api: {
        settings: {
          get: vi.fn().mockResolvedValue({
            language: 'pt-BR',
            theme: 'light',
            defaultPlaybackSpeed: 1.25,
            autoPlayNext: false,
            completionThreshold: 0.9
          } as AppSettings),
          set: vi.fn().mockResolvedValue(true)
        }
      }
    }

    // Assign to globalThis
    ;(globalThis as unknown as { window: typeof mockWindow }).window = mockWindow
    ;(globalThis as unknown as { document: typeof mockDocument }).document = mockDocument

    // Reset store state
    useSettingsStore.setState({
      settings: {
        language: 'en',
        theme: 'dark',
        defaultPlaybackSpeed: 1.0,
        autoPlayNext: true,
        completionThreshold: 0.9
      },
      isLoading: false,
      error: null
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initializes settings from main process and applies theme to document', async () => {
    await useSettingsStore.getState().init()

    const state = useSettingsStore.getState()
    expect(state.settings.language).toBe('pt-BR')
    expect(state.settings.theme).toBe('light')
    expect(state.settings.defaultPlaybackSpeed).toBe(1.25)
    expect(state.settings.autoPlayNext).toBe(false)
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()

    // Document classList should have 'light' added
    expect(classListSet.has('light')).toBe(true)
  })

  it('updates language and persists through window.api', async () => {
    await useSettingsStore.getState().setLanguage('en')

    expect(window.api.settings.set).toHaveBeenCalledWith('language', 'en')
    expect(useSettingsStore.getState().settings.language).toBe('en')
  })

  it('updates theme to dark and removes light class from document', async () => {
    // First set to light
    classListSet.add('light')

    await useSettingsStore.getState().setTheme('dark')

    expect(window.api.settings.set).toHaveBeenCalledWith('theme', 'dark')
    expect(useSettingsStore.getState().settings.theme).toBe('dark')
    expect(classListSet.has('light')).toBe(false)
  })

  it('resolves system theme based on matchMedia prefers-color-scheme', async () => {
    // Mock system preference as light
    mockMatchMedia.mockImplementation((query: string) => ({
      matches: query.includes('light') ? true : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))

    await useSettingsStore.getState().setTheme('system')

    expect(useSettingsStore.getState().settings.theme).toBe('system')
    expect(classListSet.has('light')).toBe(true)
  })

  it('updates generic settings and handles errors gracefully', async () => {
    await useSettingsStore.getState().updateSetting('defaultPlaybackSpeed', 1.75)
    expect(useSettingsStore.getState().settings.defaultPlaybackSpeed).toBe(1.75)

    // Simulate IPC error
    vi.mocked(window.api.settings.set).mockRejectedValueOnce(new Error('IPC Disk Write Failure'))

    await useSettingsStore.getState().updateSetting('autoPlayNext', true)
    expect(useSettingsStore.getState().error).toBe('IPC Disk Write Failure')

    useSettingsStore.getState().clearError()
    expect(useSettingsStore.getState().error).toBeNull()
  })
})
