import { ipcMain } from 'electron'
import { databaseService } from '../services/database.service'
import { appConfigService } from '../services/app-config.service'
import { logger } from '../services/logger.service'
import { resourceManagerService } from '../services/optimizer/resource-manager.service'

export function registerPlayerIpc(): void {
  ipcMain.handle('player:set-active', async (_event, payload: { active?: unknown }) => {
    resourceManagerService.setPlayerActive(Boolean(payload?.active))
  })

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
        if (
          !payload ||
          typeof payload.lessonId !== 'string' ||
          !payload.lessonId.trim() ||
          typeof payload.courseId !== 'string' ||
          !payload.courseId.trim()
        ) {
          return
        }
        const currentTime =
          typeof payload.currentTime === 'number' && Number.isFinite(payload.currentTime) && payload.currentTime >= 0
            ? payload.currentTime
            : 0
        const duration =
          typeof payload.duration === 'number' && Number.isFinite(payload.duration) && payload.duration >= 0
            ? payload.duration
            : 0
        const completed = Boolean(payload.completed)

        databaseService.saveLessonProgress({
          lessonId: payload.lessonId.trim(),
          courseId: payload.courseId.trim(),
          currentTime,
          duration,
          completed
        })
      } catch (err) {
        logger.error('[IPC] player:save-progress error:', err)
      }
    }
  )

  ipcMain.handle('player:get-progress', async (_event, payload: { lessonId: string }) => {
    try {
      if (!payload || typeof payload.lessonId !== 'string' || !payload.lessonId.trim()) {
        return null
      }
      return databaseService.getLessonProgress(payload.lessonId.trim())
    } catch (err) {
      logger.error('[IPC] player:get-progress error:', err)
      return null
    }
  })

  ipcMain.handle(
    'player:get-lessons-progress',
    async (_event, payload: { courseId: string }) => {
      try {
        if (!payload || typeof payload.courseId !== 'string' || !payload.courseId.trim()) {
          return []
        }
        return databaseService.getLessonProgressByCourse(payload.courseId.trim())
      } catch (err) {
        logger.error('[IPC] player:get-lessons-progress error:', err)
        return []
      }
    }
  )

  ipcMain.handle(
    'player:get-course-progress',
    async (_event, payload: { courseId: string }) => {
      try {
        if (!payload || typeof payload.courseId !== 'string' || !payload.courseId.trim()) {
          return null
        }
        return databaseService.getCourseProgressSummary(payload.courseId.trim())
      } catch (err) {
        logger.error('[IPC] player:get-course-progress error:', err)
        return null
      }
    }
  )

  ipcMain.handle('player:get-all-progress-summaries', async () => {
    try {
      return databaseService.getAllProgressSummaries()
    } catch (err) {
      logger.error('[IPC] player:get-all-progress-summaries error:', err)
      return {}
    }
  })

  ipcMain.handle(
    'player:toggle-lesson-completion',
    async (_event, payload: { lessonId: string; courseId: string }) => {
      try {
        if (
          !payload ||
          typeof payload.lessonId !== 'string' ||
          !payload.lessonId.trim() ||
          typeof payload.courseId !== 'string' ||
          !payload.courseId.trim()
        ) {
          return false
        }
        return databaseService.toggleLessonCompletion(payload.lessonId.trim(), payload.courseId.trim())
      } catch (err) {
        logger.error('[IPC] player:toggle-lesson-completion error:', err)
        return false
      }
    }
  )

  ipcMain.handle('player:get-watch-history', async (_event, payload?: { limit?: number }) => {
    try {
      const rawLimit =
        payload && typeof payload.limit === 'number' && Number.isFinite(payload.limit) ? payload.limit : 50
      const limit = Math.max(1, Math.min(Math.floor(rawLimit), 500))
      return databaseService.getWatchHistory(limit)
    } catch (err) {
      logger.error('[IPC] player:get-watch-history error:', err)
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
        if (
          !payload ||
          typeof payload.lessonId !== 'string' ||
          !payload.lessonId.trim() ||
          typeof payload.courseId !== 'string' ||
          !payload.courseId.trim()
        ) {
          return
        }
        const duration =
          typeof payload.duration === 'number' && Number.isFinite(payload.duration) && payload.duration >= 0
            ? payload.duration
            : 0
        const currentTime =
          typeof payload.currentTime === 'number' && Number.isFinite(payload.currentTime) && payload.currentTime >= 0
            ? payload.currentTime
            : 0

        databaseService.addWatchHistory({
          lessonId: payload.lessonId.trim(),
          courseId: payload.courseId.trim(),
          lessonTitle: typeof payload.lessonTitle === 'string' ? payload.lessonTitle.trim() : '',
          courseTitle: typeof payload.courseTitle === 'string' ? payload.courseTitle.trim() : '',
          coverPath: typeof payload.coverPath === 'string' ? payload.coverPath.trim() : undefined,
          duration,
          currentTime
        })
      } catch (err) {
        logger.error('[IPC] player:add-watch-history error:', err)
      }
    }
  )

  ipcMain.handle('player:get-lesson-notes', async (_event, payload: { lessonId: string }) => {
    try {
      if (!payload || typeof payload.lessonId !== 'string' || !payload.lessonId.trim()) {
        return []
      }
      return databaseService.getLessonNotes(payload.lessonId.trim())
    } catch (err) {
      logger.error('[IPC] player:get-lesson-notes error:', err)
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
        if (
          !payload ||
          typeof payload.lessonId !== 'string' ||
          !payload.lessonId.trim() ||
          typeof payload.courseId !== 'string' ||
          !payload.courseId.trim() ||
          typeof payload.content !== 'string' ||
          !payload.content.trim()
        ) {
          throw new Error('lessonId, courseId and non-empty content are required')
        }
        const timestampSeconds =
          typeof payload.timestampSeconds === 'number' &&
          Number.isFinite(payload.timestampSeconds) &&
          payload.timestampSeconds >= 0
            ? payload.timestampSeconds
            : 0

        return databaseService.addLessonNote({
          lessonId: payload.lessonId.trim(),
          courseId: payload.courseId.trim(),
          timestampSeconds,
          content: payload.content.trim()
        })
      } catch (err) {
        logger.error('[IPC] player:add-lesson-note error:', err)
        throw err
      }
    }
  )

  ipcMain.handle(
    'player:update-lesson-note',
    async (_event, payload: { id: string; content: string }) => {
      try {
        if (
          !payload ||
          typeof payload.id !== 'string' ||
          !payload.id.trim() ||
          typeof payload.content !== 'string' ||
          !payload.content.trim()
        ) {
          return false
        }
        databaseService.updateLessonNote(payload.id.trim(), payload.content.trim())
        return true
      } catch (err) {
        logger.error('[IPC] player:update-lesson-note error:', err)
        return false
      }
    }
  )

  ipcMain.handle('player:delete-lesson-note', async (_event, payload: { id: string }) => {
    try {
      if (!payload || typeof payload.id !== 'string' || !payload.id.trim()) {
        return false
      }
      databaseService.deleteLessonNote(payload.id.trim())
      return true
    } catch (err) {
      logger.error('[IPC] player:delete-lesson-note error:', err)
      return false
    }
  })

  ipcMain.handle('player:export-course-notes', async (_event, payload: { courseId: string }) => {
    try {
      if (!payload || typeof payload.courseId !== 'string' || !payload.courseId.trim()) {
        return ''
      }
      const trimmedCourseId = payload.courseId.trim()
      const courseData = databaseService.getCourseById(trimmedCourseId)
      const notes = databaseService.getCourseNotes(trimmedCourseId)
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
      logger.error('[IPC] player:export-course-notes error:', err)
      return ''
    }
  })

  ipcMain.handle('player:get-study-analytics', async (_event, payload?: { dailyGoalMinutes?: number }) => {
    try {
      const configuredGoal = appConfigService.getSettings().dailyStudyGoalMinutes || 30
      const dailyGoal =
        typeof payload?.dailyGoalMinutes === 'number' && Number.isFinite(payload.dailyGoalMinutes) && payload.dailyGoalMinutes > 0
          ? payload.dailyGoalMinutes
          : configuredGoal
      return databaseService.getStudyAnalytics(dailyGoal)
    } catch (err) {
      logger.error('[IPC] player:get-study-analytics error:', err)
      const fallbackGoal = appConfigService.getSettings().dailyStudyGoalMinutes || 30
      return {
        currentStreakDays: 0,
        longestStreakDays: 0,
        totalSecondsWatched: 0,
        totalLessonsCompleted: 0,
        dailyGoalMinutes: fallbackGoal,
        todaySecondsWatched: 0,
        dailyHistory: [],
        topCourses: []
      }
    }
  })
}

