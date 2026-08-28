import { create } from 'zustand'
import type {
  ChatConversation,
  ChatConversationSummary,
  ChatMessage,
  GroundedChatRequest,
  GroundedScope,
  IndexCoverage,
  RetrievalMoment,
  SourceNavigationRequest,
  SourceNavigationResult,
  TranscriptSelection
} from '@shared'

export interface GroundedChatContext {
  scope: GroundedScope
  moment?: RetrievalMoment
  selection?: TranscriptSelection
  cloudConsent?: boolean
}

type GroundedChatContextInput = GroundedScope | GroundedChatContext
type GroundedChatContextOptions = Omit<GroundedChatContext, 'scope'>

export interface GroundedChatState {
  isOpen: boolean
  scope: GroundedScope | null
  moment?: RetrievalMoment
  selection?: TranscriptSelection
  cloudConsent?: boolean
  conversationId?: string
  conversations: ChatConversationSummary[]
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null
  coverage: IndexCoverage | null
  activeRequestId: string | null
  open: (
    scopeOrContext: GroundedChatContextInput,
    options?: GroundedChatContextOptions
  ) => void
  close: () => void
  setContext: (context: GroundedChatContext) => void
  loadConversations: () => Promise<void>
  loadConversation: (id: string) => Promise<void>
  ask: (question: string) => Promise<void>
  cancel: () => Promise<boolean>
  rename: (id: string, title: string) => Promise<boolean>
  deleteConversation: (id: string) => Promise<boolean>
  resolveSource: (
    input: SourceNavigationRequest
  ) => Promise<SourceNavigationResult>
  clearError: () => void
}

let conversationLoadGeneration = 0

