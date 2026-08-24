import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type {
  AppSettings,
  CommitImportSessionInput as PublicCommitImportSessionInput,
  ContentResource,
  Course,
  FileOperationRecord,
  FileOperationStatus,
  ImportHistoryEntry,
  Lesson,
  Module,
  ProposedContentResource,
  ProposedCourseStructure,
  ProposedModule,
  ImportSessionTitleEdits,
  Vault
} from '../../types'
import { appConfigService } from './app-config.service'
import { databaseService } from './database.service'
import {
  importSessionService,
  type ImportSession,
  type ImportSessionService,
  type ImportSourceSignature
} from './import-session.service'
import {
  materializeProposalCovers,
  type MaterializeProposalCoversOptions
} from './proposal-cover.service'
import { vaultService } from './vault.service'
import { optimizationQueueService, provenanceAndExclusionsService } from './optimizer'
import { normalizeModuleKey } from '../utils/title-cleaner'
import { naturalCompare } from '../utils/natural-sort'

type CourseModules = (Module & { lessons: Lesson[] })[]
type MaterializeProposal = (
  proposal: ProposedCourseStructure,
  courseId: string,
  vaultPath: string,
  options?: MaterializeProposalCoversOptions
) => Promise<ProposedCourseStructure>

interface VaultGateway {
  getCurrentVault(): Vault | null
}

interface DatabaseGateway {
  saveCourseWithHierarchy(course: Course, modules: CourseModules): void
  recordFileOperation(entry: FileOperationRecord): void
  updateFileOperationStatus(
    operationId: string,
    status: FileOperationStatus,
    errorDetails?: string | null
  ): void
  recordImportHistory(entry: Omit<ImportHistoryEntry, 'id' | 'createdAt'>): ImportHistoryEntry
  updateCourseCover(courseId: string, coverPath: string): void
  updateLessonCover(lessonId: string, coverPath: string): void
}

interface SettingsGateway {
  getSettings(): Pick<AppSettings, 'deleteSourceZipAfterImport'>
}

export interface CourseImportServiceDependencies {
  sessions?: ImportSessionService
  vault?: VaultGateway
  database?: DatabaseGateway
  settings?: SettingsGateway
  materializeProposal?: MaterializeProposal
  createId?: () => string
  now?: () => number
}

export type CommitImportSessionInput = PublicCommitImportSessionInput

export interface CommitImportSessionResult {
  course: Course
  operationGroupId?: string
  warnings: string[]
}

/**
 * Applies an already-previewed import session. It deliberately trusts physical
 * paths and file metadata only from the Main-owned session, never from the
 * renderer payload. A managed import is journaled before any filesystem move.
 */
export class CourseImportService {
  private readonly sessions: ImportSessionService
  private readonly vault: VaultGateway
  private readonly database: DatabaseGateway
  private readonly settings: SettingsGateway
  private readonly materializeProposal: MaterializeProposal
  private readonly createId: () => string
  private readonly now: () => number

  public constructor(dependencies: CourseImportServiceDependencies = {}) {
    this.sessions = dependencies.sessions ?? importSessionService
    this.vault = dependencies.vault ?? vaultService
    this.database = dependencies.database ?? databaseService
    this.settings = dependencies.settings ?? appConfigService
    this.materializeProposal = dependencies.materializeProposal ?? materializeProposalCovers
    this.createId = dependencies.createId ?? crypto.randomUUID
    this.now = dependencies.now ?? Date.now
  }

