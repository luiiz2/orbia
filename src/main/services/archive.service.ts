import fs from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { logger } from './logger.service'
import { validateMediaFiles, type MediaValidationResult } from './media-validation.service'

const GIBIBYTE = 1024 * 1024 * 1024

/** Maximum archive entries accepted before any extraction begins. */
export const MAX_ZIP_ENTRIES = 100_000
/** Maximum per-file uncompressed/compressed ratio accepted from ZIP metadata. */
export const MAX_ZIP_ENTRY_COMPRESSION_RATIO = 250
/** Hard ceiling for all uncompressed file data in one ZIP (250 GiB). */
export const MAX_ZIP_UNCOMPRESSED_BYTES = 250 * GIBIBYTE
/** Reserve at least this much free staging space while extracting (1 GiB). */
export const STAGING_FREE_SPACE_MARGIN_BYTES = GIBIBYTE
/** Reserve at least this percentage of the archive's expanded size. */
export const STAGING_FREE_SPACE_MARGIN_PERCENT = 10

export interface ExtractOptions {
  zipPath: string
  destinationDir: string
  /** @deprecated Source deletion is only allowed after an approved import commit. */
  deleteSourceArchive?: boolean
  onProgress?: (percent: number, currentFile: string) => void
}

export interface PrepareZipOptions {
  zipPath: string
  /** App-owned base directory for isolated, disposable import staging. */
  stagingBaseDir: string
  onProgress?: (percent: number, currentFile: string) => void
}

export interface ExtractResult {
  extractedPath: string
  totalEntries: number
  totalExtractedFiles: number
  suggestedCourseName: string
  /** Files that failed to extract or failed size verification */
  failedEntries: string[]
  /** Non-fatal notices: unsafe paths skipped, extraction mismatches */
  warnings: string[]
  /** True when every file entry is present on disk with the expected size */
  verificationOk: boolean
}

export interface PreparedArchive extends ExtractResult {
  /** Original user-selected ZIP. It is preserved until a later approved commit. */
  sourcePath: string
  /** App-owned directory that can be discarded when preview is cancelled. */
  stagingRoot: string
  /** Kept private to Main-process callers; never trust it from the renderer. */
  stagedArchivePath: string
}

export interface ArchiveServiceDependencies {
  validateMedia?: (filePaths: string[]) => Promise<MediaValidationResult>
}

export class ArchiveService {
  public constructor(private readonly dependencies: ArchiveServiceDependencies = {}) {}

  /**
   * Check if a file path is a zip archive
   */
  public isZipFile(filePath: string): boolean {
    if (!filePath || typeof filePath !== 'string') return false
    return path.extname(filePath).toLowerCase() === '.zip'
  }

  /**
   * Compatibility wrapper for existing internal callers. It no longer moves or deletes
   * the source archive; callers that prepare a preview should use prepareZip directly.
   */
  public async extractZip(options: ExtractOptions): Promise<ExtractResult> {
    const result = await this.prepareZip({
      zipPath: options.zipPath,
      stagingBaseDir: options.destinationDir,
      onProgress: options.onProgress
    })

    if (options.deleteSourceArchive) {
      logger.warn(
        '[ArchiveService] Ignored deleteSourceArchive during preparation; source deletion belongs to approved import commit.'
      )
    }

    return result
  }

