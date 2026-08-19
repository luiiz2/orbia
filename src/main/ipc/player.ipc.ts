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

  ipcMain.handle('player:get-lesson-notes', async (_event, payload: { lessonId: string }) => {
    try {
      return databaseService.getLessonNotes(payload.lessonId)
    } catch (err) {
      console.error('[IPC] player:get-lesson-notes error:', err)
      return []
    }
  })

  ipcMain.handle(
    'player:add-lesson-note',
    async (
      _event,
      payload: {
        lessonId: string
        courseId: string
        timestampSeconds: number
        content: string
      }
    ) => {
      try {
        return databaseService.addLessonNote(payload)
      } catch (err) {
        console.error('[IPC] player:add-lesson-note error:', err)
        throw err
      }
    }
  )

  ipcMain.handle(
    'player:update-lesson-note',
    async (_event, payload: { id: string; content: string }) => {
      try {
        databaseService.updateLessonNote(payload.id, payload.content)
        return true
      } catch (err) {
        console.error('[IPC] player:update-lesson-note error:', err)
        return false
      }
    }
  )

  ipcMain.handle('player:delete-lesson-note', async (_event, payload: { id: string }) => {
    try {
      databaseService.deleteLessonNote(payload.id)
      return true
    } catch (err) {
      console.error('[IPC] player:delete-lesson-note error:', err)
      return false
    }
  })

  ipcMain.handle('player:export-course-notes', async (_event, payload: { courseId: string }) => {
    try {
      const courseData = databaseService.getCourseById(payload.courseId)
      const notes = databaseService.getCourseNotes(payload.courseId)
      const courseTitle = courseData?.course.title || 'Course Notes'

      let markdown = `# Notes: ${courseTitle}\n\n`
      markdown += `*Exported on ${new Date().toISOString()}*\n\n---\n\n`

      if (notes.length === 0) {
        markdown += `*No notes recorded for this course.*\n`
        return markdown
      }

      const lessonMap = new Map<string, string>()
      if (courseData?.modules) {
        for (const mod of courseData.modules) {
          for (const lesson of mod.lessons) {
            lessonMap.set(lesson.id, `${mod.title} > ${lesson.title}`)
          }
        }
      }

      for (const note of notes) {
        const lessonName = lessonMap.get(note.lessonId) || `Lesson (${note.lessonId})`
        const minutes = Math.floor(note.timestampSeconds / 60)
        const seconds = Math.floor(note.timestampSeconds % 60)
        const timestamp = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

        markdown += `### ${lessonName} [${timestamp}]\n\n`
        markdown += `${note.content}\n\n`
        markdown += `*Created: ${new Date(note.createdAt).toISOString()}*\n\n---\n\n`
      }

      return markdown
    } catch (err) {
      console.error('[IPC] player:export-course-notes error:', err)
      return ''
    }
  })
}

