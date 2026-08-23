import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DatabaseService } from '../../src/main/services/database.service'
import { ScannerService } from '../../src/main/services/scanner.service'
import { OrganizationPlanService } from '../../src/main/services/organization/organization-plan.service'
import type { Course, Module, Lesson } from '../../src/types'

describe('Phase 6: Organization Plan Engine', () => {
  let tempVaultDir: string
  let courseDir: string
  let dbService: DatabaseService
  let planService: OrganizationPlanService

  beforeEach(() => {
    tempVaultDir = path.join(os.tmpdir(), `orbia-plan-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
    courseDir = path.join(tempVaultDir, 'Courses', 'Sample Course')
    fs.mkdirSync(path.join(courseDir, 'Module 1'), { recursive: true })
    dbService = new DatabaseService()
    dbService.connect(tempVaultDir)
    planService = new OrganizationPlanService(dbService, new ScannerService())
  })

  afterEach(() => {
    dbService.close()
    try {
      fs.rmSync(tempVaultDir, { recursive: true, force: true })
    } catch {}
  })

  it('generates partitioned plan with safe relinks, natural reordering, and gap alerts', async () => {
    const mod1Dir = path.join(courseDir, 'Module 1')
    const vid1 = path.join(mod1Dir, '01 - Intro.mp4')
    const vid2New = path.join(mod1Dir, '02 - Renamed.mp4') // Renamed from 02_old.mp4
    const vid4 = path.join(mod1Dir, '04 - Advanced.mp4') // Note: gap at 03!

    fs.writeFileSync(vid1, Buffer.alloc(1000))
    fs.writeFileSync(vid2New, Buffer.from('unique content of lesson 2'))
    fs.writeFileSync(vid4, Buffer.alloc(4000))

    const course: Course = {
      id: 'c-plan-1',
      title: 'Sample Course',
      slug: 'sample-course',
      sourceType: 'local-vault',
      rootPath: courseDir,
      totalDuration: 300,
      moduleCount: 1,
      lessonCount: 3,
      createdAt: 1000,
      updatedAt: 1000
    }

    const module1: Module = {
      id: 'mod-plan-1',
      courseId: course.id,
      title: 'Module 1',
      orderIndex: 1,
      folderPath: mod1Dir,
      duration: 300,
      lessonCount: 3,
      createdAt: 1000
    }

    const lessons: Lesson[] = [
      { id: 'l1', moduleId: module1.id, courseId: course.id, title: 'Intro', orderIndex: 1, filePath: vid1, fileName: '01 - Intro.mp4', fileExtension: 'mp4', mediaType: 'video', duration: 100, fileSize: 1000, availability: 'local', createdAt: 1000 },
      { id: 'l2', moduleId: module1.id, courseId: course.id, title: 'Old Name', orderIndex: 2, filePath: path.join(mod1Dir, '02_old.mp4'), fileName: '02_old.mp4', fileExtension: 'mp4', mediaType: 'video', duration: 100, fileSize: Buffer.from('unique content of lesson 2').length, availability: 'local', createdAt: 1000 },
      { id: 'l4', moduleId: module1.id, courseId: course.id, title: 'Advanced', orderIndex: 3, filePath: vid4, fileName: '04 - Advanced.mp4', fileExtension: 'mp4', mediaType: 'video', duration: 100, fileSize: 4000, availability: 'local', createdAt: 1000 }
    ]

    dbService.saveCourseWithHierarchy(course, [{ ...module1, lessons }])

    // Generate Plan
    const plan = await planService.generatePlan(course.id)
    expect(plan.courseId).toBe(course.id)
    expect(plan.totalItems).toBeGreaterThan(0)

    // Check Safe Corrections has the renamed file
    const relinkItem = plan.safeCorrections.find((i) => i.actionType === 'RELINK_RENAMED_FILE')
    expect(relinkItem).toBeDefined()
    expect(relinkItem?.entityId).toBe('l2')

    // Check Conflicts has the detected sequence gap for lesson 03
    const gapItem = plan.conflicts.find((i) => i.actionType === 'FLAG_SEQUENCE_GAP')
    expect(gapItem).toBeDefined()
    expect((gapItem?.details as any)?.expectedNumber).toBe(3)

    // Apply Plan
    const applyResult = planService.applyPlan(plan)
    expect(applyResult.success).toBe(true)
    expect(applyResult.safeCount).toBeGreaterThan(0)

    // Verify DB updated with new filename while preserving lesson UUID
    const updated = dbService.getCourseById(course.id)
    const updatedL2 = updated?.modules[0].lessons.find((l) => l.id === 'l2')
    expect(updatedL2).toBeDefined()
    expect(updatedL2?.fileName).toBe('02 - Renamed.mp4')
  })
})
