import crypto from 'node:crypto'
import fs, { type Stats } from 'node:fs'
import path from 'node:path'
import type { PreparedArchive, PrepareZipOptions } from './archive.service'
import { archiveService } from './archive.service'
import { scannerService } from './scanner.service'
import { parserService } from './parser.service'
import type {
  ImportSessionPreview,
  ImportSessionResourcePreview,
  ImportSessionValidation as PublicImportSessionValidation,
  ProposedContentResource,
  ProposedCourseStructure
} from '../../types'
import type { ScannedDirectory } from './scanner.service'

export type ImportSourceKind = 'zip' | 'folder'
export type ImportCommitMode = 'managed' | 'external'

export interface ImportValidation {
  verificationOk: boolean
  failedEntries: string[]
  warnings: string[]
  extractedFiles: number
}

export interface ImportPreparationResult {
  sessionId: string
  sourceKind: ImportSourceKind
  suggestedTitle: string
  preview?: ImportSessionPreview
  validation: PublicImportSessionValidation
}

export interface ImportSourceSignature {
  sizeBytes: number
  modifiedAtMs: number
}

export interface FolderFileSignature {
  relativePath: string
  sizeBytes: number
  fingerprint?: string
}

export interface FolderSourceSnapshot {
  files: FolderFileSignature[]
}

type FolderMoveManifestEntryType = 'directory' | 'file' | 'symlink' | 'other'

/**
 * Complete, read-only inventory used exclusively to protect a managed folder
 * move. Unlike the course scanner, it includes ignored and hidden entries.
 */
interface FolderMoveManifestEntry {
  relativePath: string
  type: FolderMoveManifestEntryType
  sizeBytes: number
  modifiedAtMs: number
  linkTarget?: string
}

interface FolderMoveManifest {
  entries: FolderMoveManifestEntry[]
}

export type ImportSessionState = 'pending' | 'committing'

export interface ImportSession {
  id: string
  sourceKind: ImportSourceKind
  sourcePath: string
  sourceRoot: string
  sourceSignature?: ImportSourceSignature
  folderSourceSnapshot?: FolderSourceSnapshot
  folderMoveManifest?: FolderMoveManifest
  folderMoveManifestError?: string
  stagingBaseDir?: string
  preparedArchive?: PreparedArchive
  proposal?: ProposedCourseStructure
  validation: ImportValidation
  state: ImportSessionState
  createdAt: number
}

interface ArchiveGateway {
  prepareZip(options: PrepareZipOptions): Promise<PreparedArchive>
  discardPreparedArchive(stagingRoot: string, stagingBaseDir: string): void
}

interface ScannerGateway {
  scanDirectory(folderPath: string): Promise<ScannedDirectory>
}

interface ParserGateway {
  parseCourseHierarchy(scannedDir: ScannedDirectory): Promise<ProposedCourseStructure>
}

export interface ImportSessionServiceDependencies {
  archive?: ArchiveGateway
  scanner?: ScannerGateway
  parser?: ParserGateway
  createId?: () => string
  now?: () => number
}

export interface CompleteImportSessionOptions {
  discardStaging?: boolean
}

/**
 * Owns temporary import state exclusively in the Main process. Renderer callers
 * only receive opaque session IDs and proposal data; staging paths remain private.
 */
export class ImportSessionService {
  private readonly sessions = new Map<string, ImportSession>()
  private readonly archive: ArchiveGateway
  private readonly scanner: ScannerGateway
  private readonly parser: ParserGateway
  private readonly createId: () => string
  private readonly now: () => number

  public constructor(dependencies: ImportSessionServiceDependencies = {}) {
    this.archive = dependencies.archive ?? archiveService
    this.scanner = dependencies.scanner ?? scannerService
    this.parser = dependencies.parser ?? parserService
    this.createId = dependencies.createId ?? crypto.randomUUID
    this.now = dependencies.now ?? Date.now
  }

