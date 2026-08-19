import fs from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { logger } from './logger.service'

export interface ExtractOptions {
  zipPath: string
  destinationDir: string
  onProgress?: (percent: number, currentFile: string) => void
}

export interface ExtractResult {
  extractedPath: string
  totalEntries: number
  totalExtractedFiles: number
  suggestedCourseName: string
}

export class ArchiveService {
  /**
   * Check if a file path is a zip archive
   */
  public isZipFile(filePath: string): boolean {
    if (!filePath || typeof filePath !== 'string') return false
    return path.extname(filePath).toLowerCase() === '.zip'
  }

  /**
   * Safely extract a zip archive preventing directory traversal (Zip Slip vulnerability)
   */
  public async extractZip(options: ExtractOptions): Promise<ExtractResult> {
    const { zipPath, destinationDir, onProgress } = options

    if (!fs.existsSync(zipPath)) {
      throw new Error(`Zip archive not found at path: ${zipPath}`)
    }

    // Ensure destination base exists
    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true })
    }

    const zipBaseName = path.basename(zipPath, path.extname(zipPath))
    const extractTargetDir = path.join(destinationDir, zipBaseName)

    // Ensure target folder exists
    if (!fs.existsSync(extractTargetDir)) {
      fs.mkdirSync(extractTargetDir, { recursive: true })
    }

    logger.info(`[ArchiveService] Extracting ${zipPath} to ${extractTargetDir}`)

    const zip = new AdmZip(zipPath)
    const zipEntries = zip.getEntries()
    const totalEntries = zipEntries.length

    let extractedCount = 0

    // Extract entries safely one by one
    for (let i = 0; i < totalEntries; i++) {
      const entry = zipEntries[i]

      // Prevent Zip Slip vulnerability
      const entryPath = entry.entryName
      const resolvedDest = path.resolve(extractTargetDir, entryPath)

      if (!resolvedDest.startsWith(path.resolve(extractTargetDir))) {
        logger.warn(`[ArchiveService] Skipped unsafe Zip Slip path: ${entryPath}`)
        continue
      }

      if (entry.isDirectory) {
        if (!fs.existsSync(resolvedDest)) {
          fs.mkdirSync(resolvedDest, { recursive: true })
        }
      } else {
        const parentDir = path.dirname(resolvedDest)
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true })
        }

        // Extract individual file
        zip.extractEntryTo(entry, parentDir, false, true)
        extractedCount++
      }

      if (onProgress && totalEntries > 0) {
        const percent = Math.round(((i + 1) / totalEntries) * 100)
        onProgress(percent, entry.name || entryPath)
      }
    }

    logger.info(
      `[ArchiveService] Extraction completed. Extracted ${extractedCount} files from ${totalEntries} entries.`
    )

    // Inspect if the extracted directory has a single top-level root folder
    const finalRoot = this.detectInnerCourseRoot(extractTargetDir)

    return {
      extractedPath: finalRoot,
      totalEntries,
      totalExtractedFiles: extractedCount,
      suggestedCourseName: zipBaseName
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

export const archiveService = new ArchiveService()
