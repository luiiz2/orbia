import { create } from 'zustand'
import type { Course, Module, Lesson, LessonProgress, ProposedCourseStructure, CourseProgressSummary } from '@shared'

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
  courseProgressMap: Record<string, Record<string, LessonProgress>>
  searchQuery: string
  filterStatus: 'all' | 'in_progress' | 'completed' | 'favorites'
  importHistory: import('@shared').ImportHistoryEntry[]
  isLoading: boolean
  error: string | null

  // Actions
  fetchCourses: () => Promise<void>
  fetchCourseById: (id: string) => Promise<CourseHierarchy | null>
  fetchCourseProgress: (id: string) => Promise<void>
  importCourse: (
    proposal: ProposedCourseStructure,
    isExternal: boolean
  ) => Promise<{ success: boolean; course?: Course; error?: string }>
  importBatch: (
    items: { proposal: ProposedCourseStructure; isExternal: boolean }[]
  ) => Promise<{ success: boolean; courses?: Course[]; error?: string }>
  fetchImportHistory: () => Promise<void>
  clearImportHistory: () => Promise<void>
  updateCourseCover: (courseId: string, coverPath: string) => Promise<boolean>
  updateLessonCover: (lessonId: string, coverPath: string) => Promise<boolean>
  deleteCourse: (id: string, deleteFiles: boolean) => Promise<{ success: boolean; error?: string }>
  deleteLesson: (lessonId: string, deleteFileFromDisk?: boolean) => Promise<{ success: boolean; error?: string }>
  updateCourseMetadata: (courseId: string, customTitle: string) => Promise<void>
  updateModuleMetadata: (moduleId: string, customTitle: string) => Promise<void>
  updateLessonMetadata: (lessonId: string, customTitle: string) => Promise<void>
  reorderModule: (moduleId: string, direction: 'up' | 'down') => Promise<void>
  reorderLesson: (lessonId: string, direction: 'up' | 'down') => Promise<void>
  toggleLessonFavorite: (lessonId: string) => Promise<boolean>
  toggleModuleCompletion: (moduleId: string, courseId: string) => Promise<void>
  searchGlobal: (query: string) => Promise<import('@shared').SearchResultItem[]>
  
  courseHealth: import('@shared').CourseHealthReport | null
  fetchCourseHealth: (courseId: string) => Promise<import('@shared').CourseHealthReport | null>
  fixCourseProblems: (courseId: string) => Promise<{ success: boolean; fixedCount: number; removedCount: number; error?: string }>
  autoOrganizeLibrary: () => Promise<import('@shared').AutoOrganizeResult>
  separateMistakenlyMergedCourses: () => Promise<import('@shared').SeparateCoursesResult>
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
  courseProgressMap: {},
  courseHealth: null,
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

  fetchCourseProgress: async (id: string) => {
    try {
      const rows = await window.api.player.getLessonsProgress(id)
      const map: Record<string, LessonProgress> = {}
      for (const row of rows) {
        map[row.lessonId] = row
      }
      set((state) => ({
        courseProgressMap: { ...state.courseProgressMap, [id]: map }
      }))
    } catch (err: unknown) {
      console.error('Failed to fetch course progress:', err)
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

  deleteLesson: async (lessonId: string, deleteFileFromDisk = false) => {
    try {
      const res = await window.api.courses.deleteLesson(lessonId, deleteFileFromDisk)
      if (res.success) {
        const { activeCourseHierarchy } = get()
        if (activeCourseHierarchy) {
          await get().fetchCourseById(activeCourseHierarchy.course.id)
          await get().fetchCourseHealth(activeCourseHierarchy.course.id)
        }
        return res
      } else {
        return { success: false, error: res.error || 'Failed to delete lesson' }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      return { success: false, error: errorMsg }
    }
  },

  fetchCourseHealth: async (courseId: string) => {
    try {
      const health = await window.api.courses.getCourseHealth(courseId)
      set({ courseHealth: health })
      return health
    } catch (err) {
      console.warn('Could not fetch course health:', err)
      return null
    }
  },

  fixCourseProblems: async (courseId: string) => {
    try {
      set({ isLoading: true })
      const res = await window.api.courses.fixCourseProblems(courseId)
      if (res.success) {
        await get().fetchCourseById(courseId)
        await get().fetchCourseHealth(courseId)
        await get().fetchCourseProgress(courseId)
        await get().fetchCourses()
      }
      set({ isLoading: false })
      return res
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      set({ isLoading: false, error: errorMsg })
      return { success: false, fixedCount: 0, removedCount: 0, error: errorMsg }
    }
  },

  autoOrganizeLibrary: async () => {
    try {
      set({ isLoading: true, error: null })
      const res = await window.api.courses.autoOrganize()
      await get().fetchCourses()
      const active = get().activeCourse
      if (active) {
        await get().fetchCourseById(active.id)
      }
      set({ isLoading: false })
      return res
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      set({ isLoading: false, error: errorMsg })
      return {
        success: false,
        separatedCoursesCount: 0,
        mergedGroupsCount: 0,
        deduplicatedModulesCount: 0,
        reindexedCoursesCount: 0,
        details: [{ action: 'separated', message: errorMsg }]
      }
    }
  },

  separateMistakenlyMergedCourses: async () => {
    try {
      set({ isLoading: true, error: null })
      const res = await window.api.courses.separateMistakenlyMergedCourses()
      await get().fetchCourses()
      const active = get().activeCourse
      if (active) {
        await get().fetchCourseById(active.id)
      }
      set({ isLoading: false })
      return res
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      set({ isLoading: false, error: errorMsg })
      return {
        separatedCoursesCount: 0,
        createdCoursesCount: 0,
        details: []
      }
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

  updateCourseMetadata: async (courseId: string, customTitle: string) => {
    try {
      const res = await window.api.courses.updateMetadata({ courseId, customTitle })
      if (res.success) {
        set((state) => ({
          courses: state.courses.map((c) => (c.id === courseId ? { ...c, customTitle } : c)),
          activeCourse:
            state.activeCourse?.id === courseId
              ? { ...state.activeCourse, customTitle }
              : state.activeCourse,
          activeCourseHierarchy:
            state.activeCourseHierarchy?.course.id === courseId
              ? {
                  ...state.activeCourseHierarchy,
                  course: { ...state.activeCourseHierarchy.course, customTitle }
                }
              : state.activeCourseHierarchy
        }))
      }
    } catch (err) {
      console.error('Failed to update course metadata:', err)
    }
  },

  updateModuleMetadata: async (moduleId: string, customTitle: string) => {
    try {
      const res = await window.api.courses.updateModuleMetadata({ moduleId, customTitle })
      if (res.success) {
        set((state) => {
          if (!state.activeCourseHierarchy) return state
          return {
            activeCourseHierarchy: {
              ...state.activeCourseHierarchy,
              modules: state.activeCourseHierarchy.modules.map(m =>
                m.id === moduleId ? { ...m, customTitle } : m
              )
            }
          }
        })
      }
    } catch (err) {
      console.error('Failed to update module metadata:', err)
    }
  },

  updateLessonMetadata: async (lessonId: string, customTitle: string) => {
    try {
      const res = await window.api.courses.updateLessonMetadata({ lessonId, customTitle })
      if (res.success) {
        set((state) => {
          if (!state.activeCourseHierarchy) return state
          return {
            activeCourseHierarchy: {
              ...state.activeCourseHierarchy,
              modules: state.activeCourseHierarchy.modules.map(m => ({
                ...m,
                lessons: m.lessons.map(l =>
                  l.id === lessonId ? { ...l, customTitle } : l
                )
              }))
            }
          }
        })
      }
    } catch (err) {
      console.error('Failed to update lesson metadata:', err)
    }
  },

  reorderModule: async (moduleId: string, direction: 'up' | 'down') => {
    try {
      const res = await window.api.courses.reorderModule(moduleId, direction)
      if (res.success) {
        const { activeCourse } = get()
        if (activeCourse) {
          await get().fetchCourseById(activeCourse.id)
        }
      }
    } catch (err) {
      console.error('Failed to reorder module:', err)
    }
  },

  reorderLesson: async (lessonId: string, direction: 'up' | 'down') => {
    try {
      const res = await window.api.courses.reorderLesson(lessonId, direction)
      if (res.success) {
        const { activeCourse } = get()
        if (activeCourse) {
          await get().fetchCourseById(activeCourse.id)
        }
      }
    } catch (err) {
      console.error('Failed to reorder lesson:', err)
    }
  },

  toggleLessonFavorite: async (lessonId: string) => {
    try {
      const newState = await window.api.courses.toggleLessonFavorite(lessonId)
      set((state) => {
        if (!state.activeCourseHierarchy) return state
        return {
          activeCourseHierarchy: {
            ...state.activeCourseHierarchy,
            modules: state.activeCourseHierarchy.modules.map(m => ({
              ...m,
              lessons: m.lessons.map(l =>
                l.id === lessonId ? { ...l, isFavorite: newState } : l
              )
            }))
          }
        }
      })
      return newState
    } catch (err) {
      console.error('Failed to toggle lesson favorite:', err)
      return false
    }
  },

  toggleModuleCompletion: async (moduleId: string, courseId: string) => {
    try {
      const res = await window.api.courses.toggleModuleCompletion(moduleId, courseId)
      if (res.success) {
        await Promise.all([
          get().fetchCourseProgress(courseId),
          window.api.player.getAllProgressSummaries().then(summaries => {
            set({ progressSummaries: summaries || {} })
          }).catch(() => {})
        ])
      }
    } catch (err) {
      console.error('Failed to toggle module completion:', err)
    }
  },

  searchGlobal: async (query: string) => {
    try {
      return await window.api.courses.searchGlobal(query)
    } catch (err) {
      console.error('Global search failed:', err)
      return []
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
