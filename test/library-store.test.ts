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

  it('manages search query and course state in useLibraryStore', () => {
    const { setSearchQuery, setActiveCourse, clearActiveCourse } = useLibraryStore.getState()

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
      createdAt: 1000,
      updatedAt: 1000
    }

    setActiveCourse(mockCourse)
    expect(useLibraryStore.getState().activeCourse?.title).toBe('Python Masterclass')

    clearActiveCourse()
    expect(useLibraryStore.getState().activeCourse).toBeNull()
  })
})
