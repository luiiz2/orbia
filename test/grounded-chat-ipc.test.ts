import { beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (_event: unknown, payload?: unknown) => Promise<unknown> | unknown

const handlers = new Map<string, Handler>()
const groundedChat = { ask: vi.fn() }
const conversations = {
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  renameConversation: vi.fn(),
  deleteConversation: vi.fn()
}
const sourceNavigation = { resolve: vi.fn() }
const semanticIndex = {
  getStatus: vi.fn(),
  getMetrics: vi.fn(),
  getSettings: vi.fn(),
  setSettings: vi.fn(),
  listQueue: vi.fn(),
  enqueue: vi.fn(),
  enqueueRebuild: vi.fn(),
  refreshSource: vi.fn(),
  removeSource: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  cancel: vi.fn(),
  retry: vi.fn()
}
const worker = { subscribeProgress: vi.fn() }
const browserWindow = { getAllWindows: vi.fn().mockReturnValue([]) }
const ipcRenderer = {
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn()
}
let exposedApi: Record<string, unknown> | undefined

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler))
  },
  BrowserWindow: browserWindow,
  contextBridge: {
    exposeInMainWorld: vi.fn((name: string, value: unknown) => {
      if (name === 'api') exposedApi = value as Record<string, unknown>
    })
  },
  ipcRenderer,
  webUtils: { getPathForFile: vi.fn() }
}))

vi.mock('@electron-toolkit/preload', () => ({ electronAPI: {} }))
vi.mock('../src/main/services/chat', () => ({
  GroundedChatService: vi.fn(function () { return groundedChat }),
  chatRepository: conversations,
  sourceNavigationService: sourceNavigation
}))
vi.mock('../src/main/services/ai', () => ({ aiCoreService: {} }))
vi.mock('../src/main/services/retrieval', () => ({ HybridRetrievalService: vi.fn(function () { return {} }) }))
vi.mock('../src/main/services/semantic-index/semantic-index-repository.service', () => ({
  semanticIndexRepository: {}
}))
vi.mock('../src/main/services/semantic-index/semantic-index.service', () => ({
  semanticIndexService: semanticIndex
}))
vi.mock('../src/main/services/optimizer/optimization-worker.service', () => ({
  optimizationWorkerService: worker
}))

function registeredHandlers(): Map<string, Handler> {
  return handlers
}

