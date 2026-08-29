import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { databaseService } from './database.service'
import { logger } from './logger.service'
import type {
  OperationPlan,
  ProposedFileMutation,
  FileOperationRecord
} from '../../types/journal'
import {
  isExistingPathWithin,
  isExistingPathOrAncestorWithin,
  isPathWithin
} from '../utils/path-security'

const REORGANIZE_PLAN_TTL_MS = 5 * 60 * 1_000

interface StoredReorganizePlan {
  plan: OperationPlan
  courseId: string
  courseRoot: string
  expiresAt: number
}

function sanitizeName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function findFileInDir(
  dir: string,
  fileName: string,
  maxDepth = 4
): string | null {
  if (!fs.existsSync(dir)) return null
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (
        entry.isFile() &&
        entry.name.toLowerCase() === fileName.toLowerCase()
      ) {
        return fullPath
      }
      if (entry.isDirectory() && maxDepth > 0 && !entry.name.startsWith('.')) {
        const found = findFileInDir(fullPath, fileName, maxDepth - 1)
        if (found) return found
      }
    }
  } catch (err) {
    logger.debug('[Reorganizer] Error reading dir in findFileInDir:', err)
  }
  return null
}

function resolveActualSourcePath(
  sourcePath: string,
  courseRoot: string | undefined,
  fileName: string | undefined,
  destinationPath: string | undefined
): string | null {
  // 1. Direct path check
  if (sourcePath && fs.existsSync(sourcePath)) {
    return sourcePath
  }

  // 2. Check if already at destination path
  if (destinationPath && fs.existsSync(destinationPath)) {
    return destinationPath
  }

  // 3. Search under course root if available
  const targetFileName =
    fileName || (sourcePath ? path.basename(sourcePath) : '')
  if (courseRoot && targetFileName && fs.existsSync(courseRoot)) {
    // Check direct child
    const directPath = path.join(courseRoot, targetFileName)
    if (fs.existsSync(directPath)) return directPath

    // Check same subfolder name if sourcePath had one
    if (sourcePath) {
      const parentDirName = path.basename(path.dirname(sourcePath))
      const subfolderPath = path.join(courseRoot, parentDirName, targetFileName)
      if (fs.existsSync(subfolderPath)) return subfolderPath
    }

    // Search within course root tree
    const found = findFileInDir(courseRoot, targetFileName)
    if (found) return found
  }

  return null
}

function safeMoveFile(sourcePath: string, destPath: string): void {
  const normSource = path.normalize(sourcePath).toLowerCase()
  const normDest = path.normalize(destPath).toLowerCase()
  if (normSource === normDest) return

  const destDir = path.dirname(destPath)
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true })
  }

  try {
    fs.renameSync(sourcePath, destPath)
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException
    if (
      nodeErr.code === 'EXDEV' ||
      nodeErr.code === 'EPERM' ||
      nodeErr.code === 'EBUSY' ||
      nodeErr.code === 'EACCES'
    ) {
      fs.copyFileSync(sourcePath, destPath)
      try {
        fs.unlinkSync(sourcePath)
      } catch (unlinkErr) {
        logger.warn(
          `[Reorganizer] Could not delete source after copy: ${sourcePath}`,
          unlinkErr
        )
      }
    } else {
      throw err
    }
  }
}

