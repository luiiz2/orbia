import type {
  SourceProvider,
  SourceSummary,
  SourceSyncResult,
  SourceSyncTrigger
} from '../../../types/source'
import { databaseService } from '../database.service'
import { LocalFolderSourceAdapter } from './adapters/local-folder.adapter'
import {
  ManagedOfflineSourceAdapter,
  type ManagedOfflineSourceAdapterDependencies
} from './adapters/managed-offline.adapter'
import type { SourceAdapter } from './source-adapter'
import { SourceRepositoryService } from './source-repository.service'
import { SourceSyncService } from './source-sync.service'

export class SourceManagerService {
  private readonly adapters = new Map<SourceProvider, SourceAdapter>()
  private readonly sourceSyncService: SourceSyncService

  public constructor(private readonly repository: SourceRepositoryService) {
    this.sourceSyncService = new SourceSyncService(
      repository,
      (provider) => this.getAdapter(provider)
    )
  }

  public register(adapter: SourceAdapter): void {
    this.adapters.set(adapter.provider, adapter)
  }

  public getAdapter(provider: SourceProvider): SourceAdapter {
    const adapter = this.adapters.get(provider)
    if (!adapter)
      throw new Error(`No source adapter registered for provider: ${provider}`)
    return adapter
  }

  public listSummaries(): SourceSummary[] {
    return this.repository.listSummaries()
  }

  public syncRoot(
    rootId: string,
    trigger: SourceSyncTrigger = 'manual'
  ): Promise<SourceSyncResult> {
    return this.sourceSyncService.syncRoot(rootId, trigger)
  }
}

export const sourceManagerService = new SourceManagerService(
  new SourceRepositoryService(databaseService)
)

sourceManagerService.register(new LocalFolderSourceAdapter())

export function registerBuiltinSourceAdapters(
  manager: SourceManagerService,
  dependencies: Pick<
    ManagedOfflineSourceAdapterDependencies,
    'resolveCacheRoot'
  >
): void {
  manager.register(new LocalFolderSourceAdapter())
  manager.register(new ManagedOfflineSourceAdapter(dependencies))
}
