import { create } from 'zustand'
import type { Course, Module, Lesson, ProposedCourseStructure, CourseProgressSummary } from '@shared'

export interface CourseHierarchy {
  course: Course
  modules: (Module & { lessons: Lesson[] })[]
}

export type CourseFilterStatus = 'all' | 'in_progress' | 'completed' | 'favorites'

export interface LibraryState {
  courses: Course[]
  activeCourse: Course | null
  activeCourseHierarchy: CourseHierarchy | null
  progressSummaries: Record<string, CourseProgressSummary>
  searchQuery: string
  filterStatus: 'all' | 'in_progress' | 'completed' | 'favorites'
  importHistory: import('@shared').ImportHistoryEntry[]
  isLoading: boolean
  error: string | null

  // Actions
  fetchCourses: () => Promise<void>
  fetchCourseById: (id: string) => Promise<CourseHierarchy | null>
  importCourse: (
    proposal: ProposedCourseStructure,
    isExternal: boolean
  ) => Promise<{ success: boolean; course?: Course; error?: string }>
  importBatch: (
    items: { proposal: ProposedCourseStructure; isExternal: boolean }[]
  ) => Promise<{ success: boolean; courses?: Course[]; error?: string }>
  mergeDuplicateCourses: () => Promise<import('@shared').MergeCoursesResult>
  fetchImportHistory: () => Promise<void>
  clearImportHistory: () => Promise<void>
  updateCourseCover: (courseId: string, coverPath: string) => Promise<boolean>
  updateLessonCover: (lessonId: string, coverPath: string) => Promise<boolean>
  deleteCourse: (id: string, deleteFiles: boolean) => Promise<{ success: boolean; error?: string }>
  toggleFavorite: (courseId: string) => Promise<boolean>
  setSearchQuery: (query: string) => void
  setFilterStatus: (status: 'all' | 'in_progress' | 'completed' | 'favorites') => void
  setActiveCourse: (course: Course | null) => void
  clearActiveCourse: () => void
  clearError: () => void
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  courses: [],
  activeCourse: null,
  activeCourseHierarchy: null,
  progressSummaries: {},
  searchQuery: '',
  filterStatus: 'all',
  importHistory: [],
  isLoading: false,
  error: null,

  fetchCourses: async () => {
    set({ isLoading: true, error: null })
    try {
      const [courses, progressSummaries] = await Promise.all([
        window.api.courses.list(),
        window.api.player.getAllProgressSummaries().catch(() => ({} as Record<string, CourseProgressSummary>))
      ])

      set({
        courses: courses || [],
        progressSummaries: progressSummaries || {},
        isLoading: false
      })
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      set({
        error: errorMessage,
        isLoading: false
      })
    }
  },

