import type { AiCoreService } from '../ai/ai-core.service'
import type { AiDataType } from '../../../types/ai'
import type {
  ChatMessage,
  GroundedChatRequest,
  GroundedChatResponse,
  GroundedChatStatus
} from '../../../types/grounded-chat'
import type {
  GroundedScope,
  IndexCoverage,
  RetrievedChunk,
  RetrievalMoment,
  TranscriptSelection
} from '../../../types/retrieval'
import type { HybridRetrievalService } from '../retrieval/hybrid-retrieval.service'
import {
  ChatRepository,
  type ChatMessageSourceInput
} from './chat-repository.service'
import { buildGroundedChatMessages } from './grounded-prompt'

const INSUFFICIENT_EVIDENCE_ANSWER =
  'I do not have enough indexed content to answer that question.'
const FAILED_ANSWER =
  'I could not generate a grounded answer from the indexed content.'
const CANCELLED_ANSWER =
  'The grounded response was cancelled before an answer was generated.'
const MAX_HISTORY_MESSAGES = 6
const MAX_HISTORY_CHARACTERS = 6_000
const MAX_NEARBY_TRANSCRIPT_CHUNKS = 2
const MAX_RANKED_CHUNKS = 4
const NO_COVERAGE: IndexCoverage = {
  status: 'none',
  indexedChunks: 0,
  indexedSources: 0,
  failedSources: 0
}

export interface GroundedChatServiceDependencies {
  repository: Pick<
    ChatRepository,
    | 'createConversation'
    | 'getConversation'
    | 'getRecentMessages'
    | 'appendUserMessage'
    | 'appendAssistantMessage'
  >
  retrieval: Pick<HybridRetrievalService, 'retrieve'>
  aiCore: Pick<AiCoreService, 'chat'>
}

export class GroundedChatService {
  public constructor(
    private readonly dependencies: GroundedChatServiceDependencies
  ) {}

  public async ask(
    input: GroundedChatRequest,
    signal?: AbortSignal
  ): Promise<GroundedChatResponse> {
    const question = requireQuestion(input?.question)
    const scope = validateScope(input?.scope)
    requireRequestId(input?.requestId)
    const moment = validateMoment(input?.moment)
    const selection = validateSelection(input?.selection)

    const conversation =
      input.conversationId === undefined
        ? this.dependencies.repository.createConversation(question.slice(0, 80))
        : this.dependencies.repository.getConversation(
            requireIdentifier(input.conversationId, 'Conversation ID')
          )
    if (!conversation) throw new Error('Conversation not found')

    const history = this.dependencies.repository.getRecentMessages(
      conversation.id,
      MAX_HISTORY_MESSAGES,
      MAX_HISTORY_CHARACTERS
    )
    this.dependencies.repository.appendUserMessage(conversation.id, {
      content: question,
      scope
    })
    if (signal?.aborted)
      return this.persistTerminal(
        conversation.id,
        'cancelled',
        CANCELLED_ANSWER,
        NO_COVERAGE
      )

    let retrieval: Awaited<ReturnType<HybridRetrievalService['retrieve']>>
    try {
      retrieval = await awaitWithAbort(
        this.dependencies.retrieval.retrieve({
          query: question,
          scope,
          ...(moment ? { moment } : {}),
          ...(selection ? { selection } : {})
        }),
        signal
      )
    } catch (error) {
      return this.persistTerminal(
        conversation.id,
        isAbort(error, signal) ? 'cancelled' : 'failed',
        isAbort(error, signal) ? CANCELLED_ANSWER : FAILED_ANSWER,
        NO_COVERAGE
      )
    }
    if (signal?.aborted)
      return this.persistTerminal(
        conversation.id,
        'cancelled',
        CANCELLED_ANSWER,
        retrieval.coverage
      )
    if (retrieval.sources.length === 0) {
      return this.persistTerminal(
        conversation.id,
        'insufficient_evidence',
        INSUFFICIENT_EVIDENCE_ANSWER,
        retrieval.coverage
      )
    }

    const sources = selectPromptSources(retrieval.sources, moment)
    if (signal?.aborted)
      return this.persistTerminal(
        conversation.id,
        'cancelled',
        CANCELLED_ANSWER,
        retrieval.coverage
      )
    const messages = buildGroundedChatMessages(question, history, sources, {
      ...(selection ? { selection } : {})
    })
    try {
      const response = await awaitWithAbort(
        this.dependencies.aiCore.chat({
          messages,
          dataTypes: dataTypesFor(retrieval.sources, history, selection),
          cloudConsent: input.cloudConsent
        }),
        signal
      )
      const message = this.dependencies.repository.appendAssistantMessage(
        conversation.id,
        {
          content: response.content,
          status: 'answered',
          providerId: response.providerId,
          modelId: response.modelId,
          sources: sources.map(toSourceSnapshot)
        }
      )
      return {
        conversationId: conversation.id,
        messageId: message.id,
        status: 'answered',
        answer: message.content,
        sources: message.sources,
        coverage: retrieval.coverage
      }
    } catch (error) {
      return this.persistTerminal(
        conversation.id,
        isAbort(error, signal) ? 'cancelled' : 'failed',
        isAbort(error, signal) ? CANCELLED_ANSWER : FAILED_ANSWER,
        retrieval.coverage
      )
    }
  }

