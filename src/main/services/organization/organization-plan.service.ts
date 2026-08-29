import crypto from 'node:crypto'
import fs from 'node:fs'
import { databaseService, type DatabaseService } from '../database.service'
import { scannerService, type ScannerService } from '../scanner.service'
import { normalizeCourseHierarchy } from './hierarchy-normalizer'
import { resolveLessonIdentities } from './identity-resolver'
import {
  resolveSequenceOrdering,
  extractExplicitNumber
} from './title-sequence-resolver'
import { isExistingPathWithin, isPathWithin } from '../../utils/path-security'

const ORGANIZATION_PLAN_TTL_MS = 5 * 60 * 1_000

export interface OrganizationPlanItem {
  id: string
  title: string
  description: string
  category: 'SAFE_CORRECTION' | 'SUGGESTION' | 'CONFLICT_DECISION'
  targetEntity: 'COURSE' | 'MODULE' | 'LESSON'
  entityId?: string
  actionType:
    | 'REORDER_NATURAL'
    | 'RELINK_RENAMED_FILE'
    | 'RELINK_MOVED_FILE'
    | 'CONSOLIDATE_SAME_MODULE_DUPLICATE'
    | 'FLAG_CROSS_MODULE_DUPLICATE'
    | 'FLAG_SEQUENCE_GAP'
    | 'CLASSIFY_AUXILIARY_SECTION'
    | 'CLEAN_GENERIC_TITLE'
  details?: Record<string, unknown>
  approved: boolean
}

export interface OrganizationPlan {
  planId: string
  courseId: string
  courseTitle: string
  safeCorrections: OrganizationPlanItem[]
  suggestions: OrganizationPlanItem[]
  conflicts: OrganizationPlanItem[]
  totalItems: number
}

export interface ApplyOrganizationPlanResult {
  success: boolean
  appliedCount: number
  safeCount: number
  suggestionsCount: number
  conflictsCount: number
  error?: string
}

export class OrganizationPlanService {
  private readonly db: DatabaseService
  private readonly scanner: ScannerService
  private readonly pendingPlans = new Map<
    string,
    { plan: OrganizationPlan; expiresAt: number }
  >()

  public constructor(
    db: DatabaseService = databaseService,
    scanner: ScannerService = scannerService
  ) {
    this.db = db
    this.scanner = scanner
  }

