import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { DatabaseService } from '../src/main/services/database.service'

describe('Study Analytics Engine', () => {
  let tempVaultDir: string
  let dbService: DatabaseService

  beforeEach(() => {
    tempVaultDir = path.join(os.tmpdir(), `orbia-analytics-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
    fs.mkdirSync(tempVaultDir, { recursive: true })
    dbService = new DatabaseService()
    dbService.connect(tempVaultDir)
  })

  afterEach(() => {
    dbService.close()
    try {
      fs.rmSync(tempVaultDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('returns zeroed analytics when vault has no watch history', () => {
    const analytics = dbService.getStudyAnalytics(30)
    expect(analytics.currentStreakDays).toBe(0)
    expect(analytics.longestStreakDays).toBe(0)
    expect(analytics.totalSecondsWatched).toBe(0)
    expect(analytics.totalLessonsCompleted).toBe(0)
    expect(analytics.todaySecondsWatched).toBe(0)
    expect(analytics.dailyGoalMinutes).toBe(30)
    expect(analytics.dailyHistory).toEqual([])
    expect(analytics.topCourses).toEqual([])
  })

  it('calculates streaks, total time, and daily breakdown correctly', () => {
    const now = new Date()
    const todayMs = now.getTime()
    const oneDayMs = 24 * 60 * 60 * 1000

    // Setup course and lessons
    dbService.saveCourseWithHierarchy(
      {
        id: 'c-ana-1',
        title: 'React Masterclass',
        slug: 'react-masterclass',
        sourceType: 'local-vault',
        rootPath: '/vault/Courses/React',
        totalDuration: 3600,
        moduleCount: 1,
        lessonCount: 3,
        createdAt: todayMs - 10 * oneDayMs,
        updatedAt: todayMs
      },
      [
        {
          id: 'm-ana-1',
          courseId: 'c-ana-1',
          title: '01 - Intro',
          orderIndex: 1,
          duration: 3600,
          lessonCount: 3,
          createdAt: todayMs,
          lessons: [
            { id: 'l-a1', moduleId: 'm-ana-1', courseId: 'c-ana-1', title: 'A1', orderIndex: 1, filePath: '/1.mp4', fileName: '1.mp4', fileExtension: 'mp4', mediaType: 'video', duration: 1200, fileSize: 100, availability: 'local', createdAt: todayMs },
            { id: 'l-a2', moduleId: 'm-ana-1', courseId: 'c-ana-1', title: 'A2', orderIndex: 2, filePath: '/2.mp4', fileName: '2.mp4', fileExtension: 'mp4', mediaType: 'video', duration: 1200, fileSize: 100, availability: 'local', createdAt: todayMs },
            { id: 'l-a3', moduleId: 'm-ana-1', courseId: 'c-ana-1', title: 'A3', orderIndex: 3, filePath: '/3.mp4', fileName: '3.mp4', fileExtension: 'mp4', mediaType: 'video', duration: 1200, fileSize: 100, availability: 'local', createdAt: todayMs }
          ]
        }
      ]
    )

    // Complete two lessons
    dbService.saveLessonProgress({ lessonId: 'l-a1', courseId: 'c-ana-1', currentTime: 1200, duration: 1200, completed: true })
    dbService.saveLessonProgress({ lessonId: 'l-a2', courseId: 'c-ana-1', currentTime: 1200, duration: 1200, completed: true })

    // Add watch history for Today (Day 0), Yesterday (Day -1), and 2 Days Ago (Day -2) -> 3 day streak!
    dbService.addWatchHistory({
      lessonId: 'l-a1',
      courseId: 'c-ana-1',
      lessonTitle: 'A1',
      courseTitle: 'React Masterclass',
      duration: 1200,
      currentTime: 1200,
      watchedAt: todayMs
    })

    dbService.addWatchHistory({
      lessonId: 'l-a2',
      courseId: 'c-ana-1',
      lessonTitle: 'A2',
      courseTitle: 'React Masterclass',
      duration: 1200,
      currentTime: 1200,
      watchedAt: todayMs - oneDayMs
    })

    dbService.addWatchHistory({
      lessonId: 'l-a3',
      courseId: 'c-ana-1',
      lessonTitle: 'A3',
      courseTitle: 'React Masterclass',
      duration: 600,
      currentTime: 600,
      watchedAt: todayMs - 2 * oneDayMs
    })

    const analytics = dbService.getStudyAnalytics(45)
    expect(analytics.currentStreakDays).toBe(3)
    expect(analytics.longestStreakDays).toBe(3)
    expect(analytics.totalSecondsWatched).toBe(3000)
    expect(analytics.totalLessonsCompleted).toBe(2)
    expect(analytics.todaySecondsWatched).toBe(1200)
    expect(analytics.dailyGoalMinutes).toBe(45)
    expect(analytics.dailyHistory.length).toBe(3)
    expect(analytics.topCourses[0].courseTitle).toBe('React Masterclass')
    expect(analytics.topCourses[0].secondsWatched).toBe(3000)
  })

  it('honors user-customized study goals across different minute targets', () => {
    const customGoal15 = dbService.getStudyAnalytics(15)
    expect(customGoal15.dailyGoalMinutes).toBe(15)

    const customGoal60 = dbService.getStudyAnalytics(60)
    expect(customGoal60.dailyGoalMinutes).toBe(60)

    const customGoal120 = dbService.getStudyAnalytics(120)
    expect(customGoal120.dailyGoalMinutes).toBe(120)
  })
})
