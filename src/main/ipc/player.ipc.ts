import { ipcMain } from 'electron'
import { databaseService } from '../services/database.service'

export function registerPlayerIpc(): void {
  ipcMain.handle(
    'player:save-progress',
    async (
      _event,
      payload: {
        lessonId: string
        courseId: string
        currentTime: number
        duration: number
        completed: boolean
      }
    ) => {
      try {
        databaseService.saveLessonProgress(payload)
      } catch (err) {
        console.error('[IPC] player:save-progress error:', err)
      }
    }
  )

  ipcMain.handle('player:get-progress', async (_event, payload: { lessonId: string }) => {
    try {
      return databaseService.getLessonProgress(payload.lessonId)
    } catch (err) {
      console.error('[IPC] player:get-progress error:', err)
      return null
    }
  })

  ipcMain.handle(
    'player:get-course-progress',
    async (_event, payload: { courseId: string }) => {
      try {
        return databaseService.getCourseProgressSummary(payload.courseId)
      } catch (err) {
        console.error('[IPC] player:get-course-progress error:', err)
        return null
      }
    }
  )

  ipcMain.handle('player:get-all-progress-summaries', async () => {
    try {
      return databaseService.getAllProgressSummaries()
    } catch (err) {
      console.error('[IPC] player:get-all-progress-summaries error:', err)
      return {}
    }
  })

  ipcMain.handle(
    'player:toggle-lesson-completion',
    async (_event, payload: { lessonId: string; courseId: string }) => {
      try {
        return databaseService.toggleLessonCompletion(payload.lessonId, payload.courseId)
      } catch (err) {
        console.error('[IPC] player:toggle-lesson-completion error:', err)
        return false
      }
    }
  )

  ipcMain.handle('player:get-watch-history', async (_event, payload?: { limit?: number }) => {
    try {
      return databaseService.getWatchHistory(payload?.limit || 50)
    } catch (err) {
      console.error('[IPC] player:get-watch-history error:', err)
      return []
    }
  })

  ipcMain.handle(
    'player:add-watch-history',
    async (
      _event,
      payload: {
        lessonId: string
        courseId: string
        lessonTitle: string
        courseTitle: string
        coverPath?: string
        duration: number
        currentTime: number
      }
    ) => {
      try {
        databaseService.addWatchHistory(payload)
      } catch (err) {
        console.error('[IPC] player:add-watch-history error:', err)
      }
    }
  )
}
