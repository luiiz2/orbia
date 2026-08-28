import { BrowserWindow, ipcMain } from 'electron'
import type {
  SemanticIndexEnqueueInput,
  SemanticIndexScope,
  SemanticIndexSettings,
  SemanticSourceSelection
} from '../../types/semantic-index'
import { optimizationWorkerService } from '../services/optimizer/optimization-worker.service'
import { semanticIndexService } from '../services/semantic-index/semantic-index.service'

const MAX_ID_LENGTH = 512
const MAX_SELECTED_IDS = 1_000

export function registerSemanticIndexIpc(): void {
  optimizationWorkerService.subscribeProgress((item) => {
    if (item.jobType !== 'semantic_index') return
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed())
        window.webContents.send('semantic-index:progress', item)
    }
  })

  ipcMain.handle('semantic-index:get-status', () =>
    semanticIndexService.getStatus()
  )
  ipcMain.handle('semantic-index:get-metrics', () =>
    semanticIndexService.getMetrics()
  )
  ipcMain.handle('semantic-index:get-settings', () =>
    semanticIndexService.getSettings()
  )
  ipcMain.handle('semantic-index:update-settings', (_event, payload: unknown) =>
    semanticIndexService.setSettings(parseSettings(payload))
  )
  ipcMain.handle('semantic-index:enqueue', (_event, payload: unknown) =>
    semanticIndexService.enqueue(parseEnqueueInput(payload))
  )
  ipcMain.handle('semantic-index:rebuild', (_event, payload: unknown) =>
    semanticIndexService.enqueueRebuild(parseEnqueueInput(payload))
  )
  ipcMain.handle(
    'semantic-index:refresh-source',
    (_event, payload: unknown) => {
      const value = readRecord(
        payload,
        'Invalid semantic index refresh request'
      )
      return semanticIndexService.refreshSource(
        parseSelection(value.selection),
        parseRefreshOptions(value.options)
      )
    }
  )
  ipcMain.handle('semantic-index:remove-source', (_event, payload: unknown) =>
    semanticIndexService.removeSource(
      parseSelection(
        readRecord(payload, 'Invalid semantic source request').selection
      )
    )
  )
  ipcMain.handle('semantic-index:list-queue', () =>
    semanticIndexService.listQueue()
  )
  ipcMain.handle('semantic-index:pause-job', (_event, payload: unknown) =>
    semanticIndexService.pause(
      readId(
        readRecord(payload, 'Invalid semantic index job request'),
        'jobId',
        'Invalid semantic index job request'
      )
    )
  )
  ipcMain.handle('semantic-index:resume-job', (_event, payload: unknown) =>
    semanticIndexService.resume(
      readId(
        readRecord(payload, 'Invalid semantic index job request'),
        'jobId',
        'Invalid semantic index job request'
      )
    )
  )
  ipcMain.handle('semantic-index:cancel-job', (_event, payload: unknown) =>
    semanticIndexService.cancel(
      readId(
        readRecord(payload, 'Invalid semantic index job request'),
        'jobId',
        'Invalid semantic index job request'
      )
    )
  )
  ipcMain.handle('semantic-index:retry-job', (_event, payload: unknown) =>
    semanticIndexService.retry(
      readId(
        readRecord(payload, 'Invalid semantic index job request'),
        'jobId',
        'Invalid semantic index job request'
      )
    )
  )
}

function parseEnqueueInput(payload: unknown): SemanticIndexEnqueueInput {
  const value = readRecord(payload, 'Invalid semantic index request')
  return {
    scope: parseScope(value.scope),
    ...(value.rebuild === undefined
      ? {}
      : {
          rebuild: readBoolean(value.rebuild, 'Invalid semantic index request')
        }),
    ...(value.includeNotes === undefined
      ? {}
      : {
          includeNotes: readBoolean(
            value.includeNotes,
            'Invalid semantic index request'
          )
        }),
    ...(value.cloudConsent === undefined
      ? {}
      : {
          cloudConsent: readBoolean(
            value.cloudConsent,
            'Invalid semantic index request'
          )
        })
  }
}

