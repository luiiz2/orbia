import { ipcMain } from 'electron'
import type {
  CanonicalSourceType,
  SourceMatchStatus,
  SourceSyncResult
} from '../../types/source'
import { logger } from '../services/logger.service'
import { sourceManagerService } from '../services/sources/source-manager.service'
import { sourceWatchService } from '../services/sources/source-watch.service'

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
