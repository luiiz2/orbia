import { ipcMain, app } from 'electron'
import type { AppSettings } from '../../types'
import { appConfigService } from '../services/app-config.service'
import { logger } from '../services/logger.service'

const ALLOWED_SETTING_KEYS = new Set<string>([
  'language',
  'theme',
  'defaultPlaybackSpeed',
  'autoPlayNext',
  'completionThreshold',
  'lastVaultPath'
])

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', async () => {
    try {
      return appConfigService.getSettings()
    } catch (err) {
      logger.error('[IPC] settings:get error:', err)
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
        if (!payload || typeof payload.key !== 'string' || !ALLOWED_SETTING_KEYS.has(payload.key)) {
          return
        }
        appConfigService.setSetting(payload.key, payload.value)
      } catch (err) {
        logger.error('[IPC] settings:set error:', err)
      }
    }
  )

  ipcMain.handle('system:get-locale', async () => {
    try {
      return app.getLocale() || 'en'
    } catch (err) {
      logger.error('[IPC] system:get-locale error:', err)
      return 'en'
    }
  })
}
