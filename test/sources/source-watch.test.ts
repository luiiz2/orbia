import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  SourceRoot,
  SourceSyncResult,
  SourceSyncTrigger
} from '../../src/types/source'
import {
  PERIODIC_SYNC_MS,
  SourceWatchService
} from '../../src/main/services/sources/source-watch.service'
import type {
  SourceAdapter,
  SourceWatchDisposable
} from '../../src/main/services/sources/source-adapter'

const root: SourceRoot = {
  id: 'root-1',
  sourceId: 'source-1',
  locator: { provider: 'local-folder', path: 'C:/Courses' },
  availability: 'available'
}

function createResult(trigger: SourceSyncTrigger): SourceSyncResult {
  return {
    runId: `run-${trigger}`,
    sourceId: root.sourceId,
    sourceRootId: root.id,
    trigger,
    startedAt: 1,
    completedAt: 2,
    scannedItems: 0,
    changedItems: 0
  }
}

function createManager(adapter?: SourceAdapter) {
  return {
    listRoots: vi.fn(() => [root]),
    getAdapter: vi.fn(() => adapter),
    syncRoot: vi.fn((_: string, trigger: SourceSyncTrigger) =>
      Promise.resolve(createResult(trigger))
    )
  }
}

async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('SourceWatchService', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts one startup sync and remains idempotent', async () => {
    vi.useFakeTimers()
    const adapter = {
      watch: vi.fn(async () => ({ dispose: vi.fn() }))
    } as unknown as SourceAdapter
    const manager = createManager(adapter)
    const service = new SourceWatchService(manager)

    service.start()
    service.start()
    await settle()

    expect(manager.listRoots).toHaveBeenCalledTimes(1)
    expect(manager.getAdapter).toHaveBeenCalledTimes(1)
    expect(adapter.watch).toHaveBeenCalledWith(
      root.locator,
      expect.any(Function)
    )
    expect(manager.syncRoot).toHaveBeenCalledTimes(1)
    expect(manager.syncRoot).toHaveBeenCalledWith(root.id, 'startup')
  })

  it('restarts synchronization when roots become available after startup', async () => {
    vi.useFakeTimers()
    const adapter = {
      watch: vi.fn(async () => ({ dispose: vi.fn() }))
    } as unknown as SourceAdapter
    const manager = createManager(adapter)
    manager.listRoots.mockReturnValueOnce([]).mockReturnValue([root])
    const service = new SourceWatchService(manager)

    service.start()
    await settle()
    expect(manager.syncRoot).not.toHaveBeenCalled()

    service.restart()
    await settle()

    expect(manager.syncRoot).toHaveBeenCalledTimes(1)
    expect(manager.syncRoot).toHaveBeenCalledWith(root.id, 'startup')
  })

  it('restarts without retaining a watcher installed by a prior lifecycle', async () => {
    vi.useFakeTimers()
    let resolveFirstWatch:
      ((watcher: SourceWatchDisposable) => void) | undefined
    const staleDispose = vi.fn()
    const currentDispose = vi.fn()
    const adapter = {
      watch: vi.fn(() => {
        if (adapter.watch.mock.calls.length === 1) {
          return new Promise<SourceWatchDisposable>((resolve) => {
            resolveFirstWatch = resolve
          })
        }
        return Promise.resolve({ dispose: currentDispose })
      })
    } as unknown as SourceAdapter
    const manager = createManager(adapter)
    const service = new SourceWatchService(manager)

    service.start()
    await settle()
    service.restart()
    await settle()
    resolveFirstWatch!({ dispose: staleDispose })
    await settle()
    manager.syncRoot.mockClear()

    await vi.advanceTimersByTimeAsync(PERIODIC_SYNC_MS)

    expect(staleDispose).toHaveBeenCalledTimes(1)
    expect(currentDispose).not.toHaveBeenCalled()
    expect(adapter.watch).toHaveBeenCalledTimes(2)
    expect(manager.syncRoot).toHaveBeenCalledTimes(1)
    expect(manager.syncRoot).toHaveBeenCalledWith(root.id, 'periodic')
  })

  it('serializes a manual request behind an active root sync and returns its result', async () => {
    vi.useFakeTimers()
    let resolveStartup: ((value: SourceSyncResult) => void) | undefined
    const manualResult = createResult('manual')
    const manager = createManager({} as SourceAdapter)
    manager.syncRoot.mockImplementation(
      (_: string, trigger: SourceSyncTrigger) => {
        if (trigger === 'startup') {
          return new Promise((resolve) => {
            resolveStartup = resolve
          })
        }
        return Promise.resolve(manualResult)
      }
    )
    const service = new SourceWatchService(manager)

    service.start()
    const manualSync = service.syncRoot(root.id, 'manual')

    expect(manager.syncRoot).toHaveBeenCalledTimes(1)
    resolveStartup!(createResult('startup'))

    await expect(manualSync).resolves.toEqual(manualResult)
    expect(manager.syncRoot).toHaveBeenCalledTimes(2)
    expect(manager.syncRoot).toHaveBeenLastCalledWith(root.id, 'manual')
  })

  it('stops and waits for an active sync before accepting work for another vault', async () => {
    vi.useFakeTimers()
    let resolveStartup: ((value: SourceSyncResult) => void) | undefined
    const manager = createManager({} as SourceAdapter)
    manager.syncRoot.mockImplementation(
      (_: string, trigger: SourceSyncTrigger) =>
        new Promise((resolve) => {
          if (trigger === 'startup') resolveStartup = resolve
        })
    )
    const service = new SourceWatchService(manager)

    service.start()
    const stopped = service.stopAndWait()
    await expect(service.syncRoot(root.id, 'manual')).rejects.toThrow(
      'Source synchronization unavailable'
    )

    let finished = false
    void stopped.then(() => {
      finished = true
    })
    await settle()
    expect(finished).toBe(false)

    resolveStartup!(createResult('startup'))
    await stopped
    expect(finished).toBe(true)
  })

  it('debounces repeated watcher hints into one watch sync', async () => {
    vi.useFakeTimers()
    let dirty: ((hint: { reason: 'changed' }) => void) | undefined
    const adapter = {
      watch: vi.fn(async (_root, onDirty) => {
        dirty = onDirty
        return { dispose: vi.fn() }
      })
    } as unknown as SourceAdapter
    const manager = createManager(adapter)
    const service = new SourceWatchService(manager)
    service.start()
    await settle()
    manager.syncRoot.mockClear()

    dirty!({ reason: 'changed' })
    dirty!({ reason: 'changed' })
    dirty!({ reason: 'changed' })
    await vi.advanceTimersByTimeAsync(499)
    expect(manager.syncRoot).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(manager.syncRoot).toHaveBeenCalledTimes(1)
    expect(manager.syncRoot).toHaveBeenCalledWith(root.id, 'watch')
  })

  it('queues one watcher follow-up while a root sync is active', async () => {
    vi.useFakeTimers()
    let dirty: ((hint: { reason: 'changed' }) => void) | undefined
    let resolveWatchSync: ((value: SourceSyncResult) => void) | undefined
    const adapter = {
      watch: vi.fn(async (_root, onDirty) => {
        dirty = onDirty
        return { dispose: vi.fn() }
      })
    } as unknown as SourceAdapter
    const manager = createManager(adapter)
    manager.syncRoot.mockImplementation(
      (_: string, trigger: SourceSyncTrigger) => {
        if (trigger !== 'watch') return Promise.resolve(createResult(trigger))
        return new Promise((resolve) => {
          resolveWatchSync = resolve
        })
      }
    )
    const service = new SourceWatchService(manager)
    service.start()
    await settle()
    manager.syncRoot.mockClear()

    dirty!({ reason: 'changed' })
    await vi.advanceTimersByTimeAsync(500)
    expect(manager.syncRoot).toHaveBeenCalledTimes(1)

    dirty!({ reason: 'changed' })
    dirty!({ reason: 'changed' })
    resolveWatchSync!(createResult('watch'))
    await settle()

    expect(manager.syncRoot).toHaveBeenCalledTimes(2)
    expect(manager.syncRoot).toHaveBeenLastCalledWith(root.id, 'watch')
  })

  it('periodically syncs roots without watch support', async () => {
    vi.useFakeTimers()
    const manager = createManager({} as SourceAdapter)
    const service = new SourceWatchService(manager)
    service.start()
    await settle()
    manager.syncRoot.mockClear()

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000)

    expect(manager.syncRoot).toHaveBeenCalledTimes(1)
    expect(manager.syncRoot).toHaveBeenCalledWith(root.id, 'periodic')
  })

  it('turns root-listing failures into rejected refresh promises', async () => {
    const manager = createManager()
    manager.listRoots.mockImplementation(() => {
      throw new Error('source root cannot be mapped')
    })
    const service = new SourceWatchService(manager)

    await expect(service.refresh('periodic')).rejects.toThrow(
      'source root cannot be mapped'
    )
  })

  it('stops timers and disposes active watchers', async () => {
    vi.useFakeTimers()
    let dirty: ((hint: { reason: 'changed' }) => void) | undefined
    const dispose = vi.fn()
    const adapter = {
      watch: vi.fn(async (_root, onDirty) => {
        dirty = onDirty
        return { dispose }
      })
    } as unknown as SourceAdapter
    const manager = createManager(adapter)
    const service = new SourceWatchService(manager)
    service.start()
    await settle()
    manager.syncRoot.mockClear()

    service.stop()
    dirty!({ reason: 'changed' })
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000)

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(manager.syncRoot).not.toHaveBeenCalled()
  })
})
