import { ipcMain, app } from 'electron'
import type { AppSettings } from '../../types'
import { appConfigService } from '../services/app-config.service'

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', async () => {
    try {
      return appConfigService.getSettings()
    } catch (err) {
      console.error('[IPC] settings:get error:', err)
      return {
        language: 'en',
        theme: 'dark',
        defaultPlaybackSpeed: 1.0,
        autoPlayNext: true,
        completionThreshold: 0.90
      }
    }
  })

  ipcMain.handle(
    'settings:set',
    async <K extends keyof AppSettings>(
      _event,
      payload: { key: K; value: AppSettings[K] }
    ) => {
      try {
        appConfigService.setSetting(payload.key, payload.value)
      } catch (err) {
        console.error('[IPC] settings:set error:', err)
      }
    }
  )

  ipcMain.handle('system:get-locale', async () => {
    return app.getLocale() || 'en'
  })
}