export class ReorganizerService {
  /**
   * Generates a preview plan of physical mutations to organize files and folders cleanly on disk.
   * Never modifies files on disk; strictly produces a read-only proposal for user review.
   */
  public generateReorganizePlan(courseId: string): OperationPlan {
    const hierarchy = databaseService.getCourseById(courseId)
    if (!hierarchy || !hierarchy.course) {
      throw new Error(`Course not found: ${courseId}`)
    }

    const { course, modules } = hierarchy
    const groupId = `reorg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    const proposedMutations: ProposedFileMutation[] = []
    const conflictDetails: string[] = []

    for (const mod of modules) {
      const padModIndex = String(
        mod.orderIndex > 0 ? mod.orderIndex : mod.orderIndex + 1
      ).padStart(2, '0')
      const cleanModTitle = sanitizeName(mod.title)
      const cleanModFolder = `${padModIndex} - ${cleanModTitle}`
      const targetModPath = path.join(course.rootPath, cleanModFolder)

      for (const lesson of mod.lessons) {
        const padLesIndex = String(
          lesson.orderIndex > 0 ? lesson.orderIndex : lesson.orderIndex + 1
        ).padStart(2, '0')
        const cleanLesTitle = sanitizeName(lesson.title)
        const ext = lesson.fileExtension.startsWith('.')
          ? lesson.fileExtension
          : lesson.fileExtension
            ? `.${lesson.fileExtension}`
            : path.extname(lesson.filePath)
        const cleanFileName = `${padLesIndex} - ${cleanLesTitle}${ext}`
        const targetFilePath = path.join(targetModPath, cleanFileName)

        const resolvedSource = resolveActualSourcePath(
          lesson.filePath,
          course.rootPath,
          lesson.fileName,
          targetFilePath
        )

        if (!resolvedSource) {
          conflictDetails.push(
            `Arquivo não encontrado no disco (ignorado): ${lesson.fileName || path.basename(lesson.filePath)}`
          )
          continue
        }

        if (!isPathWithin(course.rootPath, resolvedSource, false)) {
          conflictDetails.push(
            `Arquivo fora da pasta do curso (ignorado): ${lesson.fileName || path.basename(resolvedSource)}`
          )
          continue
        }

        const normSource = path.normalize(resolvedSource).toLowerCase()
        const normTarget = path.normalize(targetFilePath).toLowerCase()

        if (normSource !== normTarget) {
          if (fs.existsSync(targetFilePath) && normSource !== normTarget) {
            conflictDetails.push(
              `Arquivo de destino já existe: ${cleanFileName}`
            )
          }

          proposedMutations.push({
            type: 'move',
            sourcePath: resolvedSource,
            destinationPath: targetFilePath,
            originalFileName: lesson.fileName || path.basename(resolvedSource),
            newFileName: cleanFileName,
            isReversible: true
          })
        } else if (
          path.normalize(lesson.filePath).toLowerCase() !== normTarget
        ) {
          databaseService.updateLessonFilePath(
            lesson.id,
            targetFilePath,
            cleanFileName
          )
        }
      }
    }

    const plan: OperationPlan = {
      groupId,
      courseTitle: course.title,
      proposedMutations,
      hasConflicts: conflictDetails.length > 0,
      conflictDetails: conflictDetails.length > 0 ? conflictDetails : undefined
    }

    this.pruneExpiredPlans(Date.now())
    this.pendingPlans.set(groupId, {
      plan,
      courseId,
      courseRoot: course.rootPath,
      expiresAt: Date.now() + REORGANIZE_PLAN_TTL_MS
    })
    return plan
  }

  /**
   * Applies an approved reorganization plan to the filesystem with atomic journal logging.
   */
  public applyReorganizePlan(
    groupId: string,
    mutations: ProposedFileMutation[],
    courseId: string
  ): { success: boolean; appliedCount: number; error?: string } {
    const stored = this.pendingPlans.get(groupId)
    if (!stored || Date.now() >= stored.expiresAt) {
      this.pendingPlans.delete(groupId)
      throw new Error('Reorganization plan is invalid or expired.')
    }
    if (
      stored.courseId !== courseId ||
      !sameMutationList(stored.plan.proposedMutations, mutations)
    ) {
      throw new Error(
        'Reorganization plan no longer matches the approved preview.'
      )
    }

    const hierarchy = courseId ? databaseService.getCourseById(courseId) : null
    const courseRoot = hierarchy?.course?.rootPath
    if (!courseRoot || courseRoot !== stored.courseRoot) {
      throw new Error('Reorganization course is no longer available.')
    }
    validateMutations(mutations, courseRoot)
    this.pendingPlans.delete(groupId)
    this.appliedGroups.set(groupId, { courseId, courseRoot })

    let appliedCount = 0

    for (const mutation of mutations) {
      const operationId = crypto.randomUUID()
      const now = Date.now()

      const journalEntry: FileOperationRecord = {
        operationId,
        groupId,
        type: mutation.type,
        sourcePath: mutation.sourcePath,
        destinationPath: mutation.destinationPath,
        originalFileName: mutation.originalFileName,
        newFileName: mutation.newFileName,
        timestamp: now,
        status: 'pending',
        isReversible: true
      }

      databaseService.recordFileOperation(journalEntry)

      try {
        const resolvedSource = resolveActualSourcePath(
          mutation.sourcePath,
          courseRoot,
          mutation.originalFileName,
          mutation.destinationPath
        )

        if (!resolvedSource) {
          databaseService.updateFileOperationStatus(
            operationId,
            'failed',
            'Source file not found on disk'
          )
          continue
        }

        if (
          !isPathWithin(courseRoot, resolvedSource, false) ||
          !isExistingPathWithin(courseRoot, resolvedSource)
        ) {
          databaseService.updateFileOperationStatus(
            operationId,
            'failed',
            'Source file is outside the course root'
          )
          continue
        }

        const normResolved = path.normalize(resolvedSource).toLowerCase()
        const normDest = path.normalize(mutation.destinationPath).toLowerCase()

        if (normResolved === normDest) {
          const lesson =
            databaseService.findLessonByFilePath(mutation.sourcePath) ||
            databaseService.findLessonByFilePath(resolvedSource)
          if (lesson) {
            databaseService.updateLessonFilePath(
              lesson.id,
              mutation.destinationPath,
              mutation.newFileName
            )
          }
          databaseService.updateFileOperationStatus(operationId, 'completed')
          appliedCount++
          continue
        }

        safeMoveFile(resolvedSource, mutation.destinationPath)

        const lesson =
          databaseService.findLessonByFilePath(mutation.sourcePath) ||
          databaseService.findLessonByFilePath(resolvedSource)
        if (lesson) {
          databaseService.updateLessonFilePath(
            lesson.id,
            mutation.destinationPath,
            mutation.newFileName
          )
        }

        databaseService.updateFileOperationStatus(operationId, 'completed')
        appliedCount++
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        logger.error(
          `[ReorganizerService] Failed to move file: ${mutation.sourcePath}`,
          err
        )
        databaseService.updateFileOperationStatus(
          operationId,
          'failed',
          errorMsg
        )
        return {
          success: false,
          appliedCount,
          error: `Erro ao mover arquivo ${mutation.originalFileName}: ${errorMsg}`
        }
      }
    }

    if (courseId) {
      databaseService.reindexCourseHierarchy(courseId)
    }

    return {
      success: true,
      appliedCount
    }
  }

  /**
   * Undoes a previously applied reorganization plan by group ID in reverse LIFO order.
   */
  public undoReorganizePlan(groupId: string): {
    success: boolean
    revertedCount: number
    error?: string
  } {
    const operations = databaseService.getFileOperationsByGroup(groupId)
    const completedOps = operations.filter((op) => op.status === 'completed')

    if (completedOps.length === 0) {
      return { success: true, revertedCount: 0 }
    }

    const courseRoot =
      this.appliedGroups.get(groupId)?.courseRoot ??
      findCourseRootForOperations(completedOps)
    if (!courseRoot) {
      throw new Error('Reorganization undo is not authorized for this group.')
    }
    validateJournalOperations(completedOps, courseRoot)

    let revertedCount = 0

    // Reverse order (LIFO)
    for (let i = completedOps.length - 1; i >= 0; i--) {
      const op = completedOps[i]

      try {
        if (fs.existsSync(op.destinationPath)) {
          safeMoveFile(op.destinationPath, op.sourcePath)

          const lesson = databaseService.findLessonByFilePath(
            op.destinationPath
          )
          if (lesson) {
            databaseService.updateLessonFilePath(
              lesson.id,
              op.sourcePath,
              op.originalFileName
            )
          }

          databaseService.updateFileOperationStatus(
            op.operationId,
            'rolled_back'
          )
          revertedCount++
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        logger.error(
          `[ReorganizerService] Failed to rollback operation: ${op.operationId}`,
          err
        )
        return {
          success: false,
          revertedCount,
          error: `Erro ao reverter ${op.newFileName}: ${errorMsg}`
        }
      }
    }

    return {
      success: true,
      revertedCount
    }
  }

  private readonly pendingPlans = new Map<string, StoredReorganizePlan>()
  private readonly appliedGroups = new Map<
    string,
    { courseId: string; courseRoot: string }
  >()

  private pruneExpiredPlans(now: number): void {
    for (const [groupId, stored] of this.pendingPlans) {
      if (now >= stored.expiresAt) this.pendingPlans.delete(groupId)
    }
  }
}

export const reorganizerService = new ReorganizerService()

function sameMutationList(
  expected: ProposedFileMutation[],
  received: ProposedFileMutation[]
): boolean {
  return (
    expected.length === received.length &&
    expected.every((mutation, index) => {
      const candidate = received[index]
      return (
        candidate !== undefined &&
        mutation.type === candidate.type &&
        mutation.sourcePath === candidate.sourcePath &&
        mutation.destinationPath === candidate.destinationPath &&
        mutation.originalFileName === candidate.originalFileName &&
        mutation.newFileName === candidate.newFileName &&
        mutation.isReversible === candidate.isReversible
      )
    })
  )
}

function validateMutations(
  mutations: ProposedFileMutation[],
  courseRoot: string
): void {
  for (const mutation of mutations) {
    if (
      mutation.type !== 'move' ||
      !mutation.isReversible ||
      !path.isAbsolute(mutation.sourcePath) ||
      !path.isAbsolute(mutation.destinationPath) ||
      !mutation.originalFileName ||
      !mutation.newFileName ||
      /[\\/]/.test(mutation.originalFileName) ||
      /[\\/]/.test(mutation.newFileName)
    ) {
      throw new Error('Reorganization mutation is invalid.')
    }
    if (
      !isPathWithin(courseRoot, mutation.sourcePath, false) ||
      !isPathWithin(courseRoot, mutation.destinationPath, false)
    ) {
      throw new Error('Reorganization mutation is outside the course root.')
    }
    if (fs.existsSync(mutation.sourcePath)) {
      if (
        !isExistingPathWithin(courseRoot, mutation.sourcePath) ||
        !fs.lstatSync(mutation.sourcePath).isFile() ||
        fs.lstatSync(mutation.sourcePath).isSymbolicLink()
      ) {
        throw new Error('Reorganization source is not a regular course file.')
      }
    }
    if (
      fs.existsSync(mutation.destinationPath) &&
      !isExistingPathWithin(courseRoot, mutation.destinationPath, true)
    ) {
      throw new Error('Reorganization destination is outside the course root.')
    }
    if (
      !isExistingPathOrAncestorWithin(
        courseRoot,
        mutation.destinationPath,
        true
      )
    ) {
      throw new Error('Reorganization destination parent is unauthorized.')
    }
  }
}

function validateJournalOperations(
  operations: FileOperationRecord[],
  courseRoot: string
): void {
  for (const operation of operations) {
    if (
      operation.type !== 'move' ||
      !isPathWithin(courseRoot, operation.sourcePath, false) ||
      !isPathWithin(courseRoot, operation.destinationPath, false) ||
      !isExistingPathOrAncestorWithin(courseRoot, operation.sourcePath, true) ||
      !isExistingPathOrAncestorWithin(
        courseRoot,
        operation.destinationPath,
        true
      )
    ) {
      throw new Error('Reorganization journal contains an unauthorized path.')
    }
    if (
      fs.existsSync(operation.destinationPath) &&
      !isExistingPathWithin(courseRoot, operation.destinationPath, true)
    ) {
      throw new Error('Reorganization journal destination is unauthorized.')
    }
  }
}

function findCourseRootForOperations(
  operations: FileOperationRecord[]
): string | null {
  if (operations.length === 0) return null
  return (
    databaseService
      .getAllCourses()
      .find((course) =>
        operations.every(
          (operation) =>
            isPathWithin(course.rootPath, operation.sourcePath, false) &&
            isPathWithin(course.rootPath, operation.destinationPath, false)
        )
      )?.rootPath ?? null
  )
}
