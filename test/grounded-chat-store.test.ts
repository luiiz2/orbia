import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ChatConversation,
  ChatConversationSummary,
  ChatMessageSource,
  GroundedChatResponse
} from '../src/types/grounded-chat'
import type { OrbiaApi } from '../src/types/api'
import { useGroundedChatStore } from '../src/renderer/src/stores/useGroundedChatStore'

const source: ChatMessageSource = {
  id: 'message-source-1',
  messageId: 'message-1',
  ordinal: 0,
  chunkId: 'chunk-1',
  sourceKind: 'transcript',
  sourceId: 'lesson:lesson-1:transcript',
  courseId: 'course-1',
  lessonId: 'lesson-1',
  transcriptId: 'transcript-1',
  sourceRevision: 'revision-1',
  locator: { startTime: 12, endTime: 18 },
  displayLabel: 'Lesson 1 · 00:12–00:18'
}

function answeredResponse(
  overrides: Partial<GroundedChatResponse> = {}
): GroundedChatResponse {
  return {
    conversationId: 'conversation-1',
    messageId: 'message-1',
    status: 'answered',
    answer: 'The indexed lesson explains this.',
    sources: [source],
    coverage: {
      status: 'completed',
      indexedChunks: 1,
      indexedSources: 1,
      failedSources: 0
    },
    ...overrides
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('grounded chat store', () => {
  const chat = {
    ask: vi.fn<OrbiaApi['chat']['ask']>(),
    cancel: vi.fn<OrbiaApi['chat']['cancel']>(),
    listConversations: vi.fn<OrbiaApi['chat']['listConversations']>(),
    getConversation: vi.fn<OrbiaApi['chat']['getConversation']>(),
    renameConversation: vi.fn<OrbiaApi['chat']['renameConversation']>(),
    deleteConversation: vi.fn<OrbiaApi['chat']['deleteConversation']>(),
    resolveSource: vi.fn<OrbiaApi['chat']['resolveSource']>()
  } satisfies OrbiaApi['chat']

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('window', { api: { chat } })
    useGroundedChatStore.setState({
      isOpen: false,
      scope: null,
      moment: undefined,
      selection: undefined,
      cloudConsent: undefined,
      conversationId: undefined,
      conversations: [],
      messages: [],
      isLoading: false,
      error: null,
      coverage: null,
      activeRequestId: null
    })
  })

  it('keeps Main evidence and sends scoped context without transcript history', async () => {
    chat.ask.mockResolvedValueOnce(answeredResponse())
    useGroundedChatStore.getState().open(
      { type: 'lesson', lessonId: 'lesson-1' },
      {
        moment: { lessonId: 'lesson-1', timestampSeconds: 12 },
        selection: {
          lessonId: 'lesson-1',
          text: 'Important concept',
          startTime: 12,
          endTime: 18
        },
        cloudConsent: true
      }
    )

    await useGroundedChatStore.getState().ask(' Explain this ')

    expect(chat.ask).toHaveBeenCalledWith({
      requestId: expect.any(String),
      question: 'Explain this',
      scope: { type: 'lesson', lessonId: 'lesson-1' },
      moment: { lessonId: 'lesson-1', timestampSeconds: 12 },
      selection: {
        lessonId: 'lesson-1',
        text: 'Important concept',
        startTime: 12,
        endTime: 18
      },
      cloudConsent: true
    })
    const request = chat.ask.mock.calls[0][0]
    expect(request.requestId).toHaveLength(36)
    expect(request).not.toHaveProperty('messages')
    expect(useGroundedChatStore.getState().messages.at(-1)).toMatchObject({
      id: 'message-1',
      sources: [
        { id: 'message-source-1', displayLabel: 'Lesson 1 · 00:12–00:18' }
      ]
    })
  })

  it('keeps insufficient evidence source-free instead of fabricating citations', async () => {
    chat.ask.mockResolvedValueOnce(
      answeredResponse({
        status: 'insufficient_evidence',
        answer: 'I do not have enough indexed content to answer that question.',
        sources: [],
        coverage: {
          status: 'none',
          indexedChunks: 0,
          indexedSources: 0,
          failedSources: 0
        }
      })
    )
    useGroundedChatStore
      .getState()
      .open({ type: 'course', courseId: 'course-1' })

    await useGroundedChatStore.getState().ask('What is covered?')

    expect(useGroundedChatStore.getState().messages.at(-1)).toMatchObject({
      status: 'insufficient_evidence',
      sources: []
    })
    expect(useGroundedChatStore.getState().coverage).toEqual({
      status: 'none',
      indexedChunks: 0,
      indexedSources: 0,
      failedSources: 0
    })
  })

  it('starts a fresh chat context when the active scope changes', () => {
    useGroundedChatStore.getState().open(
      { type: 'lesson', lessonId: 'lesson-1' },
      {
        moment: { lessonId: 'lesson-1', timestampSeconds: 12 },
        selection: { lessonId: 'lesson-1', text: 'Selected text' },
        cloudConsent: true
      }
    )
    useGroundedChatStore.setState({
      conversationId: 'conversation-old',
      messages: [
        {
          id: 'message-old',
          conversationId: 'conversation-old',
          role: 'assistant',
          content: 'Old answer',
          sources: [source],
          createdAt: 1
        }
      ],
      coverage: {
        status: 'completed',
        indexedChunks: 1,
        indexedSources: 1,
        failedSources: 0
      }
    })

    useGroundedChatStore.getState().open({
      type: 'course',
      courseId: 'course-2'
    })

    expect(useGroundedChatStore.getState()).toMatchObject({
      scope: { type: 'course', courseId: 'course-2' },
      conversationId: undefined,
      messages: [],
      moment: undefined,
      selection: undefined,
      cloudConsent: undefined,
      coverage: null
    })
  })

  it('invalidates an ask before the cancel bridge resolves', async () => {
    const pendingAsk = deferred<GroundedChatResponse>()
    const pendingCancel = deferred<boolean>()
    chat.ask.mockReturnValueOnce(pendingAsk.promise)
    chat.cancel.mockReturnValueOnce(pendingCancel.promise)
    useGroundedChatStore.getState().open({
      type: 'lesson',
      lessonId: 'lesson-1'
    })

    const pending = useGroundedChatStore.getState().ask('Explain this')
    expect(useGroundedChatStore.getState()).toMatchObject({
      isLoading: true,
      activeRequestId: expect.any(String)
    })

    const cancellation = useGroundedChatStore.getState().cancel()
    expect(useGroundedChatStore.getState()).toMatchObject({
      isLoading: false,
      activeRequestId: null
    })
    expect(useGroundedChatStore.getState().messages.at(-1)).toMatchObject({
      status: 'cancelled',
      sources: []
    })

    pendingAsk.resolve(answeredResponse())
    await pending
    expect(useGroundedChatStore.getState().messages).not.toContainEqual(
      expect.objectContaining({ id: 'message-1' })
    )

    pendingCancel.resolve(true)
    await expect(cancellation).resolves.toBe(true)
  })

  it('cancels an active ask before loading another conversation', async () => {
    let resolveAsk: ((response: GroundedChatResponse) => void) | undefined
    chat.ask.mockImplementation(
      () =>
        new Promise<GroundedChatResponse>((resolve) => {
          resolveAsk = resolve
        })
    )
    chat.cancel.mockResolvedValueOnce(true)
    chat.getConversation.mockResolvedValueOnce({
      id: 'conversation-loaded',
      title: 'Loaded conversation',
      messages: [
        {
          id: 'loaded-message',
          conversationId: 'conversation-loaded',
          role: 'assistant',
          content: 'Previously saved answer',
          sources: [],
          createdAt: 1
        }
      ],
      createdAt: 1,
      updatedAt: 1
    })
    useGroundedChatStore.getState().open({
      type: 'lesson',
      lessonId: 'lesson-1'
    })

    const pending = useGroundedChatStore.getState().ask('Explain this')
    const requestId = useGroundedChatStore.getState().activeRequestId
    await useGroundedChatStore
      .getState()
      .loadConversation('conversation-loaded')

    expect(chat.cancel).toHaveBeenCalledWith(requestId)
    expect(useGroundedChatStore.getState()).toMatchObject({
      conversationId: 'conversation-loaded',
      activeRequestId: null,
      messages: [expect.objectContaining({ id: 'loaded-message' })]
    })

    resolveAsk?.(answeredResponse())
    await pending

    expect(useGroundedChatStore.getState()).toMatchObject({
      conversationId: 'conversation-loaded',
      messages: [expect.objectContaining({ id: 'loaded-message' })]
    })
    expect(useGroundedChatStore.getState().messages).not.toContainEqual(
      expect.objectContaining({ id: 'message-1' })
    )
  })

  it('persists renamed and deleted conversations through the bridge', async () => {
    const conversation: ChatConversationSummary = {
      id: 'conversation-1',
      title: 'Original title',
      messageCount: 2,
      createdAt: 1,
      updatedAt: 2
    }
    chat.renameConversation.mockResolvedValueOnce(true)
    chat.deleteConversation.mockResolvedValueOnce(true)
    useGroundedChatStore.setState({
      conversationId: conversation.id,
      conversations: [conversation],
      messages: [
        {
          id: 'message-1',
          conversationId: conversation.id,
          role: 'assistant',
          content: 'Persisted answer',
          sources: [],
          createdAt: 2
        }
      ]
    })

    await useGroundedChatStore
      .getState()
      .rename(conversation.id, 'Renamed session')
    await useGroundedChatStore.getState().deleteConversation(conversation.id)

    expect(chat.renameConversation).toHaveBeenCalledWith(
      'conversation-1',
      'Renamed session'
    )
    expect(chat.deleteConversation).toHaveBeenCalledWith('conversation-1')
    expect(useGroundedChatStore.getState()).toMatchObject({
      conversationId: undefined,
      conversations: [],
      messages: []
    })
  })

  it('invalidates an active ask before deleting its loaded conversation', async () => {
    const pendingAsk = deferred<GroundedChatResponse>()
    chat.ask.mockReturnValueOnce(pendingAsk.promise)
    chat.cancel.mockResolvedValueOnce(true)
    chat.deleteConversation.mockResolvedValueOnce(true)
    useGroundedChatStore.getState().open({
      type: 'lesson',
      lessonId: 'lesson-1'
    })
    useGroundedChatStore.setState({ conversationId: 'conversation-1' })

    const pending = useGroundedChatStore.getState().ask('Explain this')
    const requestId = useGroundedChatStore.getState().activeRequestId
    await expect(
      useGroundedChatStore.getState().deleteConversation('conversation-1')
    ).resolves.toBe(true)

    expect(chat.cancel).toHaveBeenCalledWith(requestId)
    expect(useGroundedChatStore.getState()).toMatchObject({
      conversationId: undefined,
      activeRequestId: null,
      messages: []
    })

    pendingAsk.resolve(answeredResponse())
    await pending

    expect(useGroundedChatStore.getState()).toMatchObject({
      conversationId: undefined,
      messages: []
    })
  })

  it('keeps the loaded conversation when its deletion fails after cancelling an ask', async () => {
    const pendingAsk = deferred<GroundedChatResponse>()
    chat.ask.mockReturnValueOnce(pendingAsk.promise)
    chat.cancel.mockResolvedValueOnce(true)
    chat.deleteConversation.mockResolvedValueOnce(false)
    useGroundedChatStore.getState().open({
      type: 'lesson',
      lessonId: 'lesson-1'
    })
    useGroundedChatStore.setState({ conversationId: 'conversation-1' })

    const pending = useGroundedChatStore.getState().ask('Explain this')
    await expect(
      useGroundedChatStore.getState().deleteConversation('conversation-1')
    ).resolves.toBe(false)

    expect(useGroundedChatStore.getState()).toMatchObject({
      conversationId: 'conversation-1',
      activeRequestId: null
    })

    pendingAsk.resolve(answeredResponse())
    await pending
    expect(useGroundedChatStore.getState().conversationId).toBe(
      'conversation-1'
    )
  })

  it('keeps the most recently requested conversation when loads resolve out of order', async () => {
    const firstLoad = deferred<ChatConversation | null>()
    const secondLoad = deferred<ChatConversation | null>()
    chat.getConversation
      .mockReturnValueOnce(firstLoad.promise)
      .mockReturnValueOnce(secondLoad.promise)

    const first = useGroundedChatStore
      .getState()
      .loadConversation('conversation-first')
    const second = useGroundedChatStore
      .getState()
      .loadConversation('conversation-second')

    secondLoad.resolve({
      id: 'conversation-second',
      title: 'Second conversation',
      messages: [],
      createdAt: 2,
      updatedAt: 2
    })
    await second
    firstLoad.resolve({
      id: 'conversation-first',
      title: 'First conversation',
      messages: [],
      createdAt: 1,
      updatedAt: 1
    })
    await first

    expect(useGroundedChatStore.getState().conversationId).toBe(
      'conversation-second'
    )
  })

  it('ignores a pending conversation load after the chat context changes', async () => {
    const pendingLoad = deferred<ChatConversation | null>()
    chat.getConversation.mockReturnValueOnce(pendingLoad.promise)
    useGroundedChatStore.getState().open({
      type: 'lesson',
      lessonId: 'lesson-1'
    })

    const loading = useGroundedChatStore
      .getState()
      .loadConversation('conversation-old')
    useGroundedChatStore.getState().setContext({
      scope: { type: 'course', courseId: 'course-2' }
    })
    pendingLoad.resolve({
      id: 'conversation-old',
      title: 'Old conversation',
      messages: [],
      createdAt: 1,
      updatedAt: 1
    })
    await loading

    expect(useGroundedChatStore.getState()).toMatchObject({
      scope: { type: 'course', courseId: 'course-2' },
      conversationId: undefined,
      messages: []
    })
  })
})
