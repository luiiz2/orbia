import { dialog, ipcMain, shell } from 'electron'
import { createWriteStream, existsSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type {
  CanonicalSourceType,
  SourceMatchStatus,
  SourceSyncResult
} from '../../types/source'
import type {
  GoogleDriveDownloadInput,
  GoogleDriveDownloadResult,
  GoogleDrivePlaybackInput
} from '../../types/google-drive'
import { logger } from '../services/logger.service'
import { sourceManagerService } from '../services/sources/source-manager.service'
import { sourceWatchService } from '../services/sources/source-watch.service'
import { GoogleDriveApiError } from '../services/sources/google/google-drive-client'
import { googleDriveService } from '../services/sources/google/google-drive.service'
import { GoogleOAuthError } from '../services/sources/google/google-oauth.service'

export function registerSourcesIpc(): void {
  ipcMain.handle('sources:list-summaries', async () => {
    try {
      return sourceManagerService.listSummaries()
    } catch {
      logger.error('[IPC] sources:list-summaries failed')
      return []
    }
  })
  ipcMain.handle(
    'sources:sync-now',
    async (
      _event,
      payload: { rootId?: unknown }
    ): Promise<SourceSyncResult> => {
      const rootId = requireSourceRootId(payload?.rootId)
      try {
        return await sourceWatchService.syncRoot(rootId, 'manual')
      } catch {
        logger.error('[IPC] sources:sync-now failed')
        throw new Error('Source synchronization failed')
      }
    }
  )
  ipcMain.handle(
    'sources:list-candidates',
    async (_event, payload: { status?: unknown }) => {
      const status = requireSourceMatchStatus(payload?.status)
      try {
        return sourceManagerService.listMatchCandidates(status)
      } catch {
        logger.error('[IPC] sources:list-candidates failed')
        throw new Error('Source candidates unavailable')
      }
    }
  )
  ipcMain.handle(
    'sources:link',
    async (
      _event,
      payload: {
        sourceItemId?: unknown
        canonicalType?: unknown
        canonicalId?: unknown
      }
    ) => {
      const sourceItemId = requireSourceIdentifier(
        payload?.sourceItemId,
        'source item ID'
      )
      const canonicalType = requireCanonicalSourceType(payload?.canonicalType)
      const canonicalId = requireSourceIdentifier(
        payload?.canonicalId,
        'canonical ID'
      )
      try {
        return sourceManagerService.linkSourceToCanonical(
          sourceItemId,
          canonicalType,
          canonicalId
        )
      } catch {
        logger.error('[IPC] sources:link failed')
        throw new Error('Source link operation failed')
      }
    }
  )
  ipcMain.handle(
    'sources:unlink',
    async (
      _event,
      payload: {
        sourceItemId?: unknown
        canonicalType?: unknown
        canonicalId?: unknown
      }
    ) => {
      const sourceItemId = requireSourceIdentifier(
        payload?.sourceItemId,
        'source item ID'
      )
      const canonicalType = requireCanonicalSourceType(payload?.canonicalType)
      const canonicalId = requireSourceIdentifier(
        payload?.canonicalId,
        'canonical ID'
      )
      try {
        return sourceManagerService.unlinkSourceFromCanonical(
          sourceItemId,
          canonicalType,
          canonicalId
        )
      } catch {
        logger.error('[IPC] sources:unlink failed')
        throw new Error('Source unlink operation failed')
      }
    }
  )
  ipcMain.handle(
    'sources:review-candidate',
    async (_event, payload: { candidateId?: unknown; decision?: unknown }) => {
      const candidateId = requireSourceIdentifier(
        payload?.candidateId,
        'source match candidate ID'
      )
      const decision = requireSourceMatchDecision(payload?.decision)
      try {
        return sourceManagerService.reviewMatchCandidate(candidateId, decision)
      } catch {
        logger.error('[IPC] sources:review-candidate failed')
        throw new Error('Source review operation failed')
      }
    }
  )
  ipcMain.handle(
    'sources:match-root',
    async (_event, payload: { rootId?: unknown }) => {
      const rootId = requireSourceRootId(payload?.rootId)
      try {
        return await sourceManagerService.matchRoot(rootId)
      } catch {
        logger.error('[IPC] sources:match-root failed')
        throw new Error('Source matching failed')
      }
    }
  )

  ipcMain.handle('sources:google-status', async () => {
    return googleDriveService.getStatus()
  })
  ipcMain.handle('sources:google-connect', async () => {
    try {
      return await googleDriveService.connect()
    } catch (error) {
      logger.error('[IPC] sources:google-connect failed')
      throw toGoogleDriveError(error, 'Google Drive connection failed')
    }
  })
  ipcMain.handle('sources:google-disconnect', async () => {
    try {
      googleDriveService.disconnect()
      return true
    } catch (error) {
      logger.error('[IPC] sources:google-disconnect failed')
      throw toGoogleDriveError(error, 'Google Drive disconnection failed')
    }
  })
  ipcMain.handle(
    'sources:google-list-folder',
    async (
      _event,
      payload: {
        folderId?: unknown
        driveId?: unknown
        pageToken?: unknown
      }
    ) => {
      const folderId = optionalSourceIdentifier(payload?.folderId) ?? 'root'
      const driveId = optionalSourceIdentifier(payload?.driveId)
      const pageToken = optionalSourceIdentifier(payload?.pageToken)
      try {
        return await googleDriveService.listFolder(folderId, {
          ...(driveId ? { driveId } : {}),
          ...(pageToken ? { pageToken } : {})
        })
      } catch (error) {
        logger.error('[IPC] sources:google-list-folder failed')
        throw toGoogleDriveError(error, 'Google Drive folder unavailable')
      }
    }
  )
  ipcMain.handle(
    'sources:google-list-shared-with-me',
    async (_event, payload: { pageToken?: unknown }) => {
      const pageToken = optionalSourceIdentifier(payload?.pageToken)
      try {
        return await googleDriveService.listSharedWithMe(
          pageToken ? { pageToken } : {}
        )
      } catch (error) {
        logger.error('[IPC] sources:google-list-shared-with-me failed')
        throw toGoogleDriveError(error, 'Google Drive shared content unavailable')
      }
    }
  )
  ipcMain.handle(
    'sources:google-prepare-playback',
    async (_event, payload: GoogleDrivePlaybackInput) => {
      const itemId = requireSourceIdentifier(payload?.itemId, 'Google Drive file ID')
      const driveId = optionalSourceIdentifier(payload?.driveId)
      try {
        return await googleDriveService.preparePlayback({
          itemId,
          ...(driveId ? { driveId } : {})
        })
      } catch (error) {
        logger.error('[IPC] sources:google-prepare-playback failed')
        throw toGoogleDriveError(error, 'Google Drive file unavailable')
      }
    }
  )
  ipcMain.handle(
    'sources:google-download',
    async (
      _event,
      payload: GoogleDriveDownloadInput
    ): Promise<GoogleDriveDownloadResult> => {
      const input = normalizeDownloadInput(payload)
      const defaultPath = sanitizeDownloadFileName(input.suggestedName)
      const saveResult = await dialog.showSaveDialog({
        title: 'Baixar do Google Drive',
        defaultPath
      })
      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, cancelled: true }
      }

      const targetPath = saveResult.filePath
      const hadExistingTarget = existsSync(targetPath)
      try {
        const download = await googleDriveService.prepareDownload({
          itemId: input.itemId,
          ...(input.driveId ? { driveId: input.driveId } : {})
        })
        await pipeline(
          download.stream,
          createWriteStream(targetPath, { flags: 'w' })
        )
        return {
          success: true,
          fileName: path.basename(targetPath),
          bytes: download.size
        }
      } catch (error) {
        if (!hadExistingTarget) {
          await unlink(targetPath).catch(() => undefined)
        }
        logger.error('[IPC] sources:google-download failed')
        throw toGoogleDriveError(error, 'Google Drive download failed')
      }
    }
  )
  ipcMain.handle(
    'sources:google-open-external',
    async (_event, payload: GoogleDrivePlaybackInput): Promise<boolean> => {
      const input = normalizePlaybackInput(payload)
      try {
        const url = requireGoogleDriveExternalUrl(
          await googleDriveService.getExternalUrl(input)
        )
        await shell.openExternal(url)
        return true
      } catch (error) {
        logger.error('[IPC] sources:google-open-external failed')
        throw toGoogleDriveError(error, 'Could not open Google Drive file')
      }
    }
  )
}

