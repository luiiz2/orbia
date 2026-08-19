import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useLibraryStore } from '../src/renderer/src/stores/useLibraryStore'
import { useNavigationStore } from '../src/renderer/src/stores/useNavigationStore'

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

    useNavigationStore.setState({
      currentView: 'home',
      selectedCourseId: null,
      isSidebarCollapsed: false,
      isImportModalOpen: false,
      isVaultModalOpen: false
    })
  })

  it('manages navigation state and views properly', () => {
    const { setView, navigateToCourse, navigateToPlayer, toggleSidebar } =
      useNavigationStore.getState()

    navigateToCourse('course-123')
    expect(useNavigationStore.getState().currentView).toBe('course')
    expect(useNavigationStore.getState().selectedCourseId).toBe('course-123')

    navigateToPlayer('course-123')
    expect(useNavigationStore.getState().currentView).toBe('player')

    toggleSidebar()
    expect(useNavigationStore.getState().isSidebarCollapsed).toBe(true)

    setView('settings')
    expect(useNavigationStore.getState().currentView).toBe('settings')
  })

  it('manages search query, filterStatus, and course state in useLibraryStore', () => {
    const { setSearchQuery, setFilterStatus, setActiveCourse, clearActiveCourse } =
      useLibraryStore.getState()

    expect(useLibraryStore.getState().filterStatus).toBe('all')
    setFilterStatus('in_progress')
    expect(useLibraryStore.getState().filterStatus).toBe('in_progress')

    setFilterStatus('favorites')
    expect(useLibraryStore.getState().filterStatus).toBe('favorites')

    setSearchQuery('Python Masterclass')
    expect(useLibraryStore.getState().searchQuery).toBe('Python Masterclass')

    const mockCourse = {
      id: 'c-1',
      title: 'Python Masterclass',
      slug: 'python-masterclass',
      sourceType: 'local-vault' as const,
      rootPath: '/path',
      totalDuration: 1200,
      moduleCount: 2,
      lessonCount: 4,
      isFavorite: false,
      createdAt: 1000,
      updatedAt: 1000
    }

    setActiveCourse(mockCourse)
    expect(useLibraryStore.getState().activeCourse?.title).toBe('Python Masterclass')

    clearActiveCourse()
    expect(useLibraryStore.getState().activeCourse).toBeNull()
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