  public async commitSession(input: unknown): Promise<CommitImportSessionResult> {
    const commitInput = readCommitInput(input)
    let session: ImportSession | undefined
    let moved = false
    let hierarchySaved = false
    let moveJournaled = false
    let moveOperationId: string | undefined
    let destinationRoot: string | undefined

    try {
      session = await this.sessions.beginCommit(
        commitInput.sessionId,
        commitInput.isExternal ? 'external' : 'managed'
      )
      const currentVault = this.vault.getCurrentVault()
      if (!currentVault) {
        throw new Error('No active vault is open.')
      }
      if (session.sourceKind === 'zip' && commitInput.isExternal) {
        throw new Error('ZIP imports must be stored in the managed vault.')
      }

      const trustedProposal = applyTitleEdits(session.proposal!, commitInput.titleEdits)
      const courseId = this.createId()
      const operationGroupId = this.createId()
      const now = this.now()
      const warnings = [...session.validation.warnings]

      if (commitInput.isExternal) {
        const { course, modules } = buildCourseHierarchy(trustedProposal, {
          courseId,
          sourceType: 'local-ref',
          rootPath: session.sourceRoot,
          now,
          createId: this.createId
        })
        this.database.saveCourseWithHierarchy(course, modules)
        hierarchySaved = true
        this.completeSessionSafely(session, false, warnings)
        this.recordCompletedImportSafely(session, course, warnings)
        await this.materializeCoversSafely(trustedProposal, course, modules, currentVault.path, operationGroupId, warnings)
        this.triggerAutoOptimization(course.id)
        return { course, warnings }
      }

      destinationRoot = this.reserveManagedDestination(currentVault.path, trustedProposal.suggestedTitle, courseId)
      this.assertManagedSourceCanMove(session.sourceRoot, currentVault.path)
      moveOperationId = this.createId()
      this.database.recordFileOperation({
        operationId: moveOperationId,
        groupId: operationGroupId,
        type: 'move',
        sourcePath: session.sourceRoot,
        destinationPath: destinationRoot,
        originalFileName: path.basename(session.sourceRoot),
        newFileName: path.basename(destinationRoot),
        timestamp: now,
        status: 'pending',
        isReversible: true
      })
      moveJournaled = true

      await moveDirectory(session.sourceRoot, destinationRoot, moveOperationId)
      moved = true
      const rebasedProposal = rebaseProposalPaths(trustedProposal, session.sourceRoot, destinationRoot)
      const { course, modules } = buildCourseHierarchy(rebasedProposal, {
        courseId,
        sourceType: 'local-vault',
        rootPath: destinationRoot,
        now,
        createId: this.createId
      })
      this.database.saveCourseWithHierarchy(course, modules)
      hierarchySaved = true

      this.updateJournalSafely(moveOperationId, 'completed', warnings)
      this.completeSessionSafely(session, session.sourceKind === 'zip', warnings)
      this.recordCompletedImportSafely(session, course, warnings)
      await this.materializeCoversSafely(rebasedProposal, course, modules, currentVault.path, operationGroupId, warnings)
      if (session.sourceKind === 'zip') {
        await this.deleteSourceZipAfterCommit(session, operationGroupId, warnings)
      }

      this.triggerAutoOptimization(course.id)
      return { course, operationGroupId, warnings }
    } catch (error) {
      const details = errorMessage(error)
      if (session && !hierarchySaved && moved && destinationRoot) {
        try {
          await moveDirectory(destinationRoot, session.sourceRoot, `${moveOperationId ?? 'import'}-rollback`)
          if (moveJournaled && moveOperationId) {
            this.updateJournalSafely(moveOperationId, 'rolled_back', [], details)
          }
        } catch (rollbackError) {
          if (moveJournaled && moveOperationId) {
            this.updateJournalSafely(
              moveOperationId,
              'failed',
              [],
              `${details} Rollback failed: ${errorMessage(rollbackError)}`
            )
          }
        }
      } else if (moveJournaled && moveOperationId) {
        this.updateJournalSafely(moveOperationId, 'failed', [], details)
      }

      if (session && !hierarchySaved) {
        this.releaseSessionSafely(session.id)
      }
      throw error
    }
  }

  private reserveManagedDestination(vaultPath: string, title: string, courseId: string): string {
    const coursesPath = path.resolve(vaultPath, 'Courses')
    const slug = generateSlug(title) || 'course'
    const destinationRoot = path.resolve(coursesPath, `${slug}-${courseId.slice(0, 6)}`)
    if (!isPathWithin(coursesPath, destinationRoot) || destinationRoot === coursesPath) {
      throw new Error('The managed course destination is outside the vault.')
    }
    if (fs.existsSync(destinationRoot)) {
      throw new Error(`A managed course directory already exists at "${destinationRoot}".`)
    }
    fs.mkdirSync(coursesPath, { recursive: true })
    return destinationRoot
  }

