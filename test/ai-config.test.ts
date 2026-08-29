import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AppConfigService } from '../src/main/services/app-config.service'
import {
  ElectronAiCredentialStore,
  type AiSafeStorage
} from '../src/main/services/ai/ai-credential.service'

describe('AI configuration and credentials', () => {
  let tempDir: string
  let service: AppConfigService

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-ai-config-'))
    service = new AppConfigService(path.join(tempDir, 'config.db'))
    service.init()
  })

  afterEach(() => {
    service.close()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('returns local-only defaults and persists routing without storing a secret', () => {
    const settings = service.getAiSettings()

    expect(settings.privacyMode).toBe('LOCAL_ONLY')
    expect(settings.providers.ollama.kind).toBe('local')
    expect(settings.providers.openai.apiKeyConfigured).toBe(false)

    service.updateAiRoute('chat', {
      primary: { providerId: 'ollama', modelId: 'llama3' },
      fallback: null
    })

    expect(service.getAiSettings().routes.chat.primary?.modelId).toBe('llama3')
    expect(service.getEncryptedAiCredential('openai')).toBeNull()
    expect(
      (service.getSettings() as unknown as Record<string, unknown>)['ai.config']
    ).toBeUndefined()
  })

  it('encrypts a credential before persistence and decrypts it through the credential store', () => {
    const safeStorage: AiSafeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(`encrypted:${value}`, 'utf8'),
      decryptString: (value) =>
        value.toString('utf8').replace(/^encrypted:/, '')
    }
    const credentials = new ElectronAiCredentialStore(service, safeStorage)

    credentials.set('openai', 'sk-test')

    expect(service.getEncryptedAiCredential('openai')).not.toBe('sk-test')
    expect(credentials.get('openai')).toBe('sk-test')
    expect(service.getAiSettings().providers.openai.apiKeyConfigured).toBe(true)
  })

  it('does not fall back to plaintext when secure storage is unavailable', () => {
    const safeStorage: AiSafeStorage = {
      isEncryptionAvailable: () => false,
      encryptString: () => Buffer.from('never-used'),
      decryptString: () => 'never-used'
    }
    const credentials = new ElectronAiCredentialStore(service, safeStorage)

    expect(() => credentials.set('openai', 'sk-test')).toThrow(
      'Secure credential storage unavailable'
    )
    expect(service.getEncryptedAiCredential('openai')).toBeNull()
  })

  it('rejects Electron basic_text storage even when encryption reports available', () => {
    const safeStorage: AiSafeStorage = {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'basic_text',
      encryptString: () => Buffer.from('never-used'),
      decryptString: () => 'never-used'
    }
    const credentials = new ElectronAiCredentialStore(service, safeStorage)

    expect(() => credentials.set('openai', 'sk-test')).toThrow(
      'Secure credential storage unavailable'
    )
    expect(service.getEncryptedAiCredential('openai')).toBeNull()
  })

  it('persists the explicit cloud data-type allowlist without exposing secrets', () => {
    service.setAiAllowedCloudDataTypes(['notes', 'pdf'])

    expect(service.getAiSettings().allowedCloudDataTypes).toEqual([
      'notes',
      'pdf'
    ])
    expect(JSON.stringify(service.getAiSettings())).not.toContain('sk-')
  })
})
