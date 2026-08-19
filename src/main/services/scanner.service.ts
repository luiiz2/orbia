import fs from 'node:fs'
import path from 'node:path'
import { isIgnoredPath } from '../utils/file-utils'

export interface ScannedFile {
  name: string
  fullPath: string
  extension: string
  sizeBytes: number
  isDirectory: boolean
}

export interface ScannedDirectory {
  name: string
  fullPath: string
  files: ScannedFile[]
  subDirectories: ScannedDirectory[]
}

/**
 * Read-only recursive filesystem scanner.
 * INVARIANT: Never writes, moves, renames, or deletes files.
 */
export class ScannerService {
  /**
   * Recursively scans a root directory and returns a structured tree.
   */
  public async scanDirectory(rootPath: string): Promise<ScannedDirectory> {
    const stats = await fs.promises.stat(rootPath)
    if (!stats.isDirectory()) {
      throw new Error(`The path "${rootPath}" is not a valid directory.`)
    }

    return this.walkDirectory(rootPath, path.basename(rootPath))
  }

  /**
   * Internal recursive directory walker.
   */
  private async walkDirectory(dirPath: string, dirName: string): Promise<ScannedDirectory> {
    const files: ScannedFile[] = []
    const subDirectories: ScannedDirectory[] = []

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        if (isIgnoredPath(entry.name)) {
          continue
        }

        const fullPath = path.join(dirPath, entry.name)

        if (entry.isDirectory()) {
          try {
            const subDir = await this.walkDirectory(fullPath, entry.name)
            // Only keep non-empty directories or directories containing items
            if (subDir.files.length > 0 || subDir.subDirectories.length > 0) {
              subDirectories.push(subDir)
            }
          } catch (err) {
            console.warn(`[Scanner] Warning: Could not access subdirectory "${fullPath}":`, err)
          }
        } else if (entry.isFile()) {
          try {
            const fileStat = await fs.promises.stat(fullPath)
            files.push({
              name: entry.name,
              fullPath,
              extension: path.extname(entry.name).toLowerCase(),
              sizeBytes: fileStat.size,
              isDirectory: false
            })
          } catch (err) {
            console.warn(`[Scanner] Warning: Could not stat file "${fullPath}":`, err)
          }
        }
      }
    } catch (err) {
      console.error(`[Scanner] Error reading directory "${dirPath}":`, err)
      throw err
    }

    return {
      name: dirName,
      fullPath: dirPath,
      files,
      subDirectories
    }
  }

  /**
   * Flattens all media files across a scanned directory tree.
   */
  public collectAllFiles(scannedDir: ScannedDirectory): ScannedFile[] {
    const results: ScannedFile[] = [...scannedDir.files]
    for (const subDir of scannedDir.subDirectories) {
      results.push(...this.collectAllFiles(subDir))
    }
    return results
  }
}

export const scannerService = new ScannerService()