  private assertManagedSourceCanMove(sourceRoot: string, vaultPath: string): void {
    const resolvedSource = path.resolve(sourceRoot)
    const resolvedVault = path.resolve(vaultPath)
    const managedCourses = path.resolve(resolvedVault, 'Courses')
    const vaultMetadata = path.resolve(resolvedVault, '.orbia')
    const sourceStat = fs.statSync(resolvedSource)

    if (!sourceStat.isDirectory()) {
      throw new Error('The approved import source is no longer a directory.')
    }
    if (samePath(resolvedSource, resolvedVault) || isPathWithin(managedCourses, resolvedSource)) {
      throw new Error('The selected source is already a managed vault directory and cannot be moved again.')
    }
    if (isPathWithin(vaultMetadata, resolvedSource)) {
      throw new Error('Vault metadata cannot be used as an import source.')
    }
    if (isPathWithin(resolvedSource, resolvedVault)) {
      throw new Error('The vault cannot be placed inside the selected import source.')
    }
  }

  private completeSessionSafely(session: ImportSession, discardStaging: boolean, warnings: string[]): void {
    try {
      this.sessions.complete(session.id, { discardStaging })
    } catch (error) {
      warnings.push(`Imported course safely, but temporary files could not be cleaned: ${errorMessage(error)}`)
    }
  }

  private releaseSessionSafely(sessionId: string): void {
    try {
      this.sessions.releaseCommit(sessionId)
    } catch {
      // A completed session is intentionally no longer releasable.
    }
  }

  private updateJournalSafely(
    operationId: string,
    status: FileOperationStatus,
    warnings: string[],
    errorDetails?: string
  ): void {
    try {
      this.database.updateFileOperationStatus(operationId, status, errorDetails ?? null)
    } catch (error) {
      warnings.push(`The operation journal could not be updated: ${errorMessage(error)}`)
    }
  }

  private recordCompletedImportSafely(session: ImportSession, course: Course, warnings: string[]): void {
    try {
      this.database.recordImportHistory({
        fileName: path.basename(session.sourcePath),
        filePath: session.sourcePath,
        fileSize: session.sourceSignature?.sizeBytes ?? 0,
        status: 'completed',
        courseId: course.id,
        courseTitle: course.title,
        extractedFiles: session.validation.extractedFiles
      })
    } catch (error) {
      warnings.push(`Import history could not be recorded: ${errorMessage(error)}`)
    }
  }

  private async deleteSourceZipAfterCommit(
    session: ImportSession,
    operationGroupId: string,
    warnings: string[]
  ): Promise<void> {
    let shouldDelete: boolean
    try {
      shouldDelete = Boolean(this.settings.getSettings().deleteSourceZipAfterImport)
    } catch (error) {
      warnings.push(`The original ZIP was kept because its preference could not be read: ${errorMessage(error)}`)
      return
    }
    if (!shouldDelete) {
      return
    }
    if (!session.sourceSignature || !matchesSignature(session.sourcePath, session.sourceSignature)) {
      warnings.push('The original ZIP changed after validation and was kept.')
      return
    }

    const deleteOperationId = this.createId()
    try {
      this.database.recordFileOperation({
        operationId: deleteOperationId,
        groupId: operationGroupId,
        type: 'delete',
        sourcePath: session.sourcePath,
        destinationPath: '',
        originalFileName: path.basename(session.sourcePath),
        newFileName: '',
        timestamp: this.now(),
        status: 'pending',
        isReversible: false
      })
    } catch (error) {
      warnings.push(`The original ZIP was kept because its deletion could not be journaled: ${errorMessage(error)}`)
      return
    }

    try {
      await fs.promises.rm(session.sourcePath, { force: false })
    } catch (error) {
      const details = errorMessage(error)
      this.updateJournalSafely(deleteOperationId, 'failed', warnings, details)
      warnings.push(`The course was imported, but the original ZIP was kept: ${details}`)
      return
    }

    try {
      this.database.updateFileOperationStatus(deleteOperationId, 'completed')
    } catch (error) {
      warnings.push(`The original ZIP was deleted, but its journal could not be updated: ${errorMessage(error)}`)
    }
  }

