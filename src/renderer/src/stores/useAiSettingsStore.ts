import { create } from 'zustand'
import type {
  AiModel,
  AiDataType,
  AiPrivacyMode,
  AiProviderHealth,
  AiProviderId,
  AiProviderUpdate,
  AiRouteUpdate,
  AiSettingsSnapshot
} from '@shared'

export interface AiSettingsState {
  settings: AiSettingsSnapshot | null
  models: Partial<Record<AiProviderId, AiModel[]>>
  health: Partial<Record<AiProviderId, AiProviderHealth>>
  isLoading: boolean
  error: string | null
  storageStats: import('@shared').AiStorageStats | null
  usageStats: import('@shared').AiLocalUsageStats | null
  init: () => Promise<void>
  saveProvider: (input: AiProviderUpdate) => Promise<void>
  setRoute: (input: AiRouteUpdate) => Promise<void>
  setPrivacyMode: (privacyMode: AiPrivacyMode) => Promise<void>
  setAllowedCloudDataTypes: (dataTypes: AiDataType[]) => Promise<void>
  discoverModels: (providerId: AiProviderId) => Promise<void>
  checkHealth: (providerId: AiProviderId, modelId?: string) => Promise<void>
  fetchStorageStats: () => Promise<void>
  clearStorageCategory: (
    category: import('@shared').AiStorageCategory
  ) => Promise<boolean>
  fetchUsageStats: () => Promise<void>
  resetUsageStats: () => Promise<boolean>
  clearError: () => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const useAiSettingsStore = create<AiSettingsState>((set, get) => ({
  settings: null,
  models: {},
  health: {},
  storageStats: null,
  usageStats: null,
  isLoading: false,
  error: null,

  init: async () => {
    set({ isLoading: true, error: null })
    try {
      const settings = await window.api.ai.getSettings()
      set({ settings, isLoading: false })
      void get().fetchStorageStats()
      void get().fetchUsageStats()
    } catch (error) {
      set({ error: errorMessage(error), isLoading: false })
    }
  },

  saveProvider: async (input) => {
    set({ isLoading: true, error: null })
    try {
      const settings = await window.api.ai.saveProvider(input)
      set({ settings, isLoading: false })
    } catch (error) {
      set({ error: errorMessage(error), isLoading: false })
    }
  },

  setRoute: async (input) => {
    set({ isLoading: true, error: null })
    try {
      const settings = await window.api.ai.setRoute(input)
      set({ settings, isLoading: false })
    } catch (error) {
      set({ error: errorMessage(error), isLoading: false })
    }
  },

  setPrivacyMode: async (privacyMode) => {
    set({ isLoading: true, error: null })
    try {
      const settings = await window.api.ai.setPrivacyMode(privacyMode)
      set({ settings, isLoading: false })
    } catch (error) {
      set({ error: errorMessage(error), isLoading: false })
    }
  },

  setAllowedCloudDataTypes: async (dataTypes) => {
    set({ isLoading: true, error: null })
    try {
      const settings = await window.api.ai.setAllowedCloudDataTypes(dataTypes)
      set({ settings, isLoading: false })
    } catch (error) {
      set({ error: errorMessage(error), isLoading: false })
    }
  },

  discoverModels: async (providerId) => {
    set({ isLoading: true, error: null })
    try {
      const models = await window.api.ai.discoverModels(providerId)
      set((state) => ({
        models: { ...state.models, [providerId]: models },
        isLoading: false
      }))
    } catch (error) {
      set({ error: errorMessage(error), isLoading: false })
    }
  },

  checkHealth: async (providerId, modelId) => {
    set({ isLoading: true, error: null })
    try {
      const health = await window.api.ai.health(providerId, modelId)
      set((state) => ({
        health: { ...state.health, [providerId]: health },
        isLoading: false
      }))
    } catch (error) {
      set({ error: errorMessage(error), isLoading: false })
    }
  },

  fetchStorageStats: async () => {
    try {
      const storageStats = await window.api.ai.getStorageStats()
      set({ storageStats })
    } catch {
      // ignore
    }
  },

  clearStorageCategory: async (category) => {
    try {
      const success = await window.api.ai.clearStorageCategory(category)
      if (success) {
        void get().fetchStorageStats()
      }
      return success
    } catch (error) {
      set({ error: errorMessage(error) })
      return false
    }
  },

  fetchUsageStats: async () => {
    try {
      const usageStats = await window.api.ai.getUsageStats()
      set({ usageStats })
    } catch {
      // ignore
    }
  },

  resetUsageStats: async () => {
    try {
      const success = await window.api.ai.resetUsageStats()
      if (success) {
        void get().fetchUsageStats()
      }
      return success
    } catch (error) {
      set({ error: errorMessage(error) })
      return false
    }
  },

  clearError: () => set({ error: null })
}))
