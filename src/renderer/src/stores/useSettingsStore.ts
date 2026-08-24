import { create } from 'zustand'
import type { AppSettings } from '@shared'
import i18n from '../i18n'

export interface SettingsState {
  settings: AppSettings
  isLoading: boolean
  error: string | null

  // Actions
  init: () => Promise<void>
  setLanguage: (lang: 'en' | 'pt-BR') => Promise<void>
  setTheme: (theme: 'dark' | 'light' | 'system') => Promise<void>
  updateSetting: <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => Promise<void>
  clearError: () => void
}

const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  theme: 'dark',
  defaultPlaybackSpeed: 1.0,
  autoPlayNext: true,
  completionThreshold: 0.9,
  deleteSourceZipAfterImport: false,
  dailyStudyGoalMinutes: 30,
  weeklyLessonsGoal: 10
}

function applyTheme(theme: 'dark' | 'light' | 'system'): void {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  if (!root) return

  const isLight =
    theme === 'system'
      ? typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: light)').matches
      : theme === 'light'

  if (root.classList) {
    if (isLight) {
      root.classList.remove('dark')
      root.classList.add('light')
    } else {
      root.classList.remove('light')
      root.classList.add('dark')
    }
  }

  if (typeof root.setAttribute === 'function') {
    root.setAttribute('data-theme', isLight ? 'light' : 'dark')
  }

  if (root.style) {
    root.style.colorScheme = isLight ? 'light' : 'dark'
  }

  try {
    localStorage.setItem('orbia_theme', theme)
  } catch {
    // Ignore localStorage errors
  }
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULT_SETTINGS,
  isLoading: false,
  error: null,

  init: async () => {
    set({ isLoading: true, error: null })
    try {
      const settings = await window.api.settings.get()
      const mergedSettings: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...(settings || {})
      }

      set({
        settings: mergedSettings,
        isLoading: false
      })

      // Apply initial theme and language
      applyTheme(mergedSettings.theme)
      if (mergedSettings.language) {
        try {
          localStorage.setItem('i18nextLng', mergedSettings.language)
        } catch {
          // Ignore localStorage failure in restrictive environments
        }
        i18n.changeLanguage(mergedSettings.language).catch((err) => {
          console.warn('Failed to change language:', err)
        })
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      set({
        error: errorMsg,
        isLoading: false
      })
    }
  },

  setLanguage: async (lang: 'en' | 'pt-BR') => {
    try {
      try {
        localStorage.setItem('i18nextLng', lang)
      } catch {
        // Ignore localStorage failure in restrictive environments
      }
      await window.api.settings.set('language', lang)
      await i18n.changeLanguage(lang)
      set((state) => ({
        settings: {
          ...state.settings,
          language: lang
        }
      }))
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      set({ error: errorMsg })
    }
  },

  setTheme: async (theme: 'dark' | 'light' | 'system') => {
    try {
      applyTheme(theme)
      await window.api.settings.set('theme', theme)
      set((state) => ({
        settings: {
          ...state.settings,
          theme
        }
      }))
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      set({ error: errorMsg })
    }
  },

  updateSetting: async <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => {
    try {
      await window.api.settings.set(key, val)
      set((state) => ({
        settings: {
          ...state.settings,
          [key]: val
        }
      }))

      if (key === 'theme') {
        applyTheme(val as 'dark' | 'light' | 'system')
      } else if (key === 'language') {
        i18n.changeLanguage(val as string).catch(console.warn)
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      set({ error: errorMsg })
    }
  },

  clearError: () => {
    set({ error: null })
  }
}))
