import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DatabaseService } from '../src/main/services/database.service'

describe('Study Queue, Course Goals and Sessions', () => {
  let tempDir: string
  let vaultDir: string
  let dbService: DatabaseService

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-queue-test-'))
    vaultDir = path.join(tempDir, 'TestVault')
    fs.mkdirSync(path.join(vaultDir, '.orbia'), { recursive: true })

    dbService = new DatabaseService()
    dbService.connect(vaultDir)

    dbService.saveCourseWithHierarchy(
      {
        id: 'c1',
        title: 'React & TypeScript Masterclass',
        slug: 'react-ts',
        sourceType: 'folder',
        rootPath: path.join(vaultDir, 'React'),
        totalDuration: 7200,
        moduleCount: 1,
        lessonCount: 2,
        isFavorite: false,
        createdAt: 1000,
        updatedAt: 1000
      },
      [
        {
          id: 'm1',
          courseId: 'c1',
          title: 'Módulo 1',
          orderIndex: 1,
          duration: 7200,
          lessonCount: 2,
          createdAt: 1000,
          lessons: [
            {
              id: 'l1',
              moduleId: 'm1',
              courseId: 'c1',
              title: 'Aula 01 - Setup',
              orderIndex: 1,
              filePath: path.join(vaultDir, 'React', '01.mp4'),
              fileName: '01.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 3600,
              fileSize: 1000,
              availability: 'available',
              createdAt: 1000
            },
            {
              id: 'l2',
              moduleId: 'm1',
              courseId: 'c1',
              title: 'Aula 02 - State Management',
              orderIndex: 2,
              filePath: path.join(vaultDir, 'React', '02.mp4'),
              fileName: '02.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 3600,
              fileSize: 1000,
              availability: 'available',
              createdAt: 1000
            }
          ]
        }
      ]
    )
  })

  afterEach(() => {
    dbService.disconnect()
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // Ignored
    }
  })

  it('manages study queue items, reordering, and removal', () => {
    const item1 = dbService.addToStudyQueue('lesson', 'l1')
    const item2 = dbService.addToStudyQueue('lesson', 'l2')
    const item3 = dbService.addToStudyQueue('course', 'c1')

    let queue = dbService.getStudyQueue()
    expect(queue.length).toBe(3)
    expect(queue[0].id).toBe(item1.id)
    expect(queue[0].title).toBe('Aula 01 - Setup')
    expect(queue[1].id).toBe(item2.id)
    expect(queue[2].id).toBe(item3.id)

    // Reorder down
    const movedDown = dbService.reorderStudyQueue(item1.id, 'down')
    expect(movedDown).toBe(true)
    queue = dbService.getStudyQueue()
    expect(queue[0].id).toBe(item2.id)
    expect(queue[1].id).toBe(item1.id)

    // Reorder up
    const movedUp = dbService.reorderStudyQueue(item1.id, 'up')
    expect(movedUp).toBe(true)
    queue = dbService.getStudyQueue()
    expect(queue[0].id).toBe(item1.id)

    // Remove item
    const removed = dbService.removeFromStudyQueue(item2.id)
    expect(removed).toBe(true)
    queue = dbService.getStudyQueue()
    expect(queue.length).toBe(2)
  })

  it('sets, updates, and retrieves course goals', () => {
    expect(dbService.getCourseGoal('c1')).toBeNull()

    const targetDate = Date.now() + 30 * 24 * 60 * 60 * 1000
    const goal = dbService.setCourseGoal({
      courseId: 'c1',
      targetDate,
      dailyMinutes: 45,
      weeklyLessons: 4
    })

    expect(goal.courseId).toBe('c1')
    expect(goal.targetDate).toBe(targetDate)
    expect(goal.dailyMinutes).toBe(45)

    const retrieved = dbService.getCourseGoal('c1')
    expect(retrieved?.dailyMinutes).toBe(45)
    expect(retrieved?.weeklyLessons).toBe(4)

    dbService.deleteCourseGoal('c1')
    expect(dbService.getCourseGoal('c1')).toBeNull()
  })

  it('tracks study sessions and aggregates review dashboard stats', () => {
    const session = dbService.startStudySession({
      courseId: 'c1',
      source: 'player'
    })
    expect(session.id).toBeDefined()

    const ended = dbService.endStudySession(session.id, 1800)
    expect(ended).toBe(true)

    const sessions = dbService.getStudySessions()
    expect(sessions.length).toBe(1)
    expect(sessions[0].duration).toBe(1800)

    // Add flashcard and bookmark to test dashboard stats
    dbService.createFlashcard({
      courseId: 'c1',
      question: 'Q1',
      answer: 'A1'
    })
    dbService.createBookmark({
      courseId: 'c1',
      lessonId: 'l1',
      timestamp: 100,
      title: 'B1'
    })
    dbService.addToStudyQueue('course', 'c1')

    const stats = dbService.getReviewDashboardStats()
    expect(stats.totalFlashcardsCount).toBe(1)
    expect(stats.dueFlashcardsCount).toBe(1)
    expect(stats.bookmarksCount).toBe(1)
    expect(stats.studyQueueCount).toBe(1)
  })
})
