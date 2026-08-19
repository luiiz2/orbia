import { protocol, net } from 'electron'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { logger } from './services/logger.service'

export const MEDIA_SCHEME = 'media'

/**
 * Whitelist of allowed file extensions for media:// protocol.
 * Strictly blocks execution scripts, binaries, databases, and system files.
 */
export const ALLOWED_MEDIA_EXTENSIONS = new Set([
  // Video formats
  '.mp4',
  '.mkv',
  '.webm',
  '.mov',
  '.avi',
  '.m4v',
  '.ts',
  '.wmv',
  '.flv',
  // Audio formats
  '.mp3',
  '.m4a',
  '.wav',
  '.ogg',
  '.flac',
  '.aac',
  '.wma',
  // Documents / Text
  '.pdf',
  '.doc',
  '.docx',
  '.epub',
  '.txt',
  '.md',
  '.rtf',
  // Subtitles
  '.srt',
  '.vtt',
  '.sub',
  '.ass',
  // Images
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.svg'
])

export interface MediaPathValidationResult {
  valid: boolean
  filePath?: string
  error?: string
  statusCode: number
}

/**
 * Validates, normalizes, and extracts the target absolute file path from a media:// URL.
 * Prevents directory traversal, null-byte injections, and unauthorized file extensions.
 */
export function extractAndValidateMediaPath(requestUrl: string): MediaPathValidationResult {
  if (!requestUrl || typeof requestUrl !== 'string') {
    return { valid: false, error: 'Empty or invalid media URL', statusCode: 400 }
  }

  // Null byte injection defense
  if (requestUrl.includes('\0') || requestUrl.includes('%00')) {
    return { valid: false, error: 'Null bytes are not permitted', statusCode: 400 }
  }

  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return { valid: false, error: 'Malformed URL', statusCode: 400 }
  }

  if (url.protocol !== `${MEDIA_SCHEME}:`) {
    return { valid: false, error: `Invalid protocol scheme: ${url.protocol}`, statusCode: 400 }
  }

  // Decode file path from URL
  let filePath = decodeURIComponent(url.pathname)

  // On Windows, strip leading slash from /C:/path
  if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(filePath)) {
    filePath = filePath.slice(1)
  }

  // Handle host if path was formatted as media://C:/path
  if (url.host && url.host !== 'local-media') {
    const full = `${url.host}${url.pathname}`
    if (/^[a-zA-Z]:/.test(full)) {
      filePath = decodeURIComponent(full)
    }
  }

  // Normalize path across Windows and POSIX separators
  const normalized = path.normalize(filePath)

  // Verify that the path is absolute
  if (!path.isAbsolute(normalized)) {
    return { valid: false, error: 'Relative file paths are prohibited', statusCode: 403 }
  }

  // Extension Whitelisting
  const ext = path.extname(normalized).toLowerCase()
  if (!ext || !ALLOWED_MEDIA_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `Forbidden: File type "${ext || 'none'}" is not permitted`,
      statusCode: 403
    }
  }

  return {
    valid: true,
    filePath: normalized,
    statusCode: 200
  }
}

/**
 * Register media:// scheme privileges.
 * INVARIANT: MUST be called BEFORE app.whenReady().
 */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true, // Crucial for video seek / byte-range requests
        bypassCSP: true,
        corsEnabled: true
      }
    }
  ])
}

/**
 * Setup media:// protocol streaming handler.
 * Supports HTTP 206 Range requests for seamless video scrubbing.
 */
export function setupMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    try {
      const validation = extractAndValidateMediaPath(request.url)
      if (!validation.valid || !validation.filePath) {
        logger.warn(`[Protocol] Rejected media request: ${request.url} - ${validation.error}`)
        return new Response(validation.error || 'Access denied', { status: validation.statusCode })
      }

      const targetPath = validation.filePath

      // Check file existence and verify it is a regular file
      try {
        const stat = await fs.promises.stat(targetPath)
        if (!stat.isFile()) {
          return new Response('Requested resource is not a regular file', { status: 404 })
        }
      } catch {
        return new Response('File not found on disk', { status: 404 })
      }

      const fileUrl = pathToFileURL(targetPath).toString()

      // Forward request headers (specifically Range: bytes=...) for full byte-range streaming support
      const fetchHeaders = new Headers()
      request.headers.forEach((value, key) => {
        fetchHeaders.set(key, value)
      })

      // Chromium's internal net.fetch handles byte-range requests on file:// URLs
      return net.fetch(fileUrl, {
        headers: fetchHeaders,
        bypassCustomProtocolHandlers: true
      })
    } catch (err) {
      logger.error('[Protocol] Error handling media request:', request.url, err)
      return new Response('Internal error handling media request', { status: 500 })
    }
  })
}
