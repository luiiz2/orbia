import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { databaseService } from '../src/main/services/database.service'
import { parserService } from '../src/main/services/parser.service'
import { scannerService } from '../src/main/services/scanner.service'
import type { Course, Module, Lesson } from '../src/types'

describe('Multi-Import & Course/Lesson Covers Engine', () => {
  const testVaultDir = path.join(__dirname, 'tmp_covers_test_vault')

  beforeEach(() => {
    if (fs.existsSync(testVaultDir)) {
      fs.rmSync(testVaultDir, { recursive: true, force: true })
    }
    fs.mkdirSync(testVaultDir, { recursive: true })
    databaseService.connect(testVaultDir)
  })

  afterEach(() => {
    try {
      databaseService.close()
    } catch {}
    if (fs.existsSync(testVaultDir)) {
      fs.rmSync(testVaultDir, { recursive: true, force: true })
    }
  })

  it('persists and retrieves lesson cover_path in SQLite database', () => {
    const courseId = 'course-cover-001'
    const course: Course = {
      id: courseId,
      title: 'Course with Covers',
      slug: 'course-with-covers',
      sourceType: 'local-vault',
      rootPath: 'C:/test/course',
      coverPath: 'C:/test/course/cover.jpg',
      totalDuration: 600,
      moduleCount: 1,
      lessonCount: 2,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const lesson1: Lesson = {
      id: 'lesson-c-1',
      moduleId: 'mod-c-1',
      courseId,
      title: 'Lesson 1 with Custom Thumbnail',
      orderIndex: 1,
      filePath: 'C:/test/course/01 - intro.mp4',
      fileName: '01 - intro.mp4',
      fileExtension: 'mp4',
      mediaType: 'video',
      duration: 300,
      fileSize: 1000,
      availability: 'local',
      coverPath: 'C:/test/course/01 - intro.jpg',
      createdAt: Date.now()
    }

    const lesson2: Lesson = {
      id: 'lesson-c-2',
      moduleId: 'mod-c-1',
      courseId,
      title: 'Lesson 2 without Custom Thumbnail',
      orderIndex: 2,
      filePath: 'C:/test/course/02 - second.mp4',
      fileName: '02 - second.mp4',
      fileExtension: 'mp4',
      mediaType: 'video',
      duration: 300,
      fileSize: 1000,
      availability: 'local',
      createdAt: Date.now()
    }

    const module1: Module & { lessons: Lesson[] } = {
      id: 'mod-c-1',
      courseId,
      title: 'Module 1',
      orderIndex: 1,
      duration: 600,
      lessonCount: 2,
      createdAt: Date.now(),
      lessons: [lesson1, lesson2]
    }

    databaseService.saveCourseWithHierarchy(course, [module1])

    const retrieved = databaseService.getCourseById(courseId)
    expect(retrieved).toBeDefined()
    expect(retrieved?.course.coverPath).toBe('C:/test/course/cover.jpg')
    expect(retrieved?.modules[0].lessons[0].coverPath).toBe('C:/test/course/01 - intro.jpg')
    expect(retrieved?.modules[0].lessons[1].coverPath).toBeUndefined()
  })

  it('updates course cover and lesson cover dynamically', () => {
    const courseId = 'course-dyn-001'
    const course: Course = {
      id: courseId,
      title: 'Dynamic Cover Course',
      slug: 'dyn-course',
      sourceType: 'local-vault',
      rootPath: 'C:/test/dyn',
      totalDuration: 300,
      moduleCount: 1,
      lessonCount: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const lesson: Lesson = {
      id: 'lesson-dyn-1',
      moduleId: 'mod-dyn-1',
      courseId,
      title: 'Dynamic Lesson',
      orderIndex: 1,
      filePath: 'C:/test/dyn/lesson.mp4',
      fileName: 'lesson.mp4',
      fileExtension: 'mp4',
      mediaType: 'video',
      duration: 300,
      fileSize: 500,
      availability: 'local',
      createdAt: Date.now()
    }

    const mod: Module & { lessons: Lesson[] } = {
      id: 'mod-dyn-1',
      courseId,
      title: 'Mod',
      orderIndex: 1,
      duration: 300,
      lessonCount: 1,
      createdAt: Date.now(),
      lessons: [lesson]
    }

    databaseService.saveCourseWithHierarchy(course, [mod])

    // Update course cover
    databaseService.updateCourseCover(courseId, 'C:/covers/new-course-cover.png')
    const updatedCourse = databaseService.getCourseById(courseId)
    expect(updatedCourse?.course.coverPath).toBe('C:/covers/new-course-cover.png')

    // Update lesson cover
    databaseService.updateLessonCover('lesson-dyn-1', 'C:/covers/new-lesson-thumb.png')
    const updatedWithLesson = databaseService.getCourseById(courseId)
    expect(updatedWithLesson?.modules[0].lessons[0].coverPath).toBe('C:/covers/new-lesson-thumb.png')
  })

  it('auto-detects course cover image and lesson companion thumbnails in parserService', async () => {
    const courseFolder = path.join(testVaultDir, 'Python Complete')
    const moduleFolder = path.join(courseFolder, '01 - Basics')
    fs.mkdirSync(moduleFolder, { recursive: true })

    // Course level cover
    fs.writeFileSync(path.join(courseFolder, 'cover.png'), 'fake-image-data')

    // Lesson 1 video and companion image
    fs.writeFileSync(path.join(moduleFolder, '01 - Introduction.mp4'), 'fake-video')
    fs.writeFileSync(path.join(moduleFolder, '01 - Introduction.jpg'), 'fake-thumb')

    // Lesson 2 video without companion image
    fs.writeFileSync(path.join(moduleFolder, '02 - Variables.mp4'), 'fake-video-2')

    const scanned = await scannerService.scanDirectory(courseFolder)
    const proposal = await parserService.parseCourseHierarchy(scanned)

    expect(proposal.coverPath).toBeDefined()
    expect(path.basename(proposal.coverPath!)).toBe('cover.png')

    expect(proposal.modules.length).toBe(1)
    expect(proposal.modules[0].lessons.length).toBe(2)

    // Lesson 1 should have detected the companion thumbnail
    expect(proposal.modules[0].lessons[0].coverPath).toBeDefined()
    expect(path.basename(proposal.modules[0].lessons[0].coverPath!)).toBe('01 - Introduction.jpg')

    // Lesson 2 has no companion image but must get a generated fallback cover
    expect(proposal.modules[0].lessons[1].coverPath).toBeDefined()
  })

  it('supports importing multiple courses in batch', () => {
    const course1Id = 'batch-course-1'
    const course2Id = 'batch-course-2'

    const course1: Course = {
      id: course1Id,
      title: 'Course Alpha',
      slug: 'course-alpha',
      sourceType: 'local-vault',
      rootPath: 'C:/test/alpha',
      totalDuration: 100,
      moduleCount: 1,
      lessonCount: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const course2: Course = {
      id: course2Id,
      title: 'Course Beta',
      slug: 'course-beta',
      sourceType: 'local-vault',
      rootPath: 'C:/test/beta',
      totalDuration: 200,
      moduleCount: 1,
      lessonCount: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const mod1: Module & { lessons: Lesson[] } = {
      id: 'mod-a',
      courseId: course1Id,
      title: 'Alpha Mod',
      orderIndex: 1,
      duration: 100,
      lessonCount: 1,
      createdAt: Date.now(),
      lessons: [
        {
          id: 'les-a',
          moduleId: 'mod-a',
          courseId: course1Id,
          title: 'Lesson A',
          orderIndex: 1,
          filePath: 'C:/test/alpha/a.mp4',
          fileName: 'a.mp4',
          fileExtension: 'mp4',
          mediaType: 'video',
          duration: 100,
          fileSize: 500,
          availability: 'local',
          createdAt: Date.now()
        }
      ]
    }

    const mod2: Module & { lessons: Lesson[] } = {
      id: 'mod-b',
      courseId: course2Id,
      title: 'Beta Mod',
      orderIndex: 1,
      duration: 200,
      lessonCount: 1,
      createdAt: Date.now(),
      lessons: [
        {
          id: 'les-b',
          moduleId: 'mod-b',
          courseId: course2Id,
          title: 'Lesson B',
          orderIndex: 1,
          filePath: 'C:/test/beta/b.mp4',
          fileName: 'b.mp4',
          fileExtension: 'mp4',
          mediaType: 'video',
          duration: 200,
          fileSize: 500,
          availability: 'local',
          createdAt: Date.now()
        }
      ]
    }

    databaseService.saveCourseWithHierarchy(course1, [mod1])
    databaseService.saveCourseWithHierarchy(course2, [mod2])

    const allCourses = databaseService.getAllCourses()
    expect(allCourses.length).toBe(2)
    expect(allCourses.some((c) => c.id === course1Id)).toBe(true)
    expect(allCourses.some((c) => c.id === course2Id)).toBe(true)
  })

})
