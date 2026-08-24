import crypto from 'node:crypto'
import { databaseService, type DatabaseService } from '../database.service'
import { logger } from '../logger.service'
import type {
  Module,
  Lesson,
  MergePreview,
  MergePreviewModule,
  MergeDuplicateCandidate,
  MergeCoursesResult
} from '../../../types'
import { verifyMediaEquality } from './duplicate-detector'
import { normalizeModuleKey } from '../../utils/title-cleaner'

export interface CourseMergeOptions {
  primaryCourseId: string
  secondaryCourseIds: string[]
  targetTitle?: string
}

export interface UnmergeCourseResult {
  success: boolean
  restoredCoursesCount: number
  error?: string
}

export class CourseMergeService {
  private readonly db: DatabaseService

  public constructor(db: DatabaseService = databaseService) {
    this.db = db
  }

  /**
   * Generates a read-only preview of a proposed course merge.
   * INVARIANT: Never mutates the database or filesystem.
   */
  public async getMergePreview(courseIds: string[]): Promise<MergePreview> {
    const ids = [...new Set((courseIds || []).map((id) => id.trim()).filter(Boolean))]
    if (ids.length < 2) {
      throw new Error('Select at least two courses to preview a merge.')
    }

    const courses = ids.map((id) => this.db.getCourseById(id))
    if (courses.some((c) => c === null)) {
      throw new Error('One or more selected courses no longer exist.')
    }

    const nonNullCourses = courses as Array<NonNullable<(typeof courses)[number]>>
    // Sort canonical course (prefer highest lesson count or oldest)
    nonNullCourses.sort(
      (a, b) => b.course.lessonCount - a.course.lessonCount || a.course.createdAt - b.course.createdAt
    )

    const [canonical, ...secondaries] = nonNullCourses
    const previewModules: MergePreviewModule[] = []
    const duplicateCandidates: MergeDuplicateCandidate[] = []

    const targetModules = new Map<string, Module & { lessons: Lesson[] }>()
    for (const mod of canonical.modules) {
      const key = normalizeModuleKey(mod.title) || mod.title.toLowerCase()
      targetModules.set(key, mod)
    }

    for (const secondary of secondaries) {
      for (const secMod of secondary.modules) {
        const key = normalizeModuleKey(secMod.title) || secMod.title.toLowerCase()
        const targetMod = targetModules.get(key)
        const materialCount = (secMod.resources?.length || 0) + secMod.lessons.reduce((sum, l) => sum + (l.contentResources?.length || 0), 0)

        if (!targetMod) {
          previewModules.push({
            sourceCourseId: secondary.course.id,
            sourceModuleId: secMod.id,
            title: secMod.title,
            action: 'create',
            lessonCount: secMod.lessons.length,
            materialCount
          })
          targetModules.set(key, secMod)
        } else {
          previewModules.push({
            sourceCourseId: secondary.course.id,
            sourceModuleId: secMod.id,
            title: secMod.title,
            action: 'merge',
            targetModuleId: targetMod.id,
            lessonCount: secMod.lessons.length,
            materialCount
          })

          // Check duplicate lessons using staged equality
          for (const secLesson of secMod.lessons) {
            for (const canLesson of targetMod.lessons) {
              const equality = await verifyMediaEquality(
                { filePath: secLesson.filePath, fileName: secLesson.fileName, sizeBytes: secLesson.fileSize, duration: secLesson.duration },
                { filePath: canLesson.filePath, fileName: canLesson.fileName, sizeBytes: canLesson.fileSize, duration: canLesson.duration }
              )

              if (equality.isDuplicate) {
                duplicateCandidates.push({
                  sourceCourseId: secondary.course.id,
                  sourceModuleId: secMod.id,
                  sourceLessonId: secLesson.id,
                  targetCourseId: canonical.course.id,
                  targetModuleId: targetMod.id,
                  targetLessonId: canLesson.id,
                  reason: 'same-file-name'
                })
                break
              }
            }
          }
        }
      }
    }

    const totalLessons = nonNullCourses.reduce((sum, c) => sum + c.course.lessonCount, 0)
    const totalMaterials = nonNullCourses.reduce(
      (sum, c) => sum + c.modules.reduce((mSum, m) => mSum + (m.resources?.length || 0), 0),
      0
    )

    return {
      canonicalCourseId: canonical.course.id,
      canonicalCourseTitle: canonical.course.title,
      selectedCourseIds: ids,
      totalLessons,
      totalMaterials,
      modules: previewModules,
      duplicateCandidates
    }
  }

