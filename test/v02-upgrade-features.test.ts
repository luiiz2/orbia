import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { DatabaseService } from '../src/main/services/database.service'
import type { Course, Module, Lesson } from '../src/types'

describe('Orbia v0.2 Upgrade Features', () => {
  let tempVaultDir: string
  let dbService: DatabaseService

  beforeEach(() => {
    tempVaultDir = path.join(
      os.tmpdir(),
      `orbia-v02-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    )
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

  it('records migrations in _migrations table', () => {
    const db = (
      dbService as unknown as { db: import('better-sqlite3').Database }
    ).db
    const rows = db.prepare('SELECT id FROM _migrations').all() as Array<{
      id: string
    }>
    const migrationIds = rows.map((r) => r.id)
    expect(migrationIds).toContain('002_v0.2_metadata_and_favorites')
  })

  it('supports custom_title on course, module, and lesson', () => {
    const course: Course = {
      id: 'course-meta-1',
      title: 'Original Course Title',
      slug: 'original-course',
      sourceType: 'local-vault',
      rootPath: path.join(tempVaultDir, 'Courses', 'Original'),
      totalDuration: 300,
      moduleCount: 1,
      lessonCount: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const module: Module & { lessons: Lesson[] } = {
      id: 'mod-meta-1',
      courseId: course.id,
      title: 'Original Module Title',
      orderIndex: 1,
      duration: 300,
      lessonCount: 1,
      createdAt: Date.now(),
      lessons: [
        {
          id: 'les-meta-1',
          moduleId: 'mod-meta-1',
          courseId: course.id,
          title: 'Original Lesson Title',
          orderIndex: 1,
          filePath: path.join(course.rootPath, '01.mp4'),
          fileName: '01.mp4',
          fileExtension: '.mp4',
          mediaType: 'video',
          duration: 300,
          fileSize: 1024,
          availability: 'local',
          createdAt: Date.now()
        }
      ]
    }

    dbService.saveCourseWithHierarchy(course, [module])

    // Update custom titles
    dbService.updateCourseMetadata(course.id, {
      customTitle: 'Custom Course Name'
    })
    dbService.updateModuleMetadata(module.id, {
      customTitle: 'Custom Module Name'
    })
    dbService.updateLessonMetadata(module.lessons[0].id, {
      customTitle: 'Custom Lesson Name'
    })

    const retrieved = dbService.getCourseById(course.id)
    expect(retrieved).not.toBeNull()
    expect(retrieved!.course.title).toBe('Original Course Title')
    expect(retrieved!.course.customTitle).toBe('Custom Course Name')
    expect(retrieved!.modules[0].title).toBe('Original Module Title')
    expect(retrieved!.modules[0].customTitle).toBe('Custom Module Name')
    expect(retrieved!.modules[0].lessons[0].title).toBe('Original Lesson Title')
    expect(retrieved!.modules[0].lessons[0].customTitle).toBe(
      'Custom Lesson Name'
    )
  })

  it('supports reordering modules and lessons up and down', () => {
    const course: Course = {
      id: 'course-reorder',
      title: 'Reorder Course',
      slug: 'reorder-course',
      sourceType: 'local-vault',
      rootPath: path.join(tempVaultDir, 'Courses', 'Reorder'),
      totalDuration: 600,
      moduleCount: 2,
      lessonCount: 2,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const mod1: Module & { lessons: Lesson[] } = {
      id: 'mod-1',
      courseId: course.id,
      title: 'Module 1',
      orderIndex: 1,
      duration: 300,
      lessonCount: 2,
      createdAt: Date.now(),
      lessons: [
        {
          id: 'les-1',
          moduleId: 'mod-1',
          courseId: course.id,
          title: 'Lesson 1A',
          orderIndex: 1,
          filePath: path.join(course.rootPath, '1A.mp4'),
          fileName: '1A.mp4',
          fileExtension: '.mp4',
          mediaType: 'video',
          duration: 150,
          fileSize: 1000,
          availability: 'local',
          createdAt: Date.now()
        },
        {
          id: 'les-2',
          moduleId: 'mod-1',
          courseId: course.id,
          title: 'Lesson 1B',
          orderIndex: 2,
          filePath: path.join(course.rootPath, '1B.mp4'),
          fileName: '1B.mp4',
          fileExtension: '.mp4',
          mediaType: 'video',
          duration: 150,
          fileSize: 1000,
          availability: 'local',
          createdAt: Date.now()
        }
      ]
    }

    const mod2: Module & { lessons: Lesson[] } = {
      id: 'mod-2',
      courseId: course.id,
      title: 'Module 2',
      orderIndex: 2,
      duration: 300,
      lessonCount: 0,
      createdAt: Date.now(),
      lessons: []
    }

    dbService.saveCourseWithHierarchy(course, [mod1, mod2])

    // Swap lessons within mod1
    const reorderedLesson = dbService.reorderLesson('les-1', 'down')
    expect(reorderedLesson).toBe(true)

    let retrieved = dbService.getCourseById(course.id)
    expect(retrieved!.modules[0].lessons[0].id).toBe('les-2')
    expect(retrieved!.modules[0].lessons[1].id).toBe('les-1')

    // Swap modules
    const reorderedModule = dbService.reorderModule('mod-1', 'down')
    expect(reorderedModule).toBe(true)

    retrieved = dbService.getCourseById(course.id)
    expect(retrieved!.modules[0].id).toBe('mod-2')
    expect(retrieved!.modules[1].id).toBe('mod-1')
  })

  it('supports toggling lesson favorites', () => {
    const course: Course = {
      id: 'course-fav',
      title: 'Favorite Course',
      slug: 'fav-course',
      sourceType: 'local-vault',
      rootPath: path.join(tempVaultDir, 'Courses', 'Fav'),
      totalDuration: 100,
      moduleCount: 1,
      lessonCount: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const mod: Module & { lessons: Lesson[] } = {
      id: 'mod-fav',
      courseId: course.id,
      title: 'Fav Module',
      orderIndex: 1,
      duration: 100,
      lessonCount: 1,
      createdAt: Date.now(),
      lessons: [
        {
          id: 'les-fav-1',
          moduleId: 'mod-fav',
          courseId: course.id,
          title: 'Fav Lesson',
          orderIndex: 1,
          filePath: path.join(course.rootPath, 'fav.mp4'),
          fileName: 'fav.mp4',
          fileExtension: '.mp4',
          mediaType: 'video',
          duration: 100,
          fileSize: 1000,
          availability: 'local',
          createdAt: Date.now()
        }
      ]
    }

    dbService.saveCourseWithHierarchy(course, [mod])

    // Toggle favorite ON
    const isFavNow = dbService.toggleLessonFavorite('les-fav-1')
    expect(isFavNow).toBe(true)

    let retrieved = dbService.getCourseById(course.id)
    expect(retrieved!.modules[0].lessons[0].isFavorite).toBe(true)

    // Toggle favorite OFF
    const isFavOff = dbService.toggleLessonFavorite('les-fav-1')
    expect(isFavOff).toBe(false)

    retrieved = dbService.getCourseById(course.id)
    expect(retrieved!.modules[0].lessons[0].isFavorite).toBe(false)
  })

  it('supports batch module completion and uncompletion', () => {
    const course: Course = {
      id: 'course-batch',
      title: 'Batch Course',
      slug: 'batch-course',
      sourceType: 'local-vault',
      rootPath: path.join(tempVaultDir, 'Courses', 'Batch'),
      totalDuration: 300,
      moduleCount: 1,
      lessonCount: 3,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const mod: Module & { lessons: Lesson[] } = {
      id: 'mod-batch',
      courseId: course.id,
      title: 'Batch Module',
      orderIndex: 1,
      duration: 300,
      lessonCount: 3,
      createdAt: Date.now(),
      lessons: [
        {
          id: 'les-b-1',
          moduleId: 'mod-batch',
          courseId: course.id,
          title: 'Lesson 1',
          orderIndex: 1,
          filePath: path.join(course.rootPath, '1.mp4'),
          fileName: '1.mp4',
          fileExtension: '.mp4',
          mediaType: 'video',
          duration: 100,
          fileSize: 1000,
          availability: 'local',
          createdAt: Date.now()
        },
        {
          id: 'les-b-2',
          moduleId: 'mod-batch',
          courseId: course.id,
          title: 'Lesson 2',
          orderIndex: 2,
          filePath: path.join(course.rootPath, '2.mp4'),
          fileName: '2.mp4',
          fileExtension: '.mp4',
          mediaType: 'video',
          duration: 100,
          fileSize: 1000,
          availability: 'local',
          createdAt: Date.now()
        },
        {
          id: 'les-b-3',
          moduleId: 'mod-batch',
          courseId: course.id,
          title: 'Lesson 3',
          orderIndex: 3,
          filePath: path.join(course.rootPath, '3.mp4'),
          fileName: '3.mp4',
          fileExtension: '.mp4',
          mediaType: 'video',
          duration: 100,
          fileSize: 1000,
          availability: 'local',
          createdAt: Date.now()
        }
      ]
    }

    dbService.saveCourseWithHierarchy(course, [mod])

    // Mark entire module completed
    const affected = dbService.toggleModuleCompletion(
      'mod-batch',
      course.id,
      true
    )
    expect(affected).toBe(3)

    const progress = dbService.getLessonsProgress(course.id)
    expect(progress.length).toBe(3)
    expect(progress.every((p) => p.completed)).toBe(true)

    // Unmark entire module
    const unmarkAffected = dbService.toggleModuleCompletion(
      'mod-batch',
      course.id,
      false
    )
    expect(unmarkAffected).toBe(3)

    const unmarkProgress = dbService.getLessonsProgress(course.id)
    expect(unmarkProgress.every((p) => !p.completed)).toBe(true)
  })

  it('performs global search across courses, modules, and lessons', () => {
    const course: Course = {
      id: 'course-search',
      title: 'Mastering TypeScript & React',
      slug: 'mastering-ts-react',
      sourceType: 'local-vault',
      rootPath: path.join(tempVaultDir, 'Courses', 'TS'),
      totalDuration: 200,
      moduleCount: 1,
      lessonCount: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const mod: Module & { lessons: Lesson[] } = {
      id: 'mod-search',
      courseId: course.id,
      title: 'Advanced Generics Deep Dive',
      orderIndex: 1,
      duration: 200,
      lessonCount: 1,
      createdAt: Date.now(),
      lessons: [
        {
          id: 'les-search',
          moduleId: 'mod-search',
          courseId: course.id,
          title: 'Conditional Types and Inference',
          orderIndex: 1,
          filePath: path.join(course.rootPath, 'types.mp4'),
          fileName: 'types.mp4',
          fileExtension: '.mp4',
          mediaType: 'video',
          duration: 200,
          fileSize: 1000,
          availability: 'local',
          createdAt: Date.now()
        }
      ]
    }

    dbService.saveCourseWithHierarchy(course, [mod])

    // Search for course
    const courseResults = dbService.searchGlobal('TypeScript')
    expect(
      courseResults.some((r) => r.type === 'course' && r.id === 'course-search')
    ).toBe(true)

    // Search for module
    const moduleResults = dbService.searchGlobal('Generics')
    expect(
      moduleResults.some((r) => r.type === 'module' && r.id === 'mod-search')
    ).toBe(true)

    // Search for lesson
    const lessonResults = dbService.searchGlobal('Conditional')
    expect(
      lessonResults.some((r) => r.type === 'lesson' && r.id === 'les-search')
    ).toBe(true)
  })
})