  private persistTerminal(
    conversationId: string,
    status: Exclude<GroundedChatStatus, 'answered'>,
    content: string,
    coverage: IndexCoverage
  ): GroundedChatResponse {
    const message = this.dependencies.repository.appendAssistantMessage(
      conversationId,
      { content, status, sources: [] }
    )
    return {
      conversationId,
      messageId: message.id,
      status,
      answer: message.content,
      sources: [],
      coverage
    }
  }
}

function requireQuestion(value: unknown): string {
  const question = requireIdentifier(value, 'Question')
  if (question.length > 200_000) throw new Error('Question is invalid')
  return question
}

function requireRequestId(value: unknown): void {
  if (requireIdentifier(value, 'Request ID').length > 200)
    throw new Error('Request ID is invalid')
}

function validateScope(
  scope: GroundedChatRequest['scope'] | undefined
): GroundedScope {
  if (!scope || typeof scope !== 'object') throw new Error('Scope is required')
  if (scope.type === 'vault') return scope
  if (scope.type === 'lesson')
    return {
      type: 'lesson',
      lessonId: requireIdentifier(scope.lessonId, 'Lesson ID')
    }
  if (scope.type === 'module')
    return {
      type: 'module',
      moduleId: requireIdentifier(scope.moduleId, 'Module ID')
    }
  if (scope.type === 'course')
    return {
      type: 'course',
      courseId: requireIdentifier(scope.courseId, 'Course ID')
    }
  throw new Error('Scope is invalid')
}

function validateMoment(
  moment: GroundedChatRequest['moment']
): RetrievalMoment | undefined {
  if (moment === undefined) return undefined
  if (
    !moment ||
    typeof moment !== 'object' ||
    !Number.isFinite(moment.timestampSeconds) ||
    moment.timestampSeconds < 0
  ) {
    throw new Error('Moment is invalid')
  }
  return {
    lessonId: requireIdentifier(moment.lessonId, 'Moment lesson ID'),
    timestampSeconds: moment.timestampSeconds
  }
}

function validateSelection(
  selection: GroundedChatRequest['selection']
): TranscriptSelection | undefined {
  if (selection === undefined) return undefined
  if (
    !selection ||
    typeof selection !== 'object' ||
    typeof selection.text !== 'string' ||
    selection.text.trim().length === 0
  ) {
    throw new Error('Selection is invalid')
  }
  if (
    selection.text.length > 20_000 ||
    !validOptionalTime(selection.startTime) ||
    !validOptionalTime(selection.endTime)
  ) {
    throw new Error('Selection is invalid')
  }
  return {
    lessonId: requireIdentifier(selection.lessonId, 'Selection lesson ID'),
    text: selection.text.trim(),
    ...(selection.startTime === undefined
      ? {}
      : { startTime: selection.startTime }),
    ...(selection.endTime === undefined ? {} : { endTime: selection.endTime })
  }
}

function validOptionalTime(value: number | undefined): boolean {
  return value === undefined || (Number.isFinite(value) && value >= 0)
}