function requireSourceRootId(value: unknown): string {
  return requireSourceIdentifier(value, 'source root ID')
}

function requireSourceIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 512 ||
    hasControlCharacters(value)
  ) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}

function optionalSourceIdentifier(value: unknown): string | undefined {
  if (value === undefined) return undefined
  return requireSourceIdentifier(value, 'Google Drive identifier')
}

function normalizePlaybackInput(value: unknown): GoogleDrivePlaybackInput {
  const payload = isRecord(value) ? value : {}
  const itemId = requireSourceIdentifier(
    payload.itemId,
    'Google Drive file ID'
  )
  const driveId = optionalSourceIdentifier(payload.driveId)
  return {
    itemId,
    ...(driveId ? { driveId } : {})
  }
}

function normalizeDownloadInput(value: unknown): GoogleDriveDownloadInput {
  const payload = isRecord(value) ? value : {}
  const input = normalizePlaybackInput(payload)
  const suggestedName = payload.suggestedName
  if (suggestedName !== undefined && typeof suggestedName !== 'string') {
    throw new Error('Invalid Google Drive file name')
  }
  if (
    typeof suggestedName === 'string' &&
    (suggestedName.length > 512 || hasControlCharacters(suggestedName))
  ) {
    throw new Error('Invalid Google Drive file name')
  }
  return {
    ...input,
    ...(typeof suggestedName === 'string' ? { suggestedName } : {})
  }
}

