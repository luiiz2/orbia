import { app, dialog, ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import type {
  CommitImportSessionInput,
  ImportSessionTitleEdit,
  ImportSessionTitleEdits,
  ImportSourceCapability,
  SelectedCourseSource
} from '../../types'
import { databaseService } from '../services/database.service'
import { vaultService } from '../services/vault.service'
import { archiveService } from '../services/archive.service'
import { courseImportService } from '../services/course-import.service'
import { importSessionService } from '../services/import-session.service'
import { logger } from '../services/logger.service'
import { convertSrtToVtt } from '../utils/subtitle-utils'
import { isSubtitleFile } from '../utils/file-utils'

type ImportSourceCapabilityKind = 'zip' | 'folder'

interface ImportSourceCapabilityRecord {
  absolutePath: string
  kind: ImportSourceCapabilityKind
  expiresAt: number
}

export interface ImportSourceCapabilityRegistryOptions {
  now?: () => number
  createToken?: () => string
  ttlMs?: number
}

/** Native-picker source references that never cross the Main/Renderer boundary. */
export class ImportSourceCapabilityRegistry {
  private readonly capabilities = new Map<string, ImportSourceCapabilityRecord>()
  private readonly now: () => number
  private readonly createToken: () => string
  private readonly ttlMs: number

  public constructor(options: ImportSourceCapabilityRegistryOptions = {}) {
    this.now = options.now ?? Date.now
    this.createToken = options.createToken ?? crypto.randomUUID
    this.ttlMs = options.ttlMs ?? 5 * 60 * 1_000
  }

  public issue(absolutePath: string, kind: ImportSourceCapabilityKind): ImportSourceCapability {
    const now = this.now()
    this.pruneExpired(now)
    const token = this.nextToken()
    const resolvedPath = path.resolve(absolutePath)
    this.capabilities.set(token, {
      absolutePath: resolvedPath,
      kind,
      expiresAt: now + this.ttlMs
    })

    return {
      token,
      name: kind === 'zip' ? path.basename(resolvedPath, path.extname(resolvedPath)) : path.basename(resolvedPath),
      isZip: kind === 'zip'
    }
  }

  public consume(token: string, expectedKind: ImportSourceCapabilityKind): string {
    const capability = this.capabilities.get(token)
    if (!capability) throw new Error('Import source capability is invalid or already used.')

    // Every attempt consumes the capability, including a wrong kind, so it
    // cannot be replayed through a different prepare handler.
    this.capabilities.delete(token)
    if (this.now() >= capability.expiresAt) {
      throw new Error('Import source capability expired.')
    }
    if (capability.kind !== expectedKind) {
      throw new Error('Import source capability has a different source kind.')
    }
    return capability.absolutePath
  }

  private nextToken(): string {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const token = this.createToken()
      if (token && !this.capabilities.has(token)) return token
    }
    throw new Error('Could not create a unique import source capability.')
  }

  private pruneExpired(now: number): void {
    for (const [token, capability] of this.capabilities) {
      if (now >= capability.expiresAt) this.capabilities.delete(token)
    }
  }
}

const importSourceCapabilityRegistry = new ImportSourceCapabilityRegistry()

/**
 * A cover path is only trustworthy after the native picker returned it. The
 * renderer still receives the path for its existing preview flow, but it
 * cannot persist an arbitrary path: each picker result is a one-time
 * capability consumed by a cover update handler.
 */
interface CoverImageSelectionRecord {
  absolutePath: string
  expiresAt: number
}

export interface CoverImageSelectionRegistryOptions {
  now?: () => number
  ttlMs?: number
}

export class CoverImageSelectionRegistry {
  private readonly selections = new Map<string, CoverImageSelectionRecord>()
  private readonly now: () => number
  private readonly ttlMs: number

  public constructor(options: CoverImageSelectionRegistryOptions = {}) {
    this.now = options.now ?? Date.now
    this.ttlMs = options.ttlMs ?? 5 * 60 * 1_000
  }

