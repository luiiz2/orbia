import type { AiSafeStorage } from '../../ai/ai-credential.service'

export interface GoogleDriveCredential {
  accountId: string
  displayName: string
  email?: string
  refreshToken: string
  scopes: string[]
}

export interface StoredGoogleDriveAccount {
  accountId: string
  displayName: string
  email: string | null
  encryptedRefreshToken: string
  scopes: string[]
  status: 'connected' | 'auth-required' | 'disconnected'
  updatedAt: number
}

export interface GoogleDriveCredentialConfig {
  getGoogleDriveAccount: () => StoredGoogleDriveAccount | null
  setGoogleDriveAccount: (account: StoredGoogleDriveAccount) => void
  clearGoogleDriveAccount: () => void
}

function getElectronSafeStorage(): AiSafeStorage {
  try {
    // Dynamic require keeps non-Electron test runtimes usable.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as { safeStorage?: AiSafeStorage }
    if (electron.safeStorage) return electron.safeStorage
  } catch {
    // The caller receives a clear secure-storage error below.
  }

  return {
    isEncryptionAvailable: () => false,
    encryptString: () => {
      throw new Error('Secure credential storage unavailable')
    },
    decryptString: () => {
      throw new Error('Secure credential storage unavailable')
    }
  }
}

export class GoogleDriveCredentialStore {
  private readonly safeStorage: AiSafeStorage

  public constructor(
    private readonly config: GoogleDriveCredentialConfig,
    safeStorage?: AiSafeStorage
  ) {
    this.safeStorage = safeStorage ?? getElectronSafeStorage()
  }

  public get(): GoogleDriveCredential | null {
    const account = this.config.getGoogleDriveAccount()
    if (!account || account.status !== 'connected') return null
    this.assertEncryptionAvailable()

    try {
      const refreshToken = this.safeStorage.decryptString(
        Buffer.from(account.encryptedRefreshToken, 'base64')
      )
      if (!refreshToken) throw new Error('Empty refresh token')
      return {
        accountId: account.accountId,
        displayName: account.displayName,
        ...(account.email ? { email: account.email } : {}),
        refreshToken,
        scopes: account.scopes
      }
    } catch {
      throw new Error('Stored Google Drive credential is invalid')
    }
  }

  public set(credential: GoogleDriveCredential): void {
    if (
      !credential.accountId ||
      !credential.displayName ||
      !credential.refreshToken
    ) {
      throw new Error('Google Drive credential is incomplete')
    }
    this.assertEncryptionAvailable()
    const encryptedRefreshToken = this.safeStorage
      .encryptString(credential.refreshToken)
      .toString('base64')
    this.config.setGoogleDriveAccount({
      accountId: credential.accountId,
      displayName: credential.displayName,
      email: credential.email ?? null,
      encryptedRefreshToken,
      scopes: [...credential.scopes],
      status: 'connected',
      updatedAt: Date.now()
    })
  }

  public markAuthRequired(): void {
    const account = this.config.getGoogleDriveAccount()
    if (!account) return
    this.config.setGoogleDriveAccount({
      ...account,
      status: 'auth-required',
      updatedAt: Date.now()
    })
  }

  public clear(): void {
    this.config.clearGoogleDriveAccount()
  }

  private assertEncryptionAvailable(): void {
    const backend = this.safeStorage.getSelectedStorageBackend?.()
    if (
      !this.safeStorage.isEncryptionAvailable() ||
      backend === 'basic_text' ||
      backend === 'unknown'
    ) {
      throw new Error('Secure credential storage unavailable')
    }
  }
}
