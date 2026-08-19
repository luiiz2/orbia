import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseService } from '../src/main/services/database.service'
import type { Course, Module, Lesson } from '../src/types'

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
})
