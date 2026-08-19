import crypto from 'node:crypto'
import type {
  ProposedCourseStructure,
  ProposedModule,
  ProposedLesson,
  MediaType
} from '../../types'
import { cleanTitle, cleanCourseTitle, cleanModuleTitle } from '../utils/title-cleaner'
import { naturalCompare } from '../utils/natural-sort'
import { isMediaFile, isCoverImage, getMediaType } from '../utils/file-utils'
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
      const introLessons = this.buildLessons(rootMediaFiles)
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
      const flatLessons = this.buildLessons(rootMediaFiles)
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
    const allMedia: ScannedFile[] = []

    // Collect media in current directory
    const directMedia = dir.files.filter((f) => isMediaFile(f.fullPath))
    allMedia.push(...directMedia)

    // Recursively collect media in nested subdirectories
    for (const sub of dir.subDirectories) {
      const nestedMedia = this.collectMediaRecursive(sub)
      allMedia.push(...nestedMedia)
    }

    return this.buildLessons(allMedia)
  }

  private collectMediaRecursive(dir: ScannedDirectory): ScannedFile[] {
    const media: ScannedFile[] = dir.files.filter((f) => isMediaFile(f.fullPath))
    for (const sub of dir.subDirectories) {
      media.push(...this.collectMediaRecursive(sub))
    }
    return media
  }

  /**
   * Sorts files naturally and maps them to ProposedLesson items.
   */
  private buildLessons(files: ScannedFile[]): ProposedLesson[] {
    // Sort files naturally by filename
    const sortedFiles = [...files].sort((a, b) => naturalCompare(a.name, b.name))

    return sortedFiles.map((file, index) => {
      const mediaType: MediaType = getMediaType(file.fullPath)
      const title = cleanTitle(file.name)

      return {
        id: crypto.randomUUID(),
        title,
        originalFileName: file.name,
        filePath: file.fullPath,
        fileExtension: file.extension.replace(/^\./, ''),
        mediaType,
        fileSize: file.sizeBytes,
        orderIndex: index + 1
      }
    })
  }

  /**
   * Searches for a cover image file inside a directory.
   */
  private findCoverImage(dir: ScannedDirectory): string | undefined {
    const coverFile = dir.files.find((f) => isCoverImage(f.fullPath))
    return coverFile ? coverFile.fullPath : undefined
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
