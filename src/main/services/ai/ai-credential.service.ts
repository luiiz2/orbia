import type { AiProviderId } from '../../../types/ai'
import { AI_PROVIDER_IDS } from '../../../types/ai'
import type { AppConfigService } from '../app-config.service'
import { appConfigService } from '../app-config.service'

export interface AiSafeStorage {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
  getSelectedStorageBackend?: () => string
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

export class ElectronAiCredentialStore {
  private readonly safeStorage: AiSafeStorage

  constructor(
    private readonly config: Pick<
      AppConfigService,
      | 'getEncryptedAiCredential'
      | 'setEncryptedAiCredential'
      | 'clearAiCredential'
    >,
    safeStorage?: AiSafeStorage
  ) {
    this.safeStorage = safeStorage ?? getElectronSafeStorage()
  }

  public get(providerId: AiProviderId): string | null {
    this.assertProvider(providerId)
    const encrypted = this.config.getEncryptedAiCredential(providerId)
    if (!encrypted) return null
    this.assertEncryptionAvailable()

    try {
      return this.safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch {
      throw new Error('Stored AI credential is invalid')
    }
  }

  public set(providerId: AiProviderId, secret: string): void {
    this.assertProvider(providerId)
    if (typeof secret !== 'string')
      throw new Error('AI credential must be a string')
    if (!secret) {
      this.clear(providerId)
      return
    }
    this.assertEncryptionAvailable()
    const encrypted = this.safeStorage.encryptString(secret).toString('base64')
    this.config.setEncryptedAiCredential(providerId, encrypted)
  }

  public clear(providerId: AiProviderId): void {
    this.assertProvider(providerId)
    this.config.clearAiCredential(providerId)
  }

  private assertProvider(providerId: AiProviderId): void {
    if (!AI_PROVIDER_IDS.includes(providerId))
      throw new Error('Unknown AI provider')
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

export const aiCredentialStore = new ElectronAiCredentialStore(
  // The global service is initialized lazily, like the existing app config service.
  appConfigService
)
