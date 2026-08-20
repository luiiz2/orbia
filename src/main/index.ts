import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import {
  createMainMediaPathAuthorizer,
  registerMediaScheme,
  setupMediaProtocol
} from './protocol'
import { appConfigService } from './services/app-config.service'
import { vaultService } from './services/vault.service'
import { databaseService } from './services/database.service'
import { registerAllIpc } from './ipc'
import { logger } from './services/logger.service'

let mainWindow: BrowserWindow | null = null

// Global exception catchers
process.on('uncaughtException', (error) => {
  logger.error('[Main] Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason) => {
  logger.error('[Main] Unhandled Rejection:', reason)
})

// Performance optimization switches
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('disable-renderer-backgrounding')

// CRITICAL: Register media scheme privileges BEFORE app.whenReady()
registerMediaScheme()

// Single Instance Lock — Ensure only one process runs at a time
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  logger.info('[Main] Another instance is already running. Quitting secondary process.')
  app.quit()
} else {
  app.on('second-instance', () => {
    logger.info('[Main] Second instance launched. Focusing existing window.')
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
      mainWindow.moveTop()
    }
  })

  function createWindow(): BrowserWindow {
    logger.info('[Main] Creating BrowserWindow...')
    const win = new BrowserWindow({
      width: 1280,
      height: 850,
      minWidth: 900,
      minHeight: 600,
      show: true,
      center: true,
      autoHideMenuBar: true,
      title: 'Orbia',
      backgroundColor: '#080b11',
      icon,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    mainWindow = win

    win.on('closed', () => {
      logger.info('[Main] MainWindow closed')
      mainWindow = null
    })

    win.webContents.on('did-finish-load', () => {
      logger.info('[Main] Renderer finished loading successfully')
    })

    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      logger.error('[Main] Renderer failed to load:', errorCode, errorDescription, validatedURL)
    })

    win.webContents.on('render-process-gone', (_event, details) => {
      logger.error('[Main] Render process gone:', details.reason, details.exitCode)
    })

    win.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      logger.info('[Main] Loading dev URL:', process.env['ELECTRON_RENDERER_URL'])
      win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      const htmlPath = join(__dirname, '../renderer/index.html')
      logger.info('[Main] Loading packaged HTML:', htmlPath)
      win.loadFile(htmlPath)
    }

    return win
  }

  app.whenReady().then(async () => {
    logger.info('[Main] App ready event fired. Initializing services...')
    electronApp.setAppUserModelId('com.orbia.app')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // 1. Setup media streaming protocol
    try {
      setupMediaProtocol({
        authorizer: createMainMediaPathAuthorizer({
          getRegisteredMediaPaths: () => databaseService.getRegisteredMediaPaths(),
          getCurrentVaultPath: () => vaultService.getCurrentVault()?.path ?? databaseService.getCurrentVaultPath()
        })
      })
      logger.info('[Main] Media protocol initialized')
    } catch (err) {
      logger.error('[Main] Media protocol init error:', err)
    }

    // 2. Initialize App Config database
    try {
      appConfigService.init()
      logger.info('[Main] App Config database initialized')
    } catch (err) {
      logger.error('[Main] AppConfig init error:', err)
    }

    // 3. Register IPC endpoints
    try {
      registerAllIpc()
      logger.info('[Main] IPC handlers registered')
    } catch (err) {
      logger.error('[Main] IPC register error:', err)
    }

    // 4. Create main window immediately (zero delay)
    createWindow()

    // 5. Auto-open last active vault in background if exists
    try {
      const settings = appConfigService.getSettings()
      if (settings.lastVaultPath) {
        logger.info('[Main] Auto-opening last vault in background:', settings.lastVaultPath)
        await vaultService.openVault(settings.lastVaultPath)
      }
    } catch (err) {
      logger.warn('[Main] Could not auto-open last vault:', err)
    }

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('before-quit', () => {
    logger.info('[Main] App before-quit')
    try {
      databaseService.close()
      appConfigService.close()
    } catch (err) {
      logger.error('[Main] Error closing databases:', err)
    }
  })

  app.on('window-all-closed', () => {
    logger.info('[Main] All windows closed')
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
