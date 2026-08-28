import { ipcMain } from 'electron'
import type { GenerateSummaryRequest, SummaryScope } from '../../types/summaries'
import { summariesService } from '../services/summaries/summaries.service'

function readScope(value: unknown): SummaryScope {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid summary scope')
  }
  const scope = value as Record<string, unknown>
  const type = scope.type
  if (type !== 'lesson' && type !== 'module' && type !== 'course') {
    throw new Error('Invalid summary scope type')
  }
  if (typeof scope.courseId !== 'string' || !scope.courseId.trim()) {
    throw new Error('Invalid summary courseId')
  }

  if (type === 'lesson') {
    if (typeof scope.moduleId !== 'string' || !scope.moduleId.trim()) {
      throw new Error('Invalid summary moduleId')
    }
    if (typeof scope.lessonId !== 'string' || !scope.lessonId.trim()) {
      throw new Error('Invalid summary lessonId')
    }
    return {
      type: 'lesson',
      courseId: scope.courseId.trim(),
      moduleId: scope.moduleId.trim(),
      lessonId: scope.lessonId.trim()
    }
  }

  if (type === 'module') {
    if (typeof scope.moduleId !== 'string' || !scope.moduleId.trim()) {
      throw new Error('Invalid summary moduleId')
    }
    return {
      type: 'module',
      courseId: scope.courseId.trim(),
      moduleId: scope.moduleId.trim()
    }
  }

  return {
    type: 'course',
    courseId: scope.courseId.trim()
  }
}

function readGenerateRequest(value: unknown): GenerateSummaryRequest {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid generate summary request')
  }
  const raw = value as Record<string, unknown>
  const scope = readScope(raw.scope)
  const forceRegenerate = raw.forceRegenerate === true
  const cloudConsent = raw.cloudConsent === true

  return { scope, forceRegenerate, cloudConsent }
}

export function registerSummariesIpc(): void {
  ipcMain.handle('summaries:get', async (_event, payload: unknown) => {
    const scope = readScope(payload)
    return summariesService.getSummary(scope)
  })

  ipcMain.handle('summaries:generate', async (_event, payload: unknown) => {
    const request = readGenerateRequest(payload)
    return summariesService.generateSummary(request)
  })

  ipcMain.handle('summaries:invalidate', async (_event, payload: unknown) => {
    const scope = readScope(payload)
    return summariesService.invalidateSummary(scope)
  })
}
