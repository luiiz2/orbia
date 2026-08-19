import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { AppConfigService } from '../src/main/services/app-config.service'

describe('AppConfigService', () => {
  let tempDir: string
  let service: AppConfigService

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `orbia-config-test-${Date.now()}`)
    fs.mkdirSync(tempDir, { recursive: true })
    const configPath = path.join(tempDir, 'config.db')
    service = new AppConfigService(configPath)
    service.init()
  })

  afterEach(() => {
    service.close()
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('registers vaults and lists them ordered by lastOpened', () => {
    const now = Date.now()
    service.registerVault({
      id: 'v1',
      name: 'Vault 1',
      path: '/path/to/vault1',
      createdAt: now - 10000,
      lastOpened: now - 10000
    })

    service.registerVault({
      id: 'v2',
      name: 'Vault 2',
      path: '/path/to/vault2',
      createdAt: now,
      lastOpened: now
    })

    const recent = service.getRecentVaults()
    expect(recent.length).toBe(2)
    expect(recent[0].id).toBe('v2') // most recent first
    expect(recent[1].id).toBe('v1')
  })

  it('updates vault lastOpened timestamp', () => {
    const now = Date.now()
    service.registerVault({
      id: 'v1',
      name: 'Vault 1',
      path: '/path/to/vault1',
      createdAt: now - 5000,
      lastOpened: now - 5000
    })

    service.updateVaultLastOpened('/path/to/vault1')
    const vault = service.getVaultByPath('/path/to/vault1')
    expect(vault).not.toBeNull()
    expect(vault!.lastOpened).toBeGreaterThanOrEqual(now)
  })

  it('persists and retrieves app settings', () => {
    const initial = service.getSettings()
    expect(initial.theme).toBe('dark')
    expect(initial.language).toBe('en')

    service.setSetting('language', 'pt-BR')
    service.setSetting('defaultPlaybackSpeed', 1.5)

    const updated = service.getSettings()
    expect(updated.language).toBe('pt-BR')
    expect(updated.defaultPlaybackSpeed).toBe(1.5)
  })
})
