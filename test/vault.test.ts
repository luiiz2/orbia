import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { DatabaseService } from '../src/main/services/database.service'
import { VaultService } from '../src/main/services/vault.service'
import { appConfigService } from '../src/main/services/app-config.service'
import type { Course, Module, Lesson } from '../src/types'

describe('Vault & Database Services', () => {
  let tempVaultDir: string
  let tempConfigDir: string
  let dbService: DatabaseService
  let vaultSvc: VaultService

  beforeEach(async () => {
    tempVaultDir = path.join(os.tmpdir(), `orbia-vault-test-${Date.now()}`)
    tempConfigDir = path.join(os.tmpdir(), `orbia-cfg-test-${Date.now()}`)
    fs.mkdirSync(tempVaultDir, { recursive: true })
    fs.mkdirSync(tempConfigDir, { recursive: true })

    // Init appConfig in temp directory
    const customConfig = path.join(tempConfigDir, 'config.db')
    // Override appConfigService db path for testing
    ;(appConfigService as unknown as { dbPath: string }).dbPath = customConfig
    appConfigService.init()

    dbService = new DatabaseService()
    vaultSvc = new VaultService()
  })

  afterEach(() => {
    dbService.close()
    appConfigService.close()
    try {
      fs.rmSync(tempVaultDir, { recursive: true, force: true })
      fs.rmSync(tempConfigDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('creates vault directory topology and initializes library.db', async () => {
    const vault = await vaultSvc.createVault(tempVaultDir, 'My Learning Vault')

    expect(vault.name).toBe('My Learning Vault')
    expect(vault.path).toBe(tempVaultDir)
    expect(fs.existsSync(path.join(tempVaultDir, 'Inbox'))).toBe(true)
    expect(fs.existsSync(path.join(tempVaultDir, 'Courses'))).toBe(true)
    expect(fs.existsSync(path.join(tempVaultDir, '.orbia', 'library.db'))).toBe(true)
  })

  it('saves course hierarchy and queries it completely', () => {
    dbService.connect(tempVaultDir)

    const now = Date.now()
    const course: Course = {
      id: 'c-1',
      title: 'Rust Fundamentals',
      slug: 'rust-fundamentals',
      sourceType: 'local-vault',
      rootPath: path.join(tempVaultDir, 'Courses', 'rust-fundamentals'),
      totalDuration: 3600,
      moduleCount: 1,
      lessonCount: 2,
      createdAt: now,
      updatedAt: now
    }

    const lessons: Lesson[] = [
      {
        id: 'l-1',
        moduleId: 'm-1',
        courseId: 'c-1',
        title: 'Ownership',
        orderIndex: 1,
        filePath: '/path/01.mp4',
        fileName: '01.mp4',
        fileExtension: 'mp4',
        mediaType: 'video',
        duration: 1800,
        fileSize: 100000000,
        availability: 'local',
        createdAt: now
      },
      {
        id: 'l-2',
        moduleId: 'm-1',
        courseId: 'c-1',
        title: 'Borrowing',
        orderIndex: 2,
        filePath: '/path/02.mp4',
        fileName: '02.mp4',
        fileExtension: 'mp4',
        mediaType: 'video',
        duration: 1800,
        fileSize: 100000000,
        availability: 'local',
        createdAt: now
      }
    ]

    const modules: (Module & { lessons: Lesson[] })[] = [
      {
        id: 'm-1',
        courseId: 'c-1',
        title: 'Core Concepts',
        orderIndex: 1,
        duration: 3600,
        lessonCount: 2,
        createdAt: now,
        lessons
      }
    ]

    dbService.saveCourseWithHierarchy(course, modules)

    const allCourses = dbService.getAllCourses()
    expect(allCourses.length).toBe(1)
    expect(allCourses[0].title).toBe('Rust Fundamentals')

    const details = dbService.getCourseById('c-1')
    expect(details).not.toBeNull()
    expect(details!.modules.length).toBe(1)
    expect(details!.modules[0].lessons.length).toBe(2)
    expect(details!.modules[0].lessons[0].title).toBe('Ownership')
    expect(details!.modules[0].lessons[1].title).toBe('Borrowing')
  })

  it('tracks progress and computes course progress percentage', () => {
    dbService.connect(tempVaultDir)
    const now = Date.now()

    const course: Course = {
      id: 'c-1',
      title: 'Python',
      slug: 'python',
      sourceType: 'local-vault',
      rootPath: '/path',
      totalDuration: 1000,
      moduleCount: 1,
      lessonCount: 2,
      createdAt: now,
      updatedAt: now
    }

    const lessons: Lesson[] = [
      {
        id: 'l-1',
        moduleId: 'm-1',
        courseId: 'c-1',
        title: 'Intro',
        orderIndex: 1,
        filePath: '/1.mp4',
        fileName: '1.mp4',
        fileExtension: 'mp4',
        mediaType: 'video',
        duration: 500,
        fileSize: 1000,
        availability: 'local',
        createdAt: now
      },
      {
        id: 'l-2',
        moduleId: 'm-1',
        courseId: 'c-1',
        title: 'Variables',
        orderIndex: 2,
        filePath: '/2.mp4',
        fileName: '2.mp4',
        fileExtension: 'mp4',
        mediaType: 'video',
        duration: 500,
        fileSize: 1000,
        availability: 'local',
        createdAt: now
      }
    ]

    dbService.saveCourseWithHierarchy(course, [
      {
        id: 'm-1',
        courseId: 'c-1',
        title: 'Mod 1',
        orderIndex: 1,
        duration: 1000,
        lessonCount: 2,
        createdAt: now,
        lessons
      }
    ])

    // Save partial progress on lesson 1
    dbService.saveLessonProgress({
      lessonId: 'l-1',
      courseId: 'c-1',
      currentTime: 250,
      duration: 500,
      completed: false
    })

    let summary = dbService.getCourseProgressSummary('c-1')
    expect(summary).not.toBeNull()
    expect(summary!.percentage).toBe(0)

    // Complete lesson 1
    dbService.saveLessonProgress({
      lessonId: 'l-1',
      courseId: 'c-1',
      currentTime: 480,
      duration: 500,
      completed: true
    })

    summary = dbService.getCourseProgressSummary('c-1')
    expect(summary!.completedLessons).toBe(1)
    expect(summary!.percentage).toBe(50)

    // Toggle completion on lesson 2
    const isCompleted = dbService.toggleLessonCompletion('l-2', 'c-1')
    expect(isCompleted).toBe(true)

    summary = dbService.getCourseProgressSummary('c-1')
    expect(summary!.completedLessons).toBe(2)
    expect(summary!.percentage).toBe(100)
  })

  it('records and retrieves watch history', () => {
    dbService.connect(tempVaultDir)
    const now = Date.now()

    dbService.saveCourseWithHierarchy(
      {
        id: 'c-hist',
        title: 'Python',
        slug: 'python',
        sourceType: 'local-vault',
        rootPath: '/path',
        totalDuration: 500,
        moduleCount: 1,
        lessonCount: 1,
        createdAt: now,
        updatedAt: now
      },
      [
        {
          id: 'm-hist',
          courseId: 'c-hist',
          title: 'Mod',
          orderIndex: 1,
          duration: 500,
          lessonCount: 1,
          createdAt: now,
          lessons: [
            {
              id: 'l-hist',
              moduleId: 'm-hist',
              courseId: 'c-hist',
              title: 'Intro',
              orderIndex: 1,
              filePath: '/path/01.mp4',
              fileName: '01.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 500,
              fileSize: 1000,
              availability: 'local',
              createdAt: now
            }
          ]
        }
      ]
    )

    dbService.addWatchHistory({
      lessonId: 'l-hist',
      courseId: 'c-hist',
      lessonTitle: 'Intro',
      courseTitle: 'Python',
      duration: 300,
      currentTime: 250
    })

    const history = dbService.getWatchHistory()
    expect(history.length).toBe(1)
    expect(history[0].lessonTitle).toBe('Intro')
    expect(history[0].courseTitle).toBe('Python')
  })

  it('aggregates vault statistics correctly', () => {
    dbService.connect(tempVaultDir)
    const stats = dbService.getVaultStats()
    expect(stats.courseCount).toBe(0)
    expect(stats.lessonCount).toBe(0)
    expect(stats.completedLessons).toBe(0)
  })
})