  /**
   * Generates a comprehensive Organization Plan by comparing current DB state with scanned files on disk.
   * INVARIANT: Strictly read-only until user confirms application.
   */
  public async generatePlan(courseId: string): Promise<OrganizationPlan> {
    const courseData = this.db.getCourseById(courseId)
    if (!courseData) {
      throw new Error(`Course not found: ${courseId}`)
    }

    const { course, modules } = courseData
    const scannedDir = await this.scanner.scanDirectory(course.rootPath)
    const proposed = await normalizeCourseHierarchy(scannedDir, {
      detectCovers: false
    })

    const planId = `plan-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`
    const safeCorrections: OrganizationPlanItem[] = []
    const suggestions: OrganizationPlanItem[] = []
    const conflicts: OrganizationPlanItem[] = []

    const allExistingLessons = modules.flatMap((m) => m.lessons)
    const allScannedMedia = proposed.modules.flatMap((m) =>
      m.lessons.map((l) => ({
        filePath: l.filePath,
        fileName: l.originalFileName,
        sizeBytes: l.fileSize,
        duration: l.duration,
        moduleId: m.id,
        fingerprint: l.fingerprint
      }))
    )

    // 1. Resolve Identities (Renamed and Moved files)
    const identities = await resolveLessonIdentities(
      allScannedMedia,
      allExistingLessons,
      courseId
    )

    for (const identity of identities) {
      if (identity.type === 'RENAMED_IN_PLACE' && identity.lessonId) {
        safeCorrections.push({
          id: crypto.randomUUID(),
          title: `Relink Renamed File: ${identity.newFileName}`,
          description: `File was renamed on disk from "${identity.originalLesson?.fileName}" to "${identity.newFileName}". Preserving user progress and notes.`,
          category: 'SAFE_CORRECTION',
          targetEntity: 'LESSON',
          entityId: identity.lessonId,
          actionType: 'RELINK_RENAMED_FILE',
          details: {
            newFilePath: identity.newFilePath,
            newFileName: identity.newFileName
          },
          approved: true
        })
      } else if (identity.type === 'MOVED_IN_COURSE' && identity.lessonId) {
        safeCorrections.push({
          id: crypto.randomUUID(),
          title: `Relink Moved File: ${identity.newFileName}`,
          description: `File was moved to another module. Updating location while preserving user progress and notes.`,
          category: 'SAFE_CORRECTION',
          targetEntity: 'LESSON',
          entityId: identity.lessonId,
          actionType: 'RELINK_MOVED_FILE',
          details: {
            newFilePath: identity.newFilePath,
            newFileName: identity.newFileName,
            newModuleId: identity.newModuleId
          },
          approved: true
        })
      } else if (identity.type === 'MOVED_ACROSS_COURSES') {
        conflicts.push({
          id: crypto.randomUUID(),
          title: `Identical Content in Another Course: ${identity.newFileName}`,
          description: `Identical file was detected from course "${identity.originalLesson?.courseId}". Strict course boundary applies: treated as a separate lesson.`,
          category: 'CONFLICT_DECISION',
          targetEntity: 'LESSON',
          actionType: 'FLAG_CROSS_MODULE_DUPLICATE',
          approved: false
        })
      }
    }

    // 2. Check Module-level ordering, gaps, and duplicate numbers
    for (const mod of modules) {
      const seqItems = mod.lessons.map((l) => ({
        id: l.id,
        rawFileName: l.fileName,
        cleanTitle: l.title,
        filePath: l.filePath,
        explicitNumber:
          extractExplicitNumber(l.fileName) ?? extractExplicitNumber(l.title),
        orderIndex: l.orderIndex,
        displayOrder: l.displayOrder,
        isManual: l.hasManualOrder
      }))

      const seqResult = resolveSequenceOrdering(seqItems, {
        preserveManualOrder: true
      })

      // Check gaps
      for (const gap of seqResult.detectedGaps) {
        conflicts.push({
          id: crypto.randomUUID(),
          title: `Possible Missing Lesson ${String(gap.expectedNumber).padStart(2, '0')} in "${mod.title}"`,
          description: `Sequence jumps from lesson ${gap.afterIndex} without a lesson ${gap.expectedNumber}. A file may be missing from the course folder.`,
          category: 'CONFLICT_DECISION',
          targetEntity: 'MODULE',
          entityId: mod.id,
          actionType: 'FLAG_SEQUENCE_GAP',
          details: { expectedNumber: gap.expectedNumber },
          approved: false
        })
      }

      // Check if reordering is needed when no manual order override exists
      if (!mod.hasManualOrder) {
        let needsReorder = false
        for (let i = 0; i < seqResult.items.length; i++) {
          if (seqResult.items[i].id !== mod.lessons[i]?.id) {
            needsReorder = true
            break
          }
        }

        if (needsReorder) {
          safeCorrections.push({
            id: crypto.randomUUID(),
            title: `Natural Numeric Reordering in "${mod.title}"`,
            description: `Reorders ${mod.lessons.length} lessons into natural alphanumeric order without modifying physical files.`,
            category: 'SAFE_CORRECTION',
            targetEntity: 'MODULE',
            entityId: mod.id,
            actionType: 'REORDER_NATURAL',
            details: { orderedLessonIds: seqResult.items.map((i) => i.id) },
            approved: true
          })
        }
      }
    }

    const plan: OrganizationPlan = {
      planId,
      courseId,
      courseTitle: course.title,
      safeCorrections,
      suggestions,
      conflicts,
      totalItems: safeCorrections.length + suggestions.length + conflicts.length
    }
    this.pruneExpiredPlans(Date.now())
    this.pendingPlans.set(planId, {
      plan,
      expiresAt: Date.now() + ORGANIZATION_PLAN_TTL_MS
    })
    return plan
  }

