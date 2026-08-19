import { protocol, net } from 'electron'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

export const MEDIA_SCHEME = 'media'

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
  protocol.handle(MEDIA_SCHEME, (request) => {
    try {
      const url = new URL(request.url)

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

      const normalized = path.normalize(filePath)
      const fileUrl = pathToFileURL(normalized).toString()

      // Chromium's internal net.fetch handles byte-range requests on file:// URLs
      return net.fetch(fileUrl, {
        bypassCustomProtocolHandlers: true
      })
    } catch (err) {
      console.error('[Protocol] Error handling media request:', request.url, err)
      return new Response('File not found or unreadable', { status: 404 })
    }
  })
}
