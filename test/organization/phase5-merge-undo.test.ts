import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DatabaseService } from '../../src/main/services/database.service'
import { CourseMergeService } from '../../src/main/services/organization/course-merge.service'
import type { Course, Module, Lesson } from '../../src/types'

describe('Phase 5: Course Merge & Reversible Undo', () => {
  let tempVaultDir: string
  let dbService: DatabaseService
  let mergeService: CourseMergeService

  beforeEach(() => {
    tempVaultDir = path.join(os.tmpdir(), `orbia-merge-undo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
    fs.mkdirSync(tempVaultDir, { recursive: true })
    dbService = new DatabaseService()
    dbService.connect(tempVaultDir)
    mergeService = new CourseMergeService(dbService)
  })

  afterEach(() => {
    dbService.close()
    try {
      fs.rmSync(tempVaultDir, { recursive: true, force: true })
    } catch {}
  })

  it('performs user-selected merge logically, preserves metadata, and successfully unmerges', async () => {
    // Create Course A (Primary)
    const courseA: Course = {
      id: 'c-primary',
      title: 'Python Part 1',
      slug: 'python-part-1',
      sourceType: 'local-vault',
      rootPath: path.join(tempVaultDir, 'Courses', 'Python1'),
      totalDuration: 100,
      moduleCount: 1,
      lessonCount: 1,
      isFavorite: false,
      createdAt: 1000,
      updatedAt: 1000
    }
    const modA: Module = {
      id: 'mod-a',
      courseId: courseA.id,
      title: 'Module 1',
      orderIndex: 1,
      duration: 100,
      lessonCount: 1,
      createdAt: 1000
    }
    const lesA: Lesson = {
      id: 'les-a',
      moduleId: modA.id,
      courseId: courseA.id,
      title: 'Lesson 1',
      orderIndex: 1,
      filePath: path.join(courseA.rootPath, '01.mp4'),
      fileName: '01.mp4',
      fileExtension: 'mp4',
      mediaType: 'video',
      duration: 100,
      fileSize: 1000,
      availability: 'local',
      createdAt: 1000
    }
    dbService.saveCourseWithHierarchy(courseA, [{ ...modA, lessons: [lesA] }])

    // Create Course B (Secondary, favorite = true)
    const courseB: Course = {
      id: 'c-secondary',
      title: 'Python Part 2',
      slug: 'python-part-2',
      sourceType: 'local-vault',
      rootPath: path.join(tempVaultDir, 'Courses', 'Python2'),
      totalDuration: 200,
      moduleCount: 1,
      lessonCount: 1,
      isFavorite: true, // Should transfer favorite = true to primary
      createdAt: 2000,
      updatedAt: 2000
    }
    const modB: Module = {
      id: 'mod-b',
      courseId: courseB.id,
      title: 'Module 2',
      orderIndex: 1,
      duration: 200,
      lessonCount: 1,
      createdAt: 2000
    }
    const lesB: Lesson = {
      id: 'les-b',
      moduleId: modB.id,
      courseId: courseB.id,
      title: 'Lesson 2',
      orderIndex: 1,
      filePath: path.join(courseB.rootPath, '02.mp4'),
      fileName: '02.mp4',
      fileExtension: 'mp4',
      mediaType: 'video',
      duration: 200,
      fileSize: 2000,
      availability: 'local',
      createdAt: 2000
    }
    dbService.saveCourseWithHierarchy(courseB, [{ ...modB, lessons: [lesB] }])

    // Verify initially 2 independent courses exist
    expect(dbService.getAllCourses()).toHaveLength(2)

    // 1. Get Preview
    const preview = await mergeService.getMergePreview([courseA.id, courseB.id])
    expect(preview.selectedCourseIds).toHaveLength(2)
    expect(preview.totalLessons).toBe(2)

    // 2. Perform Merge
    const mergeResult = await mergeService.mergeCourses({
      primaryCourseId: courseA.id,
      secondaryCourseIds: [courseB.id],
      targetTitle: 'Python Masterclass Complete'
    })
    expect(mergeResult.success).toBe(true)

    // Only 1 course visible in active library list
    const activeCourses = dbService.getAllCourses()
    expect(activeCourses).toHaveLength(1)
    expect(activeCourses[0].id).toBe(courseA.id)
    expect(activeCourses[0].title).toBe('Python Masterclass Complete')
    expect(activeCourses[0].isFavorite).toBe(true) // Union of favorites!

    const primaryHierarchy = dbService.getCourseById(courseA.id)
    expect(primaryHierarchy?.modules).toHaveLength(2)
    expect(primaryHierarchy?.course.lessonCount).toBe(2)

    // 3. Perform Unmerge / Undo
    const unmergeResult = mergeService.unmergeCourse(courseA.id)
    expect(unmergeResult.success).toBe(true)
    expect(unmergeResult.restoredCoursesCount).toBe(1)

    // 4. Verify both courses are restored independently
    const restoredCourses = dbService.getAllCourses()
    expect(restoredCourses).toHaveLength(2)

    const restoredB = dbService.getCourseById(courseB.id)
    expect(restoredB).not.toBeNull()
    expect(restoredB?.modules).toHaveLength(1)
    expect(restoredB?.modules[0].id).toBe(modB.id)
    expect(restoredB?.modules[0].lessons[0].id).toBe(lesB.id)
  })
})