  /**
   * Applies the approved items of an Organization Plan in an atomic SQLite transaction.
   */
  public applyPlan(plan: OrganizationPlan): ApplyOrganizationPlanResult {
    const rawDb = this.db.getDatabase()
    if (!rawDb) throw new Error('Database is not connected.')

    const trustedPlan = this.claimPlan(plan)
    const hierarchy = this.db.getCourseById(trustedPlan.courseId)
    if (!hierarchy) throw new Error('Organization plan course is unavailable.')
    validatePlanItems(trustedPlan, hierarchy.course.rootPath, hierarchy.modules)

    let safeCount = 0
    let suggestionsCount = 0
    let conflictsCount = 0

    const allApprovedItems = [
      ...trustedPlan.safeCorrections.filter((i) => i.approved),
      ...trustedPlan.suggestions.filter((i) => i.approved),
      ...trustedPlan.conflicts.filter((i) => i.approved)
    ]

    const tx = rawDb.transaction(() => {
      for (const item of allApprovedItems) {
        switch (item.actionType) {
          case 'RELINK_RENAMED_FILE': {
            const details = item.details as {
              newFilePath: string
              newFileName: string
            }
            if (item.entityId && details) {
              rawDb
                .prepare(
                  `
                UPDATE lessons SET file_path = ?, file_name = ? WHERE id = ?
              `
                )
                .run(details.newFilePath, details.newFileName, item.entityId)
            }
            break
          }
          case 'RELINK_MOVED_FILE': {
            const details = item.details as {
              newFilePath: string
              newFileName: string
              newModuleId?: string
            }
            if (item.entityId && details) {
              if (details.newModuleId) {
                rawDb
                  .prepare(
                    `
                  UPDATE lessons SET file_path = ?, file_name = ?, module_id = ? WHERE id = ?
                `
                  )
                  .run(
                    details.newFilePath,
                    details.newFileName,
                    details.newModuleId,
                    item.entityId
                  )
              } else {
                rawDb
                  .prepare(
                    `
                  UPDATE lessons SET file_path = ?, file_name = ? WHERE id = ?
                `
                  )
                  .run(details.newFilePath, details.newFileName, item.entityId)
              }
            }
            break
          }
          case 'REORDER_NATURAL': {
            const details = item.details as { orderedLessonIds: string[] }
            if (details?.orderedLessonIds) {
              details.orderedLessonIds.forEach((lessonId, idx) => {
                rawDb
                  .prepare(
                    `UPDATE lessons SET order_index = ?, display_order = ? WHERE id = ?`
                  )
                  .run(idx + 1, idx + 1, lessonId)
              })
            }
            break
          }
        }

        if (item.category === 'SAFE_CORRECTION') safeCount++
        else if (item.category === 'SUGGESTION') suggestionsCount++
        else if (item.category === 'CONFLICT_DECISION') conflictsCount++
      }

      this.db.reindexCourseHierarchy(trustedPlan.courseId)
    })

    tx()
    this.pendingPlans.delete(trustedPlan.planId)

    return {
      success: true,
      appliedCount: allApprovedItems.length,
      safeCount,
      suggestionsCount,
      conflictsCount
    }
  }

  private claimPlan(plan: OrganizationPlan): OrganizationPlan {
    this.pruneExpiredPlans(Date.now())
    const stored = this.pendingPlans.get(plan?.planId)
    if (!stored || Date.now() >= stored.expiresAt) {
      throw new Error('Organization plan is invalid or expired.')
    }
    if (
      plan.courseId !== stored.plan.courseId ||
      plan.courseTitle !== stored.plan.courseTitle ||
      plan.totalItems !== stored.plan.totalItems
    ) {
      throw new Error(
        'Organization plan no longer matches the generated preview.'
      )
    }

    const submittedItems = allPlanItems(plan)
    const expectedItems = allPlanItems(stored.plan)
    if (submittedItems.length !== expectedItems.length) {
      throw new Error(
        'Organization plan no longer matches the generated preview.'
      )
    }
    const submittedById = new Map(submittedItems.map((item) => [item.id, item]))
    if (submittedById.size !== expectedItems.length) {
      throw new Error('Organization plan contains duplicate items.')
    }

    for (const expected of expectedItems) {
      const submitted = submittedById.get(expected.id)
      if (
        !submitted ||
        typeof submitted.approved !== 'boolean' ||
        itemWithoutApproval(expected) !== itemWithoutApproval(submitted)
      ) {
        throw new Error(
          'Organization plan no longer matches the generated preview.'
        )
      }
    }

    return {
      ...stored.plan,
      safeCorrections: applyApprovalOverrides(
        stored.plan.safeCorrections,
        submittedById
      ),
      suggestions: applyApprovalOverrides(
        stored.plan.suggestions,
        submittedById
      ),
      conflicts: applyApprovalOverrides(stored.plan.conflicts, submittedById)
    }
  }

