/**
 * Orbia v0.3 — Review & Portability Domain Types
 */

export interface VideoBookmark {
  id: string
  courseId: string
  lessonId: string
  timestamp: number // Seconds in video
  title: string
  color?: string
  createdAt: number
  updatedAt: number
  // Hydrated metadata for display
  courseTitle?: string
  lessonTitle?: string
}

export type FlashcardState = 'NEW' | 'DUE' | 'LEARNING' | 'REVIEW'

export type FlashcardReviewGrade = 'AGAIN' | 'HARD' | 'GOOD'

export interface Flashcard {
  id: string
  courseId?: string
  moduleId?: string
  lessonId?: string
  timestamp?: number
  question: string
  answer: string
  state: FlashcardState
  dueAt: number // Unix timestamp ms
  intervalDays: number
  successCount: number
  createdAt: number
  updatedAt: number
  // Hydrated metadata for display
  courseTitle?: string
  lessonTitle?: string
}

export type StudyQueueEntityType = 'course' | 'module' | 'lesson'

export interface StudyQueueItem {
  id: string
  entityType: StudyQueueEntityType
  entityId: string
  orderIndex: number
  createdAt: number
  // Hydrated metadata for display
  title: string
  courseId?: string
  courseTitle?: string
  moduleTitle?: string
  duration?: number
  coverPath?: string
}

export interface CourseGoal {
  courseId: string
  targetDate?: number // Target completion Unix timestamp ms
  dailyMinutes?: number
  weeklyLessons?: number
  updatedAt: number
}

export interface StudySession {
  id: string
  courseId?: string
  startedAt: number
  endedAt?: number
  duration: number // In seconds
  source: 'player' | 'focus_timer'
}

export interface BackupManifest {
  format: 'orbia-backup'
  version: number
  appVersion: string
  createdAt: number
  vaultName: string
  courseCount: number
  notesCount: number
  flashcardsCount: number
  bookmarksCount: number
  includesCourseFiles: boolean
}

export interface BackupPreview {
  valid: boolean
  manifest?: BackupManifest
  filePath: string
  fileSizeBytes: number
  error?: string
}

export interface ReviewDashboardStats {
  dueFlashcardsCount: number
  totalFlashcardsCount: number
  bookmarksCount: number
  studyQueueCount: number
  recentNotesCount: number
  activeStreakDays: number
}
