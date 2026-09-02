import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type {
  GoogleDriveAccountSummary,
  GoogleDriveConnectionStatus
} from '../../../../types/google-drive'
import { GoogleDriveCredentialStore } from './google-credential-store'

export const GOOGLE_DRIVE_READONLY_SCOPE =
  'https://www.googleapis.com/auth/drive.readonly'
export const GOOGLE_OAUTH_AUTHORIZATION_URL =
  'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const GOOGLE_OAUTH_USERINFO_URL =
  'https://www.googleapis.com/oauth2/v3/userinfo'

export interface GoogleOAuthServiceOptions {
  credentialStore: GoogleDriveCredentialStore
  clientId?: string
  fetch?: typeof fetch
  openExternal?: (url: string) => Promise<boolean | void>
  callbackTimeoutMs?: number
}

interface GoogleTokenResponse {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
}

interface GoogleUserInfo {
  sub?: string
  email?: string
  name?: string
}

export class GoogleOAuthError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'GoogleOAuthError'
  }
}

export class GoogleOAuthService {
  private readonly fetchImpl: typeof fetch
  private readonly clientId: string
  private readonly openExternal: (url: string) => Promise<boolean | void>
  private readonly callbackTimeoutMs: number
  private cachedAccessToken: { token: string; expiresAt: number } | null = null

  public constructor(private readonly options: GoogleOAuthServiceOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.clientId =
      options.clientId?.trim() ||
      process.env.ORBIA_GOOGLE_DRIVE_CLIENT_ID?.trim() ||
      ''
    this.openExternal = options.openExternal ?? openSystemBrowser
    this.callbackTimeoutMs = Math.max(
      10_000,
      options.callbackTimeoutMs ?? 180_000
    )
  }

  public getStatus(): GoogleDriveConnectionStatus {
    if (!this.clientId) return { configured: false, connected: false }

    try {
      const credential = this.options.credentialStore.get()
      return {
        configured: true,
        connected: Boolean(credential),
        ...(credential ? { account: toAccountSummary(credential) } : {})
      }
    } catch {
      return { configured: true, connected: false }
    }
  }

  public getConnectedAccount(): GoogleDriveAccountSummary | null {
    const credential = this.options.credentialStore.get()
    return credential ? toAccountSummary(credential) : null
  }

  public async connect(): Promise<GoogleDriveConnectionStatus> {
    this.assertConfigured()
    const previousCredential = this.options.credentialStore.get()
    const { code, redirectUri } = await this.waitForAuthorization()
    const token = await this.exchangeCode(code, redirectUri)
    const scopes = parseScopes(token.scope)
    if (!scopes.includes(GOOGLE_DRIVE_READONLY_SCOPE)) {
      throw new GoogleOAuthError(
        'Google Drive did not grant the required read-only permission'
      )
    }

    const accessToken = requireToken(token.access_token, 'access token')
    const userInfo = await this.fetchUserInfo(accessToken)
    const accountId = requireValue(userInfo.sub, 'Google account identity')
    const refreshToken = token.refresh_token || previousCredential?.refreshToken
    if (!refreshToken) {
      throw new GoogleOAuthError(
        'Google did not return a refresh token; reconnect and approve offline access'
      )
    }

    this.options.credentialStore.set({
      accountId,
      displayName:
        typeof userInfo.name === 'string' && userInfo.name.trim()
          ? userInfo.name.trim()
          : typeof userInfo.email === 'string' && userInfo.email.trim()
            ? userInfo.email.trim()
            : accountId,
      ...(typeof userInfo.email === 'string' && userInfo.email.trim()
        ? { email: userInfo.email.trim() }
        : {}),
      refreshToken,
      scopes
    })
    this.cachedAccessToken = {
      token: accessToken,
      expiresAt: Date.now() + Math.max(60, token.expires_in ?? 3600) * 1000
    }

    return {
      configured: true,
      connected: true,
      account: {
        accountId,
        displayName:
          typeof userInfo.name === 'string' && userInfo.name.trim()
            ? userInfo.name.trim()
            : typeof userInfo.email === 'string' && userInfo.email.trim()
              ? userInfo.email.trim()
              : accountId,
        ...(typeof userInfo.email === 'string' && userInfo.email.trim()
          ? { email: userInfo.email.trim() }
          : {})
      }
    }
  }

  public disconnect(): void {
    this.cachedAccessToken = null
    this.options.credentialStore.clear()
  }

