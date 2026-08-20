import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload?: unknown) => Promise<unknown> | unknown>(),
  isZipFile: vi.fn(),
  extractZip: vi.fn(),
  existsSync: vi.fn(),
  statSync: vi.fn(),
  scanDirectory: vi.fn(),
  parseCourseHierarchy: vi.fn(),
  getCurrentVault: vi.fn(),
  recordImportHistory: vi.fn(),
  saveCourseWithHierarchy: vi.fn(),
  materializeProposalCovers: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => 'C:/temp') },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, payload?: unknown) => Promise<unknown> | unknown) => {
      state.handlers.set(channel, handler)
    }
  }
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: state.existsSync,
    statSync: state.statSync
  },
  existsSync: state.existsSync,
  statSync: state.statSync
}))

vi.mock('../src/main/services/archive.service', () => ({
  archiveService: {
    isZipFile: state.isZipFile,
    extractZip: state.extractZip
  }
}))

vi.mock('../src/main/services/scanner.service', () => ({
  scannerService: { scanDirectory: state.scanDirectory }
}))

vi.mock('../src/main/services/parser.service', () => ({
  parserService: { parseCourseHierarchy: state.parseCourseHierarchy }
}))

vi.mock('../src/main/services/vault.service', () => ({
  vaultService: { getCurrentVault: state.getCurrentVault }
}))

vi.mock('../src/main/services/database.service', () => ({
  databaseService: {
    recordImportHistory: state.recordImportHistory,
    saveCourseWithHierarchy: state.saveCourseWithHierarchy
  }
}))

vi.mock('../src/main/services/proposal-cover.service', () => ({
  materializeProposalCovers: state.materializeProposalCovers
}))

import { registerCoursesIpc } from '../src/main/ipc/courses.ipc'

describe('legacy import IPC safety gate', () => {
  beforeEach(() => {
    state.handlers.clear()
    state.isZipFile.mockReset()
    state.extractZip.mockReset()
    state.existsSync.mockReset()
    state.statSync.mockReset()
    state.scanDirectory.mockReset()
    state.parseCourseHierarchy.mockReset()
    state.getCurrentVault.mockReset()
    state.recordImportHistory.mockReset()
    state.saveCourseWithHierarchy.mockReset()
    state.materializeProposalCovers.mockReset()
    state.isZipFile.mockReturnValue(true)
    state.existsSync.mockReturnValue(true)
    state.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => true, size: 1 })
    state.getCurrentVault.mockReturnValue({ path: 'C:/vault' })
    state.extractZip.mockResolvedValue({
      extractedPath: 'C:/vault/Inbox/course',
      suggestedCourseName: 'Course',
      totalExtractedFiles: 1,
      verificationOk: true,
      warnings: []
    })
    state.scanDirectory.mockResolvedValue({})
    state.parseCourseHierarchy.mockResolvedValue({ suggestedTitle: 'Parsed', modules: [] })
    state.materializeProposalCovers.mockImplementation(async (proposal) => proposal)
    registerCoursesIpc()
  })

  it('rejects raw paths and proposals without invoking privileged services', async () => {
    const handlers = [
      state.handlers.get('courses:extract-zip'),
      state.handlers.get('courses:scan-folder'),
      state.handlers.get('courses:import'),
      state.handlers.get('courses:import-batch')
    ]

    expect(handlers.every(Boolean)).toBe(true)

    const results = await Promise.all([
      handlers[0]!({ sender: { send: vi.fn() } }, { zipPath: 'C:/private/course.zip', deleteSourceArchive: true }),
      handlers[1]!({}, { folderPath: 'C:/private/course' }),
      handlers[2]!({}, { proposal: { suggestedTitle: 'Injected', modules: [], rootPath: 'C:/private/course' }, isExternal: false }),
      handlers[3]!({}, { items: [{ proposal: { suggestedTitle: 'Injected', modules: [] }, isExternal: false }] })
    ])

    for (const result of results) {
      expect(result).toMatchObject({
        success: false,
        error: expect.stringMatching(/import session preview/i)
      })
    }

    expect(state.isZipFile).not.toHaveBeenCalled()
    expect(state.existsSync).not.toHaveBeenCalled()
    expect(state.statSync).not.toHaveBeenCalled()
    expect(state.extractZip).not.toHaveBeenCalled()
    expect(state.scanDirectory).not.toHaveBeenCalled()
    expect(state.parseCourseHierarchy).not.toHaveBeenCalled()
    expect(state.getCurrentVault).not.toHaveBeenCalled()
    expect(state.recordImportHistory).not.toHaveBeenCalled()
    expect(state.saveCourseWithHierarchy).not.toHaveBeenCalled()
    expect(state.materializeProposalCovers).not.toHaveBeenCalled()
  })
})
