import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLibrarySearchStore } from '../src/renderer/src/stores/useLibrarySearchStore'
import type { FindInLibraryResponse, RelatedContentResponse } from '../src/types/library-search'

describe('useLibrarySearchStore', () => {
  const search = {
    findInLibrary: vi.fn(),
    related: vi.fn(),
    resolveResult: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('window', { api: { search } })
    useLibrarySearchStore.setState({
      isOpen: false,
      query: '',
      mode: 'normal',
      filters: {},
      response: null,
      relatedResponse: null,
      relatedAnchor: null,
      isLoading: false,
      isLoadingRelated: false,
      error: null,
      relatedError: null
    })
  })

  it('opens dialog with query and optionally submits', async () => {
    search.findInLibrary.mockResolvedValueOnce({
      query: 'docker',
      mode: 'normal',
      results: [],
      groups: [],
      coverage: { status: 'none', totalSources: 0, indexedSources: 0, missingSources: 0, percentage: 0 },
      semanticUsed: false,
      semanticUnavailable: false
    } satisfies FindInLibraryResponse)

    useLibrarySearchStore.getState().open('docker', true)

    expect(useLibrarySearchStore.getState().isOpen).toBe(true)
    expect(useLibrarySearchStore.getState().query).toBe('docker')
    expect(search.findInLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'docker', mode: 'normal' })
    )
  })

  it('updates filters and switches search modes', () => {
    useLibrarySearchStore.getState().setMode('hybrid')
    expect(useLibrarySearchStore.getState().mode).toBe('hybrid')

    useLibrarySearchStore.getState().updateFilters({
      courseId: 'course-1',
      contentTypes: ['pdf', 'code']
    })
    expect(useLibrarySearchStore.getState().filters).toEqual({
      courseId: 'course-1',
      contentTypes: ['pdf', 'code']
    })

    useLibrarySearchStore.getState().clearFilters()
    expect(useLibrarySearchStore.getState().filters).toEqual({})
  })

  it('loads related content for an anchor result', async () => {
    search.related.mockResolvedValueOnce({
      groups: [{ type: 'lessons', results: [] }],
      coverage: { status: 'completed', totalSources: 1, indexedSources: 1, missingSources: 0, percentage: 100 },
      semanticUsed: true,
      semanticUnavailable: false
    } satisfies RelatedContentResponse)

    const anchor = {
      id: 'item-1',
      chunkId: 'chunk-1',
      type: 'lesson' as const,
      title: 'Intro to Containers',
      excerpt: '...',
      courseId: 'course-1',
      courseTitle: 'Docker',
      sourceKind: 'transcript' as const,
      sourceId: 'lesson-1',
      locator: { startTime: 10, endTime: 20 },
      relevanceScore: 0.9,
      navigation: { type: 'lesson' as const, courseId: 'course-1', moduleId: 'module-1', lessonId: 'lesson-1' }
    }

    await useLibrarySearchStore.getState().loadRelated(anchor)

    expect(search.related).toHaveBeenCalledWith(
      expect.objectContaining({
        anchor: {
          chunkId: 'chunk-1',
          courseId: 'course-1',
          moduleId: undefined,
          lessonId: undefined,
          resourceId: undefined
        }
      })
    )
    expect(useLibrarySearchStore.getState().relatedAnchor).toEqual(anchor)
    expect(useLibrarySearchStore.getState().relatedResponse?.groups).toHaveLength(1)
  })

  it('handles API errors gracefully', async () => {
    search.findInLibrary.mockRejectedValueOnce(new Error('Network error'))

    await useLibrarySearchStore.getState().submit('test')

    expect(useLibrarySearchStore.getState().isLoading).toBe(false)
    expect(useLibrarySearchStore.getState().error).toBe('Network error')
  })
})