  fetchCourseById: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      const hierarchy = await window.api.courses.getById(id)
      if (hierarchy) {
        set({
          activeCourseHierarchy: hierarchy,
          activeCourse: hierarchy.course,
          isLoading: false
        })
        return hierarchy
      } else {
        set({
          activeCourseHierarchy: null,
          activeCourse: null,
          isLoading: false
        })
        return null
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      set({
        error: errorMessage,
        isLoading: false
      })
      return null
    }
  },

  importCourse: async (proposal: ProposedCourseStructure, isExternal: boolean) => {
    set({ isLoading: true, error: null })
    try {
      const res = await window.api.courses.importCourse(proposal, isExternal)
      if (res.success && res.course) {
        await get().fetchCourses()
        set({ isLoading: false, error: null })
        return res
      } else {
        const errorMsg = res.error || 'Failed to import course'
        set({ error: errorMsg, isLoading: false })
        return { success: false, error: errorMsg }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      set({ error: errorMsg, isLoading: false })
      return { success: false, error: errorMsg }
    }
  },

  importBatch: async (items: { proposal: ProposedCourseStructure; isExternal: boolean }[]) => {
    set({ isLoading: true, error: null })
    try {
      const res = await window.api.courses.importBatch(items)
      if (res.success && res.courses) {
        await get().fetchCourses()
        set({ isLoading: false, error: null })
        return res
      } else {
        const errorMsg = res.error || 'Failed to import courses in batch'
        set({ error: errorMsg, isLoading: false })
        return { success: false, error: errorMsg }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      set({ error: errorMsg, isLoading: false })
      return { success: false, error: errorMsg }
    }
  },

  mergeDuplicateCourses: async () => {
    set({ isLoading: true, error: null })
    try {
      const res = await window.api.courses.mergeDuplicateCourses()
      if (res.success) {
        await get().fetchCourses()
        set({ isLoading: false, error: null })
      } else {
        set({ isLoading: false, error: 'Falha ao unir cursos duplicados' })
      }
      return res
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      set({ error: errorMsg, isLoading: false })
      return {
        success: false,
        mergedGroupsCount: 0,
        removedCoursesCount: 0,
        deduplicatedLessonsCount: 0,
        details: []
      }
    }
  },

  fetchImportHistory: async () => {
    try {
      const history = await window.api.courses.getImportHistory()
      set({ importHistory: history || [] })
    } catch (err) {
      console.warn('Could not fetch import history:', err)
    }
  },

  clearImportHistory: async () => {
    try {
      await window.api.courses.clearImportHistory()
      set({ importHistory: [] })
    } catch (err) {
      console.warn('Could not clear import history:', err)
    }
  },

  updateCourseCover: async (courseId: string, coverPath: string) => {
    try {
      const res = await window.api.courses.updateCourseCover(courseId, coverPath)
      if (res.success) {
        // Optimistically update courses list and active course
        set((state) => ({
          courses: state.courses.map((c) => (c.id === courseId ? { ...c, coverPath } : c)),
          activeCourse:
            state.activeCourse?.id === courseId
              ? { ...state.activeCourse, coverPath }
              : state.activeCourse,
          activeCourseHierarchy:
            state.activeCourseHierarchy?.course.id === courseId
              ? {
                  ...state.activeCourseHierarchy,
                  course: { ...state.activeCourseHierarchy.course, coverPath }
                }
              : state.activeCourseHierarchy
        }))
        return true
      }
      return false
    } catch {
      return false
    }
  },

  updateLessonCover: async (lessonId: string, coverPath: string) => {
    try {
      const res = await window.api.courses.updateLessonCover(lessonId, coverPath)
      if (res.success) {
        // Optimistically update activeCourseHierarchy
        set((state) => {
          if (!state.activeCourseHierarchy) return state
          const updatedModules = state.activeCourseHierarchy.modules.map((mod) => ({
            ...mod,
            lessons: mod.lessons.map((l) => (l.id === lessonId ? { ...l, coverPath } : l))
          }))
          return {
            activeCourseHierarchy: {
              ...state.activeCourseHierarchy,
              modules: updatedModules
            }
          }
        })
        return true
      }
      return false
    } catch {
      return false
    }
  },

  deleteCourse: async (id: string, deleteFiles: boolean) => {
    set({ isLoading: true, error: null })
    try {
      const res = await window.api.courses.delete(id, deleteFiles)
      if (res.success) {
        const { activeCourse, courses, progressSummaries } = get()
        const updatedCourses = courses.filter((c) => c.id !== id)
        const updatedSummaries = { ...progressSummaries }
        delete updatedSummaries[id]

        set({
          courses: updatedCourses,
          progressSummaries: updatedSummaries,
          activeCourse: activeCourse?.id === id ? null : activeCourse,
          activeCourseHierarchy: activeCourse?.id === id ? null : get().activeCourseHierarchy,
          isLoading: false,
          error: null
        })
        return res
      } else {
        const errorMsg = res.error || 'Failed to delete course'
        set({ error: errorMsg, isLoading: false })
        return { success: false, error: errorMsg }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      set({ error: errorMsg, isLoading: false })
      return { success: false, error: errorMsg }
    }
  },

  toggleFavorite: async (courseId: string) => {
    const current = get().courses.find((c) => c.id === courseId) || get().activeCourse
    const newFavoriteState = current ? !current.isFavorite : true

    // Optimistically update courses, activeCourse, and activeCourseHierarchy
    set((state) => ({
      courses: state.courses.map((c) =>
        c.id === courseId ? { ...c, isFavorite: newFavoriteState } : c
      ),
      activeCourse:
        state.activeCourse?.id === courseId
          ? { ...state.activeCourse, isFavorite: newFavoriteState }
          : state.activeCourse,
      activeCourseHierarchy:
        state.activeCourseHierarchy?.course.id === courseId
          ? {
              ...state.activeCourseHierarchy,
              course: { ...state.activeCourseHierarchy.course, isFavorite: newFavoriteState }
            }
          : state.activeCourseHierarchy
    }))

    try {
      const actualFavoriteState = await window.api.courses.toggleFavorite(courseId)
      if (actualFavoriteState !== newFavoriteState) {
        set((state) => ({
          courses: state.courses.map((c) =>
            c.id === courseId ? { ...c, isFavorite: actualFavoriteState } : c
          ),
          activeCourse:
            state.activeCourse?.id === courseId
              ? { ...state.activeCourse, isFavorite: actualFavoriteState }
              : state.activeCourse,
          activeCourseHierarchy:
            state.activeCourseHierarchy?.course.id === courseId
              ? {
                  ...state.activeCourseHierarchy,
                  course: { ...state.activeCourseHierarchy.course, isFavorite: actualFavoriteState }
                }
              : state.activeCourseHierarchy
        }))
      }
      return actualFavoriteState
    } catch {
      // Revert on error
      set((state) => ({
        courses: state.courses.map((c) =>
          c.id === courseId ? { ...c, isFavorite: !newFavoriteState } : c
        ),
        activeCourse:
          state.activeCourse?.id === courseId
            ? { ...state.activeCourse, isFavorite: !newFavoriteState }
            : state.activeCourse,
        activeCourseHierarchy:
          state.activeCourseHierarchy?.course.id === courseId
            ? {
                ...state.activeCourseHierarchy,
                course: { ...state.activeCourseHierarchy.course, isFavorite: !newFavoriteState }
              }
            : state.activeCourseHierarchy
      }))
      return false
    }
  },

  setSearchQuery: (searchQuery: string) => {
    set({ searchQuery })
  },

  setFilterStatus: (filterStatus: 'all' | 'in_progress' | 'completed' | 'favorites') => {
    set({ filterStatus })
  },

  setActiveCourse: (course: Course | null) => {
    set({ activeCourse: course })
  },

  clearActiveCourse: () => {
    set({ activeCourse: null, activeCourseHierarchy: null })
  },

  clearError: () => {
    set({ error: null })
  }
}))
