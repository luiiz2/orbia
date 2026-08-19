import { dialog, ipcMain } from 'electron'
import path from 'node:path'
import crypto from 'node:crypto'
import type { Course, Module, Lesson, ProposedCourseStructure } from '../../types'
import { scannerService } from '../services/scanner.service'
import { parserService } from '../services/parser.service'
import { databaseService } from '../services/database.service'
import { vaultService } from '../services/vault.service'
import { archiveService } from '../services/archive.service'
import { logger } from '../services/logger.service'

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function registerCoursesIpc(): void {
  // Select either a course folder OR a course .zip file
  ipcMain.handle('courses:select-source', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Course Folder or .zip Archive',
        properties: ['openFile', 'openDirectory'],
        filters: [
          { name: 'Course Sources (Folders & Zip)', extensions: ['zip'] },
          { name: 'Zip Archives', extensions: ['zip'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const selectedPath = result.filePaths[0]
      const isZip = archiveService.isZipFile(selectedPath)
      const name = isZip
        ? path.basename(selectedPath, path.extname(selectedPath))
        : path.basename(selectedPath)

      return {
        path: selectedPath,
        name,
        isZip
      }
    } catch (err) {
      logger.error('[IPC] courses:select-source error:', err)
      return null
    }
  })

  // Extract a .zip course archive into the Vault's Inbox
  ipcMain.handle('courses:extract-zip', async (event, payload: { zipPath: string }) => {
    try {
      const currentVault = vaultService.getCurrentVault()
      if (!currentVault) {
        return { success: false, error: 'No active vault is open to extract archive.' }
      }

      const inboxDir = path.join(currentVault.path, 'Inbox')

      const result = await archiveService.extractZip({
        zipPath: payload.zipPath,
        destinationDir: inboxDir,
        onProgress: (percent, currentFile) => {
          event.sender.send('courses:extract-progress', { percent, currentFile })
        }
      })

      return {
        success: true,
        extractedPath: result.extractedPath,
        suggestedTitle: result.suggestedCourseName
      }
    } catch (err: unknown) {
      logger.error('[IPC] courses:extract-zip error:', err)
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  })

  ipcMain.handle('courses:scan-folder', async (_event, payload: { folderPath: string }) => {
    try {
      if (!payload.folderPath) {
        return { success: false, error: 'Folder path is required' }
      }

      const scannedDir = await scannerService.scanDirectory(payload.folderPath)
      const proposal = parserService.parseCourseHierarchy(scannedDir)

      return { success: true, proposal }
    } catch (err: unknown) {
      logger.error('[IPC] courses:scan-folder error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(
    'courses:import',
    async (
      _event,
      payload: { proposal: ProposedCourseStructure; isExternal: boolean }
    ) => {
      try {
        const { proposal, isExternal } = payload
        const currentVault = vaultService.getCurrentVault()
        if (!currentVault) {
          return { success: false, error: 'No active vault is open.' }
        }

        const now = Date.now()
        const courseId = crypto.randomUUID()
        const slug = `${generateSlug(proposal.suggestedTitle)}-${courseId.substring(0, 6)}`

        const course: Course = {
          id: courseId,
          title: proposal.suggestedTitle,
          slug,
          sourceType: isExternal ? 'local-ref' : 'local-vault',
          rootPath: proposal.rootPath,
          coverPath: proposal.coverPath,
          totalDuration: 0,
          moduleCount: proposal.modules.length,
          lessonCount: proposal.totalLessons,
          createdAt: now,
          updatedAt: now
        }

        const modulesWithLessons: (Module & { lessons: Lesson[] })[] = proposal.modules.map(
          (mod) => {
            const moduleId = mod.id || crypto.randomUUID()
            const lessons: Lesson[] = mod.lessons.map((l) => ({
              id: l.id || crypto.randomUUID(),
              moduleId,
              courseId,
              title: l.title,
              orderIndex: l.orderIndex,
              filePath: l.filePath,
              fileName: l.originalFileName,
              fileExtension: l.fileExtension,
              mediaType: l.mediaType,
              duration: 0,
              fileSize: l.fileSize,
              availability: 'local',
              createdAt: now
            }))

            return {
              id: moduleId,
              courseId,
              title: mod.title,
              orderIndex: mod.orderIndex,
              folderPath: mod.folderPath,
              duration: 0,
              lessonCount: lessons.length,
              createdAt: now,
              lessons
            }
          }
        )

        databaseService.saveCourseWithHierarchy(course, modulesWithLessons)

        return { success: true, course }
      } catch (err: unknown) {
        logger.error('[IPC] courses:import error:', err)
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle('courses:list', async () => {
    try {
      return databaseService.getAllCourses()
    } catch (err) {
      logger.error('[IPC] courses:list error:', err)
      return []
    }
  })

  ipcMain.handle('courses:get-by-id', async (_event, payload: { courseId: string }) => {
    try {
      return databaseService.getCourseById(payload.courseId)
    } catch (err) {
      logger.error('[IPC] courses:get-by-id error:', err)
      return null
    }
  })

  ipcMain.handle(
    'courses:delete',
    async (_event, payload: { courseId: string; deleteFiles: boolean }) => {
      try {
        databaseService.deleteCourse(payload.courseId)
        return { success: true }
      } catch (err: unknown) {
        logger.error('[IPC] courses:delete error:', err)
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
}