  public async prepareZipImport(options: {
    zipPath: string
    stagingBaseDir: string
    onProgress?: PrepareZipOptions['onProgress']
  }): Promise<ImportPreparationResult> {
    const sourceBeforePreparation = sourceSignature(options.zipPath)
    const preparedArchive = await this.archive.prepareZip(options)
    const sourceChangedDuringPreparation =
      sourceBeforePreparation !== undefined &&
      !sameSourceSignature(sourceBeforePreparation, sourceSignature(preparedArchive.sourcePath))
    const session = this.createZipSession(
      preparedArchive,
      options.stagingBaseDir,
      sourceBeforePreparation,
      sourceChangedDuringPreparation
    )
    this.sessions.set(session.id, session)

    if (!session.validation.verificationOk) {
      return this.toPreparationResult(session)
    }

    try {
      const scanned = await this.scanner.scanDirectory(preparedArchive.extractedPath)
      session.proposal = await this.parser.parseCourseHierarchy(scanned)
      return this.toPreparationResult(session)
    } catch (error) {
      await this.cancel(session.id)
      throw error
    }
  }

  public async prepareFolderImport(folderPath: string): Promise<ImportPreparationResult> {
    const resolvedFolderPath = folderPath.trim()
    if (!resolvedFolderPath) {
      throw new Error(`Directory does not exist: "${folderPath}"`)
    }

    let folderMoveManifest: FolderMoveManifest | undefined
    let folderMoveManifestError: string | undefined
    try {
      folderMoveManifest = await createFolderMoveManifest(resolvedFolderPath)
    } catch (error) {
      folderMoveManifestError = folderMoveManifestFailureMessage(error)
    }
    const scanned = await this.scanner.scanDirectory(resolvedFolderPath)
    const proposal = await this.parser.parseCourseHierarchy(scanned)
    const session: ImportSession = {
      id: this.createId(),
      sourceKind: 'folder',
      sourcePath: resolvedFolderPath,
      sourceRoot: resolvedFolderPath,
      sourceSignature: sourceSignature(resolvedFolderPath),
      folderSourceSnapshot: createFolderSourceSnapshot(scanned, resolvedFolderPath),
      folderMoveManifest,
      folderMoveManifestError,
      proposal,
      validation: {
        verificationOk: true,
        failedEntries: [],
        warnings: [],
        extractedFiles: proposal.totalFilesScanned
      },
      state: 'pending',
      createdAt: this.now()
    }
    this.sessions.set(session.id, session)
    return this.toPreparationResult(session)
  }

