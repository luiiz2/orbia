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
}

/**
 * Media types supported by Orbia
 */
export type MediaType = 'video' | 'audio' | 'pdf' | 'document'

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
  createdAt: number
  subtitles?: SubtitleTrack[]
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
}

export interface ProposedModule {
  id: string
  title: string
  folderPath?: string
  orderIndex: number
  lessons: ProposedLesson[]
}

export interface ProposedCourseStructure {
  suggestedTitle: string
  rootPath: string
  coverPath?: string
  modules: ProposedModule[]
  totalLessons: number
  totalFilesScanned: number
}
