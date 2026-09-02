import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
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
  googleStatus: vi.fn(),
  googleConnect: vi.fn(),
  googleDisconnect: vi.fn(),
  googleListFolder: vi.fn(),
  googleListSharedWithMe: vi.fn(),
  googlePreparePlayback: vi.fn(),
  googlePrepareDownload: vi.fn(),
  googleGetExternalUrl: vi.fn(),
  saveDialog: vi.fn(),
  openExternal: vi.fn(),
  loggerError: vi.fn()
}))

vi.mock('electron', () => ({
  dialog: {
    showSaveDialog: state.saveDialog
  },
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: unknown) => Promise<unknown> | unknown
    ) => {
      state.handlers.set(channel, handler)
    }
  },
  shell: {
    openExternal: state.openExternal
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

vi.mock('../../src/main/services/sources/google/google-drive.service', () => ({
  googleDriveService: {
    getStatus: state.googleStatus,
    connect: state.googleConnect,
    disconnect: state.googleDisconnect,
    listFolder: state.googleListFolder,
    listSharedWithMe: state.googleListSharedWithMe,
    preparePlayback: state.googlePreparePlayback,
    prepareDownload: state.googlePrepareDownload,
    getExternalUrl: state.googleGetExternalUrl
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
    state.googleStatus.mockReset()
    state.googleConnect.mockReset()
    state.googleDisconnect.mockReset()
    state.googleListFolder.mockReset()
    state.googleListSharedWithMe.mockReset()
    state.googlePreparePlayback.mockReset()
    state.googlePrepareDownload.mockReset()
    state.googleGetExternalUrl.mockReset()
    state.saveDialog.mockReset()
    state.openExternal.mockReset()
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
      'sources:match-root',
      'sources:google-status',
      'sources:google-connect',
      'sources:google-disconnect',
      'sources:google-list-folder',
      'sources:google-list-shared-with-me',
      'sources:google-prepare-playback',
      'sources:google-download',
      'sources:google-open-external'
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

  it('exposes Google Drive browsing and playback through path-free payloads', async () => {
    const status = { configured: true, connected: true }
    const listing = {
      folderId: 'root',
      folderName: 'Meu Drive',
      entries: []
    }
    const playback = {
      url: 'media://playback/00000000-0000-4000-8000-000000000000',
      name: 'lesson.mp4',
      mimeType: 'video/mp4',
      size: 12,
      seekable: true
    }
    state.googleStatus.mockReturnValue(status)
    state.googleConnect.mockResolvedValue(status)
    state.googleDisconnect.mockReturnValue(undefined)
    state.googleListFolder.mockResolvedValue(listing)
    state.googlePreparePlayback.mockResolvedValue(playback)

    registerSourcesIpc()

    await expect(
      state.handlers.get('sources:google-status')!({})
    ).resolves.toEqual(status)
    await expect(
      state.handlers.get('sources:google-connect')!({})
    ).resolves.toEqual(status)
    await expect(
      state.handlers.get('sources:google-list-folder')!(
        {},
        { folderId: 'root', pageToken: 'next' }
      )
    ).resolves.toEqual(listing)
    await expect(
      state.handlers.get('sources:google-prepare-playback')!(
        {},
        { itemId: 'file-1' }
      )
    ).resolves.toEqual(playback)
    await expect(
      state.handlers.get('sources:google-disconnect')!({})
    ).resolves.toBe(true)

    expect(state.googleListFolder).toHaveBeenCalledWith('root', {
      pageToken: 'next'
    })
    expect(state.googlePreparePlayback).toHaveBeenCalledWith({
      itemId: 'file-1'
    })
  })

  it('lists shared content and downloads only after the native save dialog is confirmed', async () => {
    const sharedListing = {
      folderId: 'shared-with-me',
      folderName: 'Compartilhados comigo',
      rootKind: 'shared-with-me',
      entries: []
    }
    state.googleListSharedWithMe.mockResolvedValue(sharedListing)
    state.saveDialog.mockResolvedValue({ canceled: true, filePath: '' })
    state.googlePrepareDownload.mockResolvedValue({
      stream: Readable.from(Buffer.from('downloaded content')),
      name: 'aula.mp4',
      mimeType: 'video/mp4',
      size: 17
    })

    registerSourcesIpc()

    await expect(
      state.handlers.get('sources:google-list-shared-with-me')!(
        {},
        { pageToken: 'shared-page-2' }
      )
    ).resolves.toEqual(sharedListing)
    await expect(
      state.handlers.get('sources:google-download')!(
        {},
        { itemId: 'file-1', driveId: 'shared-drive-1', suggestedName: 'aula.mp4' }
      )
    ).resolves.toEqual({ success: false, cancelled: true })

    expect(state.googleListSharedWithMe).toHaveBeenCalledWith({
      pageToken: 'shared-page-2'
    })
    expect(state.saveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'aula.mp4' })
    )
    expect(state.googlePrepareDownload).not.toHaveBeenCalled()
  })

  it('streams a confirmed Google Drive download and opens only validated Drive URLs', async () => {
    const targetPath = path.join(
      os.tmpdir(),
      `orbia-google-drive-${Date.now()}-${Math.random().toString(16).slice(2)}.mp4`
    )
    await rm(targetPath, { force: true })
    state.saveDialog.mockResolvedValue({ canceled: false, filePath: targetPath })
    state.googlePrepareDownload.mockResolvedValue({
      stream: Readable.from(Buffer.from('downloaded content')),
      name: 'aula.mp4',
      mimeType: 'video/mp4',
      size: 17
    })
    state.googleGetExternalUrl.mockResolvedValue(
      'https://drive.google.com/file/d/file-1/view'
    )
    state.openExternal.mockResolvedValue(true)

    try {
      registerSourcesIpc()

      await expect(
        state.handlers.get('sources:google-download')!(
          {},
          { itemId: 'file-1', suggestedName: 'aula.mp4' }
        )
      ).resolves.toEqual({
        success: true,
        fileName: path.basename(targetPath),
        bytes: 17
      })
      await expect(readFile(targetPath, 'utf8')).resolves.toBe(
        'downloaded content'
      )

      await expect(
        state.handlers.get('sources:google-open-external')!(
          {},
          { itemId: 'file-1' }
        )
      ).resolves.toBe(true)
      expect(state.googleGetExternalUrl).toHaveBeenCalledWith({
        itemId: 'file-1'
      })
      expect(state.openExternal).toHaveBeenCalledWith(
        'https://drive.google.com/file/d/file-1/view'
      )
    } finally {
      await rm(targetPath, { force: true })
    }
  })

  it('rejects an external URL that is not an approved Google Drive host', async () => {
    state.googleGetExternalUrl.mockResolvedValue('https://attacker.example/file')
    registerSourcesIpc()

    await expect(
      state.handlers.get('sources:google-open-external')!(
        {},
        { itemId: 'file-1' }
      )
    ).rejects.toThrow('Could not open Google Drive file')
    expect(state.openExternal).not.toHaveBeenCalled()
  })

  it('cleans up a newly created partial file when the remote stream fails', async () => {
    const targetPath = path.join(
      os.tmpdir(),
      `orbia-google-drive-failed-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`
    )
    await rm(targetPath, { force: true })
    state.saveDialog.mockResolvedValue({ canceled: false, filePath: targetPath })
    state.googlePrepareDownload.mockResolvedValue({
      stream: new Readable({
        read() {
          this.destroy(new Error('remote stream failed'))
        }
      }),
      name: 'arquivo.bin',
      mimeType: 'application/octet-stream',
      size: 10
    })

    try {
      registerSourcesIpc()

      await expect(
        state.handlers.get('sources:google-download')!(
          {},
          { itemId: 'file-1', suggestedName: 'arquivo.bin' }
        )
      ).rejects.toThrow('Google Drive download failed')
      expect(existsSync(targetPath)).toBe(false)
    } finally {
      await rm(targetPath, { force: true })
    }
  })

  it('rejects invalid download payloads before opening the save dialog', async () => {
    registerSourcesIpc()

    await expect(
      state.handlers.get('sources:google-download')!({}, { itemId: '' })
    ).rejects.toThrow('Invalid Google Drive file ID')
    expect(state.saveDialog).not.toHaveBeenCalled()
    expect(state.googlePrepareDownload).not.toHaveBeenCalled()
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
