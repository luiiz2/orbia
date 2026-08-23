import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { databaseService } from './database.service'
import { logger } from './logger.service'
import type { OperationPlan, ProposedFileMutation, FileOperationRecord } from '../../types/journal'

function sanitizeName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
      const padModIndex = String(mod.orderIndex > 0 ? mod.orderIndex : mod.orderIndex + 1).padStart(2, '0')
      const cleanModTitle = sanitizeName(mod.title)
      const cleanModFolder = `${padModIndex} - ${cleanModTitle}`
      const targetModPath = path.join(course.rootPath, cleanModFolder)

      for (const lesson of mod.lessons) {
        const padLesIndex = String(lesson.orderIndex > 0 ? lesson.orderIndex : lesson.orderIndex + 1).padStart(2, '0')
        const cleanLesTitle = sanitizeName(lesson.title)
        const cleanFileName = `${padLesIndex} - ${cleanLesTitle}${lesson.fileExtension}`
        const targetFilePath = path.join(targetModPath, cleanFileName)

        const normSource = path.normalize(lesson.filePath).toLowerCase()
        const normTarget = path.normalize(targetFilePath).toLowerCase()

        if (normSource !== normTarget) {
          if (fs.existsSync(targetFilePath) && normSource !== normTarget) {
            conflictDetails.push(`Arquivo de destino já existe: ${cleanFileName}`)
          }

          proposedMutations.push({
            type: 'move',
            sourcePath: lesson.filePath,
            destinationPath: targetFilePath,
            originalFileName: lesson.fileName || path.basename(lesson.filePath),
            newFileName: cleanFileName,
            isReversible: true
          })
        }
      }
    }

    return {
      groupId,
      courseTitle: course.title,
      proposedMutations,
      hasConflicts: conflictDetails.length > 0,
      conflictDetails: conflictDetails.length > 0 ? conflictDetails : undefined
    }
  }

  /**
   * Applies an approved reorganization plan to the filesystem with atomic journal logging.
   */
  public applyReorganizePlan(
    groupId: string,
    mutations: ProposedFileMutation[],
    courseId: string
  ): { success: boolean; appliedCount: number; error?: string } {
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
        if (!fs.existsSync(mutation.sourcePath)) {
          throw new Error(`Arquivo de origem não encontrado: ${mutation.sourcePath}`)
        }

        const destDir = path.dirname(mutation.destinationPath)
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true })
        }

        fs.renameSync(mutation.sourcePath, mutation.destinationPath)

        const lesson = databaseService.findLessonByFilePath(mutation.sourcePath)
        if (lesson) {
          databaseService.updateLessonFilePath(lesson.id, mutation.destinationPath, mutation.newFileName)
        }

        databaseService.updateFileOperationStatus(operationId, 'completed')
        appliedCount++
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        logger.error(`[ReorganizerService] Failed to move file: ${mutation.sourcePath}`, err)
        databaseService.updateFileOperationStatus(operationId, 'failed', errorMsg)
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
  public undoReorganizePlan(groupId: string): { success: boolean; revertedCount: number; error?: string } {
    const operations = databaseService.getFileOperationsByGroup(groupId)
    const completedOps = operations.filter((op) => op.status === 'completed')

    if (completedOps.length === 0) {
      return { success: true, revertedCount: 0 }
    }

    let revertedCount = 0

    // Reverse order (LIFO)
    for (let i = completedOps.length - 1; i >= 0; i--) {
      const op = completedOps[i]

      try {
        if (fs.existsSync(op.destinationPath)) {
          const sourceDir = path.dirname(op.sourcePath)
          if (!fs.existsSync(sourceDir)) {
            fs.mkdirSync(sourceDir, { recursive: true })
          }

          fs.renameSync(op.destinationPath, op.sourcePath)

          const lesson = databaseService.findLessonByFilePath(op.destinationPath)
          if (lesson) {
            databaseService.updateLessonFilePath(lesson.id, op.sourcePath, op.originalFileName)
          }

          databaseService.updateFileOperationStatus(op.operationId, 'rolled_back')
          revertedCount++
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        logger.error(`[ReorganizerService] Failed to rollback operation: ${op.operationId}`, err)
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
}

export const reorganizerService = new ReorganizerService()