  private pruneExpiredPlans(now: number): void {
    for (const [planId, stored] of this.pendingPlans) {
      if (now >= stored.expiresAt) this.pendingPlans.delete(planId)
    }
  }
}

export const organizationPlanService = new OrganizationPlanService()

function allPlanItems(plan: OrganizationPlan): OrganizationPlanItem[] {
  return [...plan.safeCorrections, ...plan.suggestions, ...plan.conflicts]
}

function itemWithoutApproval(item: OrganizationPlanItem): string {
  const immutable = { ...item } as Partial<OrganizationPlanItem>
  delete immutable.approved
  return JSON.stringify(immutable)
}

function applyApprovalOverrides(
  items: OrganizationPlanItem[],
  submittedById: Map<string, OrganizationPlanItem>
): OrganizationPlanItem[] {
  return items.map((item) => ({
    ...item,
    approved: submittedById.get(item.id)!.approved
  }))
}

function validatePlanItems(
  plan: OrganizationPlan,
  courseRoot: string,
  modules: Array<{ id: string; lessons: Array<{ id: string }> }>
): void {
  const moduleIds = new Set(modules.map((module) => module.id))
  const lessonIds = new Set(
    modules.flatMap((module) => module.lessons.map((lesson) => lesson.id))
  )

  for (const item of allPlanItems(plan)) {
    if (
      item.targetEntity === 'LESSON' &&
      item.entityId &&
      !lessonIds.has(item.entityId)
    ) {
      throw new Error('Organization plan targets a lesson outside the course.')
    }
    if (
      item.targetEntity === 'MODULE' &&
      item.entityId &&
      !moduleIds.has(item.entityId)
    ) {
      throw new Error('Organization plan targets a module outside the course.')
    }

    if (
      item.actionType === 'RELINK_RENAMED_FILE' ||
      item.actionType === 'RELINK_MOVED_FILE'
    ) {
      const details = item.details
      if (
        !details ||
        typeof details.newFilePath !== 'string' ||
        typeof details.newFileName !== 'string' ||
        !item.entityId ||
        !lessonIds.has(item.entityId) ||
        /[\\/]/.test(details.newFileName) ||
        !isPathWithin(courseRoot, details.newFilePath, false) ||
        !fs.existsSync(details.newFilePath) ||
        !isExistingPathWithin(courseRoot, details.newFilePath) ||
        !fs.lstatSync(details.newFilePath).isFile() ||
        fs.lstatSync(details.newFilePath).isSymbolicLink()
      ) {
        throw new Error('Organization plan contains an unauthorized file path.')
      }
      if (
        item.actionType === 'RELINK_MOVED_FILE' &&
        details.newModuleId !== undefined &&
        (typeof details.newModuleId !== 'string' ||
          !moduleIds.has(details.newModuleId))
      ) {
        throw new Error(
          'Organization plan targets a module outside the course.'
        )
      }
    }

    if (item.actionType === 'REORDER_NATURAL') {
      const details = item.details
      if (
        !details ||
        !Array.isArray(details.orderedLessonIds) ||
        details.orderedLessonIds.some(
          (lessonId) => typeof lessonId !== 'string' || !lessonIds.has(lessonId)
        )
      ) {
        throw new Error('Organization plan contains unauthorized lesson IDs.')
      }
    }
  }
}
