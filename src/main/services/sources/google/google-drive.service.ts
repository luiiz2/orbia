import type { Readable } from 'node:stream'
import type {
  GoogleDriveConnectionStatus,
  GoogleDriveEntry,
  GoogleDriveFolderListing,
  GoogleDrivePlayback,
  GoogleDrivePlaybackInput
} from '../../../../types/google-drive'
import type { GoogleDriveSourceItemLocator } from '../../../../types/source'
import { appConfigService } from '../../app-config.service'
import { GoogleDriveSourceAdapter } from '../adapters/google-drive.adapter'
import { RemotePlaybackSessionService } from '../remote-playback-session.service'
import {
  GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  type GoogleDriveBrowserClient,
  GoogleDriveClient
} from './google-drive-client'
import { GoogleDriveCredentialStore } from './google-credential-store'
import { GoogleOAuthService } from './google-oauth.service'

export const GOOGLE_DRIVE_ROOT_ID = 'root'
export const GOOGLE_DRIVE_SHARED_WITH_ME_ROOT_ID = 'shared-with-me'

export interface GoogleDriveDownloadHandle {
  stream: Readable
  name: string
  mimeType: string
  size: number
  webViewUrl?: string
}

export class GoogleDriveService {
  public constructor(
    private readonly oauth: GoogleOAuthService,
    private readonly client: GoogleDriveBrowserClient,
    private readonly adapter: GoogleDriveSourceAdapter,
    private readonly sessions: RemotePlaybackSessionService
  ) {}

  public getStatus(): GoogleDriveConnectionStatus {
    return this.oauth.getStatus()
  }

  public async connect(): Promise<GoogleDriveConnectionStatus> {
    const status = await this.oauth.connect()
    this.sessions.clear()
    return status
  }

  public disconnect(): void {
    this.sessions.clear()
    this.oauth.disconnect()
  }

  public async listFolder(
    folderId = GOOGLE_DRIVE_ROOT_ID,
    options: { driveId?: string; pageToken?: string } = {}
  ): Promise<GoogleDriveFolderListing> {
    const safeFolderId = requireIdentifier(folderId, 'folder')
    let folderName = 'Meu Drive'
    if (safeFolderId !== GOOGLE_DRIVE_ROOT_ID) {
      const folder = await this.client.getFile(safeFolderId)
      if (folder.mimeType !== GOOGLE_DRIVE_FOLDER_MIME_TYPE) {
        throw new Error('Google Drive item is not a folder')
      }
      folderName = folder.name
    }
    const page = await this.client.listChildren(safeFolderId, options)

    return {
      folderId: safeFolderId,
      folderName,
      entries: page.files.map((file) => toEntry(file, options.driveId)),
      ...(safeFolderId === GOOGLE_DRIVE_ROOT_ID
        ? { rootKind: 'my-drive' as const }
        : {}),
      ...(page.nextPageToken ? { nextPageToken: page.nextPageToken } : {})
    }
  }

  public async listSharedWithMe(
    options: { pageToken?: string } = {}
  ): Promise<GoogleDriveFolderListing> {
    const page = await this.client.listSharedWithMe(options)
    return {
      folderId: GOOGLE_DRIVE_SHARED_WITH_ME_ROOT_ID,
      folderName: 'Compartilhados comigo',
      rootKind: 'shared-with-me',
      entries: page.files.map((file) => toEntry(file)),
      ...(page.nextPageToken ? { nextPageToken: page.nextPageToken } : {})
    }
  }

  public async preparePlayback(
    input: GoogleDrivePlaybackInput
  ): Promise<GoogleDrivePlayback> {
    const itemId = requireIdentifier(input?.itemId, 'file')
    const metadata = await this.client.getFile(itemId)
    if (metadata.mimeType === GOOGLE_DRIVE_FOLDER_MIME_TYPE) {
      throw new Error('Folders cannot be opened as media')
    }
    if (metadata.capabilities?.canDownload === false) {
      throw new Error('This Google Drive file cannot be streamed')
    }
    if (!isViewableMimeType(metadata.mimeType)) {
      throw new Error('This Google Drive file type cannot be previewed')
    }

    const account = this.oauth.getConnectedAccount()
    if (!account) throw new Error('Google Drive is not connected')
    const locator: GoogleDriveSourceItemLocator = {
      provider: 'google-drive',
      accountId: account.accountId,
      itemId,
      ...(input.driveId ? { driveId: input.driveId } : {})
    }
    const sessionId = this.sessions.create(this.adapter, locator)
    const size = parseOptionalSize(metadata.size)
    return {
      url: `media://playback/${sessionId}`,
      name: metadata.name,
      mimeType: metadata.mimeType,
      ...(size !== undefined ? { size } : {}),
      seekable: true,
      canDownload: true,
      webViewUrl: toGoogleDriveViewUrl(metadata)
    }
  }