function requireIdentifier(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new Error(`${name} is required`)
  return value.trim()
}

function selectPromptSources(
  sources: readonly RetrievedChunk[],
  moment: RetrievalMoment | undefined
): RetrievedChunk[] {
  if (!moment)
    return sources.slice(0, MAX_NEARBY_TRANSCRIPT_CHUNKS + MAX_RANKED_CHUNKS)
  const nearby = sources
    .filter(
      (source) =>
        source.sourceKind === 'transcript' &&
        source.lessonId === moment.lessonId
    )
    .sort(
      (left, right) =>
        timestampDistance(left, moment.timestampSeconds) -
          timestampDistance(right, moment.timestampSeconds) ||
        right.relevanceScore - left.relevanceScore ||
        left.chunkId.localeCompare(right.chunkId)
    )
    .slice(0, MAX_NEARBY_TRANSCRIPT_CHUNKS)
  const nearbyIds = new Set(nearby.map((source) => source.chunkId))
  const ranked = sources
    .filter((source) => !nearbyIds.has(source.chunkId))
    .sort(
      (left, right) =>
        right.relevanceScore - left.relevanceScore ||
        left.chunkId.localeCompare(right.chunkId)
    )
    .slice(0, MAX_RANKED_CHUNKS)
  return [...nearby, ...ranked]
}

function timestampDistance(
  source: RetrievedChunk,
  timestampSeconds: number
): number {
  const start = source.locator.startTime
  const end = source.locator.endTime ?? start
  if (start === undefined || end === undefined) return Number.POSITIVE_INFINITY
  if (timestampSeconds < start) return start - timestampSeconds
  if (timestampSeconds > end) return timestampSeconds - end
  return 0
}

function dataTypesFor(
  sources: readonly RetrievedChunk[],
  history: readonly Pick<ChatMessage, 'role' | 'sources'>[],
  selection: TranscriptSelection | undefined
): AiDataType[] {
  const sourceKinds = [
    ...sources.map((source) => source.sourceKind),
    ...history
      .filter((message) => message.role === 'assistant')
      .flatMap((message) => message.sources.map((source) => source.sourceKind)),
    ...(selection ? ['transcript' as const] : [])
  ]
  return [
    ...new Set(
      sourceKinds.map((sourceKind) => {
        if (sourceKind === 'transcript' || sourceKind === 'subtitle')
          return 'transcript'
        if (sourceKind === 'note') return 'notes'
        if (sourceKind === 'pdf') return 'pdf'
        if (sourceKind === 'metadata') return 'course_name'
        return 'materials'
      })
    )
  ]
}

function toSourceSnapshot(source: RetrievedChunk): ChatMessageSourceInput {
  return {
    chunkId: source.chunkId,
    sourceKind: source.sourceKind,
    sourceId: source.sourceId,
    courseId: source.courseId,
    ...(source.moduleId ? { moduleId: source.moduleId } : {}),
    ...(source.lessonId ? { lessonId: source.lessonId } : {}),
    ...(source.resourceId ? { resourceId: source.resourceId } : {}),
    ...(source.transcriptId ? { transcriptId: source.transcriptId } : {}),
    ...(source.noteId ? { noteId: source.noteId } : {}),
    sourceRevision: source.sourceRevision,
    locator: source.locator,
    displayLabel: displayLabelFor(source)
  }
}

function displayLabelFor(source: RetrievedChunk): string {
  const start = source.locator.startTime
  const end = source.locator.endTime
  if (start !== undefined) {
    const startLabel = formatTimestamp(start)
    return `${source.sourceKind} · ${startLabel}${end === undefined ? '' : `–${formatTimestamp(end)}`}`
  }
  if (source.locator.page !== undefined)
    return `${source.sourceKind} · page ${source.locator.page}`
  return source.sourceKind
}

function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

async function awaitWithAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal | undefined
): Promise<T> {
  if (!signal) return operation
  if (signal.aborted) throw abortError()
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    operation
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort))
  })
}

function isAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

function abortError(): Error {
  const error = new Error('Grounded chat request was cancelled')
  error.name = 'AbortError'
  return error
}