  private async materializeCoversSafely(
    proposal: ProposedCourseStructure,
    course: Course,
    modules: CourseModules,
    vaultPath: string,
    operationGroupId: string,
    warnings: string[]
  ): Promise<void> {
    const existingCovers = listManagedCoverFiles(vaultPath)
    const coverCopyOperationIds: string[] = []
    let databaseCoverUpdated = false

    try {
      const materialized = await this.materializeProposal(proposal, course.id, vaultPath, {
        beforeCopy: ({ sourcePath, destinationPath }) => {
          const operationId = this.createId()
          this.database.recordFileOperation({
            operationId,
            groupId: operationGroupId,
            type: 'copy',
            sourcePath,
            destinationPath,
            originalFileName: path.basename(sourcePath),
            newFileName: path.basename(destinationPath),
            timestamp: this.now(),
            status: 'pending',
            isReversible: true
          })
          coverCopyOperationIds.push(operationId)
        }
      })
      if (materialized.coverPath && materialized.coverPath !== course.coverPath) {
        this.database.updateCourseCover(course.id, materialized.coverPath)
        course.coverPath = materialized.coverPath
        databaseCoverUpdated = true
      }

      for (let moduleIndex = 0; moduleIndex < modules.length; moduleIndex++) {
        const persistedModule = modules[moduleIndex]
        const materializedModule = materialized.modules[moduleIndex]
        if (!materializedModule) continue

        for (let lessonIndex = 0; lessonIndex < persistedModule.lessons.length; lessonIndex++) {
          const persistedLesson = persistedModule.lessons[lessonIndex]
          const materializedLesson = materializedModule.lessons[lessonIndex]
          if (!materializedLesson?.coverPath || materializedLesson.coverPath === persistedLesson.coverPath) continue
          this.database.updateLessonCover(persistedLesson.id, materializedLesson.coverPath)
          persistedLesson.coverPath = materializedLesson.coverPath
          databaseCoverUpdated = true
        }
      }

      for (const operationId of coverCopyOperationIds) {
        this.updateJournalSafely(operationId, 'completed', warnings)
      }
    } catch (error) {
      const details = errorMessage(error)
      for (const operationId of coverCopyOperationIds) {
        this.updateJournalSafely(operationId, 'failed', warnings, details)
      }
      if (!databaseCoverUpdated) {
        const cleanupWarnings = await removeNewManagedCovers(vaultPath, existingCovers)
        warnings.push(...cleanupWarnings)
      }
      warnings.push(`Course imported, but covers could not be finalized: ${details}`)
    }
  }

  private triggerAutoOptimization(courseId: string): void {
    try {
      const settings = appConfigService.getOptimizationSettings()
      if (!settings.autoOptimizeNewMedia) return

      const db = databaseService.getDatabase()
      if (!db) return

      const lessons = db.prepare(`
        SELECT id, file_path as filePath FROM lessons WHERE course_id = ? AND media_type = 'video'
      `).all(courseId) as { id: string; filePath: string }[]

      for (const l of lessons) {
        if (provenanceAndExclusionsService.isExcluded({ lessonId: l.id, courseId })) continue
        optimizationQueueService.enqueue({
          lessonId: l.id,
          courseId,
          sourcePath: l.filePath,
          profile: settings.defaultProfile || 'balanced'
        })
      }
    } catch (err) {
      // Non-blocking catch
    }
  }
}

