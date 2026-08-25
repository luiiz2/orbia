import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { appConfigService } from '../../src/main/services/app-config.service'
import { databaseService } from '../../src/main/services/database.service'
import { VaultService } from '../../src/main/services/vault.service'

describe('source watch vault lifecycle', () => {
  let tempRoot: string
  let vaultPath: string

  beforeEach(() => {
    databaseService.close()
    appConfigService.close()
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-source-vault-'))
    vaultPath = path.join(tempRoot, 'vault')
    ;(appConfigService as unknown as { dbPath: string }).dbPath = path.join(
      tempRoot,
      'config.db'
    )
    appConfigService.init()
  })

  afterEach(() => {
    databaseService.close()
    appConfigService.close()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  it('reactivates source watching after every successful create or open', async () => {
    const onVaultOpened = vi.fn()
    const service = new VaultService(onVaultOpened)

    await service.createVault(vaultPath, 'Connected Vault')
    expect(onVaultOpened).toHaveBeenCalledTimes(1)

    await service.openVault(vaultPath)
    expect(onVaultOpened).toHaveBeenCalledTimes(2)
  })
})