  public getSession(sessionId: string): ImportSession {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error('Import session not found or has expired.')
    }
    return session
  }

  /**
   * Atomically claims a pending session for commit. The mode is derived in the
   * Main process after renderer input is normalized: external references only
   * need the scanner snapshot, while managed imports also need a full move
   * manifest because they mutate the source directory.
   */
  public async beginCommit(
    sessionId: string,
    mode: ImportCommitMode = 'managed'
  ): Promise<ImportSession> {
    if (mode !== 'managed' && mode !== 'external') {
      throw new Error('The import commit mode is invalid.')
    }
    const session = this.getSession(sessionId)
    if (session.state !== 'pending') {
      throw new Error('This import session is already being committed.')
    }
    if (!session.validation.verificationOk || !session.proposal) {
      throw new Error('The import session did not pass validation and cannot be committed.')
    }

    session.state = 'committing'
    try {
      if (session.sourceKind === 'folder') {
        if (!session.folderSourceSnapshot) {
          throw new Error('The selected folder has no integrity snapshot. Review the import again.')
        }
        const sourceIsUnchanged = await validateFolderSourceIntegrity(
          session.sourceRoot,
          session.folderSourceSnapshot,
          (folderPath) => this.scanner.scanDirectory(folderPath)
        )
        if (!sourceIsUnchanged) {
          throw new Error('The selected folder changed after preview. Review the import again before moving it.')
        }
        if (mode === 'managed') {
          if (!session.folderMoveManifest) {
            throw new Error(
              session.folderMoveManifestError ??
                'The selected folder cannot be safely moved because its complete contents could not be read. Keep it as an external reference instead.'
            )
          }
          const moveManifestIsUnchanged = await validateFolderMoveManifest(
            session.sourceRoot,
            session.folderMoveManifest
          )
          if (!moveManifestIsUnchanged) {
            throw new Error('The selected folder changed after preview. Review the import again before moving it.')
          }
        }
      }
      return session
    } catch (error) {
      session.state = 'pending'
      throw error
    }
  }

  /** Releases a claim after a commit error so the user can retry or cancel. */
  public releaseCommit(sessionId: string): void {
    const session = this.getSession(sessionId)
    if (session.state === 'committing') {
      session.state = 'pending'
    }
  }

  /**
   * Finalizes a successful commit. Unlike cancel, this may discard ZIP staging
   * while the session is claimed so no concurrent cancellation can intervene.
   */
  public complete(sessionId: string, options: CompleteImportSessionOptions = {}): void {
    const session = this.getSession(sessionId)
    try {
      if (options.discardStaging && session.preparedArchive && session.stagingBaseDir) {
        this.archive.discardPreparedArchive(session.preparedArchive.stagingRoot, session.stagingBaseDir)
      }
    } finally {
      this.sessions.delete(sessionId)
    }
  }

  public async cancel(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return
    if (session.state === 'committing') {
      throw new Error('This import session cannot be cancelled while it is committing.')
    }

    this.sessions.delete(sessionId)
    if (session.preparedArchive && session.stagingBaseDir) {
      this.archive.discardPreparedArchive(session.preparedArchive.stagingRoot, session.stagingBaseDir)
    }
  }

  private createZipSession(
    preparedArchive: PreparedArchive,
    stagingBaseDir: string,
    sourceBeforePreparation: ImportSourceSignature | undefined,
    sourceChangedDuringPreparation: boolean
  ): ImportSession {
    const validation: ImportValidation = {
      verificationOk: preparedArchive.verificationOk && !sourceChangedDuringPreparation,
      failedEntries: preparedArchive.failedEntries,
      warnings: sourceChangedDuringPreparation
        ? [...preparedArchive.warnings, 'The original ZIP changed during preparation and was kept.']
        : preparedArchive.warnings,
      extractedFiles: preparedArchive.totalExtractedFiles
    }

    return {
      id: this.createId(),
      sourceKind: 'zip',
      sourcePath: preparedArchive.sourcePath,
      sourceRoot: preparedArchive.extractedPath,
      sourceSignature: sourceBeforePreparation ?? sourceSignature(preparedArchive.sourcePath),
      stagingBaseDir,
      preparedArchive,
      validation,
      state: 'pending',
      createdAt: this.now()
    }
  }

  private toPreparationResult(session: ImportSession): ImportPreparationResult {
    return {
      sessionId: session.id,
      sourceKind: session.sourceKind,
      suggestedTitle: session.proposal?.suggestedTitle ?? session.preparedArchive?.suggestedCourseName ?? '',
      preview: session.proposal ? toPublicPreview(session.proposal) : undefined,
      validation: toPublicValidation(session.validation, session)
    }
  }
}

function toPublicPreview(proposal: ProposedCourseStructure): ImportSessionPreview {
  const preview: ImportSessionPreview = {
    suggestedTitle: proposal.suggestedTitle,
    totalLessons: proposal.totalLessons,
    totalFilesScanned: proposal.totalFilesScanned,
    modules: proposal.modules.map((module) => ({
      id: module.id,
      title: module.title,
      orderIndex: module.orderIndex,
      ...(typeof module.duration === 'number' ? { duration: module.duration } : {}),
      resources: (module.resources ?? []).map(toPublicResource),
      lessons: module.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        originalFileName: displayFileName(lesson.originalFileName),
        fileExtension: lesson.fileExtension,
        mediaType: lesson.mediaType,
        fileSize: lesson.fileSize,
        orderIndex: lesson.orderIndex,
        ...(typeof lesson.duration === 'number' ? { duration: lesson.duration } : {}),
        contentResources: (lesson.contentResources ?? []).map(toPublicResource)
      }))
    }))
  }

  if (typeof proposal.totalDuration === 'number') {
    preview.totalDuration = proposal.totalDuration
  }
  if (proposal.duplicates?.length) {
    preview.duplicates = proposal.duplicates.map((duplicate) => ({
      fileName: displayFileName(duplicate.fileName),
      fileSize: duplicate.fileSize,
      count: duplicate.count
    }))
  }

  return preview
}