export const useGroundedChatStore = create<GroundedChatState>((set, get) => ({
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
  activeRequestId: null,

  open: (scopeOrContext, options) => {
    const context = toContext(scopeOrContext, options)
    const previous = get()
    const changed = !sameContext(previous, context)
    cancelIfActive(previous.activeRequestId, changed)
    if (changed) conversationLoadGeneration += 1
    set({
      isOpen: true,
      error: null,
      scope: context.scope,
      moment: context.moment,
      selection: context.selection,
      cloudConsent: context.cloudConsent,
      ...(changed
        ? {
            conversationId: undefined,
            messages: [],
            coverage: null,
            isLoading: false,
            activeRequestId: null
          }
        : {})
    })
  },
  close: () => set({ isOpen: false }),
  setContext: (context) => {
    const previous = get()
    const changed = !sameContext(previous, context)
    cancelIfActive(previous.activeRequestId, changed)
    if (changed) conversationLoadGeneration += 1
    set({
      scope: context.scope,
      moment: context.moment,
      selection: context.selection,
      cloudConsent: context.cloudConsent,
      ...(changed
        ? {
            conversationId: undefined,
            messages: [],
            coverage: null,
            isLoading: false,
            activeRequestId: null
          }
        : {})
    })
  },

  loadConversations: async () => {
    try {
      set({ error: null })
      const conversations = await window.api.chat.listConversations()
      set({ conversations })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  loadConversation: async (id) => {
    const activeRequestId = get().activeRequestId
    const loadGeneration = ++conversationLoadGeneration
    cancelIfActive(activeRequestId, true)
    try {
      set({ activeRequestId: null, error: null, isLoading: true })
      const conversation = await window.api.chat.getConversation(id)
      if (loadGeneration !== conversationLoadGeneration) return
      if (!conversation) {
        set({ isLoading: false, error: 'Conversation is unavailable' })
        return
      }
      applyConversation(set, conversation)
    } catch (error) {
      if (loadGeneration !== conversationLoadGeneration) return
      set({ isLoading: false, error: errorMessage(error) })
    }
  },

  ask: async (rawQuestion) => {
    const question = rawQuestion.trim()
    const {
      scope,
      moment,
      selection,
      cloudConsent,
      conversationId,
      isLoading
    } = get()
    if (isLoading) return
    if (!question) {
      set({ error: 'Enter a question' })
      return
    }
    if (!scope) {
      set({ error: 'Choose a study scope before asking a question' })
      return
    }

    const requestId = createRequestId()
    const input: GroundedChatRequest = {
      requestId,
      question,
      scope,
      ...(conversationId ? { conversationId } : {}),
      ...(moment ? { moment } : {}),
      ...(selection ? { selection } : {}),
      ...(cloudConsent === undefined ? {} : { cloudConsent })
    }
    const pendingUserMessage: ChatMessage = {
      id: `pending:${requestId}`,
      conversationId: conversationId ?? '',
      role: 'user',
      content: question,
      scope,
      sources: [],
      createdAt: Date.now()
    }

    set((state) => ({
      activeRequestId: requestId,
      error: null,
      isLoading: true,
      messages: [...state.messages, pendingUserMessage]
    }))
    try {
      const response = await window.api.chat.ask(input)
      if (get().activeRequestId !== requestId) return
      const assistantMessage: ChatMessage = {
        id: response.messageId,
        conversationId: response.conversationId,
        role: 'assistant',
        content: response.answer,
        status: response.status,
        sources: response.sources,
        createdAt: Date.now()
      }
      set((state) => ({
        activeRequestId: null,
        conversationId: response.conversationId,
        coverage: response.coverage,
        isLoading: false,
        messages: [
          ...state.messages.map((message) =>
            message.id === pendingUserMessage.id
              ? { ...message, conversationId: response.conversationId }
              : message
          ),
          assistantMessage
        ]
      }))
      await get().loadConversations()
    } catch (error) {
      if (get().activeRequestId !== requestId) return
      set({
        activeRequestId: null,
        error: errorMessage(error),
        isLoading: false
      })
    }
  },

  cancel: async () => {
    const requestId = get().activeRequestId
    if (!requestId) return false
    set((state) => ({
      activeRequestId: null,
      isLoading: false,
      messages: [
        ...state.messages,
        cancelledMessage(requestId, state.conversationId)
      ]
    }))
    try {
      const cancelled = await window.api.chat.cancel(requestId)
      return cancelled
    } catch (error) {
      set({ error: errorMessage(error) })
      return false
    }
  },

  rename: async (id, rawTitle) => {
    const title = rawTitle.trim()
    if (!title) {
      set({ error: 'Conversation title is required' })
      return false
    }
    try {
      const renamed = await window.api.chat.renameConversation(id, title)
      if (!renamed) return false
      set((state) => ({
        conversations: state.conversations.map((conversation) =>
          conversation.id === id ? { ...conversation, title } : conversation
        )
      }))
      return true
    } catch (error) {
      set({ error: errorMessage(error) })
      return false
    }
  },

  deleteConversation: async (id) => {
    const state = get()
    const deletingActiveConversation = state.conversationId === id
    if (deletingActiveConversation) {
      conversationLoadGeneration += 1
      if (state.activeRequestId) {
        const requestId = state.activeRequestId
        set((current) => ({
          activeRequestId: null,
          isLoading: false,
          messages: [
            ...current.messages,
            cancelledMessage(requestId, current.conversationId)
          ]
        }))
        cancelIfActive(requestId, true)
      }
    }
    try {
      const deleted = await window.api.chat.deleteConversation(id)
      if (!deleted) return false
      set((state) => ({
        conversationId:
          state.conversationId === id ? undefined : state.conversationId,
        conversations: state.conversations.filter(
          (conversation) => conversation.id !== id
        ),
        messages: state.conversationId === id ? [] : state.messages,
        coverage: state.conversationId === id ? null : state.coverage
      }))
      return true
    } catch (error) {
      set({ error: errorMessage(error) })
      return false
    }
  },

  resolveSource: (input) => window.api.chat.resolveSource(input),
  clearError: () => set({ error: null })
}))

function applyConversation(
  set: (partial: Partial<GroundedChatState>) => void,
  conversation: ChatConversation
): void {
  set({
    conversationId: conversation.id,
    messages: conversation.messages,
    isLoading: false,
    error: null,
    coverage: null
  })
}

function cancelledMessage(
  requestId: string,
  conversationId?: string
): ChatMessage {
  return {
    id: `cancelled:${requestId}`,
    conversationId: conversationId ?? '',
    role: 'assistant',
    content: 'The grounded response was cancelled before an answer was generated.',
    status: 'cancelled',
    sources: [],
    createdAt: Date.now()
  }
}

function sameContext(
  state: GroundedChatState,
  context: GroundedChatContext
): boolean {
  const current = {
    scope: state.scope,
    moment: state.moment,
    selection: state.selection,
    cloudConsent: state.cloudConsent
  }
  const next = {
    scope: context.scope,
    moment: context.moment,
    selection: context.selection,
    cloudConsent: context.cloudConsent
  }
  return JSON.stringify(current) === JSON.stringify(next)
}

function cancelIfActive(requestId: string | null, shouldCancel: boolean): void {
  if (!shouldCancel || !requestId) return
  void Promise.resolve(window.api.chat.cancel(requestId)).catch(() => undefined)
}

function toContext(
  scopeOrContext: GroundedChatContextInput,
  options?: GroundedChatContextOptions
): GroundedChatContext {
  return 'scope' in scopeOrContext
    ? scopeOrContext
    : { scope: scopeOrContext, ...options }
}

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? cryptoRandomFallback()
}

function cryptoRandomFallback(): string {
  const segment = () =>
    Math.floor(Math.random() * 0x1_0000)
      .toString(16)
      .padStart(4, '0')
  return `${segment()}${segment()}-${segment()}-4${segment().slice(1)}-8${segment().slice(1)}-${segment()}${segment()}${segment()}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Grounded chat request failed'
}