function sanitizeDownloadFileName(value: string | undefined): string {
  const basename = path.basename((value ?? 'download').replace(/[/\\]+/g, path.sep))
  const sanitized = basename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
  if (!sanitized || sanitized === '.' || sanitized === '..') return 'download'
  return sanitized.slice(0, 180)
}

function requireGoogleDriveExternalUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Google Drive link is invalid')
  try {
    const url = new URL(value)
    const allowedHosts = new Set([
      'drive.google.com',
      'docs.google.com',
      'sheets.google.com',
      'slides.google.com'
    ])
    if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname.toLowerCase())) {
      throw new Error('Google Drive link is invalid')
    }
    return url.toString()
  } catch {
    throw new Error('Google Drive link is invalid')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toGoogleDriveError(error: unknown, fallback: string): Error {
  if (error instanceof GoogleOAuthError) return new Error(error.message)
  if (error instanceof GoogleDriveApiError) {
    if (error.status === 401 || error.status === 403) {
      return new Error('Google Drive authorization is required')
    }
    if (error.status === 404) return new Error('Google Drive file was not found')
    if (error.status === 416) return new Error('Google Drive range is invalid')
  }
  return new Error(fallback)
}

function requireSourceMatchStatus(
  value: unknown
): SourceMatchStatus | undefined {
  if (value === undefined) return undefined
  if (value === 'pending' || value === 'accepted' || value === 'rejected') {
    return value
  }
  throw new Error('Invalid source match status')
}

function requireCanonicalSourceType(value: unknown): CanonicalSourceType {
  if (value === 'lesson' || value === 'content-resource') return value
  throw new Error('Invalid canonical source type')
}

function requireSourceMatchDecision(
  value: unknown
): Exclude<SourceMatchStatus, 'pending'> {
  if (value === 'accepted' || value === 'rejected') return value
  throw new Error('Invalid source match decision')
}

function hasControlCharacters(value: string): boolean {
  return value.split('').some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}
