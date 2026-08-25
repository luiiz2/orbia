import type { SourceProvider, SourceSummary } from '../../../types/source'
import { databaseService } from '../database.service'
import { LocalFolderSourceAdapter } from './adapters/local-folder.adapter'
import {
  ManagedOfflineSourceAdapter,
  type ManagedOfflineSourceAdapterDependencies
} from './adapters/managed-offline.adapter'
import type { SourceAdapter } from './source-adapter'
import { SourceRepositoryService } from './source-repository.service'

export class SourceManagerService {
  private readonly adapters = new Map<SourceProvider, SourceAdapter>()

  public constructor(private readonly repository: SourceRepositoryService) {}

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
}

export const sourceManagerService = new SourceManagerService(
  new SourceRepositoryService(databaseService)
)

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
