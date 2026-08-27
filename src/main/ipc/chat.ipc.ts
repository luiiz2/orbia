import { ipcMain } from 'electron'
import type { GroundedChatRequest } from '../../types/grounded-chat'
import type { GroundedScope, RetrievalMoment, TranscriptSelection } from '../../types/retrieval'
import {
  chatRepository,
  GroundedChatService,
  sourceNavigationService
} from '../services/chat'
import { aiCoreService } from '../services/ai'
import { HybridRetrievalService } from '../services/retrieval'
import { semanticIndexRepository } from '../services/semantic-index/semantic-index-repository.service'

const MAX_ID_LENGTH = 512
const MAX_REQUEST_ID_LENGTH = 200
const MAX_QUESTION_LENGTH = 200_000
const MAX_SELECTION_LENGTH = 20_000
const MAX_TITLE_LENGTH = 512
const requests = new Map<string, AbortController>()
const groundedChatService = new GroundedChatService({
  repository: chatRepository,
  retrieval: new HybridRetrievalService({
    repository: semanticIndexRepository,
    aiCore: aiCoreService
  }),
  aiCore: aiCoreService
})

export function registerChatIpc(): void {
  ipcMain.handle('chat:ask', async (_event, payload: unknown) => {
    const input = parseGroundedChatRequest(payload)
    if (requests.has(input.requestId)) throw new Error('Invalid grounded chat request')
    const controller = new AbortController()
    requests.set(input.requestId, controller)
    try {
      return await groundedChatService.ask(input, controller.signal)
    } finally {
      if (requests.get(input.requestId) === controller) requests.delete(input.requestId)
    }
  })

  ipcMain.handle('chat:cancel', (_event, payload: unknown) => {
    const requestId = readId(payload, 'requestId', MAX_REQUEST_ID_LENGTH, 'Invalid grounded chat cancellation')
    const controller = requests.get(requestId)
    if (!controller) return false
    controller.abort()
    return true
  })

  ipcMain.handle('chat:list-conversations', () => chatRepository.listConversations())
  ipcMain.handle('chat:get-conversation', (_event, payload: unknown) =>
    chatRepository.getConversation(readId(payload, 'id', MAX_ID_LENGTH, 'Invalid conversation request'))
  )
  ipcMain.handle('chat:rename-conversation', (_event, payload: unknown) => {
    const value = readRecord(payload, 'Invalid conversation request')
    return chatRepository.renameConversation(
      readId(value, 'id', MAX_ID_LENGTH, 'Invalid conversation request'),
      readText(value.title, MAX_TITLE_LENGTH, 'Invalid conversation request')
    )
  })
  ipcMain.handle('chat:delete-conversation', (_event, payload: unknown) =>
    chatRepository.deleteConversation(readId(payload, 'id', MAX_ID_LENGTH, 'Invalid conversation request'))
  )
  ipcMain.handle('chat:resolve-source', async (_event, payload: unknown) =>
    sourceNavigationService.resolve({
      sourceId: readId(payload, 'sourceId', MAX_ID_LENGTH, 'Invalid source navigation request')
    })
  )
}

function parseGroundedChatRequest(payload: unknown): GroundedChatRequest {
  const value = readRecord(payload, 'Invalid grounded chat request')
  const question = readText(value.question, MAX_QUESTION_LENGTH, 'Invalid grounded chat request')
  return {
    requestId: readId(value, 'requestId', MAX_REQUEST_ID_LENGTH, 'Invalid grounded chat request'),
    question,
    scope: parseScope(value.scope),
    ...(value.conversationId === undefined
      ? {}
      : { conversationId: readId(value, 'conversationId', MAX_ID_LENGTH, 'Invalid grounded chat request') }),
    ...(value.moment === undefined ? {} : { moment: parseMoment(value.moment) }),
    ...(value.selection === undefined ? {} : { selection: parseSelection(value.selection) }),
    ...(value.cloudConsent === undefined
      ? {}
      : { cloudConsent: readBoolean(value.cloudConsent, 'Invalid grounded chat request') })
  }
}

function parseScope(value: unknown): GroundedScope {
  const scope = readRecord(value, 'Invalid grounded chat request')
  if (scope.type === 'vault') return { type: 'vault' }
  if (scope.type === 'lesson') return { type: 'lesson', lessonId: readId(scope, 'lessonId', MAX_ID_LENGTH, 'Invalid grounded chat request') }
  if (scope.type === 'module') return { type: 'module', moduleId: readId(scope, 'moduleId', MAX_ID_LENGTH, 'Invalid grounded chat request') }
  if (scope.type === 'course') return { type: 'course', courseId: readId(scope, 'courseId', MAX_ID_LENGTH, 'Invalid grounded chat request') }
  throw new Error('Invalid grounded chat request')
}

function parseMoment(value: unknown): RetrievalMoment {
  const moment = readRecord(value, 'Invalid grounded chat request')
  if (!Number.isFinite(moment.timestampSeconds) || (moment.timestampSeconds as number) < 0) {
    throw new Error('Invalid grounded chat request')
  }
  return {
    lessonId: readId(moment, 'lessonId', MAX_ID_LENGTH, 'Invalid grounded chat request'),
    timestampSeconds: moment.timestampSeconds as number
  }
}

function parseSelection(value: unknown): TranscriptSelection {
  const selection = readRecord(value, 'Invalid grounded chat request')
  const startTime = readOptionalTimestamp(selection.startTime)
  const endTime = readOptionalTimestamp(selection.endTime)
  if (startTime !== undefined && endTime !== undefined && startTime > endTime) {
    throw new Error('Invalid grounded chat request')
  }
  return {
    lessonId: readId(selection, 'lessonId', MAX_ID_LENGTH, 'Invalid grounded chat request'),
    text: readText(selection.text, MAX_SELECTION_LENGTH, 'Invalid grounded chat request'),
    ...(startTime === undefined ? {} : { startTime }),
    ...(endTime === undefined ? {} : { endTime })
  }
}

function readRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message)
  return value as Record<string, unknown>
}

function readId(
  payload: unknown,
  key: string,
  maxLength: number,
  message: string
): string {
  const value = payload && typeof payload === 'object' ? (payload as Record<string, unknown>)[key] : undefined
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) throw new Error(message)
  return value.trim()
}

function readText(value: unknown, maxLength: number, message: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) throw new Error(message)
  return value.trim()
}

function readOptionalTimestamp(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isFinite(value) || (value as number) < 0) throw new Error('Invalid grounded chat request')
  return value as number
}

function readBoolean(value: unknown, message: string): boolean {
  if (typeof value !== 'boolean') throw new Error(message)
  return value
}
