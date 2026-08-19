import { ipcMain, dialog, BrowserWindow } from 'electron'
import { vaultService } from '../services/vault.service'
import { logger } from '../services/logger.service'

export function registerVaultIpc(): void {
  ipcMain.handle('vault:create', async (_event, payload: { path: string; name: string }) => {
    try {
      if (!payload || typeof payload.path !== 'string' || !payload.path.trim()) {
        return { success: false, error: 'Path is required and must be a valid directory path.' }
      }
      const trimmedPath = payload.path.trim()
      const trimmedName = typeof payload.name === 'string' ? payload.name.trim() : ''
      const vault = await vaultService.createVault(trimmedPath, trimmedName)
      return { success: true, vault }
    } catch (err: unknown) {
      logger.error('[IPC] vault:create error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('vault:open', async (_event, payload: { path: string }) => {
    try {
      if (!payload || typeof payload.path !== 'string' || !payload.path.trim()) {
        return { success: false, error: 'Path is required and must be a valid directory path.' }
      }
      const trimmedPath = payload.path.trim()
      const vault = await vaultService.openVault(trimmedPath)
      return { success: true, vault }
    } catch (err: unknown) {
      logger.error('[IPC] vault:open error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('vault:get-recent', async () => {
    try {
      return vaultService.getRecentVaults()
    } catch (err) {
      logger.error('[IPC] vault:get-recent error:', err)
      return []
    }
  })

  ipcMain.handle('vault:get-current', async () => {
    try {
      return vaultService.getCurrentVault()
    } catch (err) {
      logger.error('[IPC] vault:get-current error:', err)
      return null
    }
  })

  ipcMain.handle('vault:get-stats', async () => {
    try {
      return vaultService.getVaultStats()
    } catch (err) {
      logger.error('[IPC] vault:get-stats error:', err)
      return {
        courseCount: 0,
        moduleCount: 0,
        lessonCount: 0,
        totalDuration: 0,
        completedLessons: 0,
        totalWatchedTime: 0
      }
    }
  })

  ipcMain.handle('vault:select-directory', async () => {
    try {
      const focusedWindow = BrowserWindow.getFocusedWindow()
      const options: Electron.OpenDialogOptions = {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Folder'
      }

      const result = focusedWindow
        ? await dialog.showOpenDialog(focusedWindow, options)
        : await dialog.showOpenDialog(options)

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      return result.filePaths[0]
    } catch (err) {
      logger.error('[IPC] vault:select-directory error:', err)
      return null
    }
  })
}
