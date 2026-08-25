import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrbiaApi, SourceSummary } from '../../src/types'

const state = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown) => Promise<unknown> | unknown>(),
  listSummaries: vi.fn(),
  loggerError: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown) => Promise<unknown> | unknown) => {
      state.handlers.set(channel, handler)
    }
  }
}))

vi.mock('../../src/main/services/sources/source-manager.service', () => ({
  sourceManagerService: {
    listSummaries: state.listSummaries
  }
}))

vi.mock('../../src/main/services/logger.service', () => ({
  logger: {
    error: state.loggerError
  }
}))

import { registerSourcesIpc } from '../../src/main/ipc/sources.ipc'

describe('source summaries IPC', () => {
  beforeEach(() => {
    state.handlers.clear()
    state.listSummaries.mockReset()
    state.loggerError.mockReset()
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

    expect([...state.handlers.keys()]).toEqual(['sources:list-summaries'])
    await expect(state.handlers.get('sources:list-summaries')!({})).resolves.toEqual(summaries)

    const bridge: Pick<OrbiaApi, 'sources'> = {
      sources: { listSummaries: async () => [] }
    }
    await expect(bridge.sources.listSummaries()).resolves.toEqual([])
  })

  it('returns an empty list and logs no service error details when summaries fail', async () => {
    state.listSummaries.mockImplementation(() => {
      throw new Error('C:/private-vault/token=secret')
    })
    registerSourcesIpc()

    await expect(state.handlers.get('sources:list-summaries')!({})).resolves.toEqual([])
    expect(state.loggerError).toHaveBeenCalledTimes(1)
    expect(state.loggerError).toHaveBeenCalledWith('[IPC] sources:list-summaries failed')
  })
})
