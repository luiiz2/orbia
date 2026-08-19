import crypto from 'node:crypto'
import path from 'node:path'
import type {
  ProposedCourseStructure,
  ProposedModule,
  ProposedLesson,
  MediaType
} from '../../types'
import { cleanTitle, cleanCourseTitle, cleanModuleTitle } from '../utils/title-cleaner'
import { naturalCompare } from '../utils/natural-sort'
import { isMediaFile, isCoverImage, isImageFile, getMediaType } from '../utils/file-utils'
import type { ScannedDirectory, ScannedFile } from './scanner.service'

/**
 * Interprets a scanned directory structure into a structured Course Proposal.
 * INVARIANT: Pure function/heuristic. Does not write to DB or modify filesystem.
 */
export class ParserService {
  /**
   * Transforms a ScannedDirectory into a ProposedCourseStructure.
   */
  public parseCourseHierarchy(scannedDir: ScannedDirectory): ProposedCourseStructure {
    const suggestedTitle = cleanCourseTitle(scannedDir.name)
    const rootPath = scannedDir.fullPath

    // 1. Locate cover image in root or first sub-level
    let coverPath = this.findCoverImage(scannedDir)

    // 2. Identify modules and lessons
    const proposedModules: ProposedModule[] = []
    let totalFilesCount = 0

    // Check if root has loose media files directly
    const rootMediaFiles = scannedDir.files.filter((f) => isMediaFile(f.fullPath))
    totalFilesCount += scannedDir.files.length

    // Sort subdirectories naturally
    const sortedSubDirs = [...scannedDir.subDirectories].sort((a, b) =>
      naturalCompare(a.name, b.name)
    )

    let moduleOrderIndex = 1

    // If root has loose media files AND there are subdirectories,
    // put root media files into an introductory module
    if (rootMediaFiles.length > 0 && sortedSubDirs.length > 0) {
      const introLessons = this.buildLessons(rootMediaFiles, scannedDir.files)
      if (introLessons.length > 0) {
        proposedModules.push({
          id: crypto.randomUUID(),
          title: 'Introduction & Overview',
          folderPath: rootPath,
          orderIndex: moduleOrderIndex++,
          lessons: introLessons
        })
      }
    }

    // Process each subdirectory as a Module
    for (const subDir of sortedSubDirs) {
      const moduleLessons = this.extractMediaFromDirectory(subDir)
      totalFilesCount += this.countFiles(subDir)

      if (moduleLessons.length > 0) {
        if (!coverPath) {
          coverPath = this.findCoverImage(subDir)
        }

        proposedModules.push({
          id: crypto.randomUUID(),
          title: cleanModuleTitle(subDir.name, moduleOrderIndex),
          folderPath: subDir.fullPath,
          orderIndex: moduleOrderIndex++,
          lessons: moduleLessons
        })
      }
    }

    // If there were NO subdirectories with media, but root had media files (Flat course structure)
    if (proposedModules.length === 0 && rootMediaFiles.length > 0) {
      const flatLessons = this.buildLessons(rootMediaFiles, scannedDir.files)
      proposedModules.push({
        id: crypto.randomUUID(),
        title: suggestedTitle,
        folderPath: rootPath,
        orderIndex: 1,
        lessons: flatLessons
      })
    }

    const totalLessons = proposedModules.reduce((acc, m) => acc + m.lessons.length, 0)

    return {
      suggestedTitle,
      rootPath,
      coverPath,
      modules: proposedModules,
      totalLessons,
      totalFilesScanned: totalFilesCount
    }
  }

  /**
   * Recursively extracts media files from a directory and converts them to ProposedLessons.
   */
  private extractMediaFromDirectory(dir: ScannedDirectory): ProposedLesson[] {
    const allFiles: ScannedFile[] = this.collectAllFilesRecursive(dir)
    const mediaFiles: ScannedFile[] = allFiles.filter((f) => isMediaFile(f.fullPath))

    return this.buildLessons(mediaFiles, allFiles)
  }

  private collectAllFilesRecursive(dir: ScannedDirectory): ScannedFile[] {
    const files: ScannedFile[] = [...dir.files]
    for (const sub of dir.subDirectories) {
      files.push(...this.collectAllFilesRecursive(sub))
    }
    return files
  }

  /**
   * Sorts files naturally and maps them to ProposedLesson items, detecting companion thumbnail images.
   */
  private buildLessons(mediaFiles: ScannedFile[], allFiles: ScannedFile[] = []): ProposedLesson[] {
    const sortedFiles = [...mediaFiles].sort((a, b) => naturalCompare(a.name, b.name))
    const imageFiles = allFiles.filter((f) => isImageFile(f.fullPath))

    return sortedFiles.map((file, index) => {
      const mediaType: MediaType = getMediaType(file.fullPath)
      const title = cleanTitle(file.name)
      const baseNameWithoutExt = path.basename(file.name, path.extname(file.name)).toLowerCase()

      // Look for matching companion thumbnail image (e.g., "01 - Intro.jpg" for "01 - Intro.mp4")
      const companionImg = imageFiles.find((img) => {
        const imgBase = path.basename(img.name, path.extname(img.name)).toLowerCase()
        return (
          imgBase === baseNameWithoutExt ||
          imgBase === `${baseNameWithoutExt}_thumb` ||
          imgBase === `${baseNameWithoutExt}_cover` ||
          imgBase === `${baseNameWithoutExt}_poster`
        )
      })

      return {
        id: crypto.randomUUID(),
        title,
        originalFileName: file.name,
        filePath: file.fullPath,
        fileExtension: file.extension.replace(/^\./, ''),
        mediaType,
        fileSize: file.sizeBytes,
        orderIndex: index + 1,
        coverPath: companionImg ? companionImg.fullPath : undefined
      }
    })
  }

  /**
   * Searches for a cover image file inside a directory.
   */
  private findCoverImage(dir: ScannedDirectory): string | undefined {
    // 1. Explicit cover named files in root
    const coverFile = dir.files.find((f) => isCoverImage(f.fullPath))
    if (coverFile) return coverFile.fullPath

    // 2. Check subdirectories for explicit cover
    for (const sub of dir.subDirectories) {
      const subCover = sub.files.find((f) => isCoverImage(f.fullPath))
      if (subCover) return subCover.fullPath
    }

    // 3. Fallback to any general image in root
    const anyImage = dir.files.find((f) => isImageFile(f.fullPath))
    return anyImage ? anyImage.fullPath : undefined
  }

  /**
   * Total count of files in directory tree.
   */
  private countFiles(dir: ScannedDirectory): number {
    let count = dir.files.length
    for (const sub of dir.subDirectories) {
      count += this.countFiles(sub)
    }
    return count
  }
}

export const parserService = new ParserService()
