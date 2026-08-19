import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { appConfigService } from '../src/main/services/app-config.service'
import { vaultService } from '../src/main/services/vault.service'
import { databaseService } from '../src/main/services/database.service'

const TEST_DIR = path.join(__dirname, 'tmp_vault_delete_test')
const TEST_CONFIG_DB = path.join(TEST_DIR, 'config.db')
const TEST_VAULT_1 = path.join(TEST_DIR, 'Vault1')
const TEST_VAULT_2 = path.join(TEST_DIR, 'Vault2')

describe('VaultService - Vault Deletion & Unlinking', () => {
  beforeEach(async () => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
    fs.mkdirSync(TEST_DIR, { recursive: true })

    appConfigService.init(TEST_CONFIG_DB)
  })

  afterEach(() => {
    databaseService.close()
    appConfigService.close()
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('unlinks a vault from registry without deleting files when deleteFiles is false', async () => {
    const vault1 = await vaultService.createVault(TEST_VAULT_1, 'Vault 1')
    expect(fs.existsSync(TEST_VAULT_1)).toBe(true)
    expect(appConfigService.getRecentVaults()).toHaveLength(1)

    const success = await vaultService.deleteVault(vault1.path, false)
    expect(success).toBe(true)

    // Registry is empty
    expect(appConfigService.getRecentVaults()).toHaveLength(0)
    // Physical directory still exists
    expect(fs.existsSync(TEST_VAULT_1)).toBe(true)
    // Active vault is reset if it was open
    expect(vaultService.getCurrentVault()).toBeNull()
  })

  it('deletes vault from registry and deletes files on disk when deleteFiles is true', async () => {
    const vault2 = await vaultService.createVault(TEST_VAULT_2, 'Vault 2')
    expect(fs.existsSync(TEST_VAULT_2)).toBe(true)
    expect(appConfigService.getRecentVaults()).toHaveLength(1)

    const success = await vaultService.deleteVault(vault2.path, true)
    expect(success).toBe(true)

    // Registry is empty
    expect(appConfigService.getRecentVaults()).toHaveLength(0)
    // Physical directory is removed
    expect(fs.existsSync(TEST_VAULT_2)).toBe(false)
  })
})
