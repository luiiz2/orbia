import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SourceRoot, SourceSyncResult, SourceSyncTrigger } from '../../src/types/source'
import { SourceWatchService } from '../../src/main/services/sources/source-watch.service'
import type { SourceAdapter } from '../../src/main/services/sources/source-adapter'

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
    const adapter = { watch: vi.fn(async () => ({ dispose: vi.fn() })) } as unknown as SourceAdapter
    const manager = createManager(adapter)
    const service = new SourceWatchService(manager)

    service.start()
    service.start()
    await settle()

    expect(manager.listRoots).toHaveBeenCalledTimes(1)
    expect(manager.getAdapter).toHaveBeenCalledTimes(1)
    expect(adapter.watch).toHaveBeenCalledWith(root.locator, expect.any(Function))
    expect(manager.syncRoot).toHaveBeenCalledTimes(1)
    expect(manager.syncRoot).toHaveBeenCalledWith(root.id, 'startup')
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
    manager.syncRoot.mockImplementation((_: string, trigger: SourceSyncTrigger) => {
      if (trigger !== 'watch') return Promise.resolve(createResult(trigger))
      return new Promise((resolve) => {
        resolveWatchSync = resolve
      })
    })
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
