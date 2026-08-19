import { dialog, ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import type { Course, Module, Lesson, ProposedCourseStructure, SelectedCourseSource } from '../../types'
import { scannerService } from '../services/scanner.service'
import { parserService } from '../services/parser.service'
import { databaseService } from '../services/database.service'
import { vaultService } from '../services/vault.service'
import { archiveService } from '../services/archive.service'
import { logger } from '../services/logger.service'
import { convertSrtToVtt } from '../utils/subtitle-utils'
import { isSubtitleFile } from '../utils/file-utils'

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function registerCoursesIpc(): void {
  // Select one or multiple compressed .zip course files
  ipcMain.handle('courses:select-zip', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Selecionar Arquivos .zip de Cursos',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Arquivos Compactados (*.zip)', extensions: ['zip'] },
          { name: 'Todos os Arquivos (*.*)', extensions: ['*'] }
        ]
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const selectedSources: SelectedCourseSource[] = result.filePaths.map((selectedPath) => ({
        path: selectedPath,
        name: path.basename(selectedPath, path.extname(selectedPath)),
        isZip: true
      }))

      return selectedSources
    } catch (err) {
      logger.error('[IPC] courses:select-zip error:', err)
      return null
    }
  })

  // Select one or multiple course folder directories
  ipcMain.handle('courses:select-folder', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Selecionar Pastas de Cursos',
        properties: ['openDirectory', 'multiSelections']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const selectedSources: SelectedCourseSource[] = result.filePaths.map((selectedPath) => ({
        path: selectedPath,
        name: path.basename(selectedPath),
        isZip: false
      }))

      return selectedSources
    } catch (err) {
      logger.error('[IPC] courses:select-folder error:', err)
      return null
    }
  })

  // Select either course folders OR course .zip files (fallback)
  ipcMain.handle('courses:select-source', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Selecionar Cursos (.zip ou Pastas)',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Arquivos Compactados (*.zip)', extensions: ['zip'] },
          { name: 'Todos os Arquivos (*.*)', extensions: ['*'] }
        ]
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const selectedSources: SelectedCourseSource[] = result.filePaths.map((selectedPath) => {
        const isZip = archiveService.isZipFile(selectedPath)
        const name = isZip
          ? path.basename(selectedPath, path.extname(selectedPath))
          : path.basename(selectedPath)
        return {
          path: selectedPath,
          name,
          isZip
        }
      })

      return selectedSources
    } catch (err) {
      logger.error('[IPC] courses:select-source error:', err)
      return null
    }
  })

  // Select custom cover image from filesystem
  ipcMain.handle('courses:select-cover-image', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Selecionar Imagem de Capa',
        properties: ['openFile'],
        filters: [
          { name: 'Imagens (*.jpg, *.png, *.webp, *.jpeg)', extensions: ['jpg', 'jpeg', 'png', 'webp'] },
          { name: 'Todos os Arquivos (*.*)', extensions: ['*'] }
        ]
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      return result.filePaths[0]
    } catch (err) {
      logger.error('[IPC] courses:select-cover-image error:', err)
      return null
    }
  })

  // Update course cover
  ipcMain.handle('courses:update-course-cover', async (_event, payload: { courseId: string; coverPath: string }) => {
    try {
      if (
        !payload ||
        typeof payload.courseId !== 'string' ||
        !payload.courseId.trim() ||
        typeof payload.coverPath !== 'string'
      ) {
        return { success: false, error: 'Valid courseId and coverPath are required' }
      }
      databaseService.updateCourseCover(payload.courseId.trim(), payload.coverPath.trim())
      return { success: true }
    } catch (err: unknown) {
      logger.error('[IPC] courses:update-course-cover error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Update lesson cover / thumbnail
  ipcMain.handle('courses:update-lesson-cover', async (_event, payload: { lessonId: string; coverPath: string }) => {
    try {
      if (
        !payload ||
        typeof payload.lessonId !== 'string' ||
        !payload.lessonId.trim() ||
        typeof payload.coverPath !== 'string'
      ) {
        return { success: false, error: 'Valid lessonId and coverPath are required' }
      }
      databaseService.updateLessonCover(payload.lessonId.trim(), payload.coverPath.trim())
      return { success: true }
    } catch (err: unknown) {
      logger.error('[IPC] courses:update-lesson-cover error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Extract a .zip course archive into the Vault's Inbox
  ipcMain.handle('courses:extract-zip', async (event, payload: { zipPath: string }) => {
    try {
      if (!payload || typeof payload.zipPath !== 'string' || !payload.zipPath.trim()) {
        return { success: false, error: 'Zip archive path is required' }
      }
      const trimmedZipPath = payload.zipPath.trim()
      if (!archiveService.isZipFile(trimmedZipPath)) {
        return { success: false, error: 'Selected file is not a valid .zip archive' }
      }
      if (!fs.existsSync(trimmedZipPath)) {
        return { success: false, error: `Zip archive not found at path: ${trimmedZipPath}` }
      }

      const currentVault = vaultService.getCurrentVault()
      if (!currentVault) {
        return { success: false, error: 'No active vault is open to extract archive.' }
      }

      const inboxDir = path.join(currentVault.path, 'Inbox')

      const result = await archiveService.extractZip({
        zipPath: trimmedZipPath,
        destinationDir: inboxDir,
        onProgress: (percent, currentFile) => {
          event.sender.send('courses:extract-progress', { percent, currentFile, zipPath: trimmedZipPath })
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
      if (!payload || typeof payload.folderPath !== 'string' || !payload.folderPath.trim()) {
        return { success: false, error: 'Folder path is required' }
      }
      const trimmedFolderPath = payload.folderPath.trim()
      if (!fs.existsSync(trimmedFolderPath)) {
        return { success: false, error: `Directory does not exist: "${trimmedFolderPath}"` }
      }
      if (!fs.statSync(trimmedFolderPath).isDirectory()) {
        return { success: false, error: `Path is not a directory: "${trimmedFolderPath}"` }
      }

      const scannedDir = await scannerService.scanDirectory(trimmedFolderPath)
      const proposal = parserService.parseCourseHierarchy(scannedDir)

      return { success: true, proposal }
    } catch (err: unknown) {
      logger.error('[IPC] courses:scan-folder error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Single Course Import
  ipcMain.handle(
    'courses:import',
    async (
      _event,
      payload: { proposal: ProposedCourseStructure; isExternal: boolean }
    ) => {
      try {
        if (
          !payload ||
          !payload.proposal ||
          typeof payload.proposal.suggestedTitle !== 'string' ||
          !payload.proposal.suggestedTitle.trim() ||
          !Array.isArray(payload.proposal.modules)
        ) {
          return { success: false, error: 'Valid course proposal is required' }
        }
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
          title: proposal.suggestedTitle.trim(),
          slug,
          sourceType: isExternal ? 'local-ref' : 'local-vault',
          rootPath: proposal.rootPath || '',
          coverPath: proposal.coverPath,
          totalDuration: typeof proposal.totalDuration === 'number' ? proposal.totalDuration : 0,
          moduleCount: proposal.modules.length,
          lessonCount: typeof proposal.totalLessons === 'number' ? proposal.totalLessons : 0,
          createdAt: now,
          updatedAt: now
        }

        const modulesWithLessons: (Module & { lessons: Lesson[] })[] = proposal.modules.map(
          (mod, modIdx) => {
            const moduleId = mod.id || crypto.randomUUID()
            const lessons: Lesson[] = (mod.lessons || []).map((l, lIdx) => ({
              id: l.id || crypto.randomUUID(),
              moduleId,
              courseId,
              title: l.title || `Lesson ${lIdx + 1}`,
              orderIndex: typeof l.orderIndex === 'number' ? l.orderIndex : lIdx + 1,
              filePath: l.filePath || '',
              fileName: l.originalFileName || '',
              fileExtension: l.fileExtension || '',
              mediaType: l.mediaType || 'video',
              duration: typeof l.duration === 'number' ? l.duration : 0,
              fileSize: typeof l.fileSize === 'number' ? l.fileSize : 0,
              availability: 'local',
              coverPath: l.coverPath,
              createdAt: now
            }))

            return {
              id: moduleId,
              courseId,
              title: mod.title || `Module ${modIdx + 1}`,
              orderIndex: typeof mod.orderIndex === 'number' ? mod.orderIndex : modIdx + 1,
              folderPath: mod.folderPath,
              duration: typeof mod.duration === 'number' ? mod.duration : 0,
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

  // Batch Multi-Course Import
  ipcMain.handle(
    'courses:import-batch',
    async (
      _event,
      payload: { items: { proposal: ProposedCourseStructure; isExternal: boolean }[] }
    ) => {
      try {
        if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) {
          return { success: false, error: 'Items array is required and must not be empty.' }
        }

        const currentVault = vaultService.getCurrentVault()
        if (!currentVault) {
          return { success: false, error: 'No active vault is open.' }
        }

        const importedCourses: Course[] = []
        const now = Date.now()

        for (const item of payload.items) {
          if (
            !item ||
            !item.proposal ||
            typeof item.proposal.suggestedTitle !== 'string' ||
            !Array.isArray(item.proposal.modules)
          ) {
            continue
          }
          const { proposal, isExternal } = item
          const courseId = crypto.randomUUID()
          const slug = `${generateSlug(proposal.suggestedTitle)}-${courseId.substring(0, 6)}`

          const course: Course = {
            id: courseId,
            title: proposal.suggestedTitle.trim(),
            slug,
            sourceType: isExternal ? 'local-ref' : 'local-vault',
            rootPath: proposal.rootPath || '',
            coverPath: proposal.coverPath,
            totalDuration: typeof proposal.totalDuration === 'number' ? proposal.totalDuration : 0,
            moduleCount: proposal.modules.length,
            lessonCount: typeof proposal.totalLessons === 'number' ? proposal.totalLessons : 0,
            createdAt: now,
            updatedAt: now
          }

          const modulesWithLessons: (Module & { lessons: Lesson[] })[] = proposal.modules.map(
            (mod, modIdx) => {
              const moduleId = mod.id || crypto.randomUUID()
              const lessons: Lesson[] = (mod.lessons || []).map((l, lIdx) => ({
                id: l.id || crypto.randomUUID(),
                moduleId,
                courseId,
                title: l.title || `Lesson ${lIdx + 1}`,
                orderIndex: typeof l.orderIndex === 'number' ? l.orderIndex : lIdx + 1,
                filePath: l.filePath || '',
                fileName: l.originalFileName || '',
                fileExtension: l.fileExtension || '',
                mediaType: l.mediaType || 'video',
                duration: typeof l.duration === 'number' ? l.duration : 0,
                fileSize: typeof l.fileSize === 'number' ? l.fileSize : 0,
                availability: 'local',
                coverPath: l.coverPath,
                createdAt: now
              }))

              return {
                id: moduleId,
                courseId,
                title: mod.title || `Module ${modIdx + 1}`,
                orderIndex: typeof mod.orderIndex === 'number' ? mod.orderIndex : modIdx + 1,
                folderPath: mod.folderPath,
                duration: typeof mod.duration === 'number' ? mod.duration : 0,
                lessonCount: lessons.length,
                createdAt: now,
                lessons
              }
            }
          )

          databaseService.saveCourseWithHierarchy(course, modulesWithLessons)
          importedCourses.push(course)
        }

        return { success: true, courses: importedCourses }
      } catch (err: unknown) {
        logger.error('[IPC] courses:import-batch error:', err)
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
      if (!payload || typeof payload.courseId !== 'string' || !payload.courseId.trim()) {
        return null
      }
      return databaseService.getCourseById(payload.courseId.trim())
    } catch (err) {
      logger.error('[IPC] courses:get-by-id error:', err)
      return null
    }
  })

  ipcMain.handle(
    'courses:delete',
    async (_event, payload: { courseId: string; deleteFiles: boolean }) => {
      try {
        if (!payload || typeof payload.courseId !== 'string' || !payload.courseId.trim()) {
          return { success: false, error: 'Course ID is required' }
        }
        databaseService.deleteCourse(payload.courseId.trim())
        return { success: true }
      } catch (err: unknown) {
        logger.error('[IPC] courses:delete error:', err)
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle('courses:toggle-favorite', async (_event, payload: { courseId: string }) => {
    try {
      if (!payload || typeof payload.courseId !== 'string' || !payload.courseId.trim()) {
        return false
      }
      return databaseService.toggleCourseFavorite(payload.courseId.trim())
    } catch (err) {
      logger.error('[IPC] courses:toggle-favorite error:', err)
      return false
    }
  })

  ipcMain.handle('courses:convert-srt-to-vtt', async (_event, payload: { srtPath: string }) => {
    try {
      if (!payload || typeof payload.srtPath !== 'string' || !payload.srtPath.trim()) {
        return { success: false, error: 'Subtitle file path is required' }
      }
      const trimmedPath = payload.srtPath.trim()
      if (!isSubtitleFile(trimmedPath)) {
        return { success: false, error: 'File is not a supported subtitle file (.srt, .vtt, .sub, .ass)' }
      }
      if (!fs.existsSync(trimmedPath)) {
        return { success: false, error: `Subtitle file not found at path: ${trimmedPath}` }
      }
      const srtContent = fs.readFileSync(trimmedPath, 'utf-8')
      const vttContent = convertSrtToVtt(srtContent)
      return { success: true, vttContent }
    } catch (err: unknown) {
      logger.error('[IPC] courses:convert-srt-to-vtt error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

