import { BrowserWindow, ipcMain } from 'electron'
import type {
  TranscriptionOptions,
  TranscriptionSettings
} from '../../types/transcription'
import { transcriptionService } from '../services/transcription/transcription.service'

export function registerTranscriptionIpc(): void {
  transcriptionService.subscribeProgress((event) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed())
        window.webContents.send('transcription:progress', event)
    }
  })

  ipcMain.handle('transcription:get-current', (_event, payload: unknown) => {
    const lessonId = readId(payload, 'lessonId')
    return lessonId ? transcriptionService.getCurrent(lessonId) : null
  })

  ipcMain.handle('transcription:list-versions', (_event, payload: unknown) => {
    const lessonId = readId(payload, 'lessonId')
    return lessonId ? transcriptionService.listVersions(lessonId) : []
  })

  ipcMain.handle(
    'transcription:get-subtitle-candidate',
    (_event, payload: unknown) => {
      const lessonId = readId(payload, 'lessonId')
      if (!lessonId) return null
      const language = readOptionalLanguage(payload)
      return transcriptionService.getSubtitleCandidate(lessonId, language)
    }
  )

  ipcMain.handle('transcription:enqueue-lesson', (_event, payload: unknown) => {
    const lessonId = readId(payload, 'lessonId')
    if (!lessonId) throw new Error('Invalid transcription lesson request')
    return transcriptionService.enqueueLesson(lessonId, readOptions(payload))
  })

  ipcMain.handle('transcription:enqueue-module', (_event, payload: unknown) => {
    const moduleId = readId(payload, 'moduleId')
    if (!moduleId) throw new Error('Invalid transcription module request')
    return transcriptionService.enqueueModule(moduleId, readOptions(payload))
  })

  ipcMain.handle('transcription:enqueue-course', (_event, payload: unknown) => {
    const courseId = readId(payload, 'courseId')
    if (!courseId) throw new Error('Invalid transcription course request')
    return transcriptionService.enqueueCourse(courseId, readOptions(payload))
  })

  ipcMain.handle(
    'transcription:reuse-subtitle',
    async (_event, payload: unknown) => {
      const lessonId = readId(payload, 'lessonId')
      if (!lessonId) throw new Error('Invalid subtitle reuse request')
      return transcriptionService.reuseSubtitle(
        lessonId,
        readOptionalLanguage(payload)
      )
    }
  )

  ipcMain.handle('transcription:list-queue', () =>
    transcriptionService.listQueue()
  )
  ipcMain.handle('transcription:pause-job', (_event, payload: unknown) =>
    transcriptionService.pauseJob(readJobId(payload))
  )
  ipcMain.handle('transcription:resume-job', (_event, payload: unknown) =>
    transcriptionService.resumeJob(readJobId(payload))
  )
  ipcMain.handle('transcription:cancel-job', (_event, payload: unknown) =>
    transcriptionService.cancelJob(readJobId(payload))
  )
  ipcMain.handle('transcription:retry-job', (_event, payload: unknown) =>
    transcriptionService.retryJob(readJobId(payload))
  )
  ipcMain.handle('transcription:get-settings', () =>
    transcriptionService.getSettings()
  )
  ipcMain.handle(
    'transcription:update-settings',
    (_event, payload: unknown) => {
      if (!payload || typeof payload !== 'object')
        throw new Error('Invalid transcription settings')
      const value = payload as Partial<TranscriptionSettings>
      if (
        value.autoTranscribeNewLessons !== undefined &&
        typeof value.autoTranscribeNewLessons !== 'boolean'
      ) {
        throw new Error('Invalid transcription settings')
      }
      return transcriptionService.setSettings({
        ...(value.autoTranscribeNewLessons === undefined
          ? {}
          : { autoTranscribeNewLessons: value.autoTranscribeNewLessons })
      })
    }
  )
  ipcMain.handle(
    'transcription:get-course-auto-transcribe',
    (_event, payload: unknown) => {
      const courseId = readId(payload, 'courseId')
      return courseId
        ? transcriptionService.getCourseAutoTranscribe(courseId)
        : false
    }
  )
  ipcMain.handle(
    'transcription:set-course-auto-transcribe',
    (_event, payload: unknown) => {
      const courseId = readId(payload, 'courseId')
      if (
        !courseId ||
        !payload ||
        typeof payload !== 'object' ||
        typeof (payload as { enabled?: unknown }).enabled !== 'boolean'
      ) {
        throw new Error('Invalid course transcription settings')
      }
      return transcriptionService.setCourseAutoTranscribe(
        courseId,
        (payload as { enabled: boolean }).enabled
      )
    }
  )
}

function readId(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== 'object') return null
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readJobId(payload: unknown): string {
  const jobId = readId(payload, 'jobId')
  if (!jobId) throw new Error('Invalid transcription job request')
  return jobId
}

function readOptionalLanguage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const value = (payload as Record<string, unknown>).language
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim().length > 32)
    throw new Error('Invalid transcription language')
  return value.trim() || undefined
}

function readOptions(payload: unknown): TranscriptionOptions {
  if (!payload || typeof payload !== 'object') return {}
  const raw = (payload as Record<string, unknown>).options
  if (raw === undefined) return {}
  if (!raw || typeof raw !== 'object')
    throw new Error('Invalid transcription options')
  const input = raw as Record<string, unknown>
  const language =
    typeof input.language === 'string' ? input.language.trim() : undefined
  if (input.language !== undefined && (!language || language.length > 32))
    throw new Error('Invalid transcription language')
  for (const key of [
    'autoDetect',
    'reuseExistingSubtitle',
    'retranscribe',
    'cloudConsent'
  ]) {
    if (input[key] !== undefined && typeof input[key] !== 'boolean')
      throw new Error('Invalid transcription options')
  }
  return {
    ...(language ? { language } : {}),
    ...(typeof input.autoDetect === 'boolean'
      ? { autoDetect: input.autoDetect }
      : {}),
    ...(typeof input.reuseExistingSubtitle === 'boolean'
      ? { reuseExistingSubtitle: input.reuseExistingSubtitle }
      : {}),
    ...(typeof input.retranscribe === 'boolean'
      ? { retranscribe: input.retranscribe }
      : {}),
    ...(typeof input.cloudConsent === 'boolean'
      ? { cloudConsent: input.cloudConsent }
      : {})
  }
}
