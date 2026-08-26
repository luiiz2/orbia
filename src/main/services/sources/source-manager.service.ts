import type {
  SourceProvider,
  SourceRoot,
  SourceSummary,
  SourceMatchCandidateView,
  SourceMatchStatus,
  SourceMatchSummary,
  CanonicalSourceLink,
  CanonicalSourceType,
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
import { SourceMatchingService } from './source-matching.service'
import { SourceRepositoryService } from './source-repository.service'
import { SourceSyncService } from './source-sync.service'

export class SourceManagerService {
  private readonly adapters = new Map<SourceProvider, SourceAdapter>()
  private readonly sourceSyncService: SourceSyncService
  private readonly sourceMatchingService: SourceMatchingService

  public constructor(private readonly repository: SourceRepositoryService) {
    this.sourceSyncService = new SourceSyncService(repository, (provider) =>
      this.getAdapter(provider)
    )
    this.sourceMatchingService = new SourceMatchingService(repository)
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

  public listRoots(): SourceRoot[] {
    return this.repository.listRoots()
  }

  public syncRoot(
    rootId: string,
    trigger: SourceSyncTrigger = 'manual'
  ): Promise<SourceSyncResult> {
    return this.syncRootAndMatch(rootId, trigger)
  }

  public listMatchCandidates(
    status?: SourceMatchStatus
  ): SourceMatchCandidateView[] {
    return this.repository.listMatchCandidates(status)
  }

  public linkSourceToCanonical(
    sourceItemId: string,
    canonicalType: CanonicalSourceType,
    canonicalId: string
  ): CanonicalSourceLink {
    return this.repository.linkSourceToCanonical(
      sourceItemId,
      canonicalType,
      canonicalId,
      Date.now()
    )
  }

  public unlinkSourceFromCanonical(
    sourceItemId: string,
    canonicalType: CanonicalSourceType,
    canonicalId: string
  ): boolean {
    return this.repository.unlinkSourceFromCanonical(
      sourceItemId,
      canonicalType,
      canonicalId,
      Date.now()
    )
  }

  public reviewMatchCandidate(
    candidateId: string,
    decision: Exclude<SourceMatchStatus, 'pending'>
  ): SourceMatchCandidateView {
    return this.repository.reviewMatchCandidate(
      candidateId,
      decision,
      Date.now()
    )
  }

  public matchRoot(rootId: string): Promise<SourceMatchSummary> {
    return this.sourceMatchingService.matchRoot(rootId)
  }

  private async syncRootAndMatch(
    rootId: string,
    trigger: SourceSyncTrigger
  ): Promise<SourceSyncResult> {
    const result = await this.sourceSyncService.syncRoot(rootId, trigger)
    await this.sourceMatchingService.matchRoot(rootId)
    return result
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
