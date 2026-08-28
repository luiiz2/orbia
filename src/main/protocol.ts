import { protocol } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import { logger } from './services/logger.service'
import { TEMP_COVERS_DIR } from './utils/cover-generator'

export const MEDIA_SCHEME = 'media'

export function getMediaMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const mimeMap: Record<string, string> = {
    // Video formats
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.ts': 'video/mp2t',
    // Audio formats
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    // Documents / Subtitles / Text
    '.pdf': 'application/pdf',
    '.vtt': 'text/vtt',
    '.srt': 'text/plain',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.py': 'text/plain',
    '.js': 'text/javascript',
    '.jsx': 'text/javascript',
    '.tsx': 'text/typescript',
    '.json': 'application/json',
    '.sql': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.csv': 'text/csv',
    '.xml': 'text/xml',
    '.yaml': 'text/plain',
    '.yml': 'text/plain',
    '.java': 'text/plain',
    '.c': 'text/plain',
    '.cpp': 'text/plain',
    '.rs': 'text/plain',
    '.go': 'text/plain',
    // Images
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
  }
  return mimeMap[ext] || 'application/octet-stream'
}

/**
 * Whitelist of allowed file extensions for media:// protocol.
 * Strictly blocks binaries, databases, and sensitive system files.
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
  // Code & Data files
  '.py',
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.json',
  '.sql',
  '.html',
  '.css',
  '.csv',
  '.xml',
  '.yaml',
  '.yml',
  '.java',
  '.c',
  '.cpp',
  '.rs',
  '.go',
  // Subtitles
  '.srt',
  '.vtt',
  '.sub',
  '.ass',
  // Link shortcuts (parsed to extract the target URL)
  '.url',
  '.webloc',
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
 * Main-process authority for an already syntactically valid local path.
 * The renderer never supplies this allowlist; it is derived from the active
 * library database and app-owned cover locations.
 */
export interface MediaPathAuthorizer {
  isPathAuthorized(filePath: string): boolean | Promise<boolean>
}

export interface MainMediaPathAuthorizationSource {
  getRegisteredMediaPaths(): readonly string[]
  getCurrentVaultPath(): string | null
}

export interface MainMediaPathAuthorizerOptions {
  temporaryCoversPath?: string
}

/**
 * Builds the Main-only authorization layer used by the real media handler.
 * Course data must match a registered path exactly. The only directory-based
 * exceptions are generated covers controlled by Orbia itself.
 */
export function createMainMediaPathAuthorizer(
  source: MainMediaPathAuthorizationSource,
  options: MainMediaPathAuthorizerOptions = {}
): MediaPathAuthorizer {
  const temporaryCoversPath = options.temporaryCoversPath ?? TEMP_COVERS_DIR

  return {
    isPathAuthorized(filePath: string): boolean {
      const targetPath = normalizeAbsolutePathForComparison(filePath)
      if (!targetPath) return false

      try {
        for (const registeredPath of source.getRegisteredMediaPaths()) {
          if (pathsAreEqual(targetPath, registeredPath)) return true
        }
      } catch {
        // A missing or unavailable database must never broaden access.
        return false
      }

      if (isPathInside(targetPath, temporaryCoversPath)) return true

      const vaultPath = source.getCurrentVaultPath()
      return Boolean(
        vaultPath &&
        isPathInside(targetPath, path.join(vaultPath, '.orbia', 'covers'))
      )
    }
  }
}

const denyAllMediaPathAuthorizer: MediaPathAuthorizer = {
  isPathAuthorized: () => false
}

/**
 * Validates, normalizes, and extracts the target absolute file path from a media:// URL.
 * Prevents directory traversal, null-byte injections, and unauthorized file extensions.
 */
