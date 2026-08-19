import type { Course, Module, Lesson, ProposedCourseStructure } from './course'
import type { Vault, AppSettings, VaultStats } from './vault'
import type { LessonProgress, WatchHistoryEntry, CourseProgressSummary } from './progress'
import type { LessonNote } from './notes'

export interface SelectedCourseSource {
  path: string
  name: string
  isZip: boolean
}

export interface ExtractProgressPayload {
  percent: number
  currentFile: string
}

/**
 * Typed IPC Bridge interface exposed to the Renderer process via window.api
 */
export interface OrbiaApi {
  // Vault operations
  vault: {
    create: (path: string, name: string) => Promise<{ success: boolean; vault?: Vault; error?: string }>
    open: (path: string) => Promise<{ success: boolean; vault?: Vault; error?: string }>
    delete: (path: string, deleteFiles: boolean) => Promise<{ success: boolean; error?: string }>
    getRecent: () => Promise<Vault[]>
    getCurrent: () => Promise<Vault | null>
    getStats: () => Promise<VaultStats>
    selectDirectory: () => Promise<string | null>
  }

  // Course scanning & management
  courses: {
    selectSource: () => Promise<SelectedCourseSource[] | null>
    selectZip: () => Promise<SelectedCourseSource[] | null>
    selectFolder: () => Promise<SelectedCourseSource[] | null>
    extractZip: (zipPath: string, deleteSourceArchive?: boolean) => Promise<{ success: boolean; extractedPath?: string; suggestedTitle?: string; error?: string }>
    scanFolder: (folderPath: string) => Promise<{ success: boolean; proposal?: ProposedCourseStructure; error?: string }>
    importCourse: (proposal: ProposedCourseStructure, isExternal: boolean) => Promise<{ success: boolean; course?: Course; error?: string }>
    importBatch: (items: { proposal: ProposedCourseStructure; isExternal: boolean }[]) => Promise<{ success: boolean; courses?: Course[]; error?: string }>
    mergeDuplicateCourses: () => Promise<import('./course').MergeCoursesResult>
    getImportHistory: () => Promise<import('./course').ImportHistoryEntry[]>
    recordImportHistory: (entry: Omit<import('./course').ImportHistoryEntry, 'id' | 'createdAt'>) => Promise<import('./course').ImportHistoryEntry>
    clearImportHistory: () => Promise<boolean>
    selectCoverImage: () => Promise<string | null>
    updateCourseCover: (courseId: string, coverPath: string) => Promise<{ success: boolean; error?: string }>
    updateLessonCover: (lessonId: string, coverPath: string) => Promise<{ success: boolean; error?: string }>
    list: () => Promise<Course[]>
    getById: (courseId: string) => Promise<{ course: Course; modules: (Module & { lessons: Lesson[] })[] } | null>
    delete: (courseId: string, deleteFiles: boolean) => Promise<{ success: boolean; error?: string }>
    toggleFavorite: (courseId: string) => Promise<boolean>
    convertSrtToVtt: (srtPath: string) => Promise<{ success: boolean; vttContent?: string; error?: string }>
    onExtractProgress: (callback: (progress: ExtractProgressPayload) => void) => () => void
  }

  // Player & Progress
  player: {
    saveProgress: (progress: { lessonId: string; courseId: string; currentTime: number; duration: number; completed: boolean }) => Promise<void>
    getProgress: (lessonId: string) => Promise<LessonProgress | null>
    getCourseProgress: (courseId: string) => Promise<CourseProgressSummary | null>
    getAllProgressSummaries: () => Promise<Record<string, CourseProgressSummary>>
    toggleLessonCompletion: (lessonId: string, courseId: string) => Promise<boolean>
    getWatchHistory: (limit?: number) => Promise<WatchHistoryEntry[]>
    addWatchHistory: (entry: Omit<WatchHistoryEntry, 'id' | 'watchedAt'>) => Promise<void>
    getLessonNotes: (lessonId: string) => Promise<LessonNote[]>
    addLessonNote: (note: { lessonId: string; courseId: string; timestampSeconds: number; content: string }) => Promise<LessonNote>
    updateLessonNote: (id: string, content: string) => Promise<boolean>
    deleteLessonNote: (id: string) => Promise<boolean>
    exportCourseNotes: (courseId: string) => Promise<string>
  }

  // App Settings
  settings: {
    get: () => Promise<AppSettings>
    set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
  }

  // System
  system: {
    getLocale: () => Promise<string>
  }
}