describe('Grounded chat and semantic index IPC boundary', () => {
  beforeEach(() => {
    handlers.clear()
    vi.clearAllMocks()
    exposedApi = undefined
  })

  it('rejects invalid scope, oversized question and renderer source IDs before invoking services', async () => {
    const { registerChatIpc } = await import('../src/main/ipc/chat.ipc')
    registerChatIpc()
    const registered = registeredHandlers()

    await expect(Promise.resolve(registered.get('chat:ask')!({}, {
      requestId: 'request-1',
      scope: { type: 'lesson', lessonId: '' },
      question: 'Explain'
    }))).rejects.toThrow('Invalid grounded chat request')
    await expect(Promise.resolve(registered.get('chat:ask')!({}, {
      requestId: 'request-1',
      scope: { type: 'vault' },
      question: 'x'.repeat(200_001)
    }))).rejects.toThrow('Invalid grounded chat request')
    await expect(Promise.resolve(registered.get('chat:resolve-source')!({}, { sourceId: '' }))).rejects.toThrow('Invalid source navigation request')

    expect(groundedChat.ask).not.toHaveBeenCalled()
    expect(sourceNavigation.resolve).not.toHaveBeenCalled()
  })

  it('registers chat source navigation and semantic queue channels', async () => {
    const { registerChatIpc } = await import('../src/main/ipc/chat.ipc')
    const { registerSemanticIndexIpc } = await import('../src/main/ipc/semantic-index.ipc')
    registerChatIpc()
    registerSemanticIndexIpc()

    expect([...registeredHandlers().keys()]).toEqual(expect.arrayContaining([
      'chat:ask',
      'chat:cancel',
      'chat:list-conversations',
      'chat:get-conversation',
      'chat:rename-conversation',
      'chat:delete-conversation',
      'chat:resolve-source',
      'semantic-index:get-status',
      'semantic-index:get-metrics',
      'semantic-index:get-settings',
      'semantic-index:update-settings',
      'semantic-index:enqueue',
      'semantic-index:rebuild',
      'semantic-index:refresh-source',
      'semantic-index:remove-source',
      'semantic-index:list-queue',
      'semantic-index:pause-job',
      'semantic-index:resume-job',
      'semantic-index:cancel-job',
      'semantic-index:retry-job'
    ]))
  })

  it('passes only known grounded chat fields and cancels the matching request', async () => {
    const { registerChatIpc } = await import('../src/main/ipc/chat.ipc')
    let resolveAsk: ((value: unknown) => void) | undefined
    groundedChat.ask.mockImplementation(() => new Promise((resolve) => { resolveAsk = resolve }))
    registerChatIpc()
    const ask = registeredHandlers().get('chat:ask')!
    const cancel = registeredHandlers().get('chat:cancel')!

    const pending = Promise.resolve(ask({}, {
      requestId: ' request-1 ',
      question: ' Explain this lesson ',
      scope: { type: 'lesson', lessonId: ' lesson-1 ', ignored: 'nope' },
      moment: { lessonId: ' lesson-1 ', timestampSeconds: 12.5, ignored: true },
      selection: { lessonId: ' lesson-1 ', text: ' selected text ', startTime: 10, endTime: 12, ignored: true },
      cloudConsent: true,
      ignored: 'nope'
    }))
    await expect(Promise.resolve(cancel({}, { requestId: 'request-1' }))).resolves.toBe(true)

    expect(groundedChat.ask).toHaveBeenCalledWith({
      requestId: 'request-1',
      question: 'Explain this lesson',
      scope: { type: 'lesson', lessonId: 'lesson-1' },
      moment: { lessonId: 'lesson-1', timestampSeconds: 12.5 },
      selection: { lessonId: 'lesson-1', text: 'selected text', startTime: 10, endTime: 12 },
      cloudConsent: true
    }, expect.objectContaining({ aborted: true }))

    resolveAsk?.({ status: 'cancelled' })
    await pending
    await expect(Promise.resolve(cancel({}, { requestId: 'request-1' }))).resolves.toBe(false)
  })

  it('rejects a duplicate active request without replacing the original cancellation controller', async () => {
    const { registerChatIpc } = await import('../src/main/ipc/chat.ipc')
    const resolutions: Array<(value: unknown) => void> = []
    const signals: AbortSignal[] = []
    groundedChat.ask.mockImplementation((_input, signal: AbortSignal) => new Promise((resolve) => {
      signals.push(signal)
      resolutions.push(resolve)
    }))
    registerChatIpc()
    const ask = registeredHandlers().get('chat:ask')!
    const cancel = registeredHandlers().get('chat:cancel')!
    const request = {
      requestId: 'request-duplicate',
      question: 'Explain this lesson',
      scope: { type: 'vault' }
    }

    const original = Promise.resolve(ask({}, request))
    const duplicate = Promise.resolve(ask({}, request))

    expect(groundedChat.ask).toHaveBeenCalledTimes(1)
    await expect(duplicate).rejects.toThrow('Invalid grounded chat request')
    await expect(Promise.resolve(cancel({}, { requestId: request.requestId }))).resolves.toBe(true)
    expect(signals[0]?.aborted).toBe(true)

    resolutions[0]?.({ status: 'cancelled' })
    await original
  })

  it('forwards semantic-index worker progress and filters other job types', async () => {
    const { registerSemanticIndexIpc } = await import('../src/main/ipc/semantic-index.ipc')
    const send = vi.fn()
    browserWindow.getAllWindows.mockReturnValue([{ isDestroyed: () => false, webContents: { send } }])
    registerSemanticIndexIpc()
    const progress = worker.subscribeProgress.mock.calls.at(-1)?.[0] as (item: unknown) => void
    const semanticJob = { id: 'job-semantic', jobType: 'semantic_index', status: 'indexing', progressPercent: 25 }

    progress({ id: 'job-transcription', jobType: 'transcription', status: 'running', progressPercent: 25 })
    progress(semanticJob)

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('semantic-index:progress', semanticJob)
  })

  it('removes exactly the semantic progress listener installed by preload cleanup', async () => {
    Object.defineProperty(process, 'contextIsolated', { configurable: true, value: true })
    await import('../src/preload/index')
    const api = exposedApi as { semanticIndex: { onProgress: (callback: () => void) => () => void } }
    const callback = vi.fn()

    const cleanup = api.semanticIndex.onProgress(callback)
    const listener = ipcRenderer.on.mock.calls.at(-1)?.[1]
    cleanup()

    expect(ipcRenderer.on).toHaveBeenLastCalledWith('semantic-index:progress', listener)
    expect(ipcRenderer.removeListener).toHaveBeenCalledTimes(1)
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('semantic-index:progress', listener)
  })
})
