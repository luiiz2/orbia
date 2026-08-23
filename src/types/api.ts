import type { ContentResource, Course, MediaType, MergePreview, Module, Lesson, ProposedCourseStructure } from './course'
import type { Vault, AppSettings, VaultStats } from './vault'
import type { LessonProgress, WatchHistoryEntry, CourseProgressSummary } from './progress'
import type { LessonNote } from './notes'

export interface SelectedCourseSource {
  path: string
  name: string
  isZip: boolean
}

export interface SearchResultItem {
  type: 'course' | 'module' | 'lesson'
  id: string
  title: string
  courseId: string
  courseTitle: string
  moduleId?: string
  moduleTitle?: string
}

/**
 * Opaque capability returned by a native source picker. The absolute source
 * path stays in the Main process and is consumed exactly once during prepare.
 */
export interface ImportSourceCapability {
  token: string
  name: string
  isZip: boolean
}

export interface PrepareImportSourceInput {
  token: string
}

export interface ExtractProgressPayload {
  percent: number
  currentFile: string
}

/**
 * Public, opaque import-session source kind. The Main process owns all
 * temporary staging details for ZIP sessions.
 */
export type ImportSessionSourceKind = 'zip' | 'folder'

/**
 * Result of the strict source validation performed before an import preview.
 */
export interface ImportSessionValidation {
  verificationOk: boolean
  /** File names only; never a source or staging path. */
  failedEntries: string[]
  warnings: string[]
  extractedFiles: number
}

/** A path-free material representation safe for the Renderer preview. */
export interface ImportSessionResourcePreview {
  id: string
  name: string
  fileExtension: string
  fileSize: number
  type: ContentResource['type']
  role: ContentResource['role']
  language?: string
  label?: string
}

/** A path-free lesson representation safe for the Renderer preview. */
export interface ImportSessionLessonPreview {
  id: string
  title: string
  originalFileName: string
  fileExtension: string
  mediaType: MediaType
  fileSize: number
  orderIndex: number
  duration?: number
  contentResources: ImportSessionResourcePreview[]
}

/** A path-free module representation safe for the Renderer preview. */
export interface ImportSessionModulePreview {
  id: string
  title: string
  orderIndex: number
  duration?: number
  resources: ImportSessionResourcePreview[]
  lessons: ImportSessionLessonPreview[]
}

/** Duplicate metadata intentionally omits the source paths. */
export interface ImportSessionDuplicatePreview {
  fileName: string
  fileSize: number
  count: number
}

/**
 * Sanitized, renderer-safe view of the Main-owned proposal. Physical paths,
 * cover paths and duplicate locations deliberately never cross the bridge.
 */
export interface ImportSessionPreview {
  suggestedTitle: string
  totalDuration?: number
  totalLessons: number
  totalFilesScanned: number
  modules: ImportSessionModulePreview[]
  duplicates?: ImportSessionDuplicatePreview[]
}

/**
 * Data safe to return to the Renderer after preparing an import. `sessionId`
 * is an opaque capability; no staging path is exposed through this contract.
 */
export interface ImportSessionPreparation {
  sessionId: string
  sourceKind: ImportSessionSourceKind
  suggestedTitle: string
  preview?: ImportSessionPreview
  validation: ImportSessionValidation
}

export type PrepareImportSessionResult =
  | ({ success: true } & ImportSessionPreparation)
  | { success: false; error: string }

export interface ImportSessionTitleEdit {
  id: string
  title: string
}

/** The only proposal changes accepted after preview. */
export interface ImportSessionTitleEdits {
  courseTitle?: string
  modules?: ImportSessionTitleEdit[]
  lessons?: ImportSessionTitleEdit[]
}

/**
 * Opaque session commit. Paths and raw proposals are Main-owned and cannot be
 * supplied by the Renderer.
 */
export interface CommitImportSessionInput {
  sessionId: string
  isExternal: boolean
  titleEdits?: ImportSessionTitleEdits
}

export type CommitImportSessionResult =
  | { success: true; course: Course; operationGroupId?: string; warnings?: string[] }
  | { success: false; error: string }

export type CancelImportSessionResult =
  | { success: true }
  | { success: false; error: string }

