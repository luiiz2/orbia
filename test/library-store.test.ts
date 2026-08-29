import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useLibraryStore } from '../src/renderer/src/stores/useLibraryStore'

describe('Zustand Stores', () => {
  beforeEach(() => {
    // Reset stores
    useLibraryStore.setState({
      courses: [],
      activeCourse: null,
      activeCourseHierarchy: null,
      progressSummaries: {},
      searchQuery: '',
      isLoading: false,
      error: null
    })
  })

  it('toggles course favorite optimistically and calls window.api.courses.toggleFavorite', async () => {
    const mockCourse = {
      id: 'c-fav-1',
      title: 'Rust Programming',
      slug: 'rust-programming',
      sourceType: 'local-vault' as const,
      rootPath: '/path',
      totalDuration: 1200,
      moduleCount: 2,
      lessonCount: 4,
      isFavorite: false,
      createdAt: 1000,
      updatedAt: 1000
    }

    // Mock global window and API
    ;(global as any).window = {
      api: {
        courses: {
          toggleFavorite: vi.fn().mockResolvedValue(true)
        }
      }
    }

    useLibraryStore.setState({
      courses: [mockCourse],
      activeCourse: mockCourse,
      activeCourseHierarchy: {
        course: mockCourse,
        modules: []
      }
    })

    const { toggleFavorite } = useLibraryStore.getState()
    const result = await toggleFavorite('c-fav-1')

    expect(result).toBe(true)
    expect(window.api.courses.toggleFavorite).toHaveBeenCalledWith('c-fav-1')

    const state = useLibraryStore.getState()
    expect(state.courses[0].isFavorite).toBe(true)
    expect(state.activeCourse?.isFavorite).toBe(true)
    expect(state.activeCourseHierarchy?.course.isFavorite).toBe(true)
  })
})
