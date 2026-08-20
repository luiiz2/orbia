/**
 * Content source provider and availability abstractions.
 * Decouples course structure from physical local/cloud storage.
 */
export type ContentSourceType = 'local-vault' | 'local-ref' | 'google-drive' | 'custom'

export type AvailabilityState = 'local' | 'remote-only' | 'cached' | 'downloading' | 'offline-ready'

export interface ContentSource {
  id: string
  type: ContentSourceType
  rootIdentifier: string // Vault relative path, absolute path, or remote drive folder ID
  displayName?: string
  isAvailable: boolean
}

/**
 * Core Course Entity
 */
export interface Course {
  id: string // Stable UUID
  title: string // Human-readable cleaned title
  slug: string
  sourceType: ContentSourceType
  rootPath: string // Physical path (or remote root identifier)
  coverPath?: string // Relative to vault or local file URL
  description?: string
  totalDuration: number // In seconds
  moduleCount: number
  lessonCount: number
  isFavorite?: boolean
  createdAt: number // Unix timestamp ms
  updatedAt: number
  lastAccessedAt?: number
}

/**
 * Module / Section within a Course
 */
export interface Module {
  id: string // Stable UUID
  courseId: string
  title: string
  orderIndex: number
  folderPath?: string
  duration: number // Sum of lesson durations in seconds
  lessonCount: number
  createdAt: number
  /** Materials that belong to the module rather than one specific lesson. */
  resources?: ContentResource[]
}

/**
 * Media types supported by Orbia
 */
export type MediaType = 'video' | 'audio' | 'pdf' | 'document' | 'image' | 'link' | 'archive' | 'other'

/**
 * Lesson Entity
 */
export interface Lesson {
  id: string // Stable UUID
  moduleId: string
  courseId: string
  title: string
  orderIndex: number
  filePath: string // Absolute path (or source-relative URI)
  fileName: string // Original physical filename (e.g. "01 - Intro.mp4")
  fileExtension: string
  mediaType: MediaType
  duration: number // Duration in seconds (0 until probed/played)
  fileSize: number // In bytes
  availability: AvailabilityState
  coverPath?: string // Thumbnail / cover image path
  createdAt: number
  /** Canonical persisted resources, including subtitle-role entries. */
  contentResources?: ContentResource[]
  subtitles?: SubtitleTrack[]
  /** Legacy lesson-material projection retained for current renderer consumers. */
  resources?: AttachedResource[]
}

export interface SubtitleTrack {
  id: string
  lessonId: string
  language: string // e.g. "pt-BR", "en"
  label: string
  filePath: string
  format: 'vtt' | 'srt'
}

export interface AttachedResource {
  id: string
  lessonId: string
  name: string
  filePath: string
  fileExtension: string
  fileSize: number
  type: 'pdf' | 'code' | 'archive' | 'document'
}

export type ContentResourceRole = 'resource' | 'subtitle'

/**
 * Canonical persisted material. A resource can belong to a module or to a
 * specific lesson; subtitles are represented by `role: 'subtitle'`.
 */
export interface ContentResource {
  id: string
  courseId: string
  moduleId: string
  lessonId?: string
  role: ContentResourceRole
  name: string
  filePath: string
  fileExtension: string
  fileSize: number
  type: AttachedResource['type'] | 'image' | 'other'
  language?: string
  label?: string
  createdAt: number
}

/**
 * Hierarchy structure proposal returned by the read-only scanner
 */
export interface ProposedLesson {
  id: string
  title: string
  originalFileName: string
  filePath: string
  fileExtension: string
  mediaType: MediaType
  fileSize: number
  orderIndex: number
  duration?: number
  coverPath?: string // Thumbnail / cover image path
  fingerprint?: string // Content fingerprint from scanner
  /** Materials attached to this proposed lesson; ownership IDs are assigned on commit. */
  contentResources?: ProposedContentResource[]
}

/**
 * Read-only resource discovered during scanning. It intentionally has no
 * persisted ownership IDs: the import commit materializes those from the
 * surrounding proposed module and lesson.
 */
export interface ProposedContentResource {
  /** Proposal-local identity used by preview editing; not a persisted resource ID. */
  id: string
  name: string
  filePath: string
  fileExtension: string
  fileSize: number
  type: ContentResource['type']
  role: ContentResourceRole
  language?: string
  label?: string
  fingerprint?: string
}

export interface ProposedModule {
  id: string
  title: string
  folderPath?: string
  orderIndex: number
  duration?: number
  lessons: ProposedLesson[]
  /** Materials that belong to the module rather than a specific lesson. */
  resources?: ProposedContentResource[]
}

/**
 * Candidate repeated file detected during scan. Candidates stay in the
 * proposal; the user decides whether any later deduplication is appropriate.
 */
export interface DuplicateFile {
  fileName: string
  fileSize: number
  count: number
  paths: string[]
}

export interface ProposedCourseStructure {
  suggestedTitle: string
  rootPath: string
  coverPath?: string
  totalDuration?: number
  modules: ProposedModule[]
  totalLessons: number
  totalFilesScanned: number
  duplicates?: DuplicateFile[]
}

export interface MergeCoursesResult {
  success: boolean
  mergedGroupsCount: number
  removedCoursesCount: number
  deduplicatedLessonsCount: number
  details: Array<{
    title: string
    canonicalCourseId: string
    mergedCoursesCount: number
    totalModules: number
    totalLessons: number
    removedDuplicateLessons: number
  }>
}

/**
 * Read-only proposal for a user-reviewed course merge. It describes what a
 * later commit may do; it never authorizes deletion or a duplicate decision.
 */
export interface MergePreview {
  canonicalCourseId: string
  canonicalCourseTitle: string
  selectedCourseIds: string[]
  totalLessons: number
  totalMaterials: number
  modules: MergePreviewModule[]
  duplicateCandidates: MergeDuplicateCandidate[]
}

export interface MergePreviewModule {
  sourceCourseId: string
  sourceModuleId: string
  title: string
  action: 'merge' | 'create'
  /** Existing or planned target module; omitted only for a new module. */
  targetModuleId?: string
  lessonCount: number
  materialCount: number
}

/** A possible duplicate lesson for user review, not an instruction to remove it. */
export interface MergeDuplicateCandidate {
  sourceCourseId: string
  sourceModuleId: string
  sourceLessonId: string
  targetCourseId: string
  targetModuleId: string
  targetLessonId: string
  reason: 'same-title' | 'same-file-name' | 'same-file-path'
}

export interface ImportHistoryEntry {
  id: string
  fileName: string
  filePath: string
  fileSize: number
  status: 'completed' | 'failed' | 'in_progress'
  courseId?: string
  courseTitle?: string
  extractedFiles: number
  createdAt: number
  errorDetails?: string
}