  public async prepareDownload(
    input: GoogleDrivePlaybackInput
  ): Promise<GoogleDriveDownloadHandle> {
    const itemId = requireIdentifier(input?.itemId, 'file')
    const metadata = await this.client.getFile(itemId)
    if (metadata.mimeType === GOOGLE_DRIVE_FOLDER_MIME_TYPE) {
      throw new Error('Folders cannot be downloaded')
    }
    if (metadata.mimeType.startsWith('application/vnd.google-apps.')) {
      throw new Error('This Google Drive file must be opened in Google Drive')
    }
    if (metadata.capabilities?.canDownload === false) {
      throw new Error('This Google Drive file cannot be downloaded')
    }

    const handle = await this.client.openFile(itemId, {
      ...(input.driveId ? { driveId: input.driveId } : {}),
      metadata
    })
    return {
      stream: handle.stream,
      name: metadata.name,
      mimeType: metadata.mimeType,
      size: parseOptionalSize(metadata.size) ?? handle.totalSize,
      webViewUrl: toGoogleDriveViewUrl(metadata)
    }
  }

  public async getExternalUrl(input: GoogleDrivePlaybackInput): Promise<string> {
    const itemId = requireIdentifier(input?.itemId, 'file')
    const metadata = await this.client.getFile(itemId)
    if (metadata.mimeType === GOOGLE_DRIVE_FOLDER_MIME_TYPE) {
      throw new Error('Folders do not have an external file view')
    }
    return toGoogleDriveViewUrl(metadata)
  }

  public openPlayback(
    sessionId: string,
    range?: { start: number; end: number }
  ) {
    return this.sessions.open(requireSessionId(sessionId), range)
  }
}

function createGoogleDriveService(): GoogleDriveService {
  const credentialStore = new GoogleDriveCredentialStore({
    getGoogleDriveAccount: () => appConfigService.getGoogleDriveAccount(),
    setGoogleDriveAccount: (account) =>
      appConfigService.setGoogleDriveAccount(account),
    clearGoogleDriveAccount: () => appConfigService.clearGoogleDriveAccount()
  })
  const oauth = new GoogleOAuthService({ credentialStore })
  const client = new GoogleDriveClient({
    accessTokenProvider: () => oauth.getAccessToken()
  })
  const adapter = new GoogleDriveSourceAdapter(client)
  return new GoogleDriveService(
    oauth,
    client,
    adapter,
    new RemotePlaybackSessionService()
  )
}

export const googleDriveService = createGoogleDriveService()

function toEntry(
  file: {
    id: string
    name: string
    mimeType: string
    size?: string
    modifiedTime?: string
    driveId?: string
    webViewLink?: string
    capabilities?: { canDownload?: boolean }
  },
  driveId?: string
): GoogleDriveEntry {
  const size = parseOptionalSize(file.size)
  return {
    itemId: file.id,
    name: file.name,
    mimeType: file.mimeType,
    isFolder: file.mimeType === GOOGLE_DRIVE_FOLDER_MIME_TYPE,
    canDownload: isDirectDownloadable(file),
    canPreview:
      file.mimeType !== GOOGLE_DRIVE_FOLDER_MIME_TYPE &&
      isViewableMimeType(file.mimeType),
    ...(size !== undefined ? { size } : {}),
    ...(file.modifiedTime ? { modifiedTime: file.modifiedTime } : {}),
    ...(file.driveId ?? driveId
      ? { driveId: file.driveId ?? driveId }
      : {}),
    webViewUrl: toGoogleDriveViewUrl(file)
  }
}

function toGoogleDriveViewUrl(file: { id: string; webViewLink?: string }): string {
  return (
    file.webViewLink ??
    `https://drive.google.com/open?id=${encodeURIComponent(file.id)}`
  )
}

function isDirectDownloadable(file: {
  mimeType: string
  capabilities?: { canDownload?: boolean }
}): boolean {
  return (
    file.mimeType !== GOOGLE_DRIVE_FOLDER_MIME_TYPE &&
    !file.mimeType.startsWith('application/vnd.google-apps.') &&
    file.capabilities?.canDownload !== false
  )
}

function isViewableMimeType(mimeType: string): boolean {
  return (
    mimeType.startsWith('video/') ||
    mimeType.startsWith('audio/') ||
    mimeType.startsWith('image/') ||
    mimeType === 'application/pdf' ||
    mimeType === 'text/plain' ||
    mimeType === 'text/markdown' ||
    mimeType === 'text/csv'
  )
}

function requireIdentifier(value: string, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 512 ||
    value.split('').some((character) => {
      const code = character.charCodeAt(0)
      return code <= 31 || code === 127
    })
  ) {
    throw new Error(`Invalid Google Drive ${label} identifier`)
  }
  return value
}

function requireSessionId(value: string): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  ) {
    throw new Error('Invalid remote playback session')
  }
  return value
}

function parseOptionalSize(value: string | undefined): number | undefined {
  if (!value) return undefined
  const size = Number(value)
  return Number.isSafeInteger(size) && size >= 0 ? size : undefined
}