export function extractAndValidateMediaPath(
  requestUrl: string
): MediaPathValidationResult {
  if (!requestUrl || typeof requestUrl !== 'string') {
    return {
      valid: false,
      error: 'Empty or invalid media URL',
      statusCode: 400
    }
  }

  // Null byte injection defense
  if (requestUrl.includes('\0') || requestUrl.includes('%00')) {
    return {
      valid: false,
      error: 'Null bytes are not permitted',
      statusCode: 400
    }
  }

  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return { valid: false, error: 'Malformed URL', statusCode: 400 }
  }

  if (url.protocol !== `${MEDIA_SCHEME}:`) {
    return {
      valid: false,
      error: `Invalid protocol scheme: ${url.protocol}`,
      statusCode: 400
    }
  }

  // Decode file path from URL
  let filePath = decodeURIComponent(url.pathname)

  // On Windows, strip leading slash from /C:/path
  if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(filePath)) {
    filePath = filePath.slice(1)
  }

  // Handle host if path was formatted as media://C:/path
  if (url.host && url.host !== 'local-media') {
    let decodedHost: string
    try {
      decodedHost = decodeURIComponent(url.host)
    } catch {
      return {
        valid: false,
        error: 'Malformed URL host encoding',
        statusCode: 400
      }
    }
    const full = `${decodedHost}${url.pathname}`
    if (/^[a-zA-Z]:/.test(full)) {
      filePath = decodeURIComponent(full)
    }
  }

  // Normalize path across Windows and POSIX separators
  const normalized = path.normalize(filePath)

  // Verify that the path is absolute
  if (!path.isAbsolute(normalized)) {
    return {
      valid: false,
      error: 'Relative file paths are prohibited',
      statusCode: 403
    }
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
export function setupMediaProtocol(
  options: { authorizer?: MediaPathAuthorizer } = {}
): void {
  const authorizer = options.authorizer ?? denyAllMediaPathAuthorizer

  protocol.handle(MEDIA_SCHEME, async (request) => {
    try {
      const validation = extractAndValidateMediaPath(request.url)
      if (!validation.valid || !validation.filePath) {
        logger.warn(
          `[Protocol] Rejected media request: ${request.url} - ${validation.error}`
        )
        return new Response(validation.error || 'Access denied', {
          status: validation.statusCode
        })
      }

      const targetPath = validation.filePath

      let isAuthorized = false
      try {
        isAuthorized = await authorizer.isPathAuthorized(targetPath)
      } catch (error) {
        logger.error(
          '[Protocol] Media path authorization failed:',
          targetPath,
          error
        )
      }

      if (!isAuthorized) {
        logger.warn(
          `[Protocol] Rejected unregistered media request: ${request.url}`
        )
        return new Response(
          'Access denied: requested file is not registered in the active library',
          {
            status: 403
          }
        )
      }

      // Check file existence and verify it is a regular file
      let stat: fs.Stats
      try {
        stat = await fs.promises.stat(targetPath)
        if (!stat.isFile()) {
          return new Response('Requested resource is not a regular file', {
            status: 404
          })
        }
      } catch {
        return new Response('File not found on disk', { status: 404 })
      }

      const fileSize = stat.size
      const mimeType = getMediaMimeType(targetPath)
      const rangeHeader = request.headers.get('range')

      // HTTP 206 Range request handling for video/audio scrubbing and seeking
      if (rangeHeader && rangeHeader.startsWith('bytes=')) {
        const rangeSpec = rangeHeader.substring(6).trim()
        const [startStr, endStr] = rangeSpec.split('-')
        let start = startStr ? parseInt(startStr, 10) : 0
        let end = endStr ? parseInt(endStr, 10) : fileSize - 1

        if (isNaN(start) || start < 0) start = 0
        if (isNaN(end) || end >= fileSize) end = fileSize - 1

        if (start > end || start >= fileSize) {
          return new Response(null, {
            status: 416,
            statusText: 'Range Not Satisfiable',
            headers: {
              'Content-Range': `bytes */${fileSize}`,
              'Accept-Ranges': 'bytes'
            }
          })
        }

        const contentLength = end - start + 1
        const stream = fs.createReadStream(targetPath, { start, end })

        return new Response(Readable.toWeb(stream) as ReadableStream, {
          status: 206,
          statusText: 'Partial Content',
          headers: {
            'Content-Type': mimeType,
            'Content-Length': String(contentLength),
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*'
          }
        })
      }

      // Standard 200 response with Accept-Ranges: bytes enabled for media seeking
      const stream = fs.createReadStream(targetPath)
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': mimeType,
          'Content-Length': String(fileSize),
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*'
        }
      })
    } catch (err) {
      logger.error('[Protocol] Error handling media request:', request.url, err)
      return new Response('Internal error handling media request', {
        status: 500
      })
    }
  })
}

function normalizeAbsolutePathForComparison(filePath: string): string | null {
  if (!filePath || !path.isAbsolute(filePath)) return null
  const normalized = path.resolve(filePath)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function pathsAreEqual(left: string, right: string): boolean {
  const normalizedRight = normalizeAbsolutePathForComparison(right)
  return normalizedRight !== null && left === normalizedRight
}

function isPathInside(filePath: string, parentPath: string): boolean {
  const normalizedParent = normalizeAbsolutePathForComparison(parentPath)
  if (!normalizedParent) return false

  const relative = path.relative(normalizedParent, filePath)
  return (
    Boolean(relative) &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}
