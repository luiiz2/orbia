import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import type { ByteRange, SourceReadHandle } from '../source-adapter'

export const GOOGLE_DRIVE_API_BASE_URL = 'https://www.googleapis.com/drive/v3'
export const GOOGLE_DRIVE_FOLDER_MIME_TYPE =
  'application/vnd.google-apps.folder'

export interface GoogleDriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  modifiedTime?: string
  md5Checksum?: string
  parents?: string[]
  driveId?: string
  webViewLink?: string
  capabilities?: {
    canDownload?: boolean
  }
}

export interface GoogleDriveFilePage {
  files: GoogleDriveFile[]
  nextPageToken?: string
}

export interface GoogleDriveClientOptions {
  accessTokenProvider: () => Promise<string>
  fetch?: typeof fetch
  baseUrl?: string
}

export interface GoogleDriveSourceClient {
  listChildren: (
    folderId: string,
    options?: { driveId?: string; pageToken?: string }
  ) => Promise<GoogleDriveFilePage>
  getFile: (fileId: string) => Promise<GoogleDriveFile>
  openFile: (
    fileId: string,
    options?: {
      driveId?: string
      range?: ByteRange
      metadata?: GoogleDriveFile
    }
  ) => Promise<SourceReadHandle>
}

export interface GoogleDriveBrowserClient extends GoogleDriveSourceClient {
  listSharedWithMe: (options?: { pageToken?: string }) => Promise<GoogleDriveFilePage>
}

export class GoogleDriveApiError extends Error {
  public constructor(
    public readonly status: number,
    message = 'Google Drive request failed'
  ) {
    super(message)
    this.name = 'GoogleDriveApiError'
  }
}

export class GoogleDriveClient implements GoogleDriveBrowserClient {
  private readonly fetchImpl: typeof fetch
  private readonly baseUrl: string

  public constructor(private readonly options: GoogleDriveClientOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.baseUrl = (options.baseUrl ?? GOOGLE_DRIVE_API_BASE_URL).replace(
      /\/$/,
      ''
    )
  }

  public async listChildren(
    folderId: string,
    options: { driveId?: string; pageToken?: string } = {}
  ): Promise<GoogleDriveFilePage> {
    const query = new URLSearchParams({
      q: `'${escapeDriveQueryLiteral(requireDriveId(folderId))}' in parents and trashed = false`,
      pageSize: '100',
      orderBy: 'name_natural',
      fields:
        'nextPageToken,files(id,name,mimeType,size,modifiedTime,md5Checksum,parents,driveId,webViewLink,capabilities(canDownload))',
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true'
    })
    if (options.pageToken)
      query.set('pageToken', requireDriveId(options.pageToken))
    if (options.driveId) {
      query.set('driveId', requireDriveId(options.driveId))
      query.set('corpora', 'drive')
    }

    const payload = await this.requestJson<{
      files?: GoogleDriveFile[]
      nextPageToken?: string
    }>(`${this.baseUrl}/files?${query.toString()}`)

    return {
      files: Array.isArray(payload.files) ? payload.files : [],
      ...(payload.nextPageToken ? { nextPageToken: payload.nextPageToken } : {})
    }
  }

  public async listSharedWithMe(
    options: { pageToken?: string } = {}
  ): Promise<GoogleDriveFilePage> {
    const query = new URLSearchParams({
      q: 'sharedWithMe = true and trashed = false',
      pageSize: '100',
      orderBy: 'name_natural',
      spaces: 'drive',
      fields:
        'nextPageToken,files(id,name,mimeType,size,modifiedTime,md5Checksum,parents,driveId,webViewLink,capabilities(canDownload))',
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true'
    })
    if (options.pageToken)
      query.set('pageToken', requireDriveId(options.pageToken))

    const payload = await this.requestJson<{
      files?: GoogleDriveFile[]
      nextPageToken?: string
    }>(`${this.baseUrl}/files?${query.toString()}`)

    return {
      files: Array.isArray(payload.files) ? payload.files : [],
      ...(payload.nextPageToken ? { nextPageToken: payload.nextPageToken } : {})
    }
  }

  public async getFile(fileId: string): Promise<GoogleDriveFile> {
    const query = new URLSearchParams({
      fields:
        'id,name,mimeType,size,modifiedTime,md5Checksum,parents,driveId,webViewLink,capabilities(canDownload)',
      supportsAllDrives: 'true'
    })
    return this.requestJson<GoogleDriveFile>(
      `${this.baseUrl}/files/${encodeURIComponent(requireDriveId(fileId))}?${query.toString()}`
    )
  }

