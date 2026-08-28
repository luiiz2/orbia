import { ipcMain, app, shell } from 'electron'
import type { AppSettings } from '../../types'
import { appConfigService } from '../services/app-config.service'
import { logger } from '../services/logger.service'
import { isImportableFile } from '../utils/file-utils'
import fs from 'node:fs'

const ALLOWED_SETTING_KEYS = new Set<string>([
  'language',
  'theme',
  'defaultPlaybackSpeed',
  'autoPlayNext',
  'completionThreshold',
  'lastVaultPath',
  'deleteSourceZipAfterImport'
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
        completionThreshold: 0.9
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
        if (
          !payload ||
          typeof payload.key !== 'string' ||
          !ALLOWED_SETTING_KEYS.has(payload.key)
        ) {
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

  // Opens an external URL (http/https only) in the default browser
  ipcMain.handle('system:open-external', async (_event, url: string) => {
    try {
      if (typeof url !== 'string') return false
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
        return false
      await shell.openExternal(parsed.toString())
      return true
    } catch (err) {
      logger.error('[IPC] system:open-external error:', err)
      return false
    }
  })

  // Opens an importable file with the OS default application.
  // Restricted to importable extensions — never executes arbitrary paths.
  ipcMain.handle('system:open-path', async (_event, filePath: string) => {
    try {
      if (
        typeof filePath !== 'string' ||
        !filePath ||
        !isImportableFile(filePath)
      )
        return false
      const stat = await fs.promises.stat(filePath)
      if (!stat.isFile()) return false
      const error = await shell.openPath(filePath)
      return error === ''
    } catch (err) {
      logger.error('[IPC] system:open-path error:', err)
      return false
    }
  })
}