export type GetMergePreviewResult =
  | { success: true; preview: MergePreview }
  | { success: false; error: string }

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
    selectZip: () => Promise<ImportSourceCapability[] | null>
    selectFolder: () => Promise<ImportSourceCapability[] | null>
    selectMultiCourseFolder: () => Promise<{ path: string; name: string } | null>
    scanMultiCourseFolder: (folderPath: string) => Promise<{ success: boolean; proposals?: ProposedCourseStructure[]; error?: string }>
    prepareZipImport: (input: PrepareImportSourceInput) => Promise<PrepareImportSessionResult>
    prepareFolderImport: (input: PrepareImportSourceInput) => Promise<PrepareImportSessionResult>
    cancelImportSession: (sessionId: string) => Promise<CancelImportSessionResult>
    commitImportSession: (input: CommitImportSessionInput) => Promise<CommitImportSessionResult>
    extractZip: (zipPath: string, deleteSourceArchive?: boolean) => Promise<{ success: boolean; extractedPath?: string; suggestedTitle?: string; error?: string }>
    scanFolder: (folderPath: string) => Promise<{ success: boolean; proposal?: ProposedCourseStructure; error?: string }>
    importCourse: (proposal: ProposedCourseStructure, isExternal: boolean) => Promise<{ success: boolean; course?: Course; error?: string }>
    importBatch: (items: { proposal: ProposedCourseStructure; isExternal: boolean }[]) => Promise<{ success: boolean; courses?: Course[]; error?: string }>
    getMergePreview: (courseIds: string[]) => Promise<GetMergePreviewResult>
    mergeCourses: (courseIds: string[]) => Promise<{ success: boolean; canonicalCourseId?: string; error?: string; mergedGroupsCount?: number; removedCoursesCount?: number }>
    getImportHistory: () => Promise<import('./course').ImportHistoryEntry[]>
    recordImportHistory: (entry: Omit<import('./course').ImportHistoryEntry, 'id' | 'createdAt'>) => Promise<import('./course').ImportHistoryEntry>
    clearImportHistory: () => Promise<boolean>
    selectCoverImage: () => Promise<string | null>
    updateCourseCover: (courseId: string, coverPath: string) => Promise<{ success: boolean; error?: string }>
    updateLessonCover: (lessonId: string, coverPath: string) => Promise<{ success: boolean; error?: string }>
    list: () => Promise<Course[]>
    getById: (courseId: string) => Promise<{ course: Course; modules: (Module & { lessons: Lesson[] })[] } | null>
    delete: (courseId: string, deleteFiles: boolean) => Promise<{ success: boolean; error?: string }>
    deleteLesson: (lessonId: string, deleteFileFromDisk?: boolean) => Promise<{ success: boolean; error?: string }>
    getCourseHealth: (courseId: string) => Promise<import('./course').CourseHealthReport>
    fixCourseProblems: (courseId: string) => Promise<{ success: boolean; fixedCount: number; removedCount: number; error?: string }>
    toggleFavorite: (courseId: string) => Promise<boolean>
    updateMetadata: (input: { courseId: string; customTitle?: string }) => Promise<{ success: boolean }>
    updateModuleMetadata: (input: { moduleId: string; customTitle?: string; displayOrder?: number }) => Promise<{ success: boolean }>
    updateLessonMetadata: (input: { lessonId: string; customTitle?: string; displayOrder?: number }) => Promise<{ success: boolean }>
    reorderModule: (moduleId: string, direction: 'up' | 'down') => Promise<{ success: boolean }>
    reorderLesson: (lessonId: string, direction: 'up' | 'down') => Promise<{ success: boolean }>
    toggleLessonFavorite: (lessonId: string) => Promise<boolean>
    toggleModuleCompletion: (moduleId: string, courseId: string) => Promise<{ success: boolean; affectedCount: number }>
    searchGlobal: (query: string) => Promise<SearchResultItem[]>
    updateLessonDuration: (lessonId: string, duration: number) => Promise<{ success: boolean; error?: string }>
    convertSrtToVtt: (srtPath: string) => Promise<{ success: boolean; vttContent?: string; error?: string }>
    getReorganizePlan: (courseId: string) => Promise<{ success: boolean; plan?: import('./journal').OperationPlan; error?: string }>
    applyReorganizePlan: (groupId: string, mutations: import('./journal').ProposedFileMutation[], courseId: string) => Promise<{ success: boolean; appliedCount?: number; error?: string }>
    undoReorganizePlan: (groupId: string) => Promise<{ success: boolean; revertedCount?: number; error?: string }>
    onExtractProgress: (callback: (progress: ExtractProgressPayload) => void) => () => void
  }

  // Player & Progress
  player: {
    saveProgress: (progress: { lessonId: string; courseId: string; currentTime: number; duration: number; completed: boolean }) => Promise<void>
    getProgress: (lessonId: string) => Promise<LessonProgress | null>
    getLessonsProgress: (courseId: string) => Promise<LessonProgress[]>
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
    getStudyAnalytics: (dailyGoalMinutes?: number) => Promise<import('./progress').StudyAnalytics>
  }

  // App Settings
  settings: {
    get: () => Promise<AppSettings>
    set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
  }

  // System
  system: {
    getLocale: () => Promise<string>
    openExternal: (url: string) => Promise<boolean>
    openPath: (filePath: string) => Promise<boolean>
    getPathForFile: (file: File) => string
  }
}
