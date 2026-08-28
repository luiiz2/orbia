import { ipcMain } from 'electron'
import type {
  DeleteChapterRequest,
  GenerateChaptersRequest,
  SaveChaptersRequest,
  UpdateChapterRequest
} from '../../types/chapters'
import { chaptersService } from '../services/chapters/chapters.service'

function readLessonId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Invalid lessonId')
  }
  return value.trim()
}

function readGenerateRequest(value: unknown): GenerateChaptersRequest {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid generate chapters request')
  }
  const raw = value as Record<string, unknown>
  if (typeof raw.lessonId !== 'string' || !raw.lessonId.trim()) {
    throw new Error('Invalid lessonId')
  }
  if (typeof raw.courseId !== 'string' || !raw.courseId.trim()) {
    throw new Error('Invalid courseId')
  }
  return {
    lessonId: raw.lessonId.trim(),
    courseId: raw.courseId.trim(),
    cloudConsent: raw.cloudConsent === true
  }
}

function readSaveRequest(value: unknown): SaveChaptersRequest {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid save chapters request')
  }
  const raw = value as Record<string, unknown>
  if (typeof raw.lessonId !== 'string' || !raw.lessonId.trim()) {
    throw new Error('Invalid lessonId')
  }
  if (typeof raw.courseId !== 'string' || !raw.courseId.trim()) {
    throw new Error('Invalid courseId')
  }
  if (!Array.isArray(raw.chapters)) {
    throw new Error('Invalid chapters list')
  }
  const chapters = raw.chapters.map((item) => {
    if (!item || typeof item !== 'object')
      throw new Error('Invalid chapter item')
    const ch = item as Record<string, unknown>
    if (typeof ch.title !== 'string' || !ch.title.trim())
      throw new Error('Chapter title is required')
    if (typeof ch.timestampSeconds !== 'number' || ch.timestampSeconds < 0)
      throw new Error('Valid timestamp is required')
    return {
      id: typeof ch.id === 'string' ? ch.id : undefined,
      title: ch.title.trim(),
      timestampSeconds: ch.timestampSeconds,
      isManual: ch.isManual === true
    }
  })
  return {
    lessonId: raw.lessonId.trim(),
    courseId: raw.courseId.trim(),
    chapters
  }
}

function readUpdateRequest(value: unknown): UpdateChapterRequest {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid update chapter request')
  }
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== 'string' || !raw.id.trim())
    throw new Error('Invalid chapter id')
  if (typeof raw.lessonId !== 'string' || !raw.lessonId.trim())
    throw new Error('Invalid lessonId')
  if (typeof raw.courseId !== 'string' || !raw.courseId.trim())
    throw new Error('Invalid courseId')

  return {
    id: raw.id.trim(),
    lessonId: raw.lessonId.trim(),
    courseId: raw.courseId.trim(),
    title: typeof raw.title === 'string' ? raw.title.trim() : undefined,
    timestampSeconds:
      typeof raw.timestampSeconds === 'number'
        ? raw.timestampSeconds
        : undefined
  }
}

function readDeleteRequest(value: unknown): DeleteChapterRequest {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid delete chapter request')
  }
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== 'string' || !raw.id.trim())
    throw new Error('Invalid chapter id')
  if (typeof raw.lessonId !== 'string' || !raw.lessonId.trim())
    throw new Error('Invalid lessonId')
  if (typeof raw.courseId !== 'string' || !raw.courseId.trim())
    throw new Error('Invalid courseId')

  return {
    id: raw.id.trim(),
    lessonId: raw.lessonId.trim(),
    courseId: raw.courseId.trim()
  }
}

export function registerChaptersIpc(): void {
  ipcMain.handle('chapters:get', async (_event, payload: unknown) => {
    const lessonId = readLessonId(payload)
    return chaptersService.getChapters(lessonId)
  })

  ipcMain.handle('chapters:generate', async (_event, payload: unknown) => {
    const request = readGenerateRequest(payload)
    return chaptersService.generateChapters(request)
  })

  ipcMain.handle('chapters:save', async (_event, payload: unknown) => {
    const request = readSaveRequest(payload)
    return chaptersService.saveChapters(request)
  })

  ipcMain.handle('chapters:update', async (_event, payload: unknown) => {
    const request = readUpdateRequest(payload)
    return chaptersService.updateChapter(request)
  })

  ipcMain.handle('chapters:delete', async (_event, payload: unknown) => {
    const request = readDeleteRequest(payload)
    return chaptersService.deleteChapter(request)
  })
}
