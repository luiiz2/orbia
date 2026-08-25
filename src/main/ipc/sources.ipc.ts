import { ipcMain } from 'electron'
import { logger } from '../services/logger.service'
import { sourceManagerService } from '../services/sources/source-manager.service'

export function registerSourcesIpc(): void {
  ipcMain.handle('sources:list-summaries', async () => {
    try {
      return sourceManagerService.listSummaries()
    } catch {
      logger.error('[IPC] sources:list-summaries failed')
      return []
    }
  })
}
