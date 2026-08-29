import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { VaultService } from '../src/main/services/vault.service'
import { appConfigService } from '../src/main/services/app-config.service'

describe('Vault & Database Services', () => {
  let tempVaultDir: string
  let tempConfigDir: string
  let vaultSvc: VaultService

  beforeEach(async () => {
    tempVaultDir = path.join(os.tmpdir(), `orbia-vault-test-${Date.now()}`)
    tempConfigDir = path.join(os.tmpdir(), `orbia-cfg-test-${Date.now()}`)
    fs.mkdirSync(tempVaultDir, { recursive: true })
    fs.mkdirSync(tempConfigDir, { recursive: true })

    // Init appConfig in temp directory
    const customConfig = path.join(tempConfigDir, 'config.db')
    // Override appConfigService db path for testing
    ;(appConfigService as unknown as { dbPath: string }).dbPath = customConfig
    appConfigService.init()

    vaultSvc = new VaultService()
  })

  afterEach(() => {
    appConfigService.close()
    try {
      fs.rmSync(tempVaultDir, { recursive: true, force: true })
      fs.rmSync(tempConfigDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('creates vault directory topology and initializes library.db', async () => {
    const vault = await vaultSvc.createVault(tempVaultDir, 'My Learning Vault')

    expect(vault.name).toBe('My Learning Vault')
    expect(vault.path).toBe(tempVaultDir)
    expect(fs.existsSync(path.join(tempVaultDir, 'Inbox'))).toBe(true)
    expect(fs.existsSync(path.join(tempVaultDir, 'Courses'))).toBe(true)
    expect(fs.existsSync(path.join(tempVaultDir, '.orbia', 'library.db'))).toBe(
      true
    )
  })
})
