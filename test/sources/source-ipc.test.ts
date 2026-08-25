import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrbiaApi, SourceSummary, SourceSyncResult } from '../../src/types'

const state = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown) => Promise<unknown> | unknown>(),
  listSummaries: vi.fn(),
  syncRoot: vi.fn(),
  watchStart: vi.fn(),
  loggerError: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown) => Promise<unknown> | unknown) => {
      state.handlers.set(channel, handler)
    }
  }
}))

vi.mock('../../src/main/services/sources/source-manager.service', () => ({
  sourceManagerService: {
    listSummaries: state.listSummaries,
    syncRoot: state.syncRoot
  }
}))

vi.mock('../../src/main/services/sources/source-watch.service', () => ({
  sourceWatchService: {
    start: state.watchStart
  }
}))

vi.mock('../../src/main/services/logger.service', () => ({
  logger: {
    error: state.loggerError
  }
}))

let registerSourcesIpc: () => void

describe('source summaries IPC', () => {
  beforeEach(async () => {
    vi.resetModules()
    state.handlers.clear()
    state.listSummaries.mockReset()
    state.syncRoot.mockReset()
    state.watchStart.mockReset()
    state.loggerError.mockReset()
    ;({ registerSourcesIpc } = await import('../../src/main/ipc/sources.ipc'))
  })

  it('returns only source summaries through its dedicated channel', async () => {
    const summaries: SourceSummary[] = [
      {
        id: 'source-1',
        provider: 'local-folder',
        displayName: 'Local library',
        availability: 'available',
        preferenceWeight: 0,
        itemCount: 2,
        linkedItemCount: 1,
        availableItemCount: 2,
        missingItemCount: 0
      }
    ]
    state.listSummaries.mockReturnValue(summaries)

    registerSourcesIpc()

    expect([...state.handlers.keys()]).toEqual(['sources:list-summaries', 'sources:sync-now'])
    await expect(state.handlers.get('sources:list-summaries')!({})).resolves.toEqual(summaries)

    const bridge: Pick<OrbiaApi, 'sources'> = {
      sources: { listSummaries: async () => [], syncNow: async () => createSyncResult() }
    }
    await expect(bridge.sources.listSummaries()).resolves.toEqual([])
  })

  it('returns an empty list and logs no service error details when summaries fail', async () => {
    state.listSummaries.mockImplementation(() => {
      throw new Error('C:/private-vault/token=secret')
    })
    registerSourcesIpc()

    await expect(state.handlers.get('sources:list-summaries')!({})).resolves.toEqual([])
    expect(state.loggerError).toHaveBeenCalledTimes(1)
    expect(state.loggerError).toHaveBeenCalledWith('[IPC] sources:list-summaries failed')
  })

  it('validates root IDs and returns only source sync results', async () => {
    const result = createSyncResult()
    state.syncRoot.mockResolvedValue(result)

    registerSourcesIpc()
    registerSourcesIpc()
    const syncNow = state.handlers.get('sources:sync-now')!

    expect(state.watchStart).toHaveBeenCalledTimes(1)
    await expect(syncNow({}, { rootId: 'root-1' })).resolves.toEqual(result)
    expect(state.syncRoot).toHaveBeenCalledWith('root-1', 'manual')
    await expect(syncNow({}, { rootId: '' })).rejects.toThrow('Invalid source root ID')
    await expect(syncNow({}, { rootId: 'a'.repeat(513) })).rejects.toThrow('Invalid source root ID')
    await expect(syncNow({}, { rootId: 'root\u0000-1' })).rejects.toThrow('Invalid source root ID')
  })

  it('sanitizes manual synchronization failures', async () => {
    state.syncRoot.mockRejectedValue(new Error('C:/private-vault/token=secret'))
    registerSourcesIpc()

    await expect(state.handlers.get('sources:sync-now')!({}, { rootId: 'root-1' }))
      .rejects.toThrow('Source synchronization failed')
    expect(state.loggerError).toHaveBeenCalledWith('[IPC] sources:sync-now failed')
  })
})

function createSyncResult(): SourceSyncResult {
  return {
    runId: 'run-1',
    sourceId: 'source-1',
    sourceRootId: 'root-1',
    trigger: 'manual',
    startedAt: 1,
    completedAt: 2,
    scannedItems: 3,
    changedItems: 1
  }
}
