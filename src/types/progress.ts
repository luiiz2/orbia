/**
 * Progress tracking and watch history types
 */
export interface LessonProgress {
  lessonId: string
  courseId: string
  currentTime: number // Playback position in seconds
  duration: number // Total duration in seconds
  completed: boolean
  updatedAt: number // Unix timestamp ms
}

export interface WatchHistoryEntry {
  id: string
  lessonId: string
  courseId: string
  lessonTitle: string
  courseTitle: string
  coverPath?: string
  lessonCoverPath?: string
  fileExtension?: string
  watchedAt: number // Unix timestamp ms
  duration: number // Session duration in seconds
  currentTime: number // Position at time of entry
}

export interface CourseProgressSummary {
  courseId: string
  totalLessons: number
  completedLessons: number
  percentage: number // 0 - 100
  lastPlayedLessonId?: string
  lastPlayedLessonTitle?: string
  lastPlayedAt?: number
  totalDuration: number
  remainingDuration: number
}

export interface ModuleProgressSummary {
  moduleId: string
  courseId: string
  totalLessons: number
  completedLessons: number
  percentage: number
}

export type { LessonNote } from './notes'