function consolidateProposedModules(modules: ProposedModule[]): ProposedModule[] {
  const merged: ProposedModule[] = []
  const map = new Map<string, ProposedModule>()

  for (const mod of modules) {
    const rawTitle = editableTitle(mod.title) ?? mod.title
    const key = normalizeModuleKey(rawTitle) || rawTitle.trim().toLowerCase()
    const existing = map.get(key)
    if (existing) {
      existing.lessons = [...(existing.lessons || []), ...(mod.lessons || [])]
      if (mod.resources && mod.resources.length > 0) {
        existing.resources = [...(existing.resources || []), ...mod.resources]
      }
      if (typeof mod.duration === 'number') {
        existing.duration = (existing.duration || 0) + mod.duration
      }
    } else {
      const copy: ProposedModule = {
        ...mod,
        title: rawTitle,
        lessons: [...(mod.lessons || [])],
        resources: mod.resources ? [...mod.resources] : undefined
      }
      map.set(key, copy)
      merged.push(copy)
    }
  }

  // Re-index modules and lessons naturally
  merged.forEach((mod, mIdx) => {
    mod.orderIndex = mIdx + 1
    mod.lessons.sort((a, b) => (a.orderIndex - b.orderIndex) || naturalCompare(a.title, b.title))
    mod.lessons.forEach((les, lIdx) => {
      les.orderIndex = lIdx + 1
    })
  })

  return merged
}

function applyTitleEdits(
  trustedProposal: ProposedCourseStructure,
  titleEdits: ImportSessionTitleEdits | undefined
): ProposedCourseStructure {
  const submittedModuleTitles = new Map((titleEdits?.modules || []).map((module) => [module.id, module.title]))
  const submittedLessonTitles = new Map((titleEdits?.lessons || []).map((lesson) => [lesson.id, lesson.title]))

  const updatedModules: ProposedModule[] = trustedProposal.modules.map((trustedModule) => {
    return {
      ...trustedModule,
      title: editableTitle(submittedModuleTitles.get(trustedModule.id)) ?? trustedModule.title,
      lessons: trustedModule.lessons.map((trustedLesson) => {
        return {
          ...trustedLesson,
          title: editableTitle(submittedLessonTitles.get(trustedLesson.id)) ?? trustedLesson.title
        }
      })
    }
  })

  const mergedModules = consolidateProposedModules(updatedModules)

  return {
    ...trustedProposal,
    suggestedTitle: editableTitle(titleEdits?.courseTitle) ?? trustedProposal.suggestedTitle,
    modules: mergedModules,
    totalLessons: mergedModules.reduce((acc, mod) => acc + mod.lessons.length, 0)
  }
}


function readCommitInput(input: unknown): CommitImportSessionInput {
  if (!isRecord(input) || typeof input.sessionId !== 'string' || typeof input.isExternal !== 'boolean') {
    throw new Error('A valid import session is required.')
  }

  const sessionId = input.sessionId.trim()
  if (!sessionId) {
    throw new Error('A valid import session is required.')
  }

  const titleEdits = readTitleEdits(input.titleEdits)

  return {
    sessionId,
    isExternal: input.isExternal,
    ...(titleEdits ? { titleEdits } : {})
  }
}

function readTitleEdits(value: unknown): ImportSessionTitleEdits | undefined {
  if (!isRecord(value)) return undefined

  const courseTitle = typeof value.courseTitle === 'string' ? value.courseTitle : undefined
  const modules = readTitleEditEntries(value.modules)
  const lessons = readTitleEditEntries(value.lessons)
  if (courseTitle === undefined && modules.length === 0 && lessons.length === 0) return undefined

  return {
    ...(courseTitle === undefined ? {} : { courseTitle }),
    ...(modules.length === 0 ? {} : { modules }),
    ...(lessons.length === 0 ? {} : { lessons })
  }
}

function readTitleEditEntries(value: unknown): NonNullable<ImportSessionTitleEdits['modules']> {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.title !== 'string') return []
    return [{ id: entry.id, title: entry.title }]
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function editableTitle(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.replaceAll('\u0000', '').trim()
  return trimmed && trimmed.length <= 300 ? trimmed : undefined
}

function rebaseProposalPaths(
  proposal: ProposedCourseStructure,
  sourceRoot: string,
  destinationRoot: string
): ProposedCourseStructure {
  return {
    ...proposal,
    rootPath: destinationRoot,
    coverPath: rebasePath(proposal.coverPath, sourceRoot, destinationRoot),
    modules: proposal.modules.map((mod) => ({
      ...mod,
      folderPath: rebasePath(mod.folderPath, sourceRoot, destinationRoot),
      resources: mod.resources?.map((resource) => ({
        ...resource,
        filePath: rebasePath(resource.filePath, sourceRoot, destinationRoot) ?? resource.filePath
      })),
      lessons: mod.lessons.map((lesson) => ({
        ...lesson,
        filePath: rebasePath(lesson.filePath, sourceRoot, destinationRoot) ?? lesson.filePath,
        coverPath: rebasePath(lesson.coverPath, sourceRoot, destinationRoot),
        contentResources: lesson.contentResources?.map((resource) => ({
          ...resource,
          filePath: rebasePath(resource.filePath, sourceRoot, destinationRoot) ?? resource.filePath
        }))
      }))
    }))
  }
}

