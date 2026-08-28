import { create } from 'zustand'
import type {
  LocalProfile,
  ThemePreset,
  ResolvedTheme,
  ThemeScope,
  ThemeConfig
} from '@shared'
import { useSettingsStore } from './useSettingsStore'

interface ProfileStoreState {
  profiles: LocalProfile[]
  activeProfile: LocalProfile | null
  themePresets: ThemePreset[]
  resolvedTheme: ResolvedTheme | null
  isLoading: boolean

  fetchProfiles: () => Promise<void>
  fetchThemePresets: () => Promise<void>
  fetchResolvedTheme: (courseId?: string, sectionId?: string) => Promise<void>
  setActiveProfile: (profile: LocalProfile) => void
  createProfile: (
    name: string,
    avatarPath?: string
  ) => Promise<LocalProfile | null>
  updateProfile: (
    id: string,
    updates: Partial<LocalProfile>
  ) => Promise<boolean>
  deleteProfile: (id: string) => Promise<boolean>

  saveAppearanceOverride: (
    scopeType: ThemeScope,
    scopeId: string,
    overrides: Partial<ThemeConfig>,
    presetId?: string
  ) => Promise<boolean>
  resetAppearanceOverride: (
    scopeType: ThemeScope,
    scopeId: string,
    category?: string
  ) => Promise<boolean>
  applyResolvedThemeToDom: (theme: ResolvedTheme) => void
}

export const useProfileStore = create<ProfileStoreState>((set, get) => ({
  profiles: [],
  activeProfile: null,
  themePresets: [],
  resolvedTheme: null,
  isLoading: false,

  fetchProfiles: async () => {
    try {
      const list = await window.api.studio.listProfiles()
      set({ profiles: list })
      if (!get().activeProfile && list.length > 0) {
        set({ activeProfile: list[0] })
      }
    } catch (err) {
      console.warn('Failed to fetch profiles:', err)
    }
  },

  fetchThemePresets: async () => {
    try {
      const presets = await window.api.studio.listThemePresets()
      set({ themePresets: presets })
    } catch (err) {
      console.warn('Failed to fetch theme presets:', err)
    }
  },

  fetchResolvedTheme: async (courseId?: string, sectionId?: string) => {
    const profile = get().activeProfile
    try {
      const resolved = await window.api.studio.getResolvedTheme(
        profile?.id || 'default_profile',
        undefined,
        courseId,
        sectionId
      )
      set({ resolvedTheme: resolved })
      get().applyResolvedThemeToDom(resolved)
    } catch (err) {
      console.warn('Failed to fetch resolved theme:', err)
    }
  },

  setActiveProfile: (profile: LocalProfile) => {
    set({ activeProfile: profile })
    get().fetchResolvedTheme().catch(console.warn)
  },

  createProfile: async (name: string, avatarPath?: string) => {
    try {
      const p = await window.api.studio.createProfile(name, avatarPath)
      await get().fetchProfiles()
      return p
    } catch (err) {
      console.warn('Failed to create profile:', err)
      return null
    }
  },

  updateProfile: async (id: string, updates: Partial<LocalProfile>) => {
    try {
      const ok = await window.api.studio.updateProfile(id, updates)
      if (ok) {
        await get().fetchProfiles()
        const currentActive = get().activeProfile
        if (currentActive && currentActive.id === id) {
          set({ activeProfile: { ...currentActive, ...updates } })
        }
      }
      return ok
    } catch (err) {
      console.warn('Failed to update profile:', err)
      return false
    }
  },

  deleteProfile: async (id: string) => {
    try {
      const ok = await window.api.studio.deleteProfile(id)
      if (ok) {
        const deletedWasActive = get().activeProfile?.id === id
        await get().fetchProfiles()
        if (deletedWasActive) {
          const list = get().profiles
          if (list.length > 0) {
            get().setActiveProfile(list[0])
          }
        }
      }
      return ok
    } catch (err) {
      console.warn('Failed to delete profile:', err)
      return false
    }
  },

  saveAppearanceOverride: async (
    scopeType: ThemeScope,
    scopeId: string,
    overrides: Partial<ThemeConfig>,
    presetId?: string
  ) => {
    try {
      const ok = await window.api.studio.saveAppearanceOverride(
        scopeType,
        scopeId,
        overrides,
        presetId
      )
      if (ok) await get().fetchResolvedTheme()
      return ok
    } catch (err) {
      console.warn('Failed to save appearance override:', err)
      return false
    }
  },

  resetAppearanceOverride: async (
    scopeType: ThemeScope,
    scopeId: string,
    category?: string
  ) => {
    try {
      const ok = await window.api.studio.resetAppearanceOverride(
        scopeType,
        scopeId,
        category
      )
      if (ok) await get().fetchResolvedTheme()
      return ok
    } catch (err) {
      console.warn('Failed to reset appearance override:', err)
      return false
    }
  },

  applyResolvedThemeToDom: (theme: ResolvedTheme) => {
    const root = document.documentElement
    if (!root) return

    if (root.style && typeof root.style.removeProperty === 'function') {
      const colorProps = [
        '--background',
        '--foreground',
        '--card',
        '--card-foreground',
        '--popover',
        '--popover-foreground',
        '--primary',
        '--primary-foreground',
        '--secondary',
        '--secondary-foreground',
        '--accent',
        '--accent-foreground',
        '--border',
        '--input',
        '--ring',
        '--card-border'
      ]
      for (const prop of colorProps) {
        root.style.removeProperty(prop)
      }
    }

    const currentTheme = useSettingsStore.getState().settings?.theme || 'dark'
    const isLight =
      currentTheme === 'light' ||
      (currentTheme === 'system' &&
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: light)').matches)

    // If active mode is light, do not inject dark background tokens on html element
    if (isLight) {
      if (theme.cardStyle?.borderRadius) {
        root.style.setProperty('--radius', `${theme.cardStyle.borderRadius}px`)
      }
      return
    }

    const tokens = theme.colorTokens
    if (tokens) {
      if (tokens.background)
        root.style.setProperty('--background', tokens.background)
      if (tokens.foreground)
        root.style.setProperty('--foreground', tokens.foreground)
      if (tokens.primary) root.style.setProperty('--primary', tokens.primary)
      if (tokens.primaryForeground)
        root.style.setProperty('--primary-foreground', tokens.primaryForeground)
      if (tokens.secondary)
        root.style.setProperty('--secondary', tokens.secondary)
      if (tokens.secondaryForeground)
        root.style.setProperty(
          '--secondary-foreground',
          tokens.secondaryForeground
        )
      if (tokens.accent) root.style.setProperty('--accent', tokens.accent)
      if (tokens.card) root.style.setProperty('--card', tokens.card)
      if (tokens.border) root.style.setProperty('--border', tokens.border)
      if (tokens.cardBorder)
        root.style.setProperty('--card-border', tokens.cardBorder)
    }

    if (theme.cardStyle?.borderRadius) {
      root.style.setProperty('--radius', `${theme.cardStyle.borderRadius}px`)
    }
  }
}))
