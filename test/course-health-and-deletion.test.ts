import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { DatabaseService } from '../src/main/services/database.service'
import type { Course, Module, Lesson } from '../src/types'

describe('Course Health Diagnosis & Lesson Deletion', () => {
  let tempVaultDir: string
  let dbService: DatabaseService

  beforeEach(() => {
    tempVaultDir = path.join(os.tmpdir(), `orbia-health-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
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

  it('detects healthy course when all video files exist and are valid', () => {
    const courseDir = path.join(tempVaultDir, 'Courses', 'Healthy Course')
    const modDir = path.join(courseDir, 'Module 1')
    fs.mkdirSync(modDir, { recursive: true })

    const video1 = path.join(modDir, '01 - Intro.mp4')
    const video2 = path.join(modDir, '02 - Basics.mp4')
    fs.writeFileSync(video1, Buffer.alloc(1024))
    fs.writeFileSync(video2, Buffer.alloc(2048))

    const course: Course = {
      id: 'course-healthy',
      title: 'Healthy Course',
      slug: 'healthy-course',
      sourceType: 'local-vault',
      rootPath: courseDir,
      totalDuration: 0,
      moduleCount: 1,
      lessonCount: 2,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const module: Module = {
      id: 'mod-1',
      courseId: course.id,
      title: 'Module 1',
      orderIndex: 0,
      folderPath: modDir,
      duration: 0,
      lessonCount: 2,
      createdAt: Date.now()
    }

    const lessons: Lesson[] = [
      {
        id: 'lesson-1',
        moduleId: module.id,
        courseId: course.id,
        title: 'Intro',
        orderIndex: 0,
        filePath: video1,
        fileName: '01 - Intro.mp4',
        fileExtension: 'mp4',
        mediaType: 'video',
        duration: 0,
        fileSize: 1024,
        availability: 'local',
        createdAt: Date.now()
      },
      {
        id: 'lesson-2',
        moduleId: module.id,
        courseId: course.id,
        title: 'Basics',
        orderIndex: 1,
        filePath: video2,
        fileName: '02 - Basics.mp4',
        fileExtension: 'mp4',
        mediaType: 'video',
        duration: 0,
        fileSize: 2048,
        availability: 'local',
        createdAt: Date.now()
      }
    ]

    dbService.saveCourseWithHierarchy(course, [{ ...module, lessons }])

    const health = dbService.getCourseHealth(course.id)
    expect(health.healthy).toBe(true)
    expect(health.problemLessons.length).toBe(0)
    expect(health.totalLessons).toBe(2)
  })

  it('detects missing files, 0-byte files, and non-media files registered as lessons', () => {
    const courseDir = path.join(tempVaultDir, 'Courses', 'Problem Course')
    const modDir = path.join(courseDir, 'Module 1')
    fs.mkdirSync(modDir, { recursive: true })

    const validVideo = path.join(modDir, '01 - Intro.mp4')
    const zeroByteVideo = path.join(modDir, '02 - Empty.mp4')
    const typescriptFile = path.join(modDir, '03 - script.ts')
    const missingVideo = path.join(modDir, '04 - Missing.mp4')

    fs.writeFileSync(validVideo, Buffer.alloc(1024))
    fs.writeFileSync(zeroByteVideo, Buffer.alloc(0)) // 0 bytes
    fs.writeFileSync(typescriptFile, 'console.log("code")') // non-media code file
    // missingVideo is not written to disk

    const course: Course = {
      id: 'course-problems',
      title: 'Problem Course',
      slug: 'problem-course',
      sourceType: 'local-vault',
      rootPath: courseDir,
      totalDuration: 0,
      moduleCount: 1,
      lessonCount: 4,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const module: Module = {
      id: 'mod-prob',
      courseId: course.id,
      title: 'Module 1',
      orderIndex: 0,
      folderPath: modDir,
      duration: 0,
      lessonCount: 4,
      createdAt: Date.now()
    }

    const lessons: Lesson[] = [
      {
        id: 'l-valid',
        moduleId: module.id,
        courseId: course.id,
        title: 'Intro',
        orderIndex: 0,
        filePath: validVideo,
        fileName: '01 - Intro.mp4',
        fileExtension: 'mp4',
        mediaType: 'video',
        duration: 0,
        fileSize: 1024,
        availability: 'local',
        createdAt: Date.now()
      },
      {
        id: 'l-empty',
        moduleId: module.id,
        courseId: course.id,
        title: 'Empty Video',
        orderIndex: 1,
        filePath: zeroByteVideo,
        fileName: '02 - Empty.mp4',
        fileExtension: 'mp4',
        mediaType: 'video',
        duration: 0,
        fileSize: 0,
        availability: 'local',
        createdAt: Date.now()
      },
      {
        id: 'l-ts',
        moduleId: module.id,
        courseId: course.id,
        title: 'Typescript Code',
        orderIndex: 2,
        filePath: typescriptFile,
        fileName: '03 - script.ts',
        fileExtension: 'ts',
        mediaType: 'video', // incorrectly marked as video previously
        duration: 0,
        fileSize: 20,
        availability: 'local',
        createdAt: Date.now()
      },
      {
        id: 'l-missing',
        moduleId: module.id,
        courseId: course.id,
        title: 'Missing Video',
        orderIndex: 3,
        filePath: missingVideo,
        fileName: '04 - Missing.mp4',
        fileExtension: 'mp4',
        mediaType: 'video',
        duration: 0,
        fileSize: 5000,
        availability: 'local',
        createdAt: Date.now()
      }
    ]

    dbService.saveCourseWithHierarchy(course, [{ ...module, lessons: [lessons[0], lessons[1], lessons[3]] }])
    // Simulate legacy non-media lesson in database
    const insertRaw = (dbService as any).db.prepare(`
      INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, availability, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    insertRaw.run('l-ts', module.id, course.id, 'Typescript Code', 2, typescriptFile, '03 - script.ts', 'ts', 'video', 0, 20, 'local', Date.now())

    const health = dbService.getCourseHealth(course.id)
    expect(health.healthy).toBe(false)
    expect(health.problemLessons.length).toBe(3)

    const missingProb = health.problemLessons.find((p) => p.id === 'l-missing')
    expect(missingProb).toBeDefined()
    expect(missingProb?.problemType).toBe('missing_file')

    const emptyProb = health.problemLessons.find((p) => p.id === 'l-empty')
    expect(emptyProb).toBeDefined()
    expect(emptyProb?.problemType).toBe('zero_bytes')

    const tsProb = health.problemLessons.find((p) => p.id === 'l-ts')
    expect(tsProb).toBeDefined()
    expect(tsProb?.problemType).toBe('non_media_type')
  })

  it('fixCourseProblems converts non-media lessons to module content_resources', () => {
    const courseDir = path.join(tempVaultDir, 'Courses', 'Code Course')
    const modDir = path.join(courseDir, 'Module 1')
    fs.mkdirSync(modDir, { recursive: true })

    const videoPath = path.join(modDir, '01 - Lesson.mp4')
    const codePath = path.join(modDir, '02 - exercises.ts')
    fs.writeFileSync(videoPath, Buffer.alloc(1024))
    fs.writeFileSync(codePath, 'console.log("hello")')

    const course: Course = {
      id: 'course-code',
      title: 'Code Course',
      slug: 'code-course',
      sourceType: 'local-vault',
      rootPath: courseDir,
      totalDuration: 0,
      moduleCount: 1,
      lessonCount: 2,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const module: Module = {
      id: 'mod-code',
      courseId: course.id,
      title: 'Module 1',
      orderIndex: 0,
      folderPath: modDir,
      duration: 0,
      lessonCount: 2,
      createdAt: Date.now()
    }

    const lessons: Lesson[] = [
      {
        id: 'l-vid',
        moduleId: module.id,
        courseId: course.id,
        title: 'Lesson',
        orderIndex: 0,
        filePath: videoPath,
        fileName: '01 - Lesson.mp4',
        fileExtension: 'mp4',
        mediaType: 'video',
        duration: 0,
        fileSize: 1024,
        availability: 'local',
        createdAt: Date.now()
      }
    ]

    dbService.saveCourseWithHierarchy(course, [{ ...module, lessons }])

    // Manually force-insert legacy non-media lesson into lessons table
    const insertRaw = (dbService as any).db.prepare(`
      INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, availability, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    insertRaw.run('l-code', module.id, course.id, 'Exercises', 1, codePath, '02 - exercises.ts', 'ts', 'video', 0, 20, 'local', Date.now())

    const fixResult = dbService.fixCourseProblems(course.id)
    expect(fixResult.success).toBe(true)
    expect(fixResult.fixedCount).toBe(1)

    // Verify course hierarchy now has 1 lesson and 1 module resource
    const updated = dbService.getCourseById(course.id)
    expect(updated).toBeDefined()
    expect(updated?.modules[0].lessons.length).toBe(1)
    expect(updated?.modules[0].lessons[0].id).toBe('l-vid')
    expect(updated?.modules[0].resources?.length).toBe(1)
    expect(updated?.modules[0].resources?.[0].name).toBe('02 - exercises.ts')
    expect(updated?.course.lessonCount).toBe(1)
  })

  it('deletes a lesson and optionally deletes physical file with journal record', () => {
    const courseDir = path.join(tempVaultDir, 'Courses', 'Delete Lesson Course')
    const modDir = path.join(courseDir, 'Module 1')
    fs.mkdirSync(modDir, { recursive: true })

    const video1 = path.join(modDir, '01 - Keep.mp4')
    const video2 = path.join(modDir, '02 - Delete.mp4')
    fs.writeFileSync(video1, Buffer.alloc(1024))
    fs.writeFileSync(video2, Buffer.alloc(1024))

    const course: Course = {
      id: 'course-del-lesson',
      title: 'Delete Lesson Course',
      slug: 'delete-lesson-course',
      sourceType: 'local-vault',
      rootPath: courseDir,
      totalDuration: 0,
      moduleCount: 1,
      lessonCount: 2,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const module: Module = {
      id: 'mod-del',
      courseId: course.id,
      title: 'Module 1',
      orderIndex: 0,
      folderPath: modDir,
      duration: 0,
      lessonCount: 2,
      createdAt: Date.now()
    }

    const lessons: Lesson[] = [
      {
        id: 'l-keep',
        moduleId: module.id,
        courseId: course.id,
        title: 'Keep',
        orderIndex: 0,
        filePath: video1,
        fileName: '01 - Keep.mp4',
        fileExtension: 'mp4',
        mediaType: 'video',
        duration: 0,
        fileSize: 1024,
        availability: 'local',
        createdAt: Date.now()
      },
      {
        id: 'l-delete',
        moduleId: module.id,
        courseId: course.id,
        title: 'Delete',
        orderIndex: 1,
        filePath: video2,
        fileName: '02 - Delete.mp4',
        fileExtension: 'mp4',
        mediaType: 'video',
        duration: 0,
        fileSize: 1024,
        availability: 'local',
        createdAt: Date.now()
      }
    ]

    dbService.saveCourseWithHierarchy(course, [{ ...module, lessons }])

    // Delete lesson with physical file deletion
    const delResult = dbService.deleteLesson('l-delete', true)
    expect(delResult.success).toBe(true)

    // Verify file deleted from disk
    expect(fs.existsSync(video2)).toBe(false)
    expect(fs.existsSync(video1)).toBe(true)

    // Verify hierarchy re-indexed
    const updated = dbService.getCourseById(course.id)
    expect(updated?.modules[0].lessons.length).toBe(1)
    expect(updated?.modules[0].lessons[0].id).toBe('l-keep')
    expect(updated?.course.lessonCount).toBe(1)
  })

  it('automatically routes non-media files (e.g. Descricao.html, apostila.pdf) to module resources in saveCourseWithHierarchy', () => {
    const courseDir = path.join(tempVaultDir, 'Courses', 'HTML Course')
    const modDir = path.join(courseDir, 'Module 1')
    fs.mkdirSync(modDir, { recursive: true })

    const video1 = path.join(modDir, '01 - Intro.mp4')
    const htmlFile = path.join(modDir, 'Descrição.html')
    fs.writeFileSync(video1, Buffer.alloc(1024))
    fs.writeFileSync(htmlFile, Buffer.from('<h1>Curso</h1>'))

    const course: Course = {
      id: 'course-html',
      title: 'HTML Course',
      slug: 'html-course',
      sourceType: 'local-vault',
      rootPath: courseDir,
      totalDuration: 0,
      moduleCount: 1,
      lessonCount: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const module: Module = {
      id: 'mod-html',
      courseId: course.id,
      title: 'Module 1',
      orderIndex: 0,
      folderPath: modDir,
      duration: 0,
      lessonCount: 1,
      createdAt: Date.now()
    }

    const lessons: Lesson[] = [
      {
        id: 'lesson-video',
        moduleId: module.id,
        courseId: course.id,
        title: 'Intro Video',
        orderIndex: 0,
        filePath: video1,
        fileName: '01 - Intro.mp4',
        fileExtension: 'mp4',
        mediaType: 'video',
        duration: 100,
        fileSize: 1024,
        availability: 'local',
        createdAt: Date.now()
      },
      {
        id: 'lesson-html',
        moduleId: module.id,
        courseId: course.id,
        title: 'Descrição',
        orderIndex: 1,
        filePath: htmlFile,
        fileName: 'Descrição.html',
        fileExtension: 'html',
        mediaType: 'document',
        duration: 0,
        fileSize: 50,
        availability: 'local',
        createdAt: Date.now()
      }
    ]

    dbService.saveCourseWithHierarchy(course, [{ ...module, lessons }])

    const fetched = dbService.getCourseById(course.id)
    expect(fetched).not.toBeNull()
    // Video is the only lesson
    expect(fetched?.modules[0].lessons.length).toBe(1)
    expect(fetched?.modules[0].lessons[0].fileName).toBe('01 - Intro.mp4')

    // HTML file was automatically saved as module resource / material
    expect(fetched?.modules[0].resources?.length).toBe(1)
    expect(fetched?.modules[0].resources?.[0].name).toBe('Descrição.html')
    expect(fetched?.modules[0].resources?.[0].role).toBe('resource')
  })

  it('cleanupNonMediaLessons automatically heals existing courses with non-media lessons on connect', () => {
    const courseDir = path.join(tempVaultDir, 'Courses', 'Legacy Course')
    const modDir = path.join(courseDir, 'Module 1')
    fs.mkdirSync(modDir, { recursive: true })

    const video1 = path.join(modDir, '01 - Intro.mp4')
    const docFile = path.join(modDir, 'Apostila.pdf')
    fs.writeFileSync(video1, Buffer.alloc(1024))
    fs.writeFileSync(docFile, Buffer.alloc(512))

    const course: Course = {
      id: 'course-legacy',
      title: 'Legacy Course',
      slug: 'legacy-course',
      sourceType: 'local-vault',
      rootPath: courseDir,
      totalDuration: 0,
      moduleCount: 1,
      lessonCount: 2,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const module: Module = {
      id: 'mod-legacy',
      courseId: course.id,
      title: 'Module 1',
      orderIndex: 0,
      folderPath: modDir,
      duration: 0,
      lessonCount: 2,
      createdAt: Date.now()
    }

    // Direct insertion of a non-media lesson simulating legacy database state
    dbService.saveCourseWithHierarchy(course, [{ ...module, lessons: [] }])
    
    // Manually force-insert legacy non-media lesson into lessons table
    const stmt = (dbService as any).db.prepare(`
      INSERT INTO lessons (
        id, module_id, course_id, title, order_index,
        file_path, file_name, file_extension, media_type,
        duration, file_size, availability, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run('l-vid', module.id, course.id, 'Intro Video', 1, video1, '01 - Intro.mp4', 'mp4', 'video', 120, 1024, 'local', Date.now())
    stmt.run('l-doc', module.id, course.id, 'Apostila', 2, docFile, 'Apostila.pdf', 'pdf', 'document', 0, 512, 'local', Date.now())

    // Run cleanup
    dbService.cleanupNonMediaLessons()

    // Verify course is healed
    const healed = dbService.getCourseById(course.id)
    expect(healed?.modules[0].lessons.length).toBe(1)
    expect(healed?.modules[0].lessons[0].id).toBe('l-vid')
    expect(healed?.modules[0].resources?.length).toBe(1)
    expect(healed?.modules[0].resources?.[0].name).toBe('Apostila.pdf')
  })
})
