import { create } from 'zustand'
import type { Vault, VaultStats } from '@shared'

export interface VaultState {
  currentVault: Vault | null
  recentVaults: Vault[]
  stats: VaultStats | null
  isLoading: boolean
  error: string | null

  // Actions
  init: () => Promise<void>
  openVault: (path: string) => Promise<{ success: boolean; vault?: Vault; error?: string }>
  createVault: (path: string, name: string) => Promise<{ success: boolean; vault?: Vault; error?: string }>
  selectDirectory: () => Promise<string | null>
  refreshStats: () => Promise<void>
  setCurrentVault: (vault: Vault | null) => void
  clearError: () => void
}

export const useVaultStore = create<VaultState>((set, get) => ({
  currentVault: null,
  recentVaults: [],
  stats: null,
  isLoading: false,
  error: null,

  init: async () => {
    set({ isLoading: true, error: null })
    try {
      const [currentVault, recentVaults] = await Promise.all([
        window.api.vault.getCurrent(),
        window.api.vault.getRecent()
      ])

      let stats: VaultStats | null = null
      if (currentVault) {
        try {
          stats = await window.api.vault.getStats()
        } catch (statsErr) {
          console.warn('Failed to fetch vault stats during init:', statsErr)
        }
      }

      set({
        currentVault,
        recentVaults: recentVaults || [],
        stats,
        isLoading: false
      })
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      set({
        error: errorMessage,
        isLoading: false
      })
    }
  },

  openVault: async (path: string) => {
    set({ isLoading: true, error: null })
    try {
      const res = await window.api.vault.open(path)
      if (res.success && res.vault) {
        const [recentVaults, stats] = await Promise.all([
          window.api.vault.getRecent(),
          window.api.vault.getStats().catch(() => null)
        ])
        set({
          currentVault: res.vault,
          recentVaults: recentVaults || [],
          stats,
          isLoading: false,
          error: null
        })
        return res
      } else {
        const errorMsg = res.error || 'Failed to open vault'
        set({ error: errorMsg, isLoading: false })
        return { success: false, error: errorMsg }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      set({ error: errorMsg, isLoading: false })
      return { success: false, error: errorMsg }
    }
  },

  createVault: async (path: string, name: string) => {
    set({ isLoading: true, error: null })
    try {
      const res = await window.api.vault.create(path, name)
      if (res.success && res.vault) {
        const [recentVaults, stats] = await Promise.all([
          window.api.vault.getRecent(),
          window.api.vault.getStats().catch(() => null)
        ])
        set({
          currentVault: res.vault,
          recentVaults: recentVaults || [],
          stats,
          isLoading: false,
          error: null
        })
        return res
      } else {
        const errorMsg = res.error || 'Failed to create vault'
        set({ error: errorMsg, isLoading: false })
        return { success: false, error: errorMsg }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      set({ error: errorMsg, isLoading: false })
      return { success: false, error: errorMsg }
    }
  },

  selectDirectory: async () => {
    try {
      return await window.api.vault.selectDirectory()
    } catch (err: unknown) {
      console.error('Failed to select directory:', err)
      return null
    }
  },

  refreshStats: async () => {
    const { currentVault } = get()
    if (!currentVault) return

    try {
      const stats = await window.api.vault.getStats()
      set({ stats })
    } catch (err: unknown) {
      console.error('Failed to refresh stats:', err)
    }
  },

  setCurrentVault: (vault: Vault | null) => {
    set({ currentVault: vault })
  },

  clearError: () => {
    set({ error: null })
  }
}))
