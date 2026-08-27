import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseService } from '../src/main/services/database.service'
import type { ContentResource, Course, Module, Lesson } from '../src/types'

const TEST_VAULT_DIR = path.join(__dirname, 'tmp_merge_test_vault')

describe('DatabaseService - Course Merging & Deduplication', () => {
  let dbService: DatabaseService

  beforeEach(() => {
    if (fs.existsSync(TEST_VAULT_DIR)) {
      fs.rmSync(TEST_VAULT_DIR, { recursive: true, force: true })
    }
    fs.mkdirSync(TEST_VAULT_DIR, { recursive: true })
    dbService = new DatabaseService()
    dbService.connect(TEST_VAULT_DIR)
  })

  afterEach(() => {
    dbService.close()
    if (fs.existsSync(TEST_VAULT_DIR)) {
      fs.rmSync(TEST_VAULT_DIR, { recursive: true, force: true })
    }
  })

  it('merges multiple courses with the same title into one canonical course', () => {
    // 1. Create Course 1 ("Voss Academy" with Module 1: Lesson 1, Lesson 2)
    const course1: Course = {
      id: 'course-1',
      title: 'Voss Academy',
      slug: 'voss-academy-1',
      sourceType: 'local-vault',
      rootPath: 'C:/Vault/Voss1',
      moduleCount: 1,
      lessonCount: 2,
      totalDuration: 120,
      createdAt: 1000,
      updatedAt: 1000
    }
    const module1: Module & { lessons: Lesson[] } = {
      id: 'mod-1',
      courseId: 'course-1',
      title: 'Módulo 01 - Fundamentos',
      orderIndex: 1,
      duration: 120,
      lessonCount: 2,
      createdAt: 1000,
      lessons: [
        {
          id: 'les-1',
          moduleId: 'mod-1',
          courseId: 'course-1',
          title: 'Aula 01 - Introdução',
          fileName: '01_intro.mp4',
          filePath: 'C:/Vault/Voss1/01_intro.mp4',
          fileExtension: 'mp4',
          mediaType: 'video',
          orderIndex: 1,
          duration: 60,
          fileSize: 1000,
          availability: 'local',
          createdAt: 1000
        },
        {
          id: 'les-2',
          moduleId: 'mod-1',
          courseId: 'course-1',
          title: 'Aula 02 - Conceitos Básicos',
          fileName: '02_conceitos.mp4',
          filePath: 'C:/Vault/Voss1/02_conceitos.mp4',
          fileExtension: 'mp4',
          mediaType: 'video',
          orderIndex: 2,
          duration: 60,
          fileSize: 1000,
          availability: 'local',
          createdAt: 1000
        }
      ]
    }
    dbService.saveCourseWithHierarchy(course1, [module1])

    // 2. Create Course 2 ("Voss Academy" with Module 1: Duplicate Lesson 1 + New Lesson 3, and Module 2: Lesson 4)
    const course2: Course = {
      id: 'course-2',
      title: 'Voss Academy',
      slug: 'voss-academy-2',
      sourceType: 'local-vault',
      rootPath: 'C:/Vault/Voss2',
      moduleCount: 2,
      lessonCount: 3,
      totalDuration: 180,
      createdAt: 2000,
      updatedAt: 2000
    }
    const module2A: Module & { lessons: Lesson[] } = {
      id: 'mod-2a',
      courseId: 'course-2',
      title: 'Módulo 01 - Fundamentos',
      orderIndex: 1,
      duration: 120,
      lessonCount: 2,
      createdAt: 2000,
      lessons: [
        {
          id: 'les-duplicate-1',
          moduleId: 'mod-2a',
          courseId: 'course-2',
          title: 'Aula 01 - Introdução',
          fileName: '01_intro.mp4',
          filePath: 'C:/Vault/Voss2/01_intro.mp4',
          fileExtension: 'mp4',
          mediaType: 'video',
          orderIndex: 1,
          duration: 60,
          fileSize: 1000,
          availability: 'local',
          createdAt: 2000
        },
        {
          id: 'les-3',
          moduleId: 'mod-2a',
          courseId: 'course-2',
          title: 'Aula 03 - Primeiros Passos',
          fileName: '03_passos.mp4',
          filePath: 'C:/Vault/Voss2/03_passos.mp4',
          fileExtension: 'mp4',
          mediaType: 'video',
          orderIndex: 2,
          duration: 60,
          fileSize: 1000,
          availability: 'local',
          createdAt: 2000
        }
      ]
    }
    const module2B: Module & { lessons: Lesson[] } = {
      id: 'mod-2b',
      courseId: 'course-2',
      title: 'Módulo 02 - Avançado',
      orderIndex: 2,
      duration: 60,
      lessonCount: 1,
      createdAt: 2000,
      lessons: [
        {
          id: 'les-4',
          moduleId: 'mod-2b',
          courseId: 'course-2',
          title: 'Aula 04 - Técnicas Avançadas',
          fileName: '04_avancado.mp4',
          filePath: 'C:/Vault/Voss2/04_avancado.mp4',
          fileExtension: 'mp4',
          mediaType: 'video',
          orderIndex: 1,
          duration: 60,
          fileSize: 1000,
          availability: 'local',
          createdAt: 2000
        }
      ]
    }
    dbService.saveCourseWithHierarchy(course2, [module2A, module2B])

    // Verify initially 2 courses exist
    expect(dbService.getAllCourses()).toHaveLength(2)

    // Run merge
    const result = dbService.mergeDuplicateCourses()
    expect(result.success).toBe(true)
    expect(result.mergedGroupsCount).toBe(1)
    expect(result.removedCoursesCount).toBe(1)
    expect(result.deduplicatedLessonsCount).toBe(1)

    // Verify only 1 course remains
    const allCourses = dbService.getAllCourses()
    expect(allCourses).toHaveLength(1)
    expect(allCourses[0].title).toBe('Voss Academy')

    // Verify hierarchy of unified course
    const hierarchy = dbService.getCourseById(allCourses[0].id)
    expect(hierarchy).not.toBeNull()
    expect(hierarchy!.modules).toHaveLength(2) // Module 1 and Module 2
    expect(hierarchy!.course.lessonCount).toBe(4) // 4 unique lessons (1, 2, 3, 4)

    const mod1 = hierarchy!.modules.find((m) => m.title.includes('Fundamentos'))
    expect(mod1).toBeDefined()
    expect(mod1!.lessons).toHaveLength(3) // Lessons 1, 2, 3

    const mod2 = hierarchy!.modules.find((m) => m.title.includes('Avançado'))
    expect(mod2).toBeDefined()
    expect(mod2!.lessons).toHaveLength(1) // Lesson 4
  })

  it('records and retrieves import history entries', () => {
    const entry = dbService.recordImportHistory({
      fileName: 'Voss Academy-001.zip',
      filePath: 'C:/Downloads/Voss Academy-001.zip',
      fileSize: 50000000,
      status: 'completed',
      courseTitle: 'Voss Academy',
      extractedFiles: 40
    })

    expect(entry.id).toBeDefined()
    expect(entry.fileName).toBe('Voss Academy-001.zip')

    const history = dbService.getImportHistory()
    expect(history).toHaveLength(1)
    expect(history[0].courseTitle).toBe('Voss Academy')
    expect(history[0].extractedFiles).toBe(40)

    dbService.clearImportHistory()
    expect(dbService.getImportHistory()).toHaveLength(0)
  })

  it('merges user-selected courses into one canonical course preserving all modules', () => {
    const makeCourse = (id: string, title: string, modId: string, lesId: string, modTitle: string, lessonTitle: string): void => {
      const course: Course = {
        id,
        title,
        slug: `${id}-slug`,
        sourceType: 'local-vault',
        rootPath: `C:/Vault/${id}`,
        moduleCount: 1,
        lessonCount: 1,
        totalDuration: 60,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      const mod: Module & { lessons: Lesson[] } = {
        id: modId,
        courseId: id,
        title: modTitle,
        orderIndex: 1,
        duration: 60,
        lessonCount: 1,
        createdAt: Date.now(),
        lessons: [
          {
            id: lesId,
            moduleId: modId,
            courseId: id,
            title: lessonTitle,
            fileName: `${lesId}.mp4`,
            filePath: `C:/Vault/${id}/${lesId}.mp4`,
            fileExtension: 'mp4',
            mediaType: 'video',
            orderIndex: 1,
            duration: 60,
            fileSize: 1000,
            availability: 'local',
            createdAt: Date.now()
          }
        ]
      }
      dbService.saveCourseWithHierarchy(course, [mod])
    }

    makeCourse('part-1', 'Curso.dev-1-001', 'mod-p1', 'les-p1', 'Dia 1', 'Aula 01')
    makeCourse('part-2', 'Curso.dev-1-011', 'mod-p2', 'les-p2', 'Dia 11', 'Aula 41')
    makeCourse('part-3', 'Curso.dev-1-013', 'mod-p3', 'les-p3', 'Dia 13', 'Aula 61')

    // Track progress on a secondary lesson to verify re-pointing
    dbService.saveLessonProgress({
      lessonId: 'les-p2',
      courseId: 'part-2',
      currentTime: 10,
      duration: 60,
      completed: false
    })

    const result = dbService.mergeCoursesByIds(['part-1', 'part-2', 'part-3'], 'Curso.dev Completo')

    expect(result.success).toBe(true)
    expect(result.removedCoursesCount).toBe(2)
    expect(result.details[0].title).toBe('Curso.dev Completo')
    expect(result.details[0].totalLessons).toBe(3)

    const allCourses = dbService.getAllCourses()
    expect(allCourses).toHaveLength(1)
    expect(allCourses[0].title).toBe('Curso.dev Completo')
    expect(allCourses[0].lessonCount).toBe(3)

    const hierarchy = dbService.getCourseById(allCourses[0].id)
    expect(hierarchy!.modules).toHaveLength(3)

    // Progress re-pointed to canonical course
    const progress = dbService.getLessonProgress('les-p2')
    expect(progress).not.toBeNull()
    expect(progress!.courseId).toBe(allCourses[0].id)

    // Modules re-indexed naturally
    const modTitles = hierarchy!.modules.map((m) => m.title)
    expect(modTitles).toEqual(['Dia 1', 'Dia 11', 'Dia 13'])
    expect(hierarchy!.modules.map((m) => m.orderIndex)).toEqual([1, 2, 3])
  })

  it('builds a read-only merge preview that merges matching modules, creates new modules, and counts materials', () => {
    const now = 1_000
    const resource = (
      id: string,
      courseId: string,
      moduleId: string,
      lessonId?: string
    ): ContentResource => ({
      id,
      courseId,
      moduleId,
      lessonId,
      role: 'resource',
      name: `${id}.pdf`,
      filePath: `C:/Vault/${courseId}/${id}.pdf`,
      fileExtension: 'pdf',
      fileSize: 100,
      type: 'pdf',
      createdAt: now
    })
    const courseA: Course = {
      id: 'preview-course-a',
      title: 'Curso dividido',
      slug: 'preview-course-a',
      sourceType: 'local-vault',
      rootPath: 'C:/Vault/preview-course-a',
      moduleCount: 1,
      lessonCount: 2,
      totalDuration: 120,
      createdAt: now,
      updatedAt: now
    }
    const moduleA: Module & { lessons: Lesson[] } = {
      id: 'preview-module-a-day-1',
      courseId: courseA.id,
      title: 'Dia 1',
      orderIndex: 1,
      duration: 120,
      lessonCount: 2,
      createdAt: now,
      resources: [resource('preview-a-module-material', courseA.id, 'preview-module-a-day-1')],
      lessons: [
        {
          id: 'preview-lesson-a-duplicate',
          moduleId: 'preview-module-a-day-1',
          courseId: courseA.id,
          title: 'Aula 1',
          fileName: 'aula-1.mp4',
          filePath: 'C:/Vault/preview-course-a/aula-1.mp4',
          fileExtension: 'mp4',
          mediaType: 'video',
          orderIndex: 1,
          duration: 60,
          fileSize: 1_000,
          availability: 'local',
          createdAt: now,
          contentResources: [
            resource(
              'preview-a-lesson-material',
              courseA.id,
              'preview-module-a-day-1',
              'preview-lesson-a-duplicate'
            )
          ]
        },
        {
          id: 'preview-lesson-a-unique',
          moduleId: 'preview-module-a-day-1',
          courseId: courseA.id,
          title: 'Aula 2',
          fileName: 'aula-2.mp4',
          filePath: 'C:/Vault/preview-course-a/aula-2.mp4',
          fileExtension: 'mp4',
          mediaType: 'video',
          orderIndex: 2,
          duration: 60,
          fileSize: 1_000,
          availability: 'local',
          createdAt: now
        }
      ]
    }
    const courseB: Course = {
      id: 'preview-course-b',
      title: 'Curso dividido — parte 2',
      slug: 'preview-course-b',
      sourceType: 'local-vault',
      rootPath: 'C:/Vault/preview-course-b',
      moduleCount: 2,
      lessonCount: 2,
      totalDuration: 120,
      createdAt: now + 1,
      updatedAt: now + 1
    }
    const moduleBDay1: Module & { lessons: Lesson[] } = {
      id: 'preview-module-b-day-1',
      courseId: courseB.id,
      title: 'DIA 1',
      orderIndex: 1,
      duration: 60,
      lessonCount: 1,
      createdAt: now + 1,
      resources: [resource('preview-b-day-1-module-material', courseB.id, 'preview-module-b-day-1')],
      lessons: [
        {
          id: 'preview-lesson-b-duplicate',
          moduleId: 'preview-module-b-day-1',
          courseId: courseB.id,
          title: 'Aula 1',
          fileName: 'aula-1.mp4',
          filePath: 'C:/Vault/preview-course-b/aula-1.mp4',
          fileExtension: 'mp4',
          mediaType: 'video',
          orderIndex: 1,
          duration: 60,
          fileSize: 1_000,
          availability: 'local',
          createdAt: now + 1,
          contentResources: [
            resource(
              'preview-b-day-1-lesson-material',
              courseB.id,
              'preview-module-b-day-1',
              'preview-lesson-b-duplicate'
            )
          ]
        }
      ]
    }
    const moduleBDay2: Module & { lessons: Lesson[] } = {
      id: 'preview-module-b-day-2',
      courseId: courseB.id,
      title: 'Dia 2',
      orderIndex: 2,
      duration: 60,
      lessonCount: 1,
      createdAt: now + 1,
      resources: [resource('preview-b-day-2-module-material', courseB.id, 'preview-module-b-day-2')],
      lessons: [
        {
          id: 'preview-lesson-b-new',
          moduleId: 'preview-module-b-day-2',
          courseId: courseB.id,
          title: 'Aula 3',
          fileName: 'aula-3.mp4',
          filePath: 'C:/Vault/preview-course-b/aula-3.mp4',
          fileExtension: 'mp4',
          mediaType: 'video',
          orderIndex: 1,
          duration: 60,
          fileSize: 1_000,
          availability: 'local',
          createdAt: now + 1,
          contentResources: [
            resource(
              'preview-b-day-2-lesson-material',
              courseB.id,
              'preview-module-b-day-2',
              'preview-lesson-b-new'
            )
          ]
        }
      ]
    }

    dbService.saveCourseWithHierarchy(courseA, [moduleA])
    dbService.saveCourseWithHierarchy(courseB, [moduleBDay1, moduleBDay2])

    const dbPath = path.join(TEST_VAULT_DIR, '.orbia', 'library.db')
    const snapshotDatabaseFiles = (): Record<string, string | undefined> => ({
      database: fs.readFileSync(dbPath).toString('base64'),
      wal: fs.existsSync(`${dbPath}-wal`) ? fs.readFileSync(`${dbPath}-wal`).toString('base64') : undefined
    })
    const beforeHierarchy = [dbService.getCourseById(courseA.id), dbService.getCourseById(courseB.id)]
    const beforeDatabaseFiles = snapshotDatabaseFiles()
    const preview = dbService.getMergePreview([courseA.id, courseB.id])

    expect(preview.canonicalCourseId).toBe(courseA.id)
    expect(preview.totalLessons).toBe(4)
    expect(preview.totalMaterials).toBe(6)
    expect(preview.modules).toEqual([
      expect.objectContaining({
        sourceCourseId: courseB.id,
        sourceModuleId: moduleBDay1.id,
        title: 'DIA 1',
        action: 'merge',
        targetModuleId: moduleA.id,
        lessonCount: 1,
        materialCount: 2
      }),
      expect.objectContaining({
        sourceCourseId: courseB.id,
        sourceModuleId: moduleBDay2.id,
        title: 'Dia 2',
        action: 'create',
        lessonCount: 1,
        materialCount: 2
      })
    ])
    expect(preview.duplicateCandidates).toEqual([
      expect.objectContaining({
        sourceLessonId: 'preview-lesson-b-duplicate',
        targetLessonId: 'preview-lesson-a-duplicate',
        reason: 'same-title'
      })
    ])
    expect([dbService.getCourseById(courseA.id), dbService.getCourseById(courseB.id)]).toEqual(beforeHierarchy)
    expect(snapshotDatabaseFiles()).toEqual(beforeDatabaseFiles)
  })

  it('validates a merge preview selection before calculating it', () => {
    expect(() => dbService.getMergePreview(['only-one'])).toThrow(/at least two courses/i)
    expect(() => dbService.getMergePreview(['missing-a', 'missing-b'])).toThrow(/no longer exist/i)
  })

  it('rejects merging fewer than two courses', () => {
    expect(() => dbService.mergeCoursesByIds(['only-one'])).toThrow(/two courses/i)
  })

  it('separates mistakenly merged courses that originate from distinct folder trees', () => {
    const courseDecRoot = path.join(TEST_VAULT_DIR, 'Courses', 'curso.dec')
    const vossRoot = path.join(TEST_VAULT_DIR, 'Courses', 'voss academy')
    fs.mkdirSync(path.join(courseDecRoot, 'Mod 1'), { recursive: true })
    fs.mkdirSync(path.join(vossRoot, 'Intro'), { recursive: true })

    const vid1 = path.join(courseDecRoot, 'Mod 1', '01 - Dec.mp4')
    const vid2 = path.join(vossRoot, 'Intro', '01 - Voss.mp4')
    fs.writeFileSync(vid1, Buffer.alloc(1024))
    fs.writeFileSync(vid2, Buffer.alloc(1024))

    // Create a course that contains both modules (simulating accidental merge)
    const mergedCourse: Course = {
      id: 'merged-id',
      title: 'curso.dec',
      slug: 'curso-dec',
      sourceType: 'local-vault',
      rootPath: courseDecRoot,
      moduleCount: 2,
      lessonCount: 2,
      totalDuration: 120,
      createdAt: 1000,
      updatedAt: 1000
    }

    const mod1: Module & { lessons: Lesson[] } = {
      id: 'm-dec-1',
      courseId: mergedCourse.id,
      title: 'Mod 1',
      orderIndex: 1,
      duration: 60,
      lessonCount: 1,
      folderPath: path.join(courseDecRoot, 'Mod 1'),
      createdAt: 1000,
      lessons: [{
        id: 'l-dec-1',
        moduleId: 'm-dec-1',
        courseId: mergedCourse.id,
        title: 'Aula Dec',
        fileName: '01 - Dec.mp4',
        filePath: vid1,
        fileExtension: 'mp4',
        mediaType: 'video',
        duration: 60,
        fileSize: 1024,
        orderIndex: 1,
        availability: 'local',
        createdAt: 1000
      }]
    }

    const mod2: Module & { lessons: Lesson[] } = {
      id: 'm-voss-1',
      courseId: mergedCourse.id,
      title: 'Intro',
      orderIndex: 2,
      duration: 60,
      lessonCount: 1,
      folderPath: path.join(vossRoot, 'Intro'),
      createdAt: 1000,
      lessons: [{
        id: 'l-voss-1',
        moduleId: 'm-voss-1',
        courseId: mergedCourse.id,
        title: 'Aula Voss',
        fileName: '01 - Voss.mp4',
        filePath: vid2,
        fileExtension: 'mp4',
        mediaType: 'video',
        duration: 60,
        fileSize: 1024,
        orderIndex: 2,
        availability: 'local',
        createdAt: 1000
      }]
    }

    dbService.saveCourseWithHierarchy(mergedCourse, [mod1, mod2])

    // Before separation: 1 course with 2 modules
    expect(dbService.getAllCourses().length).toBe(1)
    expect(dbService.getCourseById(mergedCourse.id)?.modules.length).toBe(2)

    // Run separation
    const sepResult = dbService.separateMistakenlyMergedCourses()
    expect(sepResult.separatedCoursesCount).toBe(1)
    expect(sepResult.createdCoursesCount).toBe(1)

    // After separation: 2 courses!
    const allCourses = dbService.getAllCourses()
    expect(allCourses.length).toBe(2)

    const decCourse = allCourses.find((c) => c.title.toLowerCase().includes('dec'))
    const vossCourse = allCourses.find((c) => c.title.toLowerCase().includes('voss'))
    expect(decCourse).toBeDefined()
    expect(vossCourse).toBeDefined()

    const decHierarchy = dbService.getCourseById(decCourse!.id)
    const vossHierarchy = dbService.getCourseById(vossCourse!.id)
    expect(decHierarchy?.modules.length).toBe(1)
    expect(decHierarchy?.modules[0].title).toBe('Mod 1')
    expect(vossHierarchy?.modules.length).toBe(1)
    expect(vossHierarchy?.modules[0].title).toBe('Intro')
  })

})