function toPublicResource(resource: ProposedContentResource): ImportSessionResourcePreview {
  return {
    id: resource.id,
    name: displayFileName(resource.name),
    fileExtension: resource.fileExtension,
    fileSize: resource.fileSize,
    type: resource.type,
    role: resource.role,
    ...(resource.language ? { language: resource.language } : {}),
    ...(resource.label ? { label: resource.label } : {})
  }
}

function toPublicValidation(
  validation: ImportValidation,
  session: ImportSession
): PublicImportSessionValidation {
  const privatePaths = [
    session.sourcePath,
    session.sourceRoot,
    session.preparedArchive?.stagingRoot,
    session.preparedArchive?.stagedArchivePath,
    session.preparedArchive?.extractedPath
  ].filter((value): value is string => Boolean(value))

  return {
    verificationOk: validation.verificationOk,
    failedEntries: validation.failedEntries.map(displayFileName),
    warnings: validation.warnings.map((warning) => redactPrivatePaths(warning, privatePaths)),
    extractedFiles: validation.extractedFiles
  }
}

function displayFileName(value: string): string {
  const normalized = value.replaceAll('\\', '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1) || normalized
}

function redactPrivatePaths(value: string, privatePaths: string[]): string {
  return privatePaths.reduce(
    (sanitized, privatePath) => sanitized.replaceAll(privatePath, '[path]'),
    value
  )
}

function sourceSignature(sourcePath: string): ImportSourceSignature | undefined {
  try {
    const stat = fs.statSync(sourcePath)
    return { sizeBytes: stat.size, modifiedAtMs: stat.mtimeMs }
  } catch {
    return undefined
  }
}

function sameSourceSignature(
  first: ImportSourceSignature,
  second: ImportSourceSignature | undefined
): boolean {
  return Boolean(second && first.sizeBytes === second.sizeBytes && first.modifiedAtMs === second.modifiedAtMs)
}

function createFolderSourceSnapshot(scannedDirectory: ScannedDirectory, sourceRoot: string): FolderSourceSnapshot {
  const resolvedRoot = path.resolve(sourceRoot)
  const files: FolderFileSignature[] = []
  collectFolderFileSignatures(scannedDirectory, resolvedRoot, files)
  return { files: files.sort((first, second) => first.relativePath.localeCompare(second.relativePath)) }
}

function collectFolderFileSignatures(
  scannedDirectory: ScannedDirectory,
  sourceRoot: string,
  files: FolderFileSignature[]
): void {
  for (const file of scannedDirectory.files) {
    const absolutePath = path.resolve(file.fullPath)
    const relativePath = path.relative(sourceRoot, absolutePath)
    if (!relativePath || relativePath.startsWith(`..${path.sep}`) || relativePath === '..' || path.isAbsolute(relativePath)) {
      throw new Error('Scanner returned a file outside the selected folder.')
    }
    files.push({
      relativePath: relativePath.replaceAll('\\', '/'),
      sizeBytes: file.sizeBytes,
      fingerprint: file.fingerprint
    })
  }

  for (const subDirectory of scannedDirectory.subDirectories) {
    collectFolderFileSignatures(subDirectory, sourceRoot, files)
  }
}

/** Re-scans a folder and compares its previewed file structure before a commit. */
export async function validateFolderSourceIntegrity(
  sourceRoot: string,
  expectedSnapshot: FolderSourceSnapshot,
  scanDirectory: (folderPath: string) => Promise<ScannedDirectory>
): Promise<boolean> {
  const currentSnapshot = createFolderSourceSnapshot(await scanDirectory(sourceRoot), sourceRoot)
  if (expectedSnapshot.files.length !== currentSnapshot.files.length) return false

  return expectedSnapshot.files.every((expectedFile, index) => {
    const currentFile = currentSnapshot.files[index]
    return (
      expectedFile.relativePath === currentFile.relativePath &&
      expectedFile.sizeBytes === currentFile.sizeBytes &&
      expectedFile.fingerprint === currentFile.fingerprint
    )
  })
}

/**
 * Builds a full, non-following filesystem manifest for a source folder before
 * it can be moved into the managed vault. This deliberately does not reuse
 * ScannerService: scanner exclusions are correct for course structure, but an
 * excluded entry would still be moved with its parent directory.
 */
async function createFolderMoveManifest(sourceRoot: string): Promise<FolderMoveManifest> {
  const resolvedRoot = path.resolve(sourceRoot)
  let rootStats: Stats

  try {
    rootStats = await fs.promises.lstat(resolvedRoot)
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      throw new Error(`Directory does not exist: "${sourceRoot}"`)
    }
    throw inaccessibleFolderManifestError()
  }

  if (rootStats.isSymbolicLink()) {
    throw new Error('The selected import source must be a real directory, not a symbolic link.')
  }
  if (!rootStats.isDirectory()) {
    throw new Error(`Directory does not exist: "${sourceRoot}"`)
  }

  const entries: FolderMoveManifestEntry[] = [
    createFolderMoveManifestEntry('.', rootStats)
  ]
  await collectFolderMoveManifestEntries(resolvedRoot, resolvedRoot, entries)
  return {
    entries: entries.sort((first, second) => first.relativePath.localeCompare(second.relativePath))
  }
}

