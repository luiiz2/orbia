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
    const beforeVaultChange = vi.fn(async () => undefined)
    const service = new VaultService(onVaultOpened, beforeVaultChange)

    await service.createVault(vaultPath, 'Connected Vault')
    expect(beforeVaultChange).toHaveBeenCalledTimes(1)
    expect(onVaultOpened).toHaveBeenCalledTimes(1)
    expect(beforeVaultChange.mock.invocationCallOrder[0]).toBeLessThan(
      onVaultOpened.mock.invocationCallOrder[0]
    )

    await service.openVault(vaultPath)
    expect(beforeVaultChange).toHaveBeenCalledTimes(2)
    expect(onVaultOpened).toHaveBeenCalledTimes(2)
    expect(beforeVaultChange.mock.invocationCallOrder[1]).toBeLessThan(
      onVaultOpened.mock.invocationCallOrder[1]
    )

    await service.deleteVault(vaultPath, false)
    expect(beforeVaultChange).toHaveBeenCalledTimes(3)
    expect(onVaultOpened).toHaveBeenCalledTimes(2)
  })

  it('serializes concurrent vault changes around the database switch', async () => {
    const secondVaultPath = path.join(tempRoot, 'second-vault')
    let releaseFirstChange: (() => void) | undefined
    const beforeVaultChange = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFirstChange = resolve
          })
      )
      .mockResolvedValue(undefined)
    const onVaultOpened = vi.fn()
    const service = new VaultService(onVaultOpened, beforeVaultChange)

    const firstChange = service.createVault(vaultPath, 'First Vault')
    const secondChange = service.createVault(secondVaultPath, 'Second Vault')

    await vi.waitFor(() => {
      expect(fs.existsSync(path.join(vaultPath, '.orbia', 'covers'))).toBe(true)
      expect(beforeVaultChange).toHaveBeenCalledTimes(1)
      expect(
        fs.existsSync(path.join(secondVaultPath, '.orbia', 'covers'))
      ).toBe(false)
    })

    releaseFirstChange!()
    await Promise.all([firstChange, secondChange])

    expect(beforeVaultChange).toHaveBeenCalledTimes(2)
    expect(onVaultOpened).toHaveBeenCalledTimes(2)
    expect(fs.existsSync(path.join(secondVaultPath, '.orbia', 'covers'))).toBe(
      true
    )
  })
})
