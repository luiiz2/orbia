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
  openVault: (
    path: string
  ) => Promise<{ success: boolean; vault?: Vault; error?: string }>
  createVault: (
    path: string,
    name: string
  ) => Promise<{ success: boolean; vault?: Vault; error?: string }>
  deleteVault: (
    path: string,
    deleteFiles: boolean
  ) => Promise<{ success: boolean; error?: string }>
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

  deleteVault: async (path: string, deleteFiles: boolean) => {
    set({ isLoading: true, error: null })
    try {
      const res = await window.api.vault.delete(path, deleteFiles)
      if (res.success) {
        const recentVaults = await window.api.vault.getRecent()
        const { currentVault } = get()
        const wasActive = currentVault?.path === path

        let newActiveVault = wasActive ? null : currentVault
        let stats = wasActive ? null : get().stats

        if (wasActive && recentVaults && recentVaults.length > 0) {
          try {
            const openRes = await window.api.vault.open(recentVaults[0].path)
            if (openRes.success && openRes.vault) {
              newActiveVault = openRes.vault
              stats = await window.api.vault.getStats().catch(() => null)
            }
          } catch (openErr) {
            console.warn('Could not open next recent vault:', openErr)
          }
        }

        set({
          currentVault: newActiveVault,
          recentVaults: recentVaults || [],
          stats,
          isLoading: false,
          error: null
        })
        return { success: true }
      } else {
        const errorMsg = res.error || 'Failed to delete vault'
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
