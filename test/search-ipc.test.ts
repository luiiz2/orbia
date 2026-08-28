import { beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (_event: unknown, payload?: unknown) => Promise<unknown> | unknown

const handlers = new Map<string, Handler>()
const librarySearchService = {
  search: vi.fn(),
  related: vi.fn(),
  resolveResult: vi.fn()
}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler))
  }
}))

vi.mock('../src/main/services/search/library-search.service', () => ({
  librarySearchService
}))

describe('search IPC bridge', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    handlers.clear()
    const { registerSearchIpc } = await import('../src/main/ipc/search.ipc')
    registerSearchIpc()
  })

  it('registers all expected search channels', () => {
    expect(handlers.has('search:find-in-library')).toBe(true)
    expect(handlers.has('search:related')).toBe(true)
    expect(handlers.has('search:resolve-result')).toBe(true)
  })

  it('validates and routes search:find-in-library request', async () => {
    librarySearchService.search.mockResolvedValueOnce({
      query: 'docker',
      mode: 'hybrid',
      results: [],
      groups: [],
      coverage: { status: 'completed', totalSources: 1, indexedSources: 1, missingSources: 0, percentage: 100 },
      semanticUsed: true,
      semanticUnavailable: false
    })

    const handler = handlers.get('search:find-in-library')!
    const response = await handler({}, {
      query: '  docker  ',
      mode: 'hybrid',
      filters: {
        courseId: 'course-1',
        contentTypes: ['transcript', 'pdf']
      },
      limit: 20
    })

    expect(librarySearchService.search).toHaveBeenCalledWith({
      query: 'docker',
      mode: 'hybrid',
      filters: {
        courseId: 'course-1',
        contentTypes: ['transcript', 'pdf']
      },
      limit: 20
    })
    expect(response).toMatchObject({ query: 'docker', mode: 'hybrid' })
  })

  it('validates and routes search:related request', async () => {
    librarySearchService.related.mockResolvedValueOnce({
      groups: [],
      coverage: { status: 'completed', totalSources: 1, indexedSources: 1, missingSources: 0, percentage: 100 },
      semanticUsed: true,
      semanticUnavailable: false
    })

    const handler = handlers.get('search:related')!
    await handler({}, {
      anchor: {
        chunkId: 'chunk-123',
        courseId: 'course-1',
        lessonId: 'lesson-1'
      },
      limit: 5
    })

    expect(librarySearchService.related).toHaveBeenCalledWith({
      anchor: {
        chunkId: 'chunk-123',
        courseId: 'course-1',
        lessonId: 'lesson-1'
      },
      limit: 5
    })
  })

  it('validates and routes search:resolve-result request', async () => {
    librarySearchService.resolveResult.mockReturnValueOnce({
      status: 'ok',
      target: {
        type: 'lesson',
        courseId: 'course-1',
        moduleId: 'module-1',
        lessonId: 'lesson-1',
        timestampSeconds: 30
      }
    })

    const handler = handlers.get('search:resolve-result')!
    const result = await handler({}, { chunkId: 'chunk-123' })

    expect(librarySearchService.resolveResult).toHaveBeenCalledWith({ chunkId: 'chunk-123' })
    expect(result).toEqual({
      status: 'ok',
      target: {
        type: 'lesson',
        courseId: 'course-1',
        moduleId: 'module-1',
        lessonId: 'lesson-1',
        timestampSeconds: 30
      }
    })
  })

  it('rejects malformed payloads with descriptive validation errors', () => {
    const searchHandler = handlers.get('search:find-in-library')!
    expect(() => searchHandler({}, 'not-an-object')).toThrow('Invalid library search request')
    expect(() => searchHandler({}, { query: 123 })).toThrow('Invalid library search request')

    const resolveHandler = handlers.get('search:resolve-result')!
    expect(() => resolveHandler({}, null)).toThrow('Invalid search result request')
    expect(() => resolveHandler({}, { chunkId: 123 })).toThrow('Invalid search result request')
  })
})
