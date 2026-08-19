import { create } from 'zustand'
import type { Course, Module, Lesson, ProposedCourseStructure, CourseProgressSummary } from '@shared'

export interface CourseHierarchy {
  course: Course
  modules: (Module & { lessons: Lesson[] })[]
}

export interface LibraryState {
  courses: Course[]
  activeCourse: Course | null
  activeCourseHierarchy: CourseHierarchy | null
  progressSummaries: Record<string, CourseProgressSummary>
  searchQuery: string
  isLoading: boolean
  error: string | null

  // Actions
  fetchCourses: () => Promise<void>
  fetchCourseById: (id: string) => Promise<CourseHierarchy | null>
  importCourse: (
    proposal: ProposedCourseStructure,
    isExternal: boolean
  ) => Promise<{ success: boolean; course?: Course; error?: string }>
  deleteCourse: (id: string, deleteFiles: boolean) => Promise<{ success: boolean; error?: string }>
  setSearchQuery: (query: string) => void
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

  setSearchQuery: (searchQuery: string) => {
    set({ searchQuery })
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