function rebasePath(value: string | undefined, sourceRoot: string, destinationRoot: string): string | undefined {
  if (!value) return undefined
  const candidate = path.resolve(value)
  if (!isPathWithin(sourceRoot, candidate)) return value
  return path.join(destinationRoot, path.relative(path.resolve(sourceRoot), candidate))
}

export function buildCourseHierarchy(
  proposal: ProposedCourseStructure,
  options: {
    courseId: string
    sourceType: Course['sourceType']
    rootPath: string
    now: number
    createId: () => string
  }
): { course: Course; modules: CourseModules } {
  const title = editableTitle(proposal.suggestedTitle)
  if (!title) throw new Error('A course title is required.')

  const consolidatedModules = consolidateProposedModules(proposal.modules)

  const modules = consolidatedModules.map((mod) => {
    const moduleId = options.createId()
    const lessons = mod.lessons.map((lesson) => {
      const lessonId = options.createId()
      return {
        id: lessonId,
        moduleId,
        courseId: options.courseId,
        title: editableTitle(lesson.title) ?? lesson.title,
        orderIndex: lesson.orderIndex,
        filePath: lesson.filePath,
        fileName: lesson.originalFileName,
        fileExtension: lesson.fileExtension,
        mediaType: lesson.mediaType,
        duration: typeof lesson.duration === 'number' ? lesson.duration : 0,
        fileSize: lesson.fileSize,
        availability: 'local' as const,
        coverPath: lesson.coverPath,
        createdAt: options.now,
        contentResources: materializeContentResources(lesson.contentResources, {
          courseId: options.courseId,
          moduleId,
          lessonId,
          now: options.now,
          createId: options.createId
        })
      }
    })

    return {
      id: moduleId,
      courseId: options.courseId,
      title: editableTitle(mod.title) ?? mod.title,
      orderIndex: mod.orderIndex,
      folderPath: mod.folderPath,
      duration: typeof mod.duration === 'number' ? mod.duration : 0,
      lessonCount: lessons.length,
      createdAt: options.now,
      resources: materializeContentResources(mod.resources, {
        courseId: options.courseId,
        moduleId,
        now: options.now,
        createId: options.createId
      }),
      lessons
    }
  })

  const totalDuration = proposal.totalDuration ?? modules.reduce((sum, mod) => sum + mod.duration, 0)
  const course: Course = {
    id: options.courseId,
    title,
    slug: `${generateSlug(title) || 'course'}-${options.courseId.slice(0, 6)}`,
    sourceType: options.sourceType,
    rootPath: options.rootPath,
    coverPath: proposal.coverPath,
    totalDuration,
    moduleCount: modules.length,
    lessonCount: modules.reduce((sum, mod) => sum + mod.lessons.length, 0),
    createdAt: options.now,
    updatedAt: options.now
  }

  return { course, modules }
}

function materializeContentResources(
  resources: ProposedContentResource[] | undefined,
  ownership: {
    courseId: string
    moduleId: string
    lessonId?: string
    now: number
    createId: () => string
  }
): ContentResource[] | undefined {
  if (!resources?.length) return undefined
  return resources.map((resource) => ({
    id: ownership.createId(),
    courseId: ownership.courseId,
    moduleId: ownership.moduleId,
    ...(ownership.lessonId ? { lessonId: ownership.lessonId } : {}),
    role: resource.role,
    name: resource.name,
    filePath: resource.filePath,
    fileExtension: resource.fileExtension,
    fileSize: resource.fileSize,
    type: resource.type,
    ...(resource.language ? { language: resource.language } : {}),
    ...(resource.label ? { label: resource.label } : {}),
    createdAt: ownership.now
  }))
}

