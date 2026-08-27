import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CanonicalSourceLink,
  SourceMatchCandidateView,
  SourceMatchSummary,
  SourceSummary,
  SourceSyncResult
} from '../../src/types'

const state = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown) => Promise<unknown> | unknown>(),
  listSummaries: vi.fn(),
  managerSyncRoot: vi.fn(),
  listMatchCandidates: vi.fn(),
  linkSourceToCanonical: vi.fn(),
  unlinkSourceFromCanonical: vi.fn(),
  reviewMatchCandidate: vi.fn(),
  matchRoot: vi.fn(),
  watchSyncRoot: vi.fn(),
  loggerError: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: unknown) => Promise<unknown> | unknown
    ) => {
      state.handlers.set(channel, handler)
    }
  }
}))

vi.mock('../../src/main/services/sources/source-manager.service', () => ({
  sourceManagerService: {
    listSummaries: state.listSummaries,
    syncRoot: state.managerSyncRoot,
    listMatchCandidates: state.listMatchCandidates,
    linkSourceToCanonical: state.linkSourceToCanonical,
    unlinkSourceFromCanonical: state.unlinkSourceFromCanonical,
    reviewMatchCandidate: state.reviewMatchCandidate,
    matchRoot: state.matchRoot
  }
}))

vi.mock('../../src/main/services/sources/source-watch.service', () => ({
  sourceWatchService: {
    syncRoot: state.watchSyncRoot
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
    state.managerSyncRoot.mockReset()
    state.listMatchCandidates.mockReset()
    state.linkSourceToCanonical.mockReset()
    state.unlinkSourceFromCanonical.mockReset()
    state.reviewMatchCandidate.mockReset()
    state.matchRoot.mockReset()
    state.watchSyncRoot.mockReset()
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

    expect([...state.handlers.keys()]).toEqual([
      'sources:list-summaries',
      'sources:sync-now',
      'sources:list-candidates',
      'sources:link',
      'sources:unlink',
      'sources:review-candidate',
      'sources:match-root'
    ])
    await expect(
      state.handlers.get('sources:list-summaries')!({})
    ).resolves.toEqual(summaries)

  })

  it('returns an empty list and logs no service error details when summaries fail', async () => {
    state.listSummaries.mockImplementation(() => {
      throw new Error('C:/private-vault/token=secret')
    })
    registerSourcesIpc()

    await expect(
      state.handlers.get('sources:list-summaries')!({})
    ).resolves.toEqual([])
    expect(state.loggerError).toHaveBeenCalledTimes(1)
    expect(state.loggerError).toHaveBeenCalledWith(
      '[IPC] sources:list-summaries failed'
    )
  })

  it('validates root IDs and returns only source sync results', async () => {
    const result = createSyncResult()
    state.watchSyncRoot.mockResolvedValue(result)

    registerSourcesIpc()
    const syncNow = state.handlers.get('sources:sync-now')!

    await expect(syncNow({}, { rootId: 'root-1' })).resolves.toEqual(result)
    expect(state.watchSyncRoot).toHaveBeenCalledWith('root-1', 'manual')
    expect(state.managerSyncRoot).not.toHaveBeenCalled()
    await expect(syncNow({}, { rootId: '' })).rejects.toThrow(
      'Invalid source root ID'
    )
    await expect(syncNow({}, { rootId: 'a'.repeat(513) })).rejects.toThrow(
      'Invalid source root ID'
    )
    await expect(syncNow({}, { rootId: 'root\u0000-1' })).rejects.toThrow(
      'Invalid source root ID'
    )
    await expect(syncNow({}, { rootId: 'root\u001f-1' })).rejects.toThrow(
      'Invalid source root ID'
    )
    await expect(syncNow({}, { rootId: 'root\u007f-1' })).rejects.toThrow(
      'Invalid source root ID'
    )
  })

  it('sanitizes manual synchronization failures', async () => {
    state.watchSyncRoot.mockRejectedValue(
      new Error('C:/private-vault/token=secret')
    )
    registerSourcesIpc()

    await expect(
      state.handlers.get('sources:sync-now')!({}, { rootId: 'root-1' })
    ).rejects.toThrow('Source synchronization failed')
    expect(state.loggerError).toHaveBeenCalledWith(
      '[IPC] sources:sync-now failed'
    )
  })

  it('supports path-free candidate review and manual link actions', async () => {
    const candidate = createCandidate()
    const link = createLink()
    const summary = createMatchSummary()
    state.listMatchCandidates.mockReturnValue([candidate])
    state.linkSourceToCanonical.mockReturnValue(link)
    state.unlinkSourceFromCanonical.mockReturnValue(true)
    state.reviewMatchCandidate.mockReturnValue(candidate)
    state.matchRoot.mockResolvedValue(summary)

    registerSourcesIpc()

    await expect(
      state.handlers.get('sources:list-candidates')!({}, { status: 'pending' })
    ).resolves.toEqual([candidate])
    await expect(
      state.handlers.get('sources:link')!(
        {},
        {
          sourceItemId: 'item-1',
          canonicalType: 'lesson',
          canonicalId: 'lesson-1'
        }
      )
    ).resolves.toEqual(link)
    await expect(
      state.handlers.get('sources:unlink')!(
        {},
        {
          sourceItemId: 'item-1',
          canonicalType: 'lesson',
          canonicalId: 'lesson-1'
        }
      )
    ).resolves.toBe(true)
    await expect(
      state.handlers.get('sources:review-candidate')!(
        {},
        { candidateId: 'candidate-1', decision: 'accepted' }
      )
    ).resolves.toEqual(candidate)
    await expect(
      state.handlers.get('sources:match-root')!({}, { rootId: 'root-1' })
    ).resolves.toEqual(summary)

    expect(state.linkSourceToCanonical).toHaveBeenCalledWith(
      'item-1',
      'lesson',
      'lesson-1'
    )
  })

  it('rejects invalid source action payloads before calling the service', async () => {
    registerSourcesIpc()

    await expect(
      state.handlers.get('sources:list-candidates')!({}, { status: 'invalid' })
    ).rejects.toThrow('Invalid source match status')
    await expect(
      state.handlers.get('sources:link')!(
        {},
        {
          sourceItemId: 'item\u0000',
          canonicalType: 'lesson',
          canonicalId: 'lesson-1'
        }
      )
    ).rejects.toThrow('Invalid source item ID')
    await expect(
      state.handlers.get('sources:review-candidate')!(
        {},
        { candidateId: 'candidate-1', decision: 'pending' }
      )
    ).rejects.toThrow('Invalid source match decision')
    expect(state.linkSourceToCanonical).not.toHaveBeenCalled()
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

function createCandidate(): SourceMatchCandidateView {
  return {
    id: 'candidate-1',
    sourceItemId: 'item-1',
    sourceName: 'Aula 01.mp4',
    sourceProvider: 'local-folder',
    canonicalType: 'lesson',
    canonicalId: 'lesson-1',
    canonicalTitle: 'Aula 01',
    confidence: 0.9,
    evidence: {
      thresholdVersion: 'source-match-v1',
      courseContext: 'same',
      signals: [],
      strongContentMatch: true,
      technicalMetadataCompatible: true,
      duplicateAcrossCourses: false
    },
    status: 'pending',
    createdAt: 1
  }
}

function createLink(): CanonicalSourceLink {
  return {
    id: 'link-1',
    sourceItemId: 'item-1',
    canonicalType: 'lesson',
    canonicalId: 'lesson-1',
    isManual: true,
    isPreferred: false,
    createdAt: 1,
    updatedAt: 1
  }
}

function createMatchSummary(): SourceMatchSummary {
  return { evaluated: 1, autoLinked: 1, pending: 0, duplicates: 0 }
}
