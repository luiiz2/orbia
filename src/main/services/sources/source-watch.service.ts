import type { SourceRoot, SourceSyncTrigger } from '../../../types/source'
import { sourceManagerService } from './source-manager.service'
import type { SourceAdapter, SourceWatchDisposable } from './source-adapter'

export const WATCH_DEBOUNCE_MS = 500
export const PERIODIC_SYNC_MS = 15 * 60 * 1000

export interface SourceWatchManager {
  listRoots(): SourceRoot[]
  getAdapter(provider: SourceAdapter['provider']): SourceAdapter
  syncRoot(rootId: string, trigger: SourceSyncTrigger): Promise<unknown>
}

interface ActiveSync {
  promise: Promise<void>
  followUp?: SourceSyncTrigger
}

export class SourceWatchService {
  private readonly watchers = new Map<string, SourceWatchDisposable>()
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly activeSyncs = new Map<string, ActiveSync>()
  private periodicTimer?: ReturnType<typeof setInterval>
  private started = false

  public constructor(private readonly manager: SourceWatchManager = sourceManagerService) {}

  public start(): void {
    if (this.started) return
    this.started = true
    this.periodicTimer = setInterval(() => {
      void this.refresh('periodic').catch(() => undefined)
    }, PERIODIC_SYNC_MS)
    unrefTimer(this.periodicTimer)

    let roots: SourceRoot[]
    try {
      roots = this.manager.listRoots()
    } catch {
      return
    }
    void this.refreshRoots(roots, 'startup').catch(() => undefined)
    void this.installWatchers(roots)
  }

  public stop(): void {
    this.started = false
    if (this.periodicTimer) clearInterval(this.periodicTimer)
    this.periodicTimer = undefined
    for (const timer of this.debounceTimers.values()) clearTimeout(timer)
    this.debounceTimers.clear()
    for (const activeSync of this.activeSyncs.values()) activeSync.followUp = undefined
    for (const watcher of this.watchers.values()) {
      try {
        watcher.dispose()
      } catch {
        // A failed close must not leave other watchers running.
      }
    }
    this.watchers.clear()
  }

  public refresh(trigger: SourceSyncTrigger): Promise<void> {
    return this.refreshRoots(this.manager.listRoots(), trigger)
  }

  private async installWatchers(roots: SourceRoot[]): Promise<void> {
    for (const root of roots) {
      if (!this.started) return
      try {
        const adapter = this.manager.getAdapter(root.locator.provider)
        if (!adapter.watch) continue
        const watcher = await adapter.watch(root.locator, () => this.markDirty(root.id))
        if (this.started) this.watchers.set(root.id, watcher)
        else watcher.dispose()
      } catch {
        // Periodic reconciliation remains the fallback when watch setup fails.
      }
    }
  }

  private async refreshRoots(
    roots: SourceRoot[],
    trigger: SourceSyncTrigger
  ): Promise<void> {
    await Promise.all(roots.map((root) => this.syncRoot(root.id, trigger)))
  }

  private markDirty(rootId: string): void {
    if (!this.started) return
    const activeSync = this.activeSyncs.get(rootId)
    if (activeSync) {
      activeSync.followUp = 'watch'
      return
    }
    const previousTimer = this.debounceTimers.get(rootId)
    if (previousTimer) clearTimeout(previousTimer)
    const timer = setTimeout(() => {
      this.debounceTimers.delete(rootId)
      void this.syncRoot(rootId, 'watch').catch(() => undefined)
    }, WATCH_DEBOUNCE_MS)
    this.debounceTimers.set(rootId, timer)
    unrefTimer(timer)
  }

  private syncRoot(rootId: string, trigger: SourceSyncTrigger): Promise<void> {
    const activeSync = this.activeSyncs.get(rootId)
    if (activeSync) {
      activeSync.followUp = trigger
      return activeSync.promise
    }

    const next: ActiveSync = { promise: Promise.resolve() }
    next.promise = this.runSync(rootId, trigger, next).finally(() => {
      this.activeSyncs.delete(rootId)
    })
    this.activeSyncs.set(rootId, next)
    return next.promise
  }

  private async runSync(
    rootId: string,
    initialTrigger: SourceSyncTrigger,
    activeSync: ActiveSync
  ): Promise<void> {
    let trigger: SourceSyncTrigger | undefined = initialTrigger
    let error: unknown
    while (trigger) {
      activeSync.followUp = undefined
      try {
        await this.manager.syncRoot(rootId, trigger)
      } catch (caught) {
        error ??= caught
      }
      trigger = this.started ? activeSync.followUp : undefined
    }
    if (error) throw error
  }
}

export const sourceWatchService = new SourceWatchService()

function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  ;(timer as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.()
}
