import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { isIgnoredPath } from '../utils/file-utils'

export interface ScannedFile {
  name: string
  fullPath: string
  extension: string
  sizeBytes: number
  isDirectory: boolean
  /**
   * Content fingerprint (SHA-1 of head+tail sample, or whole file when small).
   * Used for real duplicate detection — name alone is not enough.
   */
  fingerprint?: string
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
              isDirectory: false,
              fingerprint: await computeFingerprint(fullPath, fileStat.size)
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

const SAMPLE_SIZE = 64 * 1024

/**
 * Lightweight content fingerprint: SHA-1 of the whole file when small (<=128KB),
 * otherwise SHA-1 of the first + last 64KB samples. Cheap enough for scans with
 * multi-gigabyte videos, robust enough to tell identical files from look-alikes.
 */
export async function computeFingerprint(fullPath: string, sizeBytes: number): Promise<string> {
  const hash = crypto.createHash('sha1')
  const fd = await fs.promises.open(fullPath, 'r')
  try {
    if (sizeBytes <= SAMPLE_SIZE * 2) {
      hash.update(await fd.readFile())
    } else {
      const head = Buffer.alloc(SAMPLE_SIZE)
      await fd.read(head, 0, SAMPLE_SIZE, 0)
      hash.update(head)
      const tail = Buffer.alloc(SAMPLE_SIZE)
      await fd.read(tail, 0, SAMPLE_SIZE, sizeBytes - SAMPLE_SIZE)
      hash.update(tail)
    }
  } finally {
    await fd.close()
  }
  return hash.digest('hex')
}

export const scannerService = new ScannerService()