  public issue(absolutePath: string): string {
    const now = this.now()
    this.pruneExpired(now)
    const resolvedPath = path.resolve(absolutePath)
    this.selections.set(this.toKey(resolvedPath), {
      absolutePath: resolvedPath,
      expiresAt: now + this.ttlMs
    })
    return resolvedPath
  }

  public consume(selectedPath: string): string {
    const key = this.toKey(selectedPath)
    const selection = this.selections.get(key)
    if (!selection) {
      throw new Error('Cover image must be selected with the native file picker.')
    }

    this.selections.delete(key)
    if (this.now() >= selection.expiresAt) {
      throw new Error('Cover image selection expired. Select it again with the native file picker.')
    }
    return selection.absolutePath
  }

  private toKey(filePath: string): string {
    const resolvedPath = path.resolve(filePath)
    return process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath
  }

  private pruneExpired(now: number): void {
    for (const [key, selection] of this.selections) {
      if (now >= selection.expiresAt) this.selections.delete(key)
    }
  }
}

const coverImageSelectionRegistry = new CoverImageSelectionRegistry()

/**
 * Drops every renderer field except the opaque session capability, storage
 * choice, and title edits keyed by Main-issued IDs.
 */
export function normalizeCommitImportSessionPayload(payload: unknown): CommitImportSessionInput | null {
  if (!isRecord(payload) || typeof payload.sessionId !== 'string' || typeof payload.isExternal !== 'boolean') {
    return null
  }

  const sessionId = payload.sessionId.trim()
  if (!sessionId) return null

  const titleEdits = normalizeTitleEdits(payload.titleEdits)
  if (titleEdits === null) return null

  return {
    sessionId,
    isExternal: payload.isExternal,
    ...(titleEdits ? { titleEdits } : {})
  }
}

/**
 * Merge preview accepts opaque course IDs only. Renderer paths and merge
 * instructions are intentionally not part of this read-only boundary.
 */
export function normalizeMergePreviewCourseIds(payload: unknown): string[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.courseIds)) return null

  const courseIds: string[] = []
  const seen = new Set<string>()
  for (const value of payload.courseIds) {
    if (typeof value !== 'string') return null
    const courseId = value.trim()
    if (!courseId || courseId.length > 200 || /[\\/]/.test(courseId)) return null
    if (!seen.has(courseId)) {
      seen.add(courseId)
      courseIds.push(courseId)
    }
  }

  return courseIds.length >= 2 ? courseIds : null
}

const MUTABLE_MERGE_UNAVAILABLE_ERROR =
  'Course merging is unavailable until a reversible operation plan is implemented. Request courses:get-merge-preview to review a safe proposal.'

const LEGACY_IMPORT_UNAVAILABLE_ERROR =
  'Legacy import channels are disabled. Select a source with the native picker and use the import session preview before committing.'

function mutableMergeUnavailableResult() {
  return {
    success: false,
    mergedGroupsCount: 0,
    removedCoursesCount: 0,
    deduplicatedLessonsCount: 0,
    details: [],
    error: MUTABLE_MERGE_UNAVAILABLE_ERROR
  }
}

function legacyImportUnavailableResult() {
  return { success: false, error: LEGACY_IMPORT_UNAVAILABLE_ERROR }
}

/** Rejects raw paths and accepts only the exact opaque capability payload. */
export function normalizeImportSourceCapabilityToken(payload: unknown): string | null {
  if (!isRecord(payload) || Object.keys(payload).length !== 1 || typeof payload.token !== 'string') {
    return null
  }

  const token = payload.token.trim()
  if (!token || token.length > 200 || /[\\/\s]/.test(token)) return null
  return token
}