  public async openFile(
    fileId: string,
    options: {
      driveId?: string
      range?: ByteRange
      metadata?: GoogleDriveFile
    } = {}
  ): Promise<SourceReadHandle> {
    const metadata = options.metadata ?? (await this.getFile(fileId))
    if (metadata.capabilities?.canDownload === false) {
      throw new GoogleDriveApiError(
        403,
        'This Google Drive file cannot be streamed by the connected account'
      )
    }

    const query = new URLSearchParams({
      alt: 'media',
      supportsAllDrives: 'true'
    })
    const headers: Record<string, string> = {}
    let requestedRange: ByteRange | undefined
    if (options.range) {
      requestedRange = normalizeRange(
        options.range,
        parseFileSize(metadata.size)
      )
      headers.Range = `bytes=${requestedRange.start}-${requestedRange.end}`
    }
    const response = await this.requestRaw(
      `${this.baseUrl}/files/${encodeURIComponent(requireDriveId(fileId))}?${query.toString()}`,
      { headers }
    )

    if (response.status !== 200 && response.status !== 206) {
      throw new GoogleDriveApiError(response.status)
    }
    if (!response.body) {
      throw new GoogleDriveApiError(502, 'Google Drive returned an empty body')
    }
    if (requestedRange && response.status !== 206) {
      throw new GoogleDriveApiError(
        502,
        'Google Drive did not return the requested byte range'
      )
    }

    const contentRange = parseContentRange(
      response.headers.get('content-range')
    )
    const metadataSize = parseFileSize(metadata.size)
    const contentLength = parseHeaderNumber(
      response.headers.get('content-length')
    )
    const totalSize = contentRange?.total ?? metadataSize ?? contentLength ?? 0
    const actualRange = contentRange
      ? { start: contentRange.start, end: contentRange.end }
      : requestedRange

    return {
      stream: Readable.fromWeb(
        response.body as unknown as NodeReadableStream<Uint8Array>
      ),
      status: response.status === 206 ? 206 : 200,
      mimeType:
        metadata.mimeType || response.headers.get('content-type') || undefined,
      totalSize,
      ...(actualRange ? { contentRange: actualRange } : {}),
      seekable: true
    }
  }

  private async requestJson<T>(url: string): Promise<T> {
    const response = await this.requestRaw(url)
    try {
      return (await response.json()) as T
    } catch {
      throw new GoogleDriveApiError(
        502,
        'Google Drive returned an invalid response'
      )
    }
  }

  private async requestRaw(
    url: string,
    init: RequestInit = {}
  ): Promise<Response> {
    const accessToken = await this.options.accessTokenProvider()
    if (!accessToken)
      throw new GoogleDriveApiError(401, 'Google Drive is disconnected')

    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${accessToken}`
      }
    })
    if (!response.ok) {
      try {
        await response.body?.cancel()
      } catch {
        // The response is already an error; do not mask its sanitized status.
      }
      throw new GoogleDriveApiError(response.status)
    }
    return response
  }
}

function requireDriveId(value: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 512 ||
    value.split('').some((character) => {
      const code = character.charCodeAt(0)
      return code <= 31 || code === 127
    })
  ) {
    throw new Error('Invalid Google Drive identifier')
  }
  return value
}

function escapeDriveQueryLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function parseFileSize(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function parseHeaderNumber(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function normalizeRange(range: ByteRange, size: number | undefined): ByteRange {
  if (
    !Number.isSafeInteger(range.start) ||
    !Number.isSafeInteger(range.end) ||
    range.start < 0 ||
    range.end < range.start ||
    (size !== undefined && (size === 0 || range.start >= size))
  ) {
    throw new GoogleDriveApiError(416, 'Invalid byte range')
  }
  return {
    start: range.start,
    end: size === undefined ? range.end : Math.min(range.end, size - 1)
  }
}

function parseContentRange(
  value: string | null
): { start: number; end: number; total: number } | undefined {
  if (!value) return undefined
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/.exec(value.trim())
  if (!match) return undefined
  const start = Number(match[1])
  const end = Number(match[2])
  const total = Number(match[3])
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    !Number.isSafeInteger(total) ||
    start < 0 ||
    end < start ||
    total <= end
  ) {
    return undefined
  }
  return { start, end, total }
}
