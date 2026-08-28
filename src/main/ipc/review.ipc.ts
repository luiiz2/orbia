import { ipcMain, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { databaseService } from '../services/database.service'
import { backupService } from '../services/backup.service'
import { exportService } from '../services/export.service'
import { vaultService } from '../services/vault.service'
import { logger } from '../services/logger.service'

export function registerReviewIpc(): void {
  // --- Bookmarks IPC ---
  ipcMain.handle('bookmarks:create', async (_event, bookmark) => {
    return databaseService.createBookmark(bookmark)
  })

  ipcMain.handle('bookmarks:update', async (_event, { id, updates }) => {
    return databaseService.updateBookmark(id, updates)
  })

  ipcMain.handle('bookmarks:delete', async (_event, id) => {
    return databaseService.deleteBookmark(id)
  })

  ipcMain.handle('bookmarks:list-by-lesson', async (_event, lessonId) => {
    return databaseService.getBookmarksByLesson(lessonId)
  })

  ipcMain.handle('bookmarks:list-by-course', async (_event, courseId) => {
    return databaseService.getBookmarksByCourse(courseId)
  })

  ipcMain.handle('bookmarks:list-recent', async (_event, limit) => {
    return databaseService.getRecentBookmarks(limit)
  })

  // --- Flashcards IPC ---
  ipcMain.handle('flashcards:create', async (_event, card) => {
    return databaseService.createFlashcard(card)
  })

  ipcMain.handle('flashcards:update', async (_event, { id, updates }) => {
    return databaseService.updateFlashcard(id, updates)
  })

  ipcMain.handle('flashcards:delete', async (_event, id) => {
    return databaseService.deleteFlashcard(id)
  })

  ipcMain.handle('flashcards:get-by-id', async (_event, id) => {
    return databaseService.getFlashcardById(id)
  })

  ipcMain.handle('flashcards:get-due', async (_event, limit) => {
    return databaseService.getDueFlashcards(limit)
  })

  ipcMain.handle('flashcards:list-all', async (_event, courseId) => {
    return databaseService.getAllFlashcards(courseId)
  })

  ipcMain.handle('flashcards:list-by-lesson', async (_event, lessonId) => {
    return databaseService.getFlashcardsByLesson(lessonId)
  })

  ipcMain.handle('flashcards:review', async (_event, { id, grade }) => {
    return databaseService.reviewFlashcard(id, grade)
  })

  // --- Study Queue IPC ---
  ipcMain.handle('studyQueue:add', async (_event, { entityType, entityId }) => {
    return databaseService.addToStudyQueue(entityType, entityId)
  })

  ipcMain.handle('studyQueue:remove', async (_event, id) => {
    return databaseService.removeFromStudyQueue(id)
  })

  ipcMain.handle('studyQueue:reorder', async (_event, { id, direction }) => {
    return databaseService.reorderStudyQueue(id, direction)
  })

  ipcMain.handle('studyQueue:list', async () => {
    return databaseService.getStudyQueue()
  })

  // --- Course Goals IPC ---
  ipcMain.handle('goals:get', async (_event, courseId) => {
    return databaseService.getCourseGoal(courseId)
  })

  ipcMain.handle('goals:set', async (_event, goal) => {
    return databaseService.setCourseGoal(goal)
  })

  ipcMain.handle('goals:delete', async (_event, courseId) => {
    return databaseService.deleteCourseGoal(courseId)
  })

  // --- Backup & Restore IPC ---
  ipcMain.handle('backup:select-backup-file', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Selecionar arquivo de backup do Orbia',
      filters: [
        { name: 'Orbia Backup (*.orbia, *.zip)', extensions: ['orbia', 'zip'] }
      ],
      properties: ['openFile']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })

  ipcMain.handle(
    'backup:select-save-path',
    async (_event, defaultName?: string) => {
      const defaultFileName =
        defaultName ||
        `OrbiaBackup-${new Date().toISOString().split('T')[0]}.orbia`
      const res = await dialog.showSaveDialog({
        title: 'Salvar backup do Orbia',
        defaultPath: defaultFileName,
        filters: [{ name: 'Orbia Backup (*.orbia)', extensions: ['orbia'] }]
      })
      if (res.canceled || !res.filePath) return null
      return res.filePath
    }
  )

  ipcMain.handle(
    'backup:create',
    async (_event, { targetFilePath, vaultName }) => {
      const vault = vaultService.getCurrentVault()
      if (!vault) {
        return {
          success: false,
          filePath: '',
          fileSizeBytes: 0,
          error: 'No vault is currently open.'
        }
      }

      let dest = targetFilePath
      if (!dest) {
        const defaultFileName = `OrbiaBackup-${new Date().toISOString().split('T')[0]}.orbia`
        const saveRes = await dialog.showSaveDialog({
          title: 'Salvar backup do Orbia',
          defaultPath: defaultFileName,
          filters: [{ name: 'Orbia Backup (*.orbia)', extensions: ['orbia'] }]
        })
        if (saveRes.canceled || !saveRes.filePath) {
          return {
            success: false,
            filePath: '',
            fileSizeBytes: 0,
            error: 'Backup cancelled by user.'
          }
        }
        dest = saveRes.filePath
      }

      return backupService.createBackup({
        vaultPath: vault.path,
        targetFilePath: dest,
        vaultName: vaultName || vault.name
      })
    }
  )

  ipcMain.handle('backup:inspect', async (_event, backupFilePath) => {
    return backupService.inspectBackup(backupFilePath)
  })

  ipcMain.handle('backup:restore', async (_event, backupFilePath) => {
    const vault = vaultService.getCurrentVault()
    if (!vault) {
      return {
        success: false,
        restoredCoursesCount: 0,
        error: 'No vault is currently open.'
      }
    }
    return backupService.restoreBackup({
      vaultPath: vault.path,
      backupFilePath
    })
  })

  // --- Exports IPC ---
  ipcMain.handle('exports:notes-markdown', async (_event, courseId) => {
    return exportService.exportNotesMarkdown(courseId)
  })

  ipcMain.handle('exports:bookmarks-markdown', async (_event, courseId) => {
    return exportService.exportBookmarksMarkdown(courseId)
  })

  ipcMain.handle('exports:flashcards-csv', async (_event, courseId) => {
    return exportService.exportFlashcardsCsv(courseId)
  })

  ipcMain.handle('exports:flashcards-markdown', async (_event, courseId) => {
    return exportService.exportFlashcardsMarkdown(courseId)
  })

  ipcMain.handle(
    'exports:save-file',
    async (_event, { defaultFileName, content }) => {
      const ext = path.extname(defaultFileName).replace(/^\./, '')
      const res = await dialog.showSaveDialog({
        title: 'Exportar arquivo',
        defaultPath: defaultFileName,
        filters: ext
          ? [
              {
                name: `${ext.toUpperCase()} Files (*.${ext})`,
                extensions: [ext]
              }
            ]
          : undefined
      })

      if (res.canceled || !res.filePath) {
        return { success: false }
      }

      fs.writeFileSync(res.filePath, content, 'utf-8')
      return { success: true, filePath: res.filePath }
    }
  )

  // --- Study Sessions IPC ---
  ipcMain.handle('sessions:start', async (_event, { courseId, source }) => {
    return databaseService.startStudySession({ courseId, source })
  })

  ipcMain.handle('sessions:end', async (_event, { sessionId, duration }) => {
    return databaseService.endStudySession(sessionId, duration)
  })

  ipcMain.handle('sessions:list', async (_event, limit) => {
    return databaseService.getStudySessions(limit)
  })

  // --- Review Dashboard IPC ---
  ipcMain.handle('review:get-dashboard-stats', async () => {
    return databaseService.getReviewDashboardStats()
  })

  logger.info('[IPC] Registered Review & Portability v0.3 handlers.')
}
