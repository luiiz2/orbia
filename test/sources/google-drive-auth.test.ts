import { describe, expect, it, vi } from 'vitest'
import { GoogleDriveCredentialStore } from '../../src/main/services/sources/google/google-credential-store'
import {
  GoogleOAuthService,
  GOOGLE_DRIVE_READONLY_SCOPE,
  GOOGLE_OAUTH_TOKEN_URL
} from '../../src/main/services/sources/google/google-oauth.service'
import type { AiSafeStorage } from '../../src/main/services/ai/ai-credential.service'
import type { StoredGoogleDriveAccount } from '../../src/main/services/sources/google/google-credential-store'

function createSafeStorage(): AiSafeStorage {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`),
    decryptString: (value) => value.toString().replace(/^encrypted:/, ''),
    getSelectedStorageBackend: () => 'os_crypt'
  }
}

function createConfig(): {
  getGoogleDriveAccount: () => StoredGoogleDriveAccount | null
  setGoogleDriveAccount: (account: StoredGoogleDriveAccount) => void
  clearGoogleDriveAccount: () => void
  getStored: () => StoredGoogleDriveAccount | null
} {
  let stored: StoredGoogleDriveAccount | null = null
  return {
    getGoogleDriveAccount: () => stored,
    setGoogleDriveAccount: (account) => {
      stored = account
    },
    clearGoogleDriveAccount: () => {
      stored = null
    },
    getStored: () => stored
  }
}

describe('Google Drive credentials and OAuth', () => {
  it('encrypts refresh tokens and never returns the persisted ciphertext as a token', () => {
    const config = createConfig()
    const store = new GoogleDriveCredentialStore(config, createSafeStorage())

    store.set({
      accountId: 'account-1',
      displayName: 'Study Account',
      email: 'study@example.com',
      refreshToken: 'refresh-token-value',
      scopes: [GOOGLE_DRIVE_READONLY_SCOPE]
    })

    const persisted = config.getStored()
    expect(persisted?.encryptedRefreshToken).not.toContain(
      'refresh-token-value'
    )
    expect(store.get()).toMatchObject({
      accountId: 'account-1',
      refreshToken: 'refresh-token-value',
      scopes: [GOOGLE_DRIVE_READONLY_SCOPE]
    })
  })

  it('refreshes an access token through Google without exposing credentials to the renderer contract', async () => {
    const config = createConfig()
    const store = new GoogleDriveCredentialStore(config, createSafeStorage())
    store.set({
      accountId: 'account-1',
      displayName: 'Study Account',
      refreshToken: 'refresh-token-value',
      scopes: [GOOGLE_DRIVE_READONLY_SCOPE]
    })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: 'access-token', expires_in: 3600 }),
        {
          status: 200
        }
      )
    )
    const oauth = new GoogleOAuthService({
      clientId: 'client-id.apps.googleusercontent.com',
      credentialStore: store,
      fetch: fetchMock
    })

    await expect(oauth.getAccessToken()).resolves.toBe('access-token')
    expect(fetchMock).toHaveBeenCalledWith(
      GOOGLE_OAUTH_TOKEN_URL,
      expect.objectContaining({ method: 'POST' })
    )
    expect(oauth.getStatus()).toMatchObject({
      configured: true,
      connected: true,
      account: { accountId: 'account-1' }
    })
  })

  it('uses a loopback callback with state and PKCE before exchanging the authorization code', async () => {
    const config = createConfig()
    const store = new GoogleDriveCredentialStore(config, createSafeStorage())
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            expires_in: 3600,
            scope: GOOGLE_DRIVE_READONLY_SCOPE
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ sub: 'account-1', name: 'Study Account' }),
          { status: 200 }
        )
      )
    let authorizationUrl: URL | undefined
    const oauth = new GoogleOAuthService({
      clientId: 'client-id.apps.googleusercontent.com',
      credentialStore: store,
      fetch: fetchMock,
      openExternal: async (url) => {
        authorizationUrl = new URL(url)
        const redirectUri = authorizationUrl.searchParams.get('redirect_uri')
        const state = authorizationUrl.searchParams.get('state')
        if (!redirectUri || !state) throw new Error('OAuth URL incomplete')
        const callback = new URL(redirectUri)
        callback.search = new URLSearchParams({
          code: 'authorization-code',
          state
        }).toString()
        await fetch(callback)
        return true
      }
    })

    await expect(oauth.connect()).resolves.toMatchObject({
      configured: true,
      connected: true,
      account: { accountId: 'account-1' }
    })
    expect(authorizationUrl?.searchParams.get('response_type')).toBe('code')
    expect(authorizationUrl?.searchParams.get('scope')).toBe(
      GOOGLE_DRIVE_READONLY_SCOPE
    )
    expect(authorizationUrl?.searchParams.get('code_challenge_method')).toBe(
      'S256'
    )
    expect(authorizationUrl?.searchParams.get('state')).toHaveLength(43)
    expect(authorizationUrl?.searchParams.get('code_challenge')).toHaveLength(
      43
    )
    expect(store.get()).toMatchObject({
      accountId: 'account-1',
      refreshToken: 'refresh-token'
    })
  })

  it('refuses persistent credentials when secure storage is unavailable', () => {
    const config = createConfig()
    const unsafeStorage: AiSafeStorage = {
      ...createSafeStorage(),
      isEncryptionAvailable: () => false
    }
    const store = new GoogleDriveCredentialStore(config, unsafeStorage)

    expect(() =>
      store.set({
        accountId: 'account-1',
        displayName: 'Study Account',
        refreshToken: 'refresh-token-value',
        scopes: [GOOGLE_DRIVE_READONLY_SCOPE]
      })
    ).toThrow('Secure credential storage unavailable')
  })
})
