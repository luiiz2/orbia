import { ipcMain, dialog, BrowserWindow } from 'electron'
import { vaultService } from '../services/vault.service'

export function registerVaultIpc(): void {
  ipcMain.handle('vault:create', async (_event, payload: { path: string; name: string }) => {
    try {
      if (!payload.path || typeof payload.path !== 'string') {
        return { success: false, error: 'Path is required' }
      }
      const vault = await vaultService.createVault(payload.path, payload.name)
      return { success: true, vault }
    } catch (err: unknown) {
      console.error('[IPC] vault:create error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('vault:open', async (_event, payload: { path: string }) => {
    try {
      if (!payload.path || typeof payload.path !== 'string') {
        return { success: false, error: 'Path is required' }
      }
      const vault = await vaultService.openVault(payload.path)
      return { success: true, vault }
    } catch (err: unknown) {
      console.error('[IPC] vault:open error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('vault:get-recent', async () => {
    try {
      return vaultService.getRecentVaults()
    } catch (err) {
      console.error('[IPC] vault:get-recent error:', err)
      return []
    }
  })

  ipcMain.handle('vault:get-current', async () => {
    return vaultService.getCurrentVault()
  })

  ipcMain.handle('vault:get-stats', async () => {
    return vaultService.getVaultStats()
  })

  ipcMain.handle('vault:select-directory', async () => {
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
  })
}
