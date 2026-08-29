import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { DatabaseService } from '../src/main/services/database.service'
import type { ContentResource, Course, Module, Lesson } from '../src/types'

describe('DatabaseService Core Engine', () => {
  let tempVaultDir: string
  let dbService: DatabaseService
  let extraTempPaths: string[]

  beforeEach(() => {
    tempVaultDir = path.join(
      os.tmpdir(),
      `orbia-db-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    )
    fs.mkdirSync(tempVaultDir, { recursive: true })
    dbService = new DatabaseService()
    extraTempPaths = []
  })

  afterEach(() => {
    dbService.close()
    for (const extraTempPath of extraTempPaths) {
      try {
        fs.rmSync(extraTempPath, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
    try {
      fs.rmSync(tempVaultDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('throws error when performing operations without active connection', () => {
    expect(dbService.isConnected()).toBe(false)
    expect(dbService.getCurrentVaultPath()).toBeNull()
    expect(() => dbService.deleteCourse('c-1')).toThrow(
      'Database is not connected to an active Vault.'
    )
    expect(() => dbService.getCourseById('c-1')).toThrow(
      'Database is not connected to an active Vault.'
    )
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

  it('records and updates journal state using the canonical file-operation fields', () => {
    dbService.connect(tempVaultDir)
    dbService.recordFileOperation({
      operationId: 'operation-1',
      groupId: 'group-1',
      type: 'move',
      sourcePath: 'C:/staging/course',
      destinationPath: 'C:/vault/Courses/course',
      originalFileName: 'course',
      newFileName: 'course',
      timestamp: 123,
      status: 'pending',
      isReversible: true
    })
    dbService.updateFileOperationStatus('operation-1', 'completed')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internalDb = (dbService as any).db
    const operation = internalDb
      .prepare(
        `SELECT original_filename, new_filename, status, error_details FROM file_operations WHERE operation_id = ?`
      )
      .get('operation-1') as {
      original_filename: string
      new_filename: string
      status: string
      error_details: string | null
    }

    expect(operation).toEqual({
      original_filename: 'course',
      new_filename: 'course',
      status: 'completed',
      error_details: null
    })
  })

  it('rolls back a pending managed move after restart when no course was persisted', () => {
    const sourceRoot = `${tempVaultDir}-external-course`
    extraTempPaths.push(sourceRoot)
    const destinationRoot = path.join(
      tempVaultDir,
      'Courses',
      'recovered-course'
    )
    fs.mkdirSync(sourceRoot, { recursive: true })
    fs.writeFileSync(path.join(sourceRoot, 'lesson.mp4'), 'lesson')

    dbService.connect(tempVaultDir)
    dbService.recordFileOperation({
      operationId: 'pending-move-1',
      groupId: 'group-1',
      type: 'move',
      sourcePath: sourceRoot,
      destinationPath: destinationRoot,
      originalFileName: 'external-course',
      newFileName: 'recovered-course',
      timestamp: 123,
      status: 'pending',
      isReversible: true
    })
    fs.mkdirSync(path.dirname(destinationRoot), { recursive: true })
    fs.renameSync(sourceRoot, destinationRoot)
    dbService.close()

    dbService = new DatabaseService()
    dbService.connect(tempVaultDir)

    expect(fs.existsSync(sourceRoot)).toBe(true)
    expect(fs.existsSync(path.join(sourceRoot, 'lesson.mp4'))).toBe(true)
    expect(fs.existsSync(destinationRoot)).toBe(false)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internalDb = (dbService as any).db
    const operation = internalDb
      .prepare(`SELECT status FROM file_operations WHERE operation_id = ?`)
      .get('pending-move-1') as { status: string }
    expect(operation.status).toBe('rolled_back')
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
      coverPath: path.join(
        tempVaultDir,
        'Courses',
        'fullstack-typescript',
        'cover.jpg'
      ),
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

  it('persists module and lesson resources and derives lesson subtitles from subtitle resources', () => {
    dbService.connect(tempVaultDir)
    const now = Date.now()
    const course: Course = {
      id: 'course-resources',
      title: 'Resourceful Course',
      slug: 'resourceful-course',
      sourceType: 'local-vault',
      rootPath: path.join(tempVaultDir, 'Courses', 'resourceful-course'),
      coverPath: '/course/course-cover.jpg',
      totalDuration: 120,
      moduleCount: 1,
      lessonCount: 1,
      createdAt: now,
      updatedAt: now
    }
    const moduleResource: ContentResource = {
      id: 'resource-module-1',
      courseId: course.id,
      moduleId: 'module-resources',
      role: 'resource',
      name: 'Workbook',
      filePath: '/course/module/workbook.pdf',
      fileExtension: 'pdf',
      fileSize: 1200,
      type: 'pdf',
      createdAt: now
    }
    const lessonResource: ContentResource = {
      id: 'resource-lesson-1',
      courseId: course.id,
      moduleId: 'module-resources',
      lessonId: 'lesson-resources',
      role: 'resource',
      name: 'Slides',
      filePath: '/course/module/slides.pdf',
      fileExtension: 'pdf',
      fileSize: 2400,
      type: 'pdf',
      createdAt: now
    }
    const subtitleResource: ContentResource = {
      id: 'subtitle-lesson-1',
      courseId: course.id,
      moduleId: 'module-resources',
      lessonId: 'lesson-resources',
      role: 'subtitle',
      name: 'Português',
      filePath: '/course/module/aula.pt-BR.vtt',
      fileExtension: 'vtt',
      fileSize: 320,
      type: 'document',
      language: 'pt-BR',
      label: 'Português',
      createdAt: now
    }
    const modules: (Module & { lessons: Lesson[] })[] = [
      {
        id: 'module-resources',
        courseId: course.id,
        title: 'Module with materials',
        orderIndex: 1,
        duration: 120,
        lessonCount: 1,
        createdAt: now,
        resources: [moduleResource],
        lessons: [
          {
            id: 'lesson-resources',
            moduleId: 'module-resources',
            courseId: course.id,
            title: 'Aula com materiais',
            orderIndex: 1,
            filePath: '/course/module/aula.mp4',
            fileName: 'aula.mp4',
            fileExtension: 'mp4',
            mediaType: 'video',
            duration: 120,
            fileSize: 5000,
            availability: 'local',
            coverPath: '/course/module/aula-cover.jpg',
            createdAt: now,
            contentResources: [lessonResource, subtitleResource]
          }
        ]
      }
    ]

    dbService.saveCourseWithHierarchy(course, modules)

    const details = dbService.getCourseById(course.id)
    expect(details).not.toBeNull()
    expect(details!.modules[0].resources).toEqual([moduleResource])
    expect(details!.modules[0].lessons[0].contentResources).toEqual([
      lessonResource,
      subtitleResource
    ])
    expect(details!.modules[0].lessons[0].resources).toEqual([
      {
        id: 'resource-lesson-1',
        lessonId: 'lesson-resources',
        name: 'Slides',
        filePath: '/course/module/slides.pdf',
        fileExtension: 'pdf',
        fileSize: 2400,
        type: 'pdf'
      }
    ])
    expect(details!.modules[0].lessons[0].subtitles).toEqual([
      {
        id: 'subtitle-lesson-1',
        lessonId: 'lesson-resources',
        language: 'pt-BR',
        label: 'Português',
        filePath: '/course/module/aula.pt-BR.vtt',
        format: 'vtt'
      }
    ])
    expect(dbService.getRegisteredMediaPaths()).toEqual(
      expect.arrayContaining([
        '/course/course-cover.jpg',
        '/course/module/aula.mp4',
        '/course/module/aula-cover.jpg',
        moduleResource.filePath,
        lessonResource.filePath,
        subtitleResource.filePath
      ])
    )
  })

  it('rolls back the hierarchy when a resource insert fails in the same transaction', () => {
    dbService.connect(tempVaultDir)
    const now = Date.now()
    const course: Course = {
      id: 'course-resource-rollback',
      title: 'Resource rollback',
      slug: 'resource-rollback',
      sourceType: 'local-vault',
      rootPath: path.join(tempVaultDir, 'Courses', 'resource-rollback'),
      totalDuration: 60,
      moduleCount: 1,
      lessonCount: 1,
      createdAt: now,
      updatedAt: now
    }
    const duplicateResource: ContentResource = {
      id: 'duplicate-resource',
      courseId: course.id,
      moduleId: 'module-resource-rollback',
      role: 'resource',
      name: 'Guide',
      filePath: '/course/guide.pdf',
      fileExtension: 'pdf',
      fileSize: 50,
      type: 'pdf',
      createdAt: now
    }
    const modules: (Module & { lessons: Lesson[] })[] = [
      {
        id: 'module-resource-rollback',
        courseId: course.id,
        title: 'Module',
        orderIndex: 1,
        duration: 60,
        lessonCount: 1,
        createdAt: now,
        resources: [duplicateResource],
        lessons: [
          {
            id: 'lesson-resource-rollback',
            moduleId: 'module-resource-rollback',
            courseId: course.id,
            title: 'Lesson',
            orderIndex: 1,
            filePath: '/course/lesson.mp4',
            fileName: 'lesson.mp4',
            fileExtension: 'mp4',
            mediaType: 'video',
            duration: 60,
            fileSize: 100,
            availability: 'local',
            createdAt: now,
            contentResources: [
              {
                ...duplicateResource,
                lessonId: 'lesson-resource-rollback',
                filePath: '/course/lesson-guide.pdf'
              }
            ]
          }
        ]
      }
    ]

    expect(() => dbService.saveCourseWithHierarchy(course, modules)).toThrow()
    expect(dbService.getCourseById(course.id)).toBeNull()
  })

  it('keeps legacy lesson resources and subtitle tracks compatible with canonical resources', () => {
    dbService.connect(tempVaultDir)
    const now = Date.now()
    const course: Course = {
      id: 'course-legacy-resources',
      title: 'Legacy resources',
      slug: 'legacy-resources',
      sourceType: 'local-vault',
      rootPath: path.join(tempVaultDir, 'Courses', 'legacy-resources'),
      totalDuration: 60,
      moduleCount: 1,
      lessonCount: 1,
      createdAt: now,
      updatedAt: now
    }
    const modules: (Module & { lessons: Lesson[] })[] = [
      {
        id: 'module-legacy-resources',
        courseId: course.id,
        title: 'Module',
        orderIndex: 1,
        duration: 60,
        lessonCount: 1,
        createdAt: now,
        lessons: [
          {
            id: 'lesson-legacy-resources',
            moduleId: 'module-legacy-resources',
            courseId: course.id,
            title: 'Lesson',
            orderIndex: 1,
            filePath: '/course/lesson.mp4',
            fileName: 'lesson.mp4',
            fileExtension: 'mp4',
            mediaType: 'video',
            duration: 60,
            fileSize: 100,
            availability: 'local',
            createdAt: now,
            resources: [
              {
                id: 'legacy-attachment',
                lessonId: 'lesson-legacy-resources',
                name: 'Checklist',
                filePath: '/course/checklist.pdf',
                fileExtension: 'pdf',
                fileSize: 90,
                type: 'pdf'
              }
            ],
            subtitles: [
              {
                id: 'legacy-subtitle',
                lessonId: 'lesson-legacy-resources',
                language: 'en',
                label: 'English',
                filePath: '/course/lesson.en.srt',
                format: 'srt'
              }
            ]
          }
        ]
      }
    ]

    dbService.saveCourseWithHierarchy(course, modules)

    const lesson = dbService.getCourseById(course.id)!.modules[0].lessons[0]
    expect(lesson.resources).toEqual(modules[0].lessons[0].resources)
    expect(lesson.subtitles).toEqual(modules[0].lessons[0].subtitles)
    expect(lesson.contentResources).toEqual([
      expect.objectContaining({
        id: 'legacy-attachment',
        role: 'resource',
        lessonId: lesson.id
      }),
      expect.objectContaining({
        id: 'legacy-subtitle',
        role: 'subtitle',
        lessonId: lesson.id
      })
    ])
  })

  it('updates lastAccessedAt and orders courses by last_accessed_at DESC', () => {
    dbService.connect(tempVaultDir)
    const now = Date.now()

    const createCourse = (
      id: string,
      title: string,
      created: number
    ): Course => ({
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

    const createModule = (
      courseId: string
    ): (Module & { lessons: Lesson[] })[] => [
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

    dbService.saveCourseWithHierarchy(
      createCourse('c-1', 'First Course', now - 1000),
      createModule('c-1')
    )
    dbService.saveCourseWithHierarchy(
      createCourse('c-2', 'Second Course', now - 2000),
      createModule('c-2')
    )

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

  it('returns the latest saved position for a watched lesson', () => {
    dbService.connect(tempVaultDir)
    const now = Date.now()

    dbService.saveCourseWithHierarchy(
      {
        id: 'c-continue',
        title: 'Continue watching test',
        slug: 'continue-watching-test',
        sourceType: 'local-vault',
        rootPath: '/path',
        totalDuration: 600,
        moduleCount: 1,
        lessonCount: 1,
        createdAt: now,
        updatedAt: now
      },
      [
        {
          id: 'm-continue',
          courseId: 'c-continue',
          title: 'Module',
          orderIndex: 1,
          duration: 600,
          lessonCount: 1,
          createdAt: now,
          lessons: [
            {
              id: 'l-continue',
              moduleId: 'm-continue',
              courseId: 'c-continue',
              title: 'Lesson',
              orderIndex: 1,
              filePath: '/lesson.mp4',
              fileName: 'lesson.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 600,
              fileSize: 100,
              availability: 'local',
              createdAt: now
            }
          ]
        }
      ]
    )

    dbService.addWatchHistory({
      lessonId: 'l-continue',
      courseId: 'c-continue',
      lessonTitle: 'Lesson',
      courseTitle: 'Continue watching test',
      duration: 600,
      currentTime: 0
    })

    // The player saves progress for normal playback, pause, and seek events.
    dbService.saveLessonProgress({
      lessonId: 'l-continue',
      courseId: 'c-continue',
      currentTime: 60,
      duration: 600,
      completed: false
    })
    expect(dbService.getWatchHistory()[0]).toMatchObject({
      currentTime: 60,
      duration: 600
    })

    dbService.saveLessonProgress({
      lessonId: 'l-continue',
      courseId: 'c-continue',
      currentTime: 240,
      duration: 600,
      completed: false
    })
    expect(dbService.getWatchHistory()[0]).toMatchObject({
      currentTime: 240,
      duration: 600
    })

    dbService.saveLessonProgress({
      lessonId: 'l-continue',
      courseId: 'c-continue',
      currentTime: 120,
      duration: 600,
      completed: false
    })
    expect(dbService.getWatchHistory()[0]).toMatchObject({
      currentTime: 120,
      duration: 600
    })
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
            {
              id: 'ls-1',
              moduleId: 'm-summary',
              courseId: 'c-summary',
              title: 'L1',
              orderIndex: 1,
              filePath: '/1.mp4',
              fileName: '1.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 250,
              fileSize: 100,
              availability: 'local',
              createdAt: now
            },
            {
              id: 'ls-2',
              moduleId: 'm-summary',
              courseId: 'c-summary',
              title: 'L2',
              orderIndex: 2,
              filePath: '/2.mp4',
              fileName: '2.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 250,
              fileSize: 100,
              availability: 'local',
              createdAt: now
            },
            {
              id: 'ls-3',
              moduleId: 'm-summary',
              courseId: 'c-summary',
              title: 'L3',
              orderIndex: 3,
              filePath: '/3.mp4',
              fileName: '3.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 250,
              fileSize: 100,
              availability: 'local',
              createdAt: now
            },
            {
              id: 'ls-4',
              moduleId: 'm-summary',
              courseId: 'c-summary',
              title: 'L4',
              orderIndex: 4,
              filePath: '/4.mp4',
              fileName: '4.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 250,
              fileSize: 100,
              availability: 'local',
              createdAt: now
            }
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
            {
              id: 'ls-stat-1',
              moduleId: 'm-stat-1',
              courseId: 'c-stat',
              title: 'Les 1',
              orderIndex: 1,
              filePath: '/1.mp4',
              fileName: '1.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 1000,
              fileSize: 500,
              availability: 'local',
              createdAt: now
            }
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
            {
              id: 'ls-stat-2',
              moduleId: 'm-stat-2',
              courseId: 'c-stat',
              title: 'Les 2',
              orderIndex: 1,
              filePath: '/2.mp4',
              fileName: '2.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 1000,
              fileSize: 500,
              availability: 'local',
              createdAt: now
            }
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

  it('creates and verifies all optimized composite indexes and foreign key indexes', () => {
    dbService.connect(tempVaultDir)
    // Access internal SQLite db for index reflection
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internalDb = (dbService as any).db

    const indicesStmt = internalDb.prepare(`
      SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%'
    `)
    const indices = indicesStmt.all() as { name: string; tbl_name: string }[]
    const indexNames = indices.map((i) => i.name)

    // Verify critical performance and foreign-key indexes
    expect(indexNames).toContain('idx_courses_accessed_created')
    expect(indexNames).toContain('idx_lessons_course_module_order')
    expect(indexNames).toContain('idx_progress_course_completed')
    expect(indexNames).toContain('idx_progress_course_updated')
    expect(indexNames).toContain('idx_notes_course_time')
    expect(indexNames).toContain('idx_notes_lesson_time')
    expect(indexNames).toContain('idx_notes_course_created')
    expect(indexNames).toContain('idx_history_lesson')
    expect(indexNames).toContain('idx_history_course_watched')

    // Verify EXPLAIN QUERY PLAN uses composite indexes
    const explainLessons = internalDb
      .prepare(
        `
      EXPLAIN QUERY PLAN
      SELECT id FROM lessons WHERE course_id = ? ORDER BY module_id, order_index ASC
    `
      )
      .all('c-test') as { detail: string }[]
    const lessonsPlanText = explainLessons.map((p) => p.detail).join(' ')
    expect(lessonsPlanText).toContain('idx_lessons_course_module_order')

    const explainNotes = internalDb
      .prepare(
        `
      EXPLAIN QUERY PLAN
      SELECT id FROM lesson_notes WHERE course_id = ? ORDER BY timestamp_seconds
    `
      )
      .all('c-test') as { detail: string }[]
    const notesPlanText = explainNotes.map((p) => p.detail).join(' ')
    expect(notesPlanText).toContain('idx_notes_course_time')

    const explainHistory = internalDb
      .prepare(
        `
      EXPLAIN QUERY PLAN
      SELECT id FROM watch_history WHERE course_id = ? ORDER BY watched_at DESC
    `
      )
      .all('c-test') as { detail: string }[]
    const historyPlanText = explainHistory.map((p) => p.detail).join(' ')
    expect(historyPlanText).toContain('idx_history_course_watched')
  })

  it('optimizes getAllProgressSummaries into a single high-performance SQL aggregate query across multiple courses', () => {
    dbService.connect(tempVaultDir)
    const now = Date.now()

    // Setup 5 courses with diverse progress states
    for (let c = 1; c <= 5; c++) {
      const courseId = `course-bench-${c}`
      const lessonCount = c === 5 ? 0 : 4 // Course 5 has no lessons

      const modules: (Module & { lessons: Lesson[] })[] =
        lessonCount > 0
          ? [
              {
                id: `mod-${c}-1`,
                courseId,
                title: `Module ${c}`,
                orderIndex: 1,
                duration: 4000,
                lessonCount: 4,
                createdAt: now,
                lessons: [
                  {
                    id: `l-${c}-1`,
                    moduleId: `mod-${c}-1`,
                    courseId,
                    title: `L${c}.1`,
                    orderIndex: 1,
                    filePath: `/f1.mp4`,
                    fileName: `f1.mp4`,
                    fileExtension: 'mp4',
                    mediaType: 'video',
                    duration: 1000,
                    fileSize: 100,
                    availability: 'local',
                    createdAt: now
                  },
                  {
                    id: `l-${c}-2`,
                    moduleId: `mod-${c}-1`,
                    courseId,
                    title: `L${c}.2`,
                    orderIndex: 2,
                    filePath: `/f2.mp4`,
                    fileName: `f2.mp4`,
                    fileExtension: 'mp4',
                    mediaType: 'video',
                    duration: 1000,
                    fileSize: 100,
                    availability: 'local',
                    createdAt: now
                  },
                  {
                    id: `l-${c}-3`,
                    moduleId: `mod-${c}-1`,
                    courseId,
                    title: `L${c}.3`,
                    orderIndex: 3,
                    filePath: `/f3.mp4`,
                    fileName: `f3.mp4`,
                    fileExtension: 'mp4',
                    mediaType: 'video',
                    duration: 1000,
                    fileSize: 100,
                    availability: 'local',
                    createdAt: now
                  },
                  {
                    id: `l-${c}-4`,
                    moduleId: `mod-${c}-1`,
                    courseId,
                    title: `L${c}.4`,
                    orderIndex: 4,
                    filePath: `/f4.mp4`,
                    fileName: `f4.mp4`,
                    fileExtension: 'mp4',
                    mediaType: 'video',
                    duration: 1000,
                    fileSize: 100,
                    availability: 'local',
                    createdAt: now
                  }
                ]
              }
            ]
          : []

      dbService.saveCourseWithHierarchy(
        {
          id: courseId,
          title: `Course ${c}`,
          slug: `course-${c}`,
          sourceType: 'local-vault',
          rootPath: `/path/${c}`,
          totalDuration: lessonCount * 1000,
          moduleCount: lessonCount > 0 ? 1 : 0,
          lessonCount,
          createdAt: now,
          updatedAt: now
        },
        modules
      )
    }

    // Course 1: No progress recorded
    // Course 2: 1 of 4 completed (25%)
    dbService.saveLessonProgress({
      lessonId: 'l-2-1',
      courseId: 'course-bench-2',
      currentTime: 1000,
      duration: 1000,
      completed: true
    })

    // Course 3: 2 of 4 completed (50%)
    dbService.saveLessonProgress({
      lessonId: 'l-3-1',
      courseId: 'course-bench-3',
      currentTime: 1000,
      duration: 1000,
      completed: true
    })
    dbService.saveLessonProgress({
      lessonId: 'l-3-2',
      courseId: 'course-bench-3',
      currentTime: 1000,
      duration: 1000,
      completed: true
    })

    // Course 4: 4 of 4 completed (100%), with sequential progress updates to verify lastPlayed ranking
    dbService.saveLessonProgress({
      lessonId: 'l-4-1',
      courseId: 'course-bench-4',
      currentTime: 1000,
      duration: 1000,
      completed: true
    })
    dbService.saveLessonProgress({
      lessonId: 'l-4-2',
      courseId: 'course-bench-4',
      currentTime: 1000,
      duration: 1000,
      completed: true
    })
    dbService.saveLessonProgress({
      lessonId: 'l-4-3',
      courseId: 'course-bench-4',
      currentTime: 1000,
      duration: 1000,
      completed: true
    })
    dbService.saveLessonProgress({
      lessonId: 'l-4-4',
      courseId: 'course-bench-4',
      currentTime: 1000,
      duration: 1000,
      completed: true
    })

    // Execute bulk aggregate
    const allSummaries = dbService.getAllProgressSummaries()

    // Verify Course 1
    expect(allSummaries['course-bench-1']).toBeDefined()
    expect(allSummaries['course-bench-1'].totalLessons).toBe(4)
    expect(allSummaries['course-bench-1'].completedLessons).toBe(0)
    expect(allSummaries['course-bench-1'].percentage).toBe(0)
    expect(allSummaries['course-bench-1'].totalDuration).toBe(4000)
    expect(allSummaries['course-bench-1'].remainingDuration).toBe(4000)
    expect(allSummaries['course-bench-1'].lastPlayedLessonId).toBeUndefined()

    // Verify Course 2
    expect(allSummaries['course-bench-2']).toBeDefined()
    expect(allSummaries['course-bench-2'].totalLessons).toBe(4)
    expect(allSummaries['course-bench-2'].completedLessons).toBe(1)
    expect(allSummaries['course-bench-2'].percentage).toBe(25)
    expect(allSummaries['course-bench-2'].remainingDuration).toBe(3000)
    expect(allSummaries['course-bench-2'].lastPlayedLessonId).toBe('l-2-1')
    expect(allSummaries['course-bench-2'].lastPlayedLessonTitle).toBe('L2.1')

    // Verify Course 3
    expect(allSummaries['course-bench-3']).toBeDefined()
    expect(allSummaries['course-bench-3'].completedLessons).toBe(2)
    expect(allSummaries['course-bench-3'].percentage).toBe(50)
    expect(allSummaries['course-bench-3'].remainingDuration).toBe(2000)

    // Verify Course 4
    expect(allSummaries['course-bench-4']).toBeDefined()
    expect(allSummaries['course-bench-4'].completedLessons).toBe(4)
    expect(allSummaries['course-bench-4'].percentage).toBe(100)
    expect(allSummaries['course-bench-4'].remainingDuration).toBe(0)
    expect(allSummaries['course-bench-4'].lastPlayedLessonId).toBe('l-4-4')
    expect(allSummaries['course-bench-4'].lastPlayedLessonTitle).toBe('L4.4')

    // Course 5 (0 lessons) should not be present
    expect(allSummaries['course-bench-5']).toBeUndefined()

    // Verify that getAllProgressSummaries() matches individual getCourseProgressSummary() exactly
    for (let c = 1; c <= 4; c++) {
      const single = dbService.getCourseProgressSummary(`course-bench-${c}`)
      expect(allSummaries[`course-bench-${c}`]).toEqual(single)
    }
  })

  it('executes unified getVaultStats in a single query with exact data aggregation', () => {
    dbService.connect(tempVaultDir)
    const now = Date.now()

    // Empty DB stats
    const emptyStats = dbService.getVaultStats()
    expect(emptyStats).toEqual({
      courseCount: 0,
      moduleCount: 0,
      lessonCount: 0,
      totalDuration: 0,
      completedLessons: 0,
      totalWatchedTime: 0
    })

    // Populate with 2 courses
    dbService.saveCourseWithHierarchy(
      {
        id: 'c-v1',
        title: 'Vault Course 1',
        slug: 'v-1',
        sourceType: 'local-vault',
        rootPath: '/path1',
        totalDuration: 3600,
        moduleCount: 1,
        lessonCount: 2,
        createdAt: now,
        updatedAt: now
      },
      [
        {
          id: 'm-v1',
          courseId: 'c-v1',
          title: 'Mod 1',
          orderIndex: 1,
          duration: 3600,
          lessonCount: 2,
          createdAt: now,
          lessons: [
            {
              id: 'l-v1-1',
              moduleId: 'm-v1',
              courseId: 'c-v1',
              title: 'L1',
              orderIndex: 1,
              filePath: '/1.mp4',
              fileName: '1.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 1800,
              fileSize: 100,
              availability: 'local',
              createdAt: now
            },
            {
              id: 'l-v1-2',
              moduleId: 'm-v1',
              courseId: 'c-v1',
              title: 'L2',
              orderIndex: 2,
              filePath: '/2.mp4',
              fileName: '2.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 1800,
              fileSize: 100,
              availability: 'local',
              createdAt: now
            }
          ]
        }
      ]
    )

    dbService.saveCourseWithHierarchy(
      {
        id: 'c-v2',
        title: 'Vault Course 2',
        slug: 'v-2',
        sourceType: 'local-vault',
        rootPath: '/path2',
        totalDuration: 1200,
        moduleCount: 1,
        lessonCount: 1,
        createdAt: now,
        updatedAt: now
      },
      [
        {
          id: 'm-v2',
          courseId: 'c-v2',
          title: 'Mod 2',
          orderIndex: 1,
          duration: 1200,
          lessonCount: 1,
          createdAt: now,
          lessons: [
            {
              id: 'l-v2-1',
              moduleId: 'm-v2',
              courseId: 'c-v2',
              title: 'L2.1',
              orderIndex: 1,
              filePath: '/3.mp4',
              fileName: '3.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 1200,
              fileSize: 100,
              availability: 'local',
              createdAt: now
            }
          ]
        }
      ]
    )

    dbService.saveLessonProgress({
      lessonId: 'l-v1-1',
      courseId: 'c-v1',
      currentTime: 1800,
      duration: 1800,
      completed: true
    })
    dbService.saveLessonProgress({
      lessonId: 'l-v1-2',
      courseId: 'c-v1',
      currentTime: 600,
      duration: 1800,
      completed: false
    })
    dbService.saveLessonProgress({
      lessonId: 'l-v2-1',
      courseId: 'c-v2',
      currentTime: 1200,
      duration: 1200,
      completed: true
    })

    const stats = dbService.getVaultStats()
    expect(stats).toEqual({
      courseCount: 2,
      moduleCount: 2,
      lessonCount: 3,
      totalDuration: 4800,
      completedLessons: 2,
      totalWatchedTime: 3600 // 1800 + 600 + 1200
    })
  })

  it('supports lesson notes CRUD and indexed ordering', () => {
    dbService.connect(tempVaultDir)
    const now = Date.now()

    dbService.saveCourseWithHierarchy(
      {
        id: 'c-notes',
        title: 'Notes Course',
        slug: 'notes-course',
        sourceType: 'local-vault',
        rootPath: '/path',
        totalDuration: 600,
        moduleCount: 1,
        lessonCount: 1,
        createdAt: now,
        updatedAt: now
      },
      [
        {
          id: 'm-notes',
          courseId: 'c-notes',
          title: 'Mod',
          orderIndex: 1,
          duration: 600,
          lessonCount: 1,
          createdAt: now,
          lessons: [
            {
              id: 'l-notes-1',
              moduleId: 'm-notes',
              courseId: 'c-notes',
              title: 'L1',
              orderIndex: 1,
              filePath: '/1.mp4',
              fileName: '1.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 600,
              fileSize: 100,
              availability: 'local',
              createdAt: now
            }
          ]
        }
      ]
    )

    const note1 = dbService.addLessonNote({
      lessonId: 'l-notes-1',
      courseId: 'c-notes',
      timestampSeconds: 120,
      content: 'Second note in time'
    })

    const note2 = dbService.addLessonNote({
      lessonId: 'l-notes-1',
      courseId: 'c-notes',
      timestampSeconds: 30,
      content: 'First note in time'
    })

    // Retrieve notes ordered by timestamp_seconds ASC
    const lessonNotes = dbService.getLessonNotes('l-notes-1')
    expect(lessonNotes.length).toBe(2)
    expect(lessonNotes[0].id).toBe(note2.id)
    expect(lessonNotes[0].timestampSeconds).toBe(30)
    expect(lessonNotes[1].id).toBe(note1.id)
    expect(lessonNotes[1].timestampSeconds).toBe(120)

    // Update note
    dbService.updateLessonNote(note1.id, 'Updated note content')
    const updatedNotes = dbService.getLessonNotes('l-notes-1')
    expect(updatedNotes.find((n) => n.id === note1.id)?.content).toBe(
      'Updated note content'
    )
    // Course notes query
    const courseNotes = dbService.getCourseNotes('c-notes')
    expect(courseNotes.length).toBe(2)

    // Delete note
    dbService.deleteLessonNote(note2.id)
    expect(dbService.getLessonNotes('l-notes-1').length).toBe(1)
  })

  it('updates lesson duration and propagates to module and course totals', () => {
    dbService.connect(tempVaultDir)
    const now = Date.now()
    dbService.saveCourseWithHierarchy(
      {
        id: 'c-dur',
        title: 'Duration Test Course',
        slug: 'duration-test',
        sourceType: 'local-vault',
        rootPath: '/vault/Courses/Duration',
        totalDuration: 0,
        moduleCount: 1,
        lessonCount: 2,
        createdAt: now,
        updatedAt: now
      },
      [
        {
          id: 'm-dur-1',
          courseId: 'c-dur',
          title: '01 - Module',
          orderIndex: 1,
          duration: 0,
          lessonCount: 2,
          createdAt: now,
          lessons: [
            {
              id: 'l-dur-1',
              moduleId: 'm-dur-1',
              courseId: 'c-dur',
              title: 'L1',
              orderIndex: 1,
              filePath: '/1.mp4',
              fileName: '1.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 0,
              fileSize: 100,
              availability: 'local',
              createdAt: now
            },
            {
              id: 'l-dur-2',
              moduleId: 'm-dur-1',
              courseId: 'c-dur',
              title: 'L2',
              orderIndex: 2,
              filePath: '/2.mp4',
              fileName: '2.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 0,
              fileSize: 100,
              availability: 'local',
              createdAt: now
            }
          ]
        }
      ]
    )

    dbService.updateLessonDuration('l-dur-1', 150)
    dbService.updateLessonDuration('l-dur-2', 250)

    const course = dbService.getCourseById('c-dur')
    expect(course).not.toBeNull()
    expect(course?.course.totalDuration).toBe(400)
    expect(course?.modules[0].duration).toBe(400)
  })

  it('merges selected courses into a single canonical course', () => {
    dbService.connect(tempVaultDir)
    const now = Date.now()

    dbService.saveCourseWithHierarchy(
      {
        id: 'c-merge-1',
        title: 'Python Mastery',
        slug: 'python-mastery-1',
        sourceType: 'local-vault',
        rootPath: '/vault/Courses/Python1',
        totalDuration: 100,
        moduleCount: 1,
        lessonCount: 2,
        createdAt: now - 1000,
        updatedAt: now - 1000
      },
      [
        {
          id: 'm-m1',
          courseId: 'c-merge-1',
          title: '01 - Fundamentos',
          orderIndex: 1,
          duration: 100,
          lessonCount: 2,
          createdAt: now,
          lessons: [
            {
              id: 'l-m1',
              moduleId: 'm-m1',
              courseId: 'c-merge-1',
              title: '01 - Intro',
              orderIndex: 1,
              filePath: '/1.mp4',
              fileName: '1.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 50,
              fileSize: 100,
              availability: 'local',
              createdAt: now
            },
            {
              id: 'l-m2',
              moduleId: 'm-m1',
              courseId: 'c-merge-1',
              title: '02 - Variaveis',
              orderIndex: 2,
              filePath: '/2.mp4',
              fileName: '2.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 50,
              fileSize: 100,
              availability: 'local',
              createdAt: now
            }
          ]
        }
      ]
    )

    dbService.saveCourseWithHierarchy(
      {
        id: 'c-merge-2',
        title: 'Python Mastery Extra',
        slug: 'python-mastery-2',
        sourceType: 'local-vault',
        rootPath: '/vault/Courses/Python2',
        totalDuration: 50,
        moduleCount: 1,
        lessonCount: 1,
        createdAt: now,
        updatedAt: now
      },
      [
        {
          id: 'm-m2',
          courseId: 'c-merge-2',
          title: '02 - Avancado',
          orderIndex: 1,
          duration: 50,
          lessonCount: 1,
          createdAt: now,
          lessons: [
            {
              id: 'l-m3',
              moduleId: 'm-m2',
              courseId: 'c-merge-2',
              title: '01 - Decorators',
              orderIndex: 1,
              filePath: '/3.mp4',
              fileName: '3.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 50,
              fileSize: 100,
              availability: 'local',
              createdAt: now
            }
          ]
        }
      ]
    )

    const result = dbService.mergeCourses(['c-merge-1', 'c-merge-2'])
    expect(result.success).toBe(true)
    expect(result.removedCoursesCount).toBe(1)

    const merged = dbService.getCourseById('c-merge-1')
    expect(merged).not.toBeNull()
    expect(merged?.modules.length).toBe(2)
    expect(merged?.course.lessonCount).toBe(3)

    const deleted = dbService.getCourseById('c-merge-2')
    expect(deleted).toBeNull()
  })
})
