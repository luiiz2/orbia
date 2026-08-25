import type {
  SourceSnapshotItem,
  SourceSyncResult,
  SourceSyncTrigger
} from '../../../types/source'
import type { SourceAdapter } from './source-adapter'
import { SourceRepositoryService } from './source-repository.service'

export type SourceAdapterResolver = (
  provider: SourceAdapter['provider']
) => SourceAdapter

export class SourceSyncService {
  public constructor(
    private readonly repository: SourceRepositoryService,
    private readonly getAdapter: SourceAdapterResolver,
    private readonly now: () => number = Date.now
  ) {}

  public async syncRoot(
    rootId: string,
    trigger: SourceSyncTrigger
  ): Promise<SourceSyncResult> {
    const root = this.repository.getRoot(rootId)
    if (!root) throw new Error('Unknown source root')

    const adapter = this.getAdapter(root.locator.provider)
    const run = this.repository.beginSync(rootId, trigger, this.now())

    try {
      const items: SourceSnapshotItem[] = []
      for await (const batch of adapter.reconcile({ root: root.locator })) {
        items.push(...batch.items)
      }
      return this.repository.completeSync(run.id, items, this.now())
    } catch {
      this.repository.failSync(run.id, this.now())
      throw new Error('Source synchronization failed')
    }
  }
}
