import { ipcMain } from 'electron'
import type { SourceSyncResult } from '../../types/source'
import { logger } from '../services/logger.service'
import { sourceManagerService } from '../services/sources/source-manager.service'
import { sourceWatchService } from '../services/sources/source-watch.service'

let sourceWatchStarted = false

export function registerSourcesIpc(): void {
  if (!sourceWatchStarted) {
    sourceWatchService.start()
    sourceWatchStarted = true
  }
  ipcMain.handle('sources:list-summaries', async () => {
    try {
      return sourceManagerService.listSummaries()
    } catch {
      logger.error('[IPC] sources:list-summaries failed')
      return []
    }
  })
  ipcMain.handle('sources:sync-now', async (
    _event,
    payload: { rootId?: unknown }
  ): Promise<SourceSyncResult> => {
    const rootId = requireSourceRootId(payload?.rootId)
    try {
      return await sourceManagerService.syncRoot(rootId, 'manual')
    } catch {
      logger.error('[IPC] sources:sync-now failed')
      throw new Error('Source synchronization failed')
    }
  })
}

function requireSourceRootId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 512 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error('Invalid source root ID')
  }
  return value
}