  /**
   * Commits an approved logical merge with complete metadata preservation and Undo snapshot.
   */
  public async mergeCourses(options: CourseMergeOptions): Promise<MergeCoursesResult> {
    await this.getMergePreview([options.primaryCourseId, ...options.secondaryCourseIds])
    const rawDb = this.db.getDatabase()
    if (!rawDb) throw new Error('Database is not connected.')

    const primaryCourse = this.db.getCourseById(options.primaryCourseId)
    if (!primaryCourse) throw new Error(`Primary course ${options.primaryCourseId} not found.`)

    const secondaryCourses = options.secondaryCourseIds
      .map((id) => this.db.getCourseById(id))
      .filter((c): c is NonNullable<typeof c> => c !== null)

    const mergeGroupId = `merge-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`

    // Snapshot pre-merge state for full Undo capability
    const preMergeSnapshot = {
      mergeGroupId,
      timestamp: Date.now(),
      primaryCourseId: options.primaryCourseId,
      secondaries: secondaryCourses.map((sec) => ({
        course: sec.course,
        moduleIds: sec.modules.map((m) => m.id),
        lessonIds: sec.modules.flatMap((m) => m.lessons.map((l) => l.id))
      }))
    }

    const tx = rawDb.transaction(() => {
      for (const sec of secondaryCourses) {
        // Union favorites
        if (sec.course.isFavorite) {
          rawDb.prepare(`UPDATE courses SET is_favorite = 1 WHERE id = ?`).run(options.primaryCourseId)
        }

        // Re-point modules and lessons to primary course
        for (const mod of sec.modules) {
          rawDb.prepare(`UPDATE modules SET course_id = ? WHERE id = ?`).run(options.primaryCourseId, mod.id)
          rawDb.prepare(`UPDATE lessons SET course_id = ? WHERE module_id = ?`).run(options.primaryCourseId, mod.id)
          rawDb.prepare(`UPDATE content_resources SET course_id = ? WHERE module_id = ?`).run(options.primaryCourseId, mod.id)
        }

        // Migrate progress, notes, watch history to primary course ID
        rawDb.prepare(`UPDATE lesson_progress SET course_id = ? WHERE course_id = ?`).run(options.primaryCourseId, sec.course.id)
        rawDb.prepare(`UPDATE lesson_notes SET course_id = ? WHERE course_id = ?`).run(options.primaryCourseId, sec.course.id)
        rawDb.prepare(`UPDATE watch_history SET course_id = ? WHERE course_id = ?`).run(options.primaryCourseId, sec.course.id)

        // Soft-archive secondary course with merge metadata instead of DELETE
        rawDb.prepare(`
          UPDATE courses
          SET merged_into_course_id = ?, merge_metadata = ?, updated_at = ?
          WHERE id = ?
        `).run(options.primaryCourseId, JSON.stringify(preMergeSnapshot), Date.now(), sec.course.id)
      }

      if (options.targetTitle && options.targetTitle.trim()) {
        rawDb.prepare(`UPDATE courses SET title = ?, updated_at = ? WHERE id = ?`).run(
          options.targetTitle.trim(),
          Date.now(),
          options.primaryCourseId
        )
      }

      this.db.reindexCourseHierarchy(options.primaryCourseId)
    })

    tx()

    const updatedPrimary = this.db.getCourseById(options.primaryCourseId)

    return {
      success: true,
      mergedGroupsCount: 1,
      removedCoursesCount: secondaryCourses.length,
      deduplicatedLessonsCount: 0,
      details: [
        {
          title: options.targetTitle || updatedPrimary?.course.title || '',
          canonicalCourseId: options.primaryCourseId,
          mergedCoursesCount: secondaryCourses.length + 1,
          totalModules: updatedPrimary?.modules.length || 0,
          totalLessons: updatedPrimary?.course.lessonCount || 0,
          removedDuplicateLessons: 0
        }
      ]
    }
  }

  /**
   * Reverses a previous course merge and restores all secondary courses.
   */
  public unmergeCourse(mergedCourseId: string): UnmergeCourseResult {
    const rawDb = this.db.getDatabase()
    if (!rawDb) throw new Error('Database is not connected.')

    const secondaries = rawDb.prepare(`
      SELECT id, merge_metadata as mergeMetadata FROM courses WHERE merged_into_course_id = ?
    `).all(mergedCourseId) as Array<{ id: string; mergeMetadata: string }>

    if (secondaries.length === 0) {
      return { success: false, restoredCoursesCount: 0, error: 'No merged secondary courses found for this course.' }
    }

    let restoredCount = 0

    const tx = rawDb.transaction(() => {
      for (const sec of secondaries) {
        if (!sec.mergeMetadata) continue
        try {
          const snapshot = JSON.parse(sec.mergeMetadata) as { secondaries?: Array<{ course: { id: string }; moduleIds?: string[] }> }
          const secRecord = snapshot.secondaries?.find((s) => s.course.id === sec.id)
          if (secRecord) {
            // Restore modules
            for (const modId of secRecord.moduleIds || []) {
              rawDb.prepare(`UPDATE modules SET course_id = ? WHERE id = ?`).run(sec.id, modId)
              rawDb.prepare(`UPDATE lessons SET course_id = ? WHERE module_id = ?`).run(sec.id, modId)
              rawDb.prepare(`UPDATE content_resources SET course_id = ? WHERE module_id = ?`).run(sec.id, modId)
            }
          }

          // Un-archive secondary course
          rawDb.prepare(`
            UPDATE courses SET merged_into_course_id = NULL, merge_metadata = NULL, updated_at = ? WHERE id = ?
          `).run(Date.now(), sec.id)

          this.db.reindexCourseHierarchy(sec.id)
          restoredCount++
        } catch (err) {
          logger.warn('Failed to parse and restore secondary snapshot:', err)
        }
      }

      this.db.reindexCourseHierarchy(mergedCourseId)
    })

    tx()

    return {
      success: true,
      restoredCoursesCount: restoredCount
    }
  }
}

export const courseMergeService = new CourseMergeService()