  public async getAccessToken(): Promise<string> {
    this.assertConfigured()
    if (
      this.cachedAccessToken &&
      this.cachedAccessToken.expiresAt > Date.now() + 60_000
    ) {
      return this.cachedAccessToken.token
    }

    const credential = this.options.credentialStore.get()
    if (!credential) throw new GoogleOAuthError('Google Drive is not connected')

    const response = await this.fetchImpl(GOOGLE_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        refresh_token: credential.refreshToken,
        grant_type: 'refresh_token'
      }).toString()
    })
    if (!response.ok) {
      if (response.status === 400 || response.status === 401) {
        this.options.credentialStore.markAuthRequired()
      }
      throw new GoogleOAuthError('Google Drive authentication expired')
    }

    let token: GoogleTokenResponse
    try {
      token = (await response.json()) as GoogleTokenResponse
    } catch {
      throw new GoogleOAuthError(
        'Google Drive returned an invalid token response'
      )
    }
    const accessToken = requireToken(token.access_token, 'access token')
    this.cachedAccessToken = {
      token: accessToken,
      expiresAt: Date.now() + Math.max(60, token.expires_in ?? 3600) * 1000
    }
    return accessToken
  }

  private async exchangeCode(
    code: string,
    redirectUri: string
  ): Promise<GoogleTokenResponse> {
    const response = await this.fetchImpl(GOOGLE_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        code,
        code_verifier: this.pendingCodeVerifier,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      }).toString()
    })
    if (!response.ok) {
      throw new GoogleOAuthError(
        'Google Drive authorization could not be completed'
      )
    }
    try {
      return (await response.json()) as GoogleTokenResponse
    } catch {
      throw new GoogleOAuthError(
        'Google Drive returned an invalid token response'
      )
    }
  }

  private async fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const response = await this.fetchImpl(GOOGLE_OAUTH_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!response.ok)
      throw new GoogleOAuthError('Google account identity unavailable')
    try {
      return (await response.json()) as GoogleUserInfo
    } catch {
      throw new GoogleOAuthError('Google account identity response is invalid')
    }
  }

  private pendingCodeVerifier = ''

  private async waitForAuthorization(): Promise<{
    code: string
    redirectUri: string
  }> {
    const state = randomBytes(32).toString('base64url')
    this.pendingCodeVerifier = randomBytes(64).toString('base64url')
    const codeChallenge = createHash('sha256')
      .update(this.pendingCodeVerifier)
      .digest('base64url')

    const listener = await createLoopbackListener(state, this.callbackTimeoutMs)
    const authorizationUrl = new URL(GOOGLE_OAUTH_AUTHORIZATION_URL)
    authorizationUrl.search = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: listener.redirectUri,
      response_type: 'code',
      scope: GOOGLE_DRIVE_READONLY_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    }).toString()

    try {
      const opened = await this.openExternal(authorizationUrl.toString())
      if (opened === false)
        throw new GoogleOAuthError('Could not open Google authorization')
      return { code: await listener.code, redirectUri: listener.redirectUri }
    } finally {
      listener.server.close()
      this.pendingCodeVerifier = ''
    }
  }

  private assertConfigured(): void {
    if (!this.clientId) {
      throw new GoogleOAuthError(
        'Google Drive is not configured; set ORBIA_GOOGLE_DRIVE_CLIENT_ID'
      )
    }
  }
}

async function openSystemBrowser(url: string): Promise<boolean> {
  try {
    // Dynamic require keeps unit tests and non-Electron tooling usable.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as {
      shell?: { openExternal: (target: string) => Promise<boolean> }
    }
    return (await electron.shell?.openExternal(url)) ?? false
  } catch {
    return false
  }
}

async function createLoopbackListener(
  expectedState: string,
  timeoutMs: number
): Promise<{ server: Server; redirectUri: string; code: Promise<string> }> {
  let resolveCode: (code: string) => void = () => undefined
  let rejectCode: (error: Error) => void = () => undefined
  let settled = false
  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })

  const server = createServer((request, response) => {
    const requestUrl = new URL(
      request.url ?? '/',
      `http://127.0.0.1:${serverAddressPort(server)}`
    )
    if (
      request.method !== 'GET' ||
      requestUrl.pathname !== '/oauth2/callback'
    ) {
      response.writeHead(404).end()
      return
    }

    if (requestUrl.searchParams.get('state') !== expectedState) {
      response.writeHead(400).end('Authorization state mismatch')
      settleReject(new GoogleOAuthError('Google authorization state mismatch'))
      return
    }
    const error = requestUrl.searchParams.get('error')
    if (error) {
      response.writeHead(400).end('Google authorization was cancelled')
      settleReject(new GoogleOAuthError('Google authorization was cancelled'))
      return
    }
    const authorizationCode = requestUrl.searchParams.get('code')
    if (!authorizationCode || authorizationCode.length > 8192) {
      response.writeHead(400).end('Authorization code missing')
      settleReject(new GoogleOAuthError('Google authorization code missing'))
      return
    }

    response
      .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      .end(
        '<!doctype html><title>Orbia</title><p>Conexão concluída. Você pode voltar ao Orbia.</p>'
      )
    settleResolve(authorizationCode)
  })

  const listening = new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  await listening
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new GoogleOAuthError(
      'Could not start local Google authorization callback'
    )
  }
  const timeout = setTimeout(() => {
    settleReject(new GoogleOAuthError('Google authorization timed out'))
  }, timeoutMs)

  return {
    server,
    redirectUri: `http://127.0.0.1:${address.port}/oauth2/callback`,
    code
  }

  function settleResolve(value: string): void {
    if (settled) return
    settled = true
    if (timeout) clearTimeout(timeout)
    resolveCode(value)
  }

  function settleReject(error: Error): void {
    if (settled) return
    settled = true
    if (timeout) clearTimeout(timeout)
    rejectCode(error)
  }
}

function serverAddressPort(server: Server): number {
  const address = server.address()
  return address && typeof address !== 'string' ? address.port : 80
}

function parseScopes(scope: string | undefined): string[] {
  const scopes =
    typeof scope === 'string'
      ? scope.split(/\s+/).filter(Boolean)
      : [GOOGLE_DRIVE_READONLY_SCOPE]
  return [...new Set(scopes)]
}

function requireToken(value: string | undefined, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new GoogleOAuthError(`Google Drive ${label} missing`)
  }
  return value
}

function requireValue(value: string | undefined, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new GoogleOAuthError(`${label} missing`)
  }
  return value.trim()
}

function toAccountSummary(credential: {
  accountId: string
  displayName: string
  email?: string
}): GoogleDriveAccountSummary {
  return {
    accountId: credential.accountId,
    displayName: credential.displayName,
    ...(credential.email ? { email: credential.email } : {})
  }
}
