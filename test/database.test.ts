import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { DatabaseService } from '../src/main/services/database.service'
import type { Course, Module, Lesson } from '../src/types'

describe('DatabaseService Core Engine', () => {
  let tempVaultDir: string
  let dbService: DatabaseService

  beforeEach(() => {
    tempVaultDir = path.join(os.tmpdir(), `orbia-db-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
    fs.mkdirSync(tempVaultDir, { recursive: true })
    dbService = new DatabaseService()
  })

  afterEach(() => {
    dbService.close()
    try {
      fs.rmSync(tempVaultDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('throws error when performing operations without active connection', () => {
    expect(dbService.isConnected()).toBe(false)
    expect(dbService.getCurrentVaultPath()).toBeNull()
    expect(() => dbService.deleteCourse('c-1')).toThrow('Database is not connected to an active Vault.')
    expect(() => dbService.getCourseById('c-1')).toThrow('Database is not connected to an active Vault.')
    expect(() =>
      dbService.saveLessonProgress({
        lessonId: 'l-1',
        courseId: 'c-1',
        currentTime: 10,
        duration: 100,
        completed: false
      })
    ).toThrow('Database is not connected to an active Vault.')
  })

  it('connects, creates .orbia/library.db, and enables WAL & foreign keys', () => {
    dbService.connect(tempVaultDir)
    expect(dbService.isConnected()).toBe(true)
    expect(dbService.getCurrentVaultPath()).toBe(tempVaultDir)

    const dbFile = path.join(tempVaultDir, '.orbia', 'library.db')
    expect(fs.existsSync(dbFile)).toBe(true)

    // Reconnecting to same vault path should be a no-op
    dbService.connect(tempVaultDir)
    expect(dbService.isConnected()).toBe(true)
  })

  it('handles empty database queries safely', () => {
    dbService.connect(tempVaultDir)
    expect(dbService.getAllCourses()).toEqual([])
    expect(dbService.getCourseById('non-existent')).toBeNull()
    expect(dbService.getLessonProgress('non-existent')).toBeNull()
    expect(dbService.getCourseProgressSummary('non-existent')).toBeNull()
    expect(dbService.getAllProgressSummaries()).toEqual({})
    expect(dbService.getWatchHistory()).toEqual([])

    const stats = dbService.getVaultStats()
    expect(stats).toEqual({
      courseCount: 0,
      moduleCount: 0,
      lessonCount: 0,
      totalDuration: 0,
      completedLessons: 0,
      totalWatchedTime: 0
    })
  })

  it('saves and retrieves complex multi-module course hierarchies within a transaction', () => {
    dbService.connect(tempVaultDir)
    const now = Date.now()

    const course: Course = {
      id: 'course-master',
      title: 'Fullstack TypeScript',
      slug: 'fullstack-typescript',
      sourceType: 'local-vault',
      rootPath: path.join(tempVaultDir, 'Courses', 'fullstack-typescript'),
      coverPath: path.join(tempVaultDir, 'Courses', 'fullstack-typescript', 'cover.jpg'),
      description: 'Complete TS course',
      totalDuration: 7200,
      moduleCount: 2,
      lessonCount: 3,
      createdAt: now,
      updatedAt: now
    }

    const modules: (Module & { lessons: Lesson[] })[] = [
      {
        id: 'mod-1',
        courseId: 'course-master',
        title: '01 - Fundamentals',
        orderIndex: 1,
        folderPath: '/mod1',
        duration: 3600,
        lessonCount: 2,
        createdAt: now,
        lessons: [
          {
            id: 'les-1',
            moduleId: 'mod-1',
            courseId: 'course-master',
            title: 'Types & Interfaces',
            orderIndex: 1,
            filePath: '/mod1/01.mp4',
            fileName: '01.mp4',
            fileExtension: 'mp4',
            mediaType: 'video',
            duration: 1800,
            fileSize: 50000000,
            availability: 'local',
            createdAt: now
          },
          {
            id: 'les-2',
            moduleId: 'mod-1',
            courseId: 'course-master',
            title: 'Generics',
            orderIndex: 2,
            filePath: '/mod1/02.mp4',
            fileName: '02.mp4',
            fileExtension: 'mp4',
            mediaType: 'video',
            duration: 1800,
            fileSize: 60000000,
            availability: 'local',
            createdAt: now
          }
        ]
      },
      {
        id: 'mod-2',
        courseId: 'course-master',
        title: '02 - Advanced Patterns',
        orderIndex: 2,
        folderPath: '/mod2',
        duration: 3600,
        lessonCount: 1,
        createdAt: now,
        lessons: [
          {
            id: 'les-3',
            moduleId: 'mod-2',
            courseId: 'course-master',
            title: 'Conditional Types',
            orderIndex: 1,
            filePath: '/mod2/01.mp4',
            fileName: '01.mp4',
            fileExtension: 'mp4',
            mediaType: 'video',
            duration: 3600,
            fileSize: 120000000,
            availability: 'local',
            createdAt: now
          }
        ]
      }
    ]

    dbService.saveCourseWithHierarchy(course, modules)

    const allCourses = dbService.getAllCourses()
    expect(allCourses.length).toBe(1)
    expect(allCourses[0].id).toBe('course-master')
    expect(allCourses[0].title).toBe('Fullstack TypeScript')

    const details = dbService.getCourseById('course-master')
    expect(details).not.toBeNull()
    expect(details!.course.title).toBe('Fullstack TypeScript')
    expect(details!.modules.length).toBe(2)
    expect(details!.modules[0].lessons.length).toBe(2)
    expect(details!.modules[1].lessons.length).toBe(1)
    expect(details!.modules[0].lessons[0].title).toBe('Types & Interfaces')
    expect(details!.modules[1].lessons[0].title).toBe('Conditional Types')
  })

  it('updates lastAccessedAt and orders courses by last_accessed_at DESC', () => {
    dbService.connect(tempVaultDir)
    const now = Date.now()

    const createCourse = (id: string, title: string, created: number): Course => ({
      id,
      title,
      slug: id,
      sourceType: 'local-vault',
      rootPath: `/path/${id}`,
      totalDuration: 100,
      moduleCount: 1,
      lessonCount: 1,
      createdAt: created,
      updatedAt: created
    })

    const createModule = (courseId: string): (Module & { lessons: Lesson[] })[] => [
      {
        id: `m-${courseId}`,
        courseId,
        title: 'Module',
        orderIndex: 1,
        duration: 100,
        lessonCount: 1,
        createdAt: now,
        lessons: [
          {
            id: `l-${courseId}`,
            moduleId: `m-${courseId}`,
            courseId,
            title: 'Lesson',
            orderIndex: 1,
            filePath: `/file.mp4`,
            fileName: 'file.mp4',
            fileExtension: 'mp4',
            mediaType: 'video',
            duration: 100,
            fileSize: 100,
            availability: 'local',
            createdAt: now
          }
        ]
      }
    ]

    dbService.saveCourseWithHierarchy(createCourse('c-1', 'First Course', now - 1000), createModule('c-1'))
    dbService.saveCourseWithHierarchy(createCourse('c-2', 'Second Course', now - 2000), createModule('c-2'))

    let courses = dbService.getAllCourses()
    expect(courses.map((c) => c.id)).toEqual(['c-1', 'c-2'])

    // Touch c-2 so it becomes most recently accessed
    dbService.updateCourseLastAccessed('c-2')

    courses = dbService.getAllCourses()
    expect(courses[0].id).toBe('c-2')
  })

  it('enforces foreign key cascading deletions', () => {
    dbService.connect(tempVaultDir)
    const now = Date.now()

    dbService.saveCourseWithHierarchy(
      {
        id: 'c-cascade',
        title: 'Cascade Test Course',
        slug: 'cascade-test',
        sourceType: 'local-vault',
        rootPath: '/path',
        totalDuration: 300,
        moduleCount: 1,
        lessonCount: 1,
        createdAt: now,
        updatedAt: now
      },
      [
        {
          id: 'm-cascade',
          courseId: 'c-cascade',
          title: 'Module 1',
          orderIndex: 1,
          duration: 300,
          lessonCount: 1,
          createdAt: now,
          lessons: [
            {
              id: 'l-cascade',
              moduleId: 'm-cascade',
              courseId: 'c-cascade',
              title: 'Lesson 1',
              orderIndex: 1,
              filePath: '/path/01.mp4',
              fileName: '01.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 300,
              fileSize: 1000,
              availability: 'local',
              createdAt: now
            }
          ]
        }
      ]
    )

    // Save progress and history
    dbService.saveLessonProgress({
      lessonId: 'l-cascade',
      courseId: 'c-cascade',
      currentTime: 150,
      duration: 300,
      completed: false
    })

    dbService.addWatchHistory({
      lessonId: 'l-cascade',
      courseId: 'c-cascade',
      lessonTitle: 'Lesson 1',
      courseTitle: 'Cascade Test Course',
      duration: 300,
      currentTime: 150
    })

    expect(dbService.getCourseById('c-cascade')).not.toBeNull()
    expect(dbService.getLessonProgress('l-cascade')).not.toBeNull()
    expect(dbService.getWatchHistory().length).toBe(1)

    // Delete course
    dbService.deleteCourse('c-cascade')

    expect(dbService.getCourseById('c-cascade')).toBeNull()
    expect(dbService.getLessonProgress('l-cascade')).toBeNull()
    expect(dbService.getWatchHistory().length).toBe(0)
    expect(dbService.getVaultStats().courseCount).toBe(0)
  })

  it('manages lesson progress, toggle completion, and preservation of completed status', () => {
    dbService.connect(tempVaultDir)
    const now = Date.now()

    dbService.saveCourseWithHierarchy(
      {
        id: 'c-prog',
        title: 'Progress Test',
        slug: 'progress-test',
        sourceType: 'local-vault',
        rootPath: '/path',
        totalDuration: 1000,
        moduleCount: 1,
        lessonCount: 2,
        createdAt: now,
        updatedAt: now
      },
      [
        {
          id: 'm-prog',
          courseId: 'c-prog',
          title: 'Module',
          orderIndex: 1,
          duration: 1000,
          lessonCount: 2,
          createdAt: now,
          lessons: [
            {
              id: 'l-prog-1',
              moduleId: 'm-prog',
              courseId: 'c-prog',
              title: 'Lesson 1',
              orderIndex: 1,
              filePath: '/1.mp4',
              fileName: '1.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 500,
              fileSize: 100,
              availability: 'local',
              createdAt: now
            },
            {
              id: 'l-prog-2',
              moduleId: 'm-prog',
              courseId: 'c-prog',
              title: 'Lesson 2',
              orderIndex: 2,
              filePath: '/2.mp4',
              fileName: '2.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 500,
              fileSize: 100,
              availability: 'local',
              createdAt: now
            }
          ]
        }
      ]
    )

    // Initially no progress
    expect(dbService.getLessonProgress('l-prog-1')).toBeNull()

    // Save partial progress
    dbService.saveLessonProgress({
      lessonId: 'l-prog-1',
      courseId: 'c-prog',
      currentTime: 100,
      duration: 500,
      completed: false
    })

    let p1 = dbService.getLessonProgress('l-prog-1')
    expect(p1?.currentTime).toBe(100)
    expect(p1?.completed).toBe(false)

    // Mark completed
    dbService.saveLessonProgress({
      lessonId: 'l-prog-1',
      courseId: 'c-prog',
      currentTime: 490,
      duration: 500,
      completed: true
    })

    p1 = dbService.getLessonProgress('l-prog-1')
    expect(p1?.completed).toBe(true)

    // Rewatching (completed=false in incoming payload) should preserve completed=true per DB trigger/case
    dbService.saveLessonProgress({
      lessonId: 'l-prog-1',
      courseId: 'c-prog',
      currentTime: 50,
      duration: 500,
      completed: false
    })

    p1 = dbService.getLessonProgress('l-prog-1')
    expect(p1?.completed).toBe(true)
    expect(p1?.currentTime).toBe(50)

    // Toggle completion on lesson 2
    expect(dbService.toggleLessonCompletion('l-prog-2', 'c-prog')).toBe(true)
    expect(dbService.getLessonProgress('l-prog-2')?.completed).toBe(true)

    // Toggle again to uncomplete
    expect(dbService.toggleLessonCompletion('l-prog-2', 'c-prog')).toBe(false)
    expect(dbService.getLessonProgress('l-prog-2')?.completed).toBe(false)
  })

  it('computes accurate progress summaries and aggregates all summaries', () => {
    dbService.connect(tempVaultDir)
    const now = Date.now()

    dbService.saveCourseWithHierarchy(
      {
        id: 'c-summary',
        title: 'Summary Test Course',
        slug: 'summary-test',
        sourceType: 'local-vault',
        rootPath: '/path',
        totalDuration: 1000,
        moduleCount: 1,
        lessonCount: 4,
        createdAt: now,
        updatedAt: now
      },
      [
        {
          id: 'm-summary',
          courseId: 'c-summary',
          title: 'Module',
          orderIndex: 1,
          duration: 1000,
          lessonCount: 4,
          createdAt: now,
          lessons: [
            { id: 'ls-1', moduleId: 'm-summary', courseId: 'c-summary', title: 'L1', orderIndex: 1, filePath: '/1.mp4', fileName: '1.mp4', fileExtension: 'mp4', mediaType: 'video', duration: 250, fileSize: 100, availability: 'local', createdAt: now },
            { id: 'ls-2', moduleId: 'm-summary', courseId: 'c-summary', title: 'L2', orderIndex: 2, filePath: '/2.mp4', fileName: '2.mp4', fileExtension: 'mp4', mediaType: 'video', duration: 250, fileSize: 100, availability: 'local', createdAt: now },
            { id: 'ls-3', moduleId: 'm-summary', courseId: 'c-summary', title: 'L3', orderIndex: 3, filePath: '/3.mp4', fileName: '3.mp4', fileExtension: 'mp4', mediaType: 'video', duration: 250, fileSize: 100, availability: 'local', createdAt: now },
            { id: 'ls-4', moduleId: 'm-summary', courseId: 'c-summary', title: 'L4', orderIndex: 4, filePath: '/4.mp4', fileName: '4.mp4', fileExtension: 'mp4', mediaType: 'video', duration: 250, fileSize: 100, availability: 'local', createdAt: now }
          ]
        }
      ]
    )

    // Complete 1 lesson out of 4 (25%)
    dbService.saveLessonProgress({
      lessonId: 'ls-1',
      courseId: 'c-summary',
      currentTime: 250,
      duration: 250,
      completed: true
    })

    let summary = dbService.getCourseProgressSummary('c-summary')
    expect(summary).not.toBeNull()
    expect(summary!.totalLessons).toBe(4)
    expect(summary!.completedLessons).toBe(1)
    expect(summary!.percentage).toBe(25)
    expect(summary!.totalDuration).toBe(1000)
    expect(summary!.remainingDuration).toBe(750)
    expect(summary!.lastPlayedLessonId).toBe('ls-1')
    expect(summary!.lastPlayedLessonTitle).toBe('L1')

    // Complete second lesson (50%)
    dbService.saveLessonProgress({
      lessonId: 'ls-2',
      courseId: 'c-summary',
      currentTime: 250,
      duration: 250,
      completed: true
    })

    summary = dbService.getCourseProgressSummary('c-summary')
    expect(summary!.completedLessons).toBe(2)
    expect(summary!.percentage).toBe(50)
    expect(summary!.remainingDuration).toBe(500)

    const allSummaries = dbService.getAllProgressSummaries()
    expect(allSummaries['c-summary']).toBeDefined()
    expect(allSummaries['c-summary'].percentage).toBe(50)
  })

  it('paginates watch history and calculates vault statistics accurately', () => {
    dbService.connect(tempVaultDir)
    const now = Date.now()

    dbService.saveCourseWithHierarchy(
      {
        id: 'c-stat',
        title: 'Stats Course',
        slug: 'stats-course',
        sourceType: 'local-vault',
        rootPath: '/path',
        totalDuration: 2000,
        moduleCount: 2,
        lessonCount: 2,
        createdAt: now,
        updatedAt: now
      },
      [
        {
          id: 'm-stat-1',
          courseId: 'c-stat',
          title: 'Mod 1',
          orderIndex: 1,
          duration: 1000,
          lessonCount: 1,
          createdAt: now,
          lessons: [
            { id: 'ls-stat-1', moduleId: 'm-stat-1', courseId: 'c-stat', title: 'Les 1', orderIndex: 1, filePath: '/1.mp4', fileName: '1.mp4', fileExtension: 'mp4', mediaType: 'video', duration: 1000, fileSize: 500, availability: 'local', createdAt: now }
          ]
        },
        {
          id: 'm-stat-2',
          courseId: 'c-stat',
          title: 'Mod 2',
          orderIndex: 2,
          duration: 1000,
          lessonCount: 1,
          createdAt: now,
          lessons: [
            { id: 'ls-stat-2', moduleId: 'm-stat-2', courseId: 'c-stat', title: 'Les 2', orderIndex: 1, filePath: '/2.mp4', fileName: '2.mp4', fileExtension: 'mp4', mediaType: 'video', duration: 1000, fileSize: 500, availability: 'local', createdAt: now }
          ]
        }
      ]
    )

    dbService.saveLessonProgress({
      lessonId: 'ls-stat-1',
      courseId: 'c-stat',
      currentTime: 1000,
      duration: 1000,
      completed: true
    })

    dbService.saveLessonProgress({
      lessonId: 'ls-stat-2',
      courseId: 'c-stat',
      currentTime: 400,
      duration: 1000,
      completed: false
    })

    // Add multiple history entries
    for (let i = 0; i < 5; i++) {
      dbService.addWatchHistory({
        lessonId: 'ls-stat-1',
        courseId: 'c-stat',
        lessonTitle: `Les 1 - Session ${i}`,
        courseTitle: 'Stats Course',
        duration: 1000,
        currentTime: 200 * i
      })
    }

    const limitedHistory = dbService.getWatchHistory(3)
    expect(limitedHistory.length).toBe(3)

    const fullHistory = dbService.getWatchHistory(10)
    expect(fullHistory.length).toBe(5)

    const stats = dbService.getVaultStats()
    expect(stats.courseCount).toBe(1)
    expect(stats.moduleCount).toBe(2)
    expect(stats.lessonCount).toBe(2)
    expect(stats.totalDuration).toBe(2000)
    expect(stats.completedLessons).toBe(1)
    expect(stats.totalWatchedTime).toBe(1400) // 1000 + 400
  })
})