async function collectFolderMoveManifestEntries(
  sourceRoot: string,
  directoryPath: string,
  entries: FolderMoveManifestEntry[]
): Promise<void> {
  let childNames: string[]
  try {
    childNames = await fs.promises.readdir(directoryPath)
  } catch {
    throw inaccessibleFolderManifestError()
  }

  for (const childName of childNames) {
    const childPath = path.join(directoryPath, childName)
    let childStats: Stats
    try {
      childStats = await fs.promises.lstat(childPath)
    } catch {
      throw inaccessibleFolderManifestError()
    }

    const relativePath = normalizedManifestRelativePath(sourceRoot, childPath)
    let linkTarget: string | undefined
    if (childStats.isSymbolicLink()) {
      try {
        linkTarget = await fs.promises.readlink(childPath)
      } catch {
        throw inaccessibleFolderManifestError()
      }
    }

    entries.push(createFolderMoveManifestEntry(relativePath, childStats, linkTarget))

    if (childStats.isDirectory()) {
      await collectFolderMoveManifestEntries(sourceRoot, childPath, entries)
    }
  }
}

function normalizedManifestRelativePath(sourceRoot: string, entryPath: string): string {
  const relativePath = path.relative(sourceRoot, entryPath)
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    throw inaccessibleFolderManifestError()
  }
  return relativePath.replaceAll('\\', '/')
}

function createFolderMoveManifestEntry(
  relativePath: string,
  stats: Stats,
  linkTarget?: string
): FolderMoveManifestEntry {
  return {
    relativePath,
    type: folderMoveManifestEntryType(stats),
    sizeBytes: stats.size,
    modifiedAtMs: stats.mtimeMs,
    ...(linkTarget === undefined ? {} : { linkTarget })
  }
}

function folderMoveManifestEntryType(stats: Stats): FolderMoveManifestEntryType {
  if (stats.isSymbolicLink()) return 'symlink'
  if (stats.isDirectory()) return 'directory'
  if (stats.isFile()) return 'file'
  return 'other'
}

async function validateFolderMoveManifest(
  sourceRoot: string,
  expectedManifest: FolderMoveManifest
): Promise<boolean> {
  const currentManifest = await createFolderMoveManifest(sourceRoot)
  if (expectedManifest.entries.length !== currentManifest.entries.length) return false

  return expectedManifest.entries.every((expectedEntry, index) => {
    const currentEntry = currentManifest.entries[index]
    return (
      expectedEntry.relativePath === currentEntry.relativePath &&
      expectedEntry.type === currentEntry.type &&
      expectedEntry.sizeBytes === currentEntry.sizeBytes &&
      expectedEntry.modifiedAtMs === currentEntry.modifiedAtMs &&
      expectedEntry.linkTarget === currentEntry.linkTarget
    )
  })
}

function folderMoveManifestFailureMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : inaccessibleFolderManifestError().message
}

function inaccessibleFolderManifestError(): Error {
  return new Error(
    'The selected folder cannot be safely moved because one or more entries could not be read. Keep it as an external reference instead.'
  )
}

function hasErrorCode(error: unknown, expectedCode: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === expectedCode
  )
}

export const importSessionService = new ImportSessionService()
