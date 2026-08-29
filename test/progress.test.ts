import { describe, it, expect } from 'vitest'
import { calculateProgressDetails } from '../src/renderer/src/hooks/useCourseProgress'
import type { Module, Lesson, LessonProgress } from '../src/types'

describe('Course & Lesson Progress Calculations', () => {
  const mockLessonsM1: Lesson[] = [
    {
      id: 'l-1',
      moduleId: 'm-1',
      courseId: 'course-calc-1',
      title: 'Intro to Design',
      orderIndex: 1,
      filePath: '/m1/01.mp4',
      fileName: '01.mp4',
      fileExtension: 'mp4',
      mediaType: 'video',
      duration: 1000,
      fileSize: 10000,
      availability: 'local',
      createdAt: 1000
    },
    {
      id: 'l-2',
      moduleId: 'm-1',
      courseId: 'course-calc-1',
      title: 'Domain Modeling',
      orderIndex: 2,
      filePath: '/m1/02.mp4',
      fileName: '02.mp4',
      fileExtension: 'mp4',
      mediaType: 'video',
      duration: 1000,
      fileSize: 10000,
      availability: 'local',
      createdAt: 1000
    }
  ]

  const mockLessonsM2: Lesson[] = [
    {
      id: 'l-3',
      moduleId: 'm-2',
      courseId: 'course-calc-1',
      title: 'Event Driven Architecture',
      orderIndex: 1,
      filePath: '/m2/01.mp4',
      fileName: '01.mp4',
      fileExtension: 'mp4',
      mediaType: 'video',
      duration: 1000,
      fileSize: 10000,
      availability: 'local',
      createdAt: 1000
    },
    {
      id: 'l-4',
      moduleId: 'm-2',
      courseId: 'course-calc-1',
      title: 'Testing & QA',
      orderIndex: 2,
      filePath: '/m2/02.mp4',
      fileName: '02.mp4',
      fileExtension: 'mp4',
      mediaType: 'video',
      duration: 1000,
      fileSize: 10000,
      availability: 'local',
      createdAt: 1000
    }
  ]

  const mockModules: (Module & { lessons: Lesson[] })[] = [
    {
      id: 'm-1',
      courseId: 'course-calc-1',
      title: 'Module 1: Principles',
      orderIndex: 1,
      duration: 2000,
      lessonCount: 2,
      createdAt: 1000,
      lessons: mockLessonsM1
    },
    {
      id: 'm-2',
      courseId: 'course-calc-1',
      title: 'Module 2: Advanced',
      orderIndex: 2,
      duration: 2000,
      lessonCount: 2,
      createdAt: 1000,
      lessons: mockLessonsM2
    }
  ]

  it('calculates 0% progress when no lessons are watched', () => {
    const result = calculateProgressDetails({
      modules: mockModules,
      progressMap: {}
    })

    expect(result.coursePercentage).toBe(0)
    expect(result.completedLessons).toBe(0)
    expect(result.totalLessons).toBe(4)
    expect(result.totalDuration).toBe(4000)
    expect(result.remainingDuration).toBe(4000)
    expect(result.isCompleted).toBe(false)
    expect(result.isLessonCompleted('l-1')).toBe(false)
    expect(result.moduleProgress['m-1'].percentage).toBe(0)
    expect(result.moduleProgress['m-1'].remainingDuration).toBe(2000)
  })

  it('adheres to 90% threshold rule for automatic completion', () => {
    // Lesson duration is 1000s. 899s is 89.9% (< 90%), 900s is 90% (>= 90%)
    const progressMap: Record<string, LessonProgress> = {
      'l-1': {
        lessonId: 'l-1',
        courseId: 'course-calc-1',
        currentTime: 899,
        duration: 1000,
        completed: false,
        updatedAt: 1000
      },
      'l-2': {
        lessonId: 'l-2',
        courseId: 'course-calc-1',
        currentTime: 900,
        duration: 1000,
        completed: false,
        updatedAt: 1000
      }
    }

    const result = calculateProgressDetails({
      modules: mockModules,
      progressMap
    })

    // l-1 is not complete (89.9%), l-2 is complete (90%)
    expect(result.isLessonCompleted('l-1')).toBe(false)
    expect(result.isLessonCompleted('l-2')).toBe(true)

    // Module 1 has 1 of 2 completed (50%)
    expect(result.moduleProgress['m-1'].completedLessons).toBe(1)
    expect(result.moduleProgress['m-1'].percentage).toBe(50)

    // Module 1 remaining duration: l-1 remaining = 1000 - 899 = 101s, l-2 remaining = 0s
    expect(result.moduleProgress['m-1'].remainingDuration).toBe(101)

    // Course has 1 of 4 completed (25%)
    expect(result.completedLessons).toBe(1)
    expect(result.coursePercentage).toBe(25)
    expect(result.isCompleted).toBe(false)
  })

  it('respects manual completion flag even if currentTime is 0', () => {
    const progressMap: Record<string, LessonProgress> = {
      'l-1': {
        lessonId: 'l-1',
        courseId: 'course-calc-1',
        currentTime: 0,
        duration: 1000,
        completed: true,
        updatedAt: 1000
      }
    }

    const result = calculateProgressDetails({
      modules: mockModules,
      progressMap
    })

    expect(result.isLessonCompleted('l-1')).toBe(true)
    expect(result.completedLessons).toBe(1)
    expect(result.coursePercentage).toBe(25)
  })

  it('marks course 100% completed when all lessons are completed', () => {
    const fullProgress: Record<string, LessonProgress> = {
      'l-1': {
        lessonId: 'l-1',
        courseId: 'c1',
        currentTime: 1000,
        duration: 1000,
        completed: true,
        updatedAt: 1000
      },
      'l-2': {
        lessonId: 'l-2',
        courseId: 'c1',
        currentTime: 1000,
        duration: 1000,
        completed: true,
        updatedAt: 1000
      },
      'l-3': {
        lessonId: 'l-3',
        courseId: 'c1',
        currentTime: 1000,
        duration: 1000,
        completed: true,
        updatedAt: 1000
      },
      'l-4': {
        lessonId: 'l-4',
        courseId: 'c1',
        currentTime: 1000,
        duration: 1000,
        completed: true,
        updatedAt: 1000
      }
    }

    const result = calculateProgressDetails({
      modules: mockModules,
      progressMap: fullProgress
    })

    expect(result.coursePercentage).toBe(100)
    expect(result.completedLessons).toBe(4)
    expect(result.remainingDuration).toBe(0)
    expect(result.isCompleted).toBe(true)
    expect(result.moduleProgress['m-1'].percentage).toBe(100)
    expect(result.moduleProgress['m-2'].percentage).toBe(100)
  })

  it('retrieves summary from library store summary when modules are not loaded', () => {
    const summary = {
      courseId: 'course-calc-1',
      totalLessons: 10,
      completedLessons: 6,
      percentage: 60,
      totalDuration: 6000,
      remainingDuration: 2400
    }

    const result = calculateProgressDetails({
      modules: undefined,
      summary
    })

    expect(result.coursePercentage).toBe(60)
    expect(result.completedLessons).toBe(6)
    expect(result.totalLessons).toBe(10)
    expect(result.totalDuration).toBe(6000)
    expect(result.remainingDuration).toBe(2400)
    expect(result.isCompleted).toBe(false)
  })

  it('safely handles empty course with 0 lessons', () => {
    const result = calculateProgressDetails({
      modules: []
    })

    expect(result.coursePercentage).toBe(0)
    expect(result.completedLessons).toBe(0)
    expect(result.totalLessons).toBe(0)
    expect(result.totalDuration).toBe(0)
    expect(result.remainingDuration).toBe(0)
    expect(result.isCompleted).toBe(false)
  })
})