  /**
   * Copies a ZIP into a unique app-owned staging directory, extracts it safely, and
   * verifies every archive file entry. This method never changes the user's source ZIP.
   */
  public async prepareZip(options: PrepareZipOptions): Promise<PreparedArchive> {
    const { zipPath, stagingBaseDir, onProgress } = options

    if (!fs.existsSync(zipPath)) {
      throw new Error(`Zip archive not found at path: ${zipPath}`)
    }

    const resolvedStagingBase = path.resolve(stagingBaseDir)
    if (!fs.existsSync(resolvedStagingBase)) {
      fs.mkdirSync(resolvedStagingBase, { recursive: true })
    }

    const stagingRoot = fs.mkdtempSync(path.join(resolvedStagingBase, 'orbia-import-'))
    const stagedArchivePath = path.join(stagingRoot, path.basename(zipPath))
    const extractTargetDir = path.join(stagingRoot, 'content')

    try {
      fs.mkdirSync(extractTargetDir, { recursive: true })
      try {
        fs.copyFileSync(zipPath, stagedArchivePath)
      } catch (error) {
        throw new Error(
          `Could not copy ZIP archive into import staging: ${error instanceof Error ? error.message : String(error)}`
        )
      }

      const zipBaseName = path.basename(zipPath, path.extname(zipPath))

      logger.info(`[ArchiveService] Preparing ${zipPath} in ${extractTargetDir}`)

      let zipEntries: AdmZip.IZipEntry[]
      try {
        zipEntries = new AdmZip(stagedArchivePath).getEntries()
      } catch (error) {
        throw new Error(
          `Could not read ZIP archive: ${error instanceof Error ? error.message : String(error)}`
        )
      }
      this.assertZipSafetyLimits(zipEntries, resolvedStagingBase)
      const totalEntries = zipEntries.length

    let extractedCount = 0
    const failedEntries = new Set<string>()
    const warnings: string[] = []
    const expectedFiles = new Map<string, number>()
    const targetRoot = path.resolve(extractTargetDir)

    // Extract entries safely one by one
    for (let i = 0; i < totalEntries; i++) {
      const entry = zipEntries[i]

      // Decode entry name: UTF-8 when valid, else latin1 (Windows-created zips)
      const rawName = entry.rawEntryName
      let decodedName = rawName.toString('utf8')
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(rawName)
      } catch {
        decodedName = rawName.toString('latin1')
      }

      // Normalize and sanitize the relative path.
      const entryPath = sanitizeRelPath(decodedName)

      // Prevent Zip Slip vulnerability
      const resolvedDest = path.resolve(extractTargetDir, entryPath)
      const relative = path.relative(targetRoot, resolvedDest)

      if (!entryPath || relative.startsWith('..') || path.isAbsolute(relative) || entryPath.includes('..')) {
        failedEntries.add(entryPath || decodedName)
        warnings.push(`Skipped unsafe path: ${entryPath}`)
        logger.warn(`[ArchiveService] Skipped unsafe Zip Slip path: ${entryPath}`)
        this.reportProgress(onProgress, i, totalEntries, entryPath)
        continue
      }

      if (entry.isDirectory) {
        try {
          if (!fs.existsSync(resolvedDest)) {
            fs.mkdirSync(resolvedDest, { recursive: true })
          }
        } catch (err) {
          failedEntries.add(entryPath)
          warnings.push(`Failed to create directory: ${entryPath}`)
          logger.warn(`[ArchiveService] Failed to create dir ${entryPath}:`, err)
        }
      } else {
        if (expectedFiles.has(entryPath)) {
          failedEntries.add(entryPath)
          warnings.push(`Duplicate destination path in ZIP: ${entryPath}`)
          logger.warn(`[ArchiveService] Duplicate destination path in ZIP: ${entryPath}`)
          this.reportProgress(onProgress, i, totalEntries, entryPath)
          continue
        }

        const expectedSize = entry.header.size
        expectedFiles.set(entryPath, expectedSize)

        try {
          const parentDir = path.dirname(resolvedDest)
          if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true })
          }

          const data = entry.getData()
          fs.writeFileSync(resolvedDest, data)
          extractedCount++

          // Byte-size verification: what we wrote must match the archive record
          if (data.length !== expectedSize) {
            failedEntries.add(entryPath)
            warnings.push(`Size mismatch for ${entryPath}: wrote ${data.length}, expected ${expectedSize}`)
            logger.warn(
              `[ArchiveService] Size mismatch for ${entryPath}: wrote ${data.length}, expected ${expectedSize}`
            )
          }
        } catch (err) {
          failedEntries.add(entryPath)
          warnings.push(`Failed to extract: ${entryPath}`)
          logger.warn(`[ArchiveService] Failed to extract ${entryPath}:`, err)
        }
      }

      this.reportProgress(onProgress, i, totalEntries, entryPath)
    }

    // Verify every expected file path and byte size from a clean staging directory.
    for (const [entryPath, expectedSize] of expectedFiles) {
      const resolvedDest = path.resolve(extractTargetDir, entryPath)
      try {
        const stat = fs.statSync(resolvedDest)
        if (!stat.isFile() || stat.size !== expectedSize) {
          failedEntries.add(entryPath)
          warnings.push(`Verification mismatch for ${entryPath}: expected ${expectedSize} bytes`)
        }
      } catch (error) {
        failedEntries.add(entryPath)
        warnings.push(`Verification missing file: ${entryPath}`)
        logger.warn(`[ArchiveService] Verification failed for ${entryPath}:`, error)
      }
    }

    const stagedFiles = [...expectedFiles.keys()].map((entryPath) => path.join(extractTargetDir, entryPath))
    let mediaValidationFailed = false
    try {
      const mediaValidation = await (this.dependencies.validateMedia ?? validateMediaFiles)(stagedFiles)
      mediaValidationFailed = !mediaValidation.valid
      for (const failedFile of mediaValidation.failedFiles) {
        const relativePath = path.relative(extractTargetDir, failedFile).split(path.sep).join('/')
        failedEntries.add(relativePath || failedFile)
      }
      warnings.push(...mediaValidation.warnings)
    } catch (error) {
      mediaValidationFailed = true
      const mediaFiles = stagedFiles.filter((filePath) => /\.(?:mp4|mkv|webm|mov|avi|m4v|ts|wmv|flv|mp3|m4a|wav|ogg|flac|aac|wma)$/i.test(filePath))
      for (const filePath of mediaFiles) {
        failedEntries.add(path.relative(extractTargetDir, filePath).split(path.sep).join('/'))
      }
      warnings.push(
        `Media validation could not run: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    const filesOnDisk = countFilesRecursive(extractTargetDir)
    const verificationOk = !mediaValidationFailed && failedEntries.size === 0 && filesOnDisk === expectedFiles.size
    if (filesOnDisk !== expectedFiles.size) {
      warnings.push(
        `Verification mismatch: ${filesOnDisk} files on disk, ${expectedFiles.size} expected (${totalEntries} entries in ZIP)`
      )
    }

    logger.info(
      `[ArchiveService] Extraction completed. Extracted ${extractedCount} files from ${totalEntries} entries. Verified: ${verificationOk}`
    )

    // Inspect if the extracted directory has a single top-level root folder
    const finalRoot = this.detectInnerCourseRoot(extractTargetDir)

    return {
      sourcePath: path.resolve(zipPath),
      extractedPath: finalRoot,
      totalEntries,
      totalExtractedFiles: extractedCount,
      suggestedCourseName: zipBaseName,
      failedEntries: [...failedEntries],
      warnings,
      verificationOk,
      stagingRoot,
      stagedArchivePath
    }
    } catch (error) {
      try {
        this.discardPreparedArchive(stagingRoot, resolvedStagingBase)
      } catch (cleanupError) {
        logger.error('[ArchiveService] Failed to clean incomplete ZIP staging:', cleanupError)
      }
      throw error
    }
  }

  /**
   * Removes an app-owned staging directory. The resolved target must be a direct
   * descendant of the configured staging base, never a user-provided source path.
   */
  public discardPreparedArchive(stagingRoot: string, stagingBaseDir: string): void {
    const resolvedBase = path.resolve(stagingBaseDir)
    const resolvedStaging = path.resolve(stagingRoot)
    const relative = path.relative(resolvedBase, resolvedStaging)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Refusing to discard a path outside import staging.')
    }

    if (fs.existsSync(resolvedStaging)) {
      fs.rmSync(resolvedStaging, { recursive: true, force: true })
    }
  }

  /** Rejects ZIP bomb metadata before entry data is read or written. */
  private assertZipSafetyLimits(entries: AdmZip.IZipEntry[], stagingBaseDir: string): void {
    if (entries.length > MAX_ZIP_ENTRIES) {
      throw new Error(`ZIP archive has too many entries (maximum ${MAX_ZIP_ENTRIES}).`)
    }

    let totalUncompressedBytes = 0n
    const maxRatio = BigInt(MAX_ZIP_ENTRY_COMPRESSION_RATIO)
    const maxUncompressedBytes = BigInt(MAX_ZIP_UNCOMPRESSED_BYTES)

    for (const entry of entries) {
      if (entry.isDirectory) continue

      const uncompressedSize = zipEntrySize(entry.header.size)
      const compressedSize = zipEntrySize(entry.header.compressedSize)
      if (uncompressedSize > 0n && (compressedSize === 0n || uncompressedSize > compressedSize * maxRatio)) {
        throw new Error(
          `ZIP archive contains an entry with a suspicious compression ratio (maximum ${MAX_ZIP_ENTRY_COMPRESSION_RATIO}:1).`
        )
      }

      totalUncompressedBytes += uncompressedSize
      if (totalUncompressedBytes > maxUncompressedBytes) {
        throw new Error(
          `ZIP archive exceeds the maximum uncompressed size of ${MAX_ZIP_UNCOMPRESSED_BYTES} bytes.`
        )
      }
    }

    const availableBytes = this.availableStagingBytes(stagingBaseDir)
    if (availableBytes === undefined) {
      throw new Error('Could not verify available staging space. ZIP extraction was not started.')
    }

    const percentageMargin =
      totalUncompressedBytes / BigInt(STAGING_FREE_SPACE_MARGIN_PERCENT)
    const requiredMargin =
      percentageMargin > BigInt(STAGING_FREE_SPACE_MARGIN_BYTES)
        ? percentageMargin
        : BigInt(STAGING_FREE_SPACE_MARGIN_BYTES)
    if (totalUncompressedBytes + requiredMargin > availableBytes) {
      throw new Error('ZIP archive does not fit in the staging volume with the required safety margin.')
    }
  }

  /** Returns free bytes from statfs, or undefined so callers can fail closed. */
  private availableStagingBytes(stagingBaseDir: string): bigint | undefined {
    const statfsSync: typeof fs.statfsSync | undefined = fs.statfsSync
    if (typeof statfsSync !== 'function') return undefined

    try {
      const stats = statfsSync(stagingBaseDir, { bigint: true })
      if (typeof stats.bavail !== 'bigint' || typeof stats.bsize !== 'bigint') return undefined
      return stats.bavail * stats.bsize
    } catch (error) {
      logger.warn('[ArchiveService] Could not inspect staging free space:', error)
      return undefined
    }
  }

  private reportProgress(
    onProgress: ExtractOptions['onProgress'],
    index: number,
    totalEntries: number,
    entryPath: string
  ): void {
    if (onProgress && totalEntries > 0) {
      const percent = Math.round(((index + 1) / totalEntries) * 100)
      onProgress(percent, path.basename(entryPath) || entryPath)
    }
  }

  /**
   * If a zip contains everything wrapped in a single root folder, return that inner directory.
   */
  private detectInnerCourseRoot(targetDir: string): string {
    try {
      const items = fs.readdirSync(targetDir, { withFileTypes: true })
      // Filter out hidden files like .DS_Store, __MACOSX, Thumbs.db
      const visibleItems = items.filter(
        (item) =>
          !item.name.startsWith('.') &&
          !item.name.startsWith('__MACOSX') &&
          item.name !== 'Thumbs.db'
      )

      if (visibleItems.length === 1 && visibleItems[0].isDirectory()) {
        const innerPath = path.join(targetDir, visibleItems[0].name)
        logger.info(`[ArchiveService] Detected single inner folder: ${innerPath}`)
        return innerPath
      }
    } catch (err) {
      logger.warn('[ArchiveService] Could not inspect inner course root:', err)
    }

    return targetDir
  }
}

/**
 * Normalizes a zip entry name into a safe relative path:
 * forward slashes, no leading slash, Windows-reserved chars neutralized.
 */
function sanitizeRelPath(rawName: string): string {
  const normalized = rawName.replace(/\\/g, '/').replace(/^\/+/, '')
  return normalized
    .split('/')
    .map((segment) => segment.replace(/[:*?"<>|]/g, '_'))
    .join('/')
}

function zipEntrySize(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('ZIP archive has invalid size metadata.')
  }
  return BigInt(value)
}

/** Counts regular files under a directory tree (recursive). */
function countFilesRecursive(dirPath: string): number {
  let count = 0
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      count += countFilesRecursive(fullPath)
    } else if (entry.isFile()) {
      count++
    }
  }
  return count
}

export const archiveService = new ArchiveService()
