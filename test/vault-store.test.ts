import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useVaultStore } from '../src/renderer/src/stores/useVaultStore'
import type { Vault, VaultStats } from '../src/types'

describe('VaultStore Operations', () => {
  const mockVault: Vault = {
    id: 'vault-test-1',
    name: 'Primary Vault',
    path: '/vaults/primary',
    createdAt: 1000,
    lastOpened: 1000
  }

  const mockStats: VaultStats = {
    courseCount: 5,
    moduleCount: 15,
    lessonCount: 45,
    totalDuration: 54000,
    completedLessons: 10,
    totalWatchedTime: 12000
  }

  beforeEach(() => {
    // Provide window global mock in node environment
    const mockWindow = {
      api: {
        vault: {
          getCurrent: vi.fn().mockResolvedValue(mockVault),
          getRecent: vi.fn().mockResolvedValue([mockVault]),
          getStats: vi.fn().mockResolvedValue(mockStats),
          open: vi.fn().mockResolvedValue({ success: true, vault: mockVault }),
          create: vi.fn().mockResolvedValue({ success: true, vault: mockVault }),
          selectDirectory: vi.fn().mockResolvedValue('/vaults/selected')
        }
      }
    }

    ;(globalThis as unknown as { window: typeof mockWindow }).window = mockWindow

    useVaultStore.setState({
      currentVault: null,
      recentVaults: [],
      stats: null,
      isLoading: false,
      error: null
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initializes vault store with current vault, recent list, and stats', async () => {
    await useVaultStore.getState().init()

    const state = useVaultStore.getState()
    expect(state.currentVault?.id).toBe('vault-test-1')
    expect(state.recentVaults.length).toBe(1)
    expect(state.stats?.courseCount).toBe(5)
    expect(state.isLoading).toBe(false)
  })

  it('opens vault successfully and refreshes recent list & stats', async () => {
    const result = await useVaultStore.getState().openVault('/vaults/primary')

    expect(result.success).toBe(true)
    expect(window.api.vault.open).toHaveBeenCalledWith('/vaults/primary')
    expect(useVaultStore.getState().currentVault?.path).toBe('/vaults/primary')
  })

  it('handles open vault failure cleanly', async () => {
    vi.mocked(window.api.vault.open).mockResolvedValueOnce({
      success: false,
      error: 'Vault directory does not exist'
    })

    const result = await useVaultStore.getState().openVault('/invalid/path')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Vault directory does not exist')
    expect(useVaultStore.getState().error).toBe('Vault directory does not exist')
  })

  it('creates new vault and sets it as current', async () => {
    const result = await useVaultStore.getState().createVault('/vaults/new', 'New Vault')

    expect(result.success).toBe(true)
    expect(window.api.vault.create).toHaveBeenCalledWith('/vaults/new', 'New Vault')
    expect(useVaultStore.getState().currentVault?.name).toBe('Primary Vault')
  })

})