function parseSettings(payload: unknown): Partial<SemanticIndexSettings> {
  const value = readRecord(payload, 'Invalid semantic index settings')
  if (value.includeNotes === undefined) return {}
  return {
    includeNotes: readBoolean(
      value.includeNotes,
      'Invalid semantic index settings'
    )
  }
}

function parseRefreshOptions(
  payload: unknown
): Omit<SemanticIndexEnqueueInput, 'scope' | 'rebuild'> {
  if (payload === undefined) return {}
  const value = readRecord(payload, 'Invalid semantic index refresh request')
  return {
    ...(value.includeNotes === undefined
      ? {}
      : {
          includeNotes: readBoolean(
            value.includeNotes,
            'Invalid semantic index refresh request'
          )
        }),
    ...(value.cloudConsent === undefined
      ? {}
      : {
          cloudConsent: readBoolean(
            value.cloudConsent,
            'Invalid semantic index refresh request'
          )
        })
  }
}

function parseScope(payload: unknown): SemanticIndexScope {
  const scope = readRecord(payload, 'Invalid semantic index request')
  if (scope.type === 'vault') return { type: 'vault' }
  if (scope.type === 'lesson')
    return {
      type: 'lesson',
      lessonId: readId(scope, 'lessonId', 'Invalid semantic index request')
    }
  if (scope.type === 'course')
    return {
      type: 'course',
      courseId: readId(scope, 'courseId', 'Invalid semantic index request')
    }
  if (scope.type === 'selected') {
    const lessonIds = readIdList(
      scope.lessonIds,
      'Invalid semantic index request'
    )
    const resourceIds = readIdList(
      scope.resourceIds,
      'Invalid semantic index request'
    )
    const noteIds = readIdList(scope.noteIds, 'Invalid semantic index request')
    if (lessonIds.length + resourceIds.length + noteIds.length === 0)
      throw new Error('Invalid semantic index request')
    return {
      type: 'selected',
      ...(lessonIds.length ? { lessonIds } : {}),
      ...(resourceIds.length ? { resourceIds } : {}),
      ...(noteIds.length ? { noteIds } : {})
    }
  }
  throw new Error('Invalid semantic index request')
}

function parseSelection(payload: unknown): SemanticSourceSelection {
  const value = readRecord(payload, 'Invalid semantic source request')
  const entries = [
    value.lessonId === undefined
      ? undefined
      : ([
          'lessonId',
          readId(value, 'lessonId', 'Invalid semantic source request')
        ] as const),
    value.resourceId === undefined
      ? undefined
      : ([
          'resourceId',
          readId(value, 'resourceId', 'Invalid semantic source request')
        ] as const),
    value.noteId === undefined
      ? undefined
      : ([
          'noteId',
          readId(value, 'noteId', 'Invalid semantic source request')
        ] as const)
  ].filter(
    (entry): entry is readonly ['lessonId' | 'resourceId' | 'noteId', string] =>
      entry !== undefined
  )
  if (entries.length !== 1) throw new Error('Invalid semantic source request')
  return { [entries[0][0]]: entries[0][1] }
}

function readIdList(value: unknown, message: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > MAX_SELECTED_IDS)
    throw new Error(message)
  return [...new Set(value.map((id) => readId({ id }, 'id', message)))].sort()
}

function readRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(message)
  return value as Record<string, unknown>
}

function readId(
  payload: Record<string, unknown>,
  key: string,
  message: string
): string {
  const value = payload[key]
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > MAX_ID_LENGTH
  )
    throw new Error(message)
  return value.trim()
}

function readBoolean(value: unknown, message: string): boolean {
  if (typeof value !== 'boolean') throw new Error(message)
  return value
}
