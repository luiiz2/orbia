import { useMemo } from 'react'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useLibraryStore } from '../stores/useLibraryStore'
import type { Module, Lesson, LessonProgress, CourseProgressSummary } from '@shared'

export interface ModuleProgressInfo {
  moduleId: string
  totalLessons: number
  completedLessons: number
  percentage: number
  duration: number
  remainingDuration: number
}

export interface CourseProgressResult {
  coursePercentage: number
  completedLessons: number
  totalLessons: number
  totalDuration: number
  remainingDuration: number
  isCompleted: boolean
  moduleProgress: Record<string, ModuleProgressInfo>
  getLessonProgress: (lessonId: string) => LessonProgress | undefined
  isLessonCompleted: (lessonId: string) => boolean
}

export interface UseCourseProgressOptions {
  courseId?: string
  modules?: (Module & { lessons: Lesson[] })[]
}

export interface CalculateProgressParams {
  modules?: (Module & { lessons: Lesson[] })[]
  progressMap?: Record<string, LessonProgress>
  summary?: CourseProgressSummary | null
}

/**
 * Pure calculation function for course and module progression.
 */
export function calculateProgressDetails(params: CalculateProgressParams): CourseProgressResult {
  const { modules, progressMap = {}, summary } = params

  if (!modules || modules.length === 0) {
    if (summary) {
      return {
        coursePercentage: summary.percentage,
        completedLessons: summary.completedLessons,
        totalLessons: summary.totalLessons,
        totalDuration: summary.totalDuration,
        remainingDuration: summary.remainingDuration,
        isCompleted: summary.percentage >= 100,
        moduleProgress: {},
        getLessonProgress: () => undefined,
        isLessonCompleted: () => false
      }
    }

    return {
      coursePercentage: 0,
      completedLessons: 0,
      totalLessons: 0,
      totalDuration: 0,
      remainingDuration: 0,
      isCompleted: false,
      moduleProgress: {},
      getLessonProgress: () => undefined,
      isLessonCompleted: () => false
    }
  }

  let totalLessons = 0
  let completedLessons = 0
  let totalDuration = 0
  let remainingDuration = 0
  const moduleProgress: Record<string, ModuleProgressInfo> = {}

  for (const mod of modules) {
    const lessons = mod.lessons || []
    let modCompleted = 0
    let modDuration = 0
    let modRemaining = 0

    for (const lesson of lessons) {
      totalLessons++
      const progress = progressMap[lesson.id]
      const lessonDuration = lesson.duration || progress?.duration || 0
      modDuration += lessonDuration
      totalDuration += lessonDuration

      const isComplete =
        progress?.completed ||
        (lessonDuration > 0 &&
          progress?.currentTime !== undefined &&
          progress.currentTime / lessonDuration >= 0.9)

      if (isComplete) {
        completedLessons++
        modCompleted++
      } else {
        const watched = progress?.currentTime || 0
        const left = Math.max(0, lessonDuration - watched)
        modRemaining += left
        remainingDuration += left
      }
    }

    const modTotal = lessons.length
    const modPercentage = modTotal > 0 ? Math.round((modCompleted / modTotal) * 100) : 0

    moduleProgress[mod.id] = {
      moduleId: mod.id,
      totalLessons: modTotal,
      completedLessons: modCompleted,
      percentage: modPercentage,
      duration: modDuration,
      remainingDuration: modRemaining
    }
  }

  const coursePercentage = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
  const isCompleted = totalLessons > 0 && completedLessons === totalLessons

  const getLessonProgress = (lessonId: string): LessonProgress | undefined => {
    return progressMap[lessonId]
  }

  const isLessonCompleted = (lessonId: string): boolean => {
    const p = progressMap[lessonId]
    if (p?.completed) return true
    if (p && p.duration > 0 && p.currentTime / p.duration >= 0.9) return true
    return false
  }

  return {
    coursePercentage,
    completedLessons,
    totalLessons,
    totalDuration,
    remainingDuration,
    isCompleted,
    moduleProgress,
    getLessonProgress,
    isLessonCompleted
  }
}

/**
 * Custom hook to compute course and module progress, completion percentages,
 * and remaining durations based on the active player state or library store.
 */
export function useCourseProgress(options?: UseCourseProgressOptions): CourseProgressResult {
  const playerModules = usePlayerStore((s) => s.modulesWithLessons)
  const playerProgressMap = usePlayerStore((s) => s.progressMap)
  const activePlayerCourse = usePlayerStore((s) => s.activeCourse)

  const libraryHierarchy = useLibraryStore((s) => s.activeCourseHierarchy)
  const progressSummaries = useLibraryStore((s) => s.progressSummaries)

  return useMemo(() => {
    // Determine which modules and course we are computing for
    let targetModules = options?.modules
    let courseId = options?.courseId

    if (!targetModules) {
      if (courseId && libraryHierarchy?.course.id === courseId) {
        targetModules = libraryHierarchy.modules
      } else if (!courseId && playerModules.length > 0) {
        targetModules = playerModules
        courseId = activePlayerCourse?.id
      } else if (libraryHierarchy?.modules) {
        targetModules = libraryHierarchy.modules
        courseId = libraryHierarchy.course.id
      } else {
        targetModules = playerModules
        courseId = activePlayerCourse?.id
      }
    }

    const summary = courseId ? progressSummaries[courseId] : undefined

    return calculateProgressDetails({
      modules: targetModules,
      progressMap: playerProgressMap,
      summary
    })
  }, [
    options?.courseId,
    options?.modules,
    playerModules,
    playerProgressMap,
    activePlayerCourse,
    libraryHierarchy,
    progressSummaries
  ])
}
