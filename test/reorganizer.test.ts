import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { databaseService } from '../src/main/services/database.service'
import { reorganizerService } from '../src/main/services/reorganizer.service'
import type { Course, Module, Lesson } from '../src/types/course'

describe('Physical Course Reorganizer & Journal Undo Engine', () => {
  let tempDir: string
  let vaultDir: string
  let courseDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-reorg-test-'))
    vaultDir = path.join(tempDir, 'vault')
    courseDir = path.join(vaultDir, 'Courses', 'Python Pro')
    fs.mkdirSync(path.join(vaultDir, '.orbia'), { recursive: true })
    fs.mkdirSync(courseDir, { recursive: true })

    databaseService.connect(vaultDir)
  })

  afterEach(() => {
    databaseService.close()
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true })
      } catch {
        // Ignore windows file lock in tests
      }
    }
  })

  it('generates a clean reorganization plan, applies mutations with journal, and safely undos', () => {
    const mod1Dir = path.join(courseDir, 'modulo_01_raw')
    fs.mkdirSync(mod1Dir, { recursive: true })

    const lesson1Path = path.join(mod1Dir, '01_intro_1080p.mp4')
    const lesson2Path = path.join(mod1Dir, 'aula_02_variaveis.mp4')

    fs.writeFileSync(lesson1Path, 'dummy video 1')
    fs.writeFileSync(lesson2Path, 'dummy video 2')

    const courseId = 'course-reorg-1'
    const modId = 'mod-reorg-1'
    const les1Id = 'les-reorg-1'
    const les2Id = 'les-reorg-2'

    const now = Date.now()
    const course: Course = {
      id: courseId,
      title: 'Python Pro',
      slug: 'python-pro',
      sourceType: 'local-vault',
      rootPath: courseDir,
      totalDuration: 120,
      moduleCount: 1,
      lessonCount: 2,
      createdAt: now,
      updatedAt: now
    }

    const mod: Module = {
      id: modId,
      courseId,
      title: 'Introdução ao Python',
      orderIndex: 0,
      folderPath: mod1Dir,
      duration: 120,
      lessonCount: 2,
      createdAt: now
    }

    const les1: Lesson = {
      id: les1Id,
      moduleId: modId,
      courseId,
      title: 'Introdução',
      orderIndex: 0,
      filePath: lesson1Path,
      fileName: '01_intro_1080p.mp4',
      fileExtension: '.mp4',
      mediaType: 'video',
      duration: 60,
      fileSize: 13,
      createdAt: now
    }

    const les2: Lesson = {
      id: les2Id,
      moduleId: modId,
      courseId,
      title: 'Variáveis e Tipos',
      orderIndex: 1,
      filePath: lesson2Path,
      fileName: 'aula_02_variaveis.mp4',
      fileExtension: '.mp4',
      mediaType: 'video',
      duration: 60,
      fileSize: 13,
      createdAt: now
    }

    databaseService.saveCourseWithHierarchy(course, [{ ...mod, lessons: [les1, les2] }])

    // 1. Generate Plan
    const plan = reorganizerService.generateReorganizePlan(courseId)
    expect(plan.hasConflicts).toBe(false)
    expect(plan.proposedMutations.length).toBe(2)

    const mut1 = plan.proposedMutations.find((m) => m.sourcePath === lesson1Path)
    expect(mut1).toBeDefined()
    expect(mut1!.newFileName).toContain('01 - Introdução.mp4')

    // 2. Apply Plan
    const applyResult = reorganizerService.applyReorganizePlan(plan.groupId, plan.proposedMutations, courseId)
    expect(applyResult.success).toBe(true)
    expect(applyResult.appliedCount).toBe(2)

    // Verify physical files moved
    expect(fs.existsSync(lesson1Path)).toBe(false)
    expect(fs.existsSync(mut1!.destinationPath)).toBe(true)

    // Verify database updated
    const updatedLes1 = databaseService.getLessonById(les1Id)
    expect(updatedLes1?.filePath).toBe(mut1!.destinationPath)

    // 3. Undo Plan
    const undoResult = reorganizerService.undoReorganizePlan(plan.groupId)
    expect(undoResult.success).toBe(true)
    expect(undoResult.revertedCount).toBe(2)

    // Verify physical files reverted
    expect(fs.existsSync(lesson1Path)).toBe(true)
    expect(fs.existsSync(mut1!.destinationPath)).toBe(false)

    // Verify database reverted
    const revertedLes1 = databaseService.getLessonById(les1Id)
    expect(revertedLes1?.filePath).toBe(lesson1Path)
  })

  it('handles missing source files gracefully without crashing the reorganization', () => {
    const courseId = 'course-reorg-missing'
    const modId = 'mod-reorg-missing'
    const lesId = 'les-reorg-missing'

    const now = Date.now()
    const course: Course = {
      id: courseId,
      title: 'Missing File Course',
      slug: 'missing-file-course',
      sourceType: 'local-vault',
      rootPath: courseDir,
      totalDuration: 60,
      moduleCount: 1,
      lessonCount: 1,
      createdAt: now,
      updatedAt: now
    }

    const mod: Module = {
      id: modId,
      courseId,
      title: 'Modulo 1',
      orderIndex: 0,
      folderPath: path.join(courseDir, 'Modulo 1'),
      duration: 60,
      lessonCount: 1,
      createdAt: now
    }

    const nonExistentPath = path.join(courseDir, 'old_inbox_folder', 'ghost.mp4')
    const les: Lesson = {
      id: lesId,
      moduleId: modId,
      courseId,
      title: 'Aula Fantasma',
      orderIndex: 0,
      filePath: nonExistentPath,
      fileName: 'ghost.mp4',
      fileExtension: '.mp4',
      mediaType: 'video',
      duration: 60,
      fileSize: 100,
      createdAt: now
    }

    databaseService.saveCourseWithHierarchy(course, [{ ...mod, lessons: [les] }])

    // 1. Generate plan for non-existent file
    const plan = reorganizerService.generateReorganizePlan(courseId)
    // Does not produce invalid physical move mutations that would crash
    expect(plan.proposedMutations.length).toBe(0)
    expect(plan.conflictDetails?.length).toBeGreaterThan(0)

    // 2. Applying plan succeeds gracefully with 0 errors
    const applyResult = reorganizerService.applyReorganizePlan(plan.groupId, plan.proposedMutations, courseId)
    expect(applyResult.success).toBe(true)
    expect(applyResult.appliedCount).toBe(0)
  })
})
