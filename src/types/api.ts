import type { Course, Module, Lesson, ProposedCourseStructure } from './course'
import type { Vault, AppSettings, VaultStats } from './vault'
import type { LessonProgress, WatchHistoryEntry, CourseProgressSummary } from './progress'

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
    getRecent: () => Promise<Vault[]>
    getCurrent: () => Promise<Vault | null>
    getStats: () => Promise<VaultStats>
    selectDirectory: () => Promise<string | null>
  }

  // Course scanning & management
  courses: {
    selectSource: () => Promise<SelectedCourseSource | null>
    selectZip: () => Promise<SelectedCourseSource | null>
    selectFolder: () => Promise<SelectedCourseSource | null>
    extractZip: (zipPath: string) => Promise<{ success: boolean; extractedPath?: string; suggestedTitle?: string; error?: string }>
    scanFolder: (folderPath: string) => Promise<{ success: boolean; proposal?: ProposedCourseStructure; error?: string }>
    importCourse: (proposal: ProposedCourseStructure, isExternal: boolean) => Promise<{ success: boolean; course?: Course; error?: string }>
    list: () => Promise<Course[]>
    getById: (courseId: string) => Promise<{ course: Course; modules: (Module & { lessons: Lesson[] })[] } | null>
    delete: (courseId: string, deleteFiles: boolean) => Promise<{ success: boolean; error?: string }>
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