async function moveDirectory(sourcePath: string, destinationPath: string, operationId: string): Promise<void> {
  if (fs.existsSync(destinationPath)) {
    throw new Error(`Destination already exists: "${destinationPath}"`)
  }

  try {
    await fs.promises.rename(sourcePath, destinationPath)
  } catch (renameError) {
    if (fs.existsSync(destinationPath)) throw renameError

    const transferPath = createTransferPath(destinationPath, operationId)
    try {
      await fs.promises.cp(sourcePath, transferPath, {
        recursive: true,
        force: false,
        errorOnExist: true
      })
    } catch (copyError) {
      await discardTransferPath(transferPath)
      throw copyError
    }

    try {
      if (fs.existsSync(destinationPath)) {
        throw new Error(`Destination already exists: "${destinationPath}"`)
      }
      await fs.promises.rename(transferPath, destinationPath)
    } catch (finalizeError) {
      await discardTransferPath(transferPath)
      throw finalizeError
    }

    try {
      await fs.promises.rm(sourcePath, { recursive: true, force: false })
    } catch (removeError) {
      try {
        await fs.promises.rename(destinationPath, transferPath)
        await discardTransferPath(transferPath)
      } catch (cleanupError) {
        throw new Error(
          `${errorMessage(removeError)} The temporary transfer cleanup also failed: ${errorMessage(cleanupError)}`
        )
      }
      throw removeError
    }
  }
}

function createTransferPath(destinationPath: string, operationId: string): string {
  const parentPath = path.dirname(destinationPath)
  const safeOperationId = operationId.replace(/[^a-zA-Z0-9-]/g, '') || 'operation'
  const transferPath = path.join(parentPath, `.orbia-transfer-${safeOperationId}-${path.basename(destinationPath)}`)
  if (!isPathWithin(parentPath, transferPath) || fs.existsSync(transferPath)) {
    throw new Error('A temporary import transfer path is unavailable.')
  }
  return transferPath
}

async function discardTransferPath(transferPath: string): Promise<void> {
  const parentPath = path.dirname(transferPath)
  if (!isPathWithin(parentPath, transferPath) || !path.basename(transferPath).startsWith('.orbia-transfer-')) {
    throw new Error('Refusing to remove a path outside an owned import transfer.')
  }
  if (fs.existsSync(transferPath)) {
    await fs.promises.rm(transferPath, { recursive: true, force: false })
  }
}

function listManagedCoverFiles(vaultPath: string): Set<string> {
  const coversPath = path.resolve(vaultPath, '.orbia', 'covers')
  try {
    return new Set(
      fs.readdirSync(coversPath, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(coversPath, entry.name))
    )
  } catch {
    return new Set()
  }
}

async function removeNewManagedCovers(vaultPath: string, existingCovers: Set<string>): Promise<string[]> {
  const coversPath = path.resolve(vaultPath, '.orbia', 'covers')
  const warnings: string[] = []
  for (const coverPath of listManagedCoverFiles(vaultPath)) {
    if (existingCovers.has(coverPath) || !isPathWithin(coversPath, coverPath)) continue
    try {
      await fs.promises.rm(coverPath, { force: false })
    } catch (error) {
      warnings.push(`A generated cover could not be cleaned: ${errorMessage(error)}`)
    }
  }
  return warnings
}

function matchesSignature(sourcePath: string, signature: ImportSourceSignature): boolean {
  try {
    const stat = fs.statSync(sourcePath)
    return stat.size === signature.sizeBytes && stat.mtimeMs === signature.modifiedAtMs
  } catch {
    return false
  }
}

function isPathWithin(parentPath: string, candidatePath: string): boolean {
  const parent = path.resolve(parentPath)
  const candidate = path.resolve(candidatePath)
  const relative = path.relative(parent, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function samePath(firstPath: string, secondPath: string): boolean {
  const first = path.resolve(firstPath)
  const second = path.resolve(secondPath)
  return process.platform === 'win32' ? first.toLowerCase() === second.toLowerCase() : first === second
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const courseImportService = new CourseImportService()