function normalizeTitleEdits(value: unknown): ImportSessionTitleEdits | undefined | null {
  if (value === undefined) return undefined
  if (!isRecord(value)) return null

  if (value.courseTitle !== undefined && typeof value.courseTitle !== 'string') return null
  const modules = normalizeTitleEditEntries(value.modules)
  const lessons = normalizeTitleEditEntries(value.lessons)
  if (modules === null || lessons === null) return null

  if (value.courseTitle === undefined && modules === undefined && lessons === undefined) return undefined
  return {
    ...(typeof value.courseTitle === 'string' ? { courseTitle: value.courseTitle } : {}),
    ...(modules === undefined ? {} : { modules }),
    ...(lessons === undefined ? {} : { lessons })
  }
}

function normalizeTitleEditEntries(value: unknown): ImportSessionTitleEdit[] | undefined | null {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return null

  const entries: ImportSessionTitleEdit[] = []
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.title !== 'string' || !entry.id.trim()) {
      return null
    }
    entries.push({ id: entry.id, title: entry.title })
  }
  return entries
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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

      const selectedSources = result.filePaths.map((selectedPath) =>
        importSourceCapabilityRegistry.issue(selectedPath, 'zip')
      )

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

      const selectedSources = result.filePaths.map((selectedPath) =>
        importSourceCapabilityRegistry.issue(selectedPath, 'folder')
      )

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

      return coverImageSelectionRegistry.issue(result.filePaths[0])
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
      const coverPath = coverImageSelectionRegistry.consume(payload.coverPath)
      databaseService.updateCourseCover(payload.courseId.trim(), coverPath)
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
      const coverPath = coverImageSelectionRegistry.consume(payload.coverPath)
      databaseService.updateLessonCover(payload.lessonId.trim(), coverPath)
      return { success: true }
    } catch (err: unknown) {
      logger.error('[IPC] courses:update-lesson-cover error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Prepare a ZIP in Main-owned temporary staging. No user file changes here.
  ipcMain.handle('courses:prepare-zip-import', async (event, payload: unknown) => {
    try {
      const token = normalizeImportSourceCapabilityToken(payload)
      if (!token) {
        return { success: false, error: 'A valid import source capability is required.' }
      }
      const zipPath = importSourceCapabilityRegistry.consume(token, 'zip')
      if (!archiveService.isZipFile(zipPath)) {
        return { success: false, error: 'Selected file is not a valid .zip archive' }
      }
      if (!fs.existsSync(zipPath) || !fs.statSync(zipPath).isFile()) {
        return { success: false, error: `Zip archive not found at path: ${zipPath}` }
      }

      const result = await importSessionService.prepareZipImport({
        zipPath,
        stagingBaseDir: path.join(app.getPath('temp'), 'orbia', 'import-staging'),
        onProgress: (percent, currentFile) => {
          event.sender.send('courses:extract-progress', { percent, currentFile: path.basename(currentFile) })
        }
      })
      return { success: true, ...result }
    } catch (err: unknown) {
      logger.error('[IPC] courses:prepare-zip-import error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Prepare a read-only folder import session. The source is revalidated at commit.
  ipcMain.handle('courses:prepare-folder-import', async (_event, payload: unknown) => {
    try {
      const token = normalizeImportSourceCapabilityToken(payload)
      if (!token) {
        return { success: false, error: 'A valid import source capability is required.' }
      }
      const folderPath = importSourceCapabilityRegistry.consume(token, 'folder')
      const result = await importSessionService.prepareFolderImport(folderPath)
      return { success: true, ...result }
    } catch (err: unknown) {
      logger.error('[IPC] courses:prepare-folder-import error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('courses:cancel-import-session', async (_event, payload: { sessionId: string }) => {
    try {
      if (!payload || typeof payload.sessionId !== 'string' || !payload.sessionId.trim()) {
        return { success: false, error: 'Import session ID is required' }
      }
      await importSessionService.cancel(payload.sessionId.trim())
      return { success: true }
    } catch (err: unknown) {
      logger.error('[IPC] courses:cancel-import-session error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(
    'courses:commit-import-session',
    async (_event, payload: unknown) => {
      try {
        const commitInput = normalizeCommitImportSessionPayload(payload)
        if (!commitInput) {
          return { success: false, error: 'A valid import session is required' }
        }

        const result = await courseImportService.commitSession(commitInput)
        return { success: true, ...result }
      } catch (err: unknown) {
        logger.error('[IPC] courses:commit-import-session error:', err)
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // Legacy raw-path entry points are intentionally unavailable. Imports must
  // use a Main-issued source capability and a reviewed import session.
  ipcMain.handle('courses:extract-zip', async () => legacyImportUnavailableResult())

  ipcMain.handle(
    'courses:update-lesson-duration',
    async (_event, payload: { lessonId: string; duration: number }) => {
      try {
        if (!payload || typeof payload.lessonId !== 'string' || !payload.lessonId.trim()) {
          return { success: false, error: 'Lesson ID is required' }
        }
        const duration = Number(payload.duration)
        if (!Number.isFinite(duration) || duration <= 0) {
          return { success: false, error: 'Invalid duration' }
        }
        databaseService.updateLessonDuration(payload.lessonId.trim(), duration)
        return { success: true }
      } catch (err: unknown) {
        logger.error('[IPC] courses:update-lesson-duration error:', err)
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle('courses:get-merge-preview', async (_event, payload: unknown) => {
    try {
      const courseIds = normalizeMergePreviewCourseIds(payload)
      if (!courseIds) {
        return { success: false, error: 'Select at least two valid courses to preview a merge.' }
      }

      return { success: true, preview: databaseService.getMergePreview(courseIds) }
    } catch (err: unknown) {
      logger.error('[IPC] courses:get-merge-preview error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Mutable merges remain blocked until a reversible operation plan exists.
  // Keep the legacy channels safe for callers that still invoke them directly.
  ipcMain.handle('courses:merge-duplicates', async () => {
    return mutableMergeUnavailableResult()
  })

  ipcMain.handle('courses:merge-courses', async () => mutableMergeUnavailableResult())

  // Get Import History
  ipcMain.handle('courses:get-import-history', async () => {
    try {
      return databaseService.getImportHistory()
    } catch (err) {
      logger.error('[IPC] courses:get-import-history error:', err)
      return []
    }
  })

  // Record Import History Entry
  ipcMain.handle('courses:record-import-history', async (_event, payload: any) => {
    try {
      return databaseService.recordImportHistory(payload)
    } catch (err) {
      logger.error('[IPC] courses:record-import-history error:', err)
      throw err
    }
  })

  // Clear Import History
  ipcMain.handle('courses:clear-import-history', async () => {
    try {
      return databaseService.clearImportHistory()
    } catch (err) {
      logger.error('[IPC] courses:clear-import-history error:', err)
      return false
    }
  })

  ipcMain.handle('courses:scan-folder', async () => legacyImportUnavailableResult())
  ipcMain.handle('courses:import', async () => legacyImportUnavailableResult())
  ipcMain.handle('courses:import-batch', async () => legacyImportUnavailableResult())

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
        const course = databaseService.getCourseById(payload.courseId.trim())
        if (!course) {
          return { success: false, error: 'Course not found' }
        }

        if (payload.deleteFiles) {
          const vault = vaultService.getCurrentVault()
          const root = course.course.rootPath
          const vaultRoot = vault ? path.resolve(vault.path) : null
          const inVault =
            vaultRoot && root && path.resolve(root).startsWith(vaultRoot + path.sep)
          if (inVault && root && fs.existsSync(root)) {
            // Journal the deletion (irreversible — the UI warns before asking).
            databaseService.recordFileOperation({
              operationId: crypto.randomUUID(),
              groupId: `delete-${course.course.id}`,
              type: 'delete',
              sourcePath: root,
              destinationPath: '',
              originalFileName: course.course.title,
              newFileName: '',
              timestamp: Date.now(),
              status: 'completed',
              isReversible: false
            })
            fs.rmSync(root, { recursive: true, force: true })
          }
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

