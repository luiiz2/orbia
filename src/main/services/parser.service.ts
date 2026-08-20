import crypto from 'node:crypto'
import path from 'node:path'
import type {
  DuplicateFile,
  ProposedContentResource,
  ProposedCourseStructure,
  ProposedLesson,
  ProposedModule
} from '../../types'
import { cleanCourseTitle, cleanModuleTitle, cleanTitle } from '../utils/title-cleaner'
import { naturalCompare } from '../utils/natural-sort'
import {
  getMediaType,
  isCoverImage,
  isImageFile,
  isMediaFile,
  isPreservableContentFile,
  isSubtitleFile
} from '../utils/file-utils'
import type { ScannedDirectory, ScannedFile } from './scanner.service'
import { ensureCourseCover, generateTextCover } from '../utils/cover-generator'

interface ParsedModuleContent {
  lessons: ProposedLesson[]
  resources: ProposedContentResource[]
}

interface DuplicateCandidate {
  fileName: string
  filePath: string
  fileSize: number
  fingerprint?: string
}

/**
 * Interprets a scanned directory structure into a structured Course Proposal.
 * INVARIANT: Read-only. Never writes to DB or mutates user course files.
 * Generated fallback covers are written to the OS temp dir (app cache only).
 */
export class ParserService {
  /**
   * Transforms a ScannedDirectory into a ProposedCourseStructure.
   * Every course receives an explicit root cover image or an SVG fallback.
   */
  public async parseCourseHierarchy(scannedDir: ScannedDirectory): Promise<ProposedCourseStructure> {
    const suggestedTitle = cleanCourseTitle(scannedDir.name)
    const rootPath = scannedDir.fullPath

    // 1. Locate a root cover image; generate a fallback if missing.
    let coverPath = this.findCoverImage(scannedDir)
    if (!coverPath) {
      coverPath = await ensureCourseCover(rootPath, suggestedTitle)
    }

    // 2. Identify modules, playable lessons, and all other preserved content.
    const proposedModules: ProposedModule[] = []
    let totalFilesCount = scannedDir.files.length
    const rootContent = await this.parseModuleContent(scannedDir.files, rootPath)

    // Sort subdirectories naturally
    const sortedSubDirs = [...scannedDir.subDirectories].sort((a, b) =>
      naturalCompare(a.name, b.name)
    )

    let moduleOrderIndex = 1

    const hasRootContent = rootContent.lessons.length > 0 || rootContent.resources.length > 0
    const hasRootContentBeyondCourseCover =
      rootContent.lessons.length > 0 ||
      rootContent.resources.some((resource) => resource.filePath !== coverPath)

    // Loose root content sits before nested modules, even when it is material-only.
    // A root cover alone must not create a phantom introductory module.
    if (hasRootContentBeyondCourseCover && sortedSubDirs.length > 0) {
      proposedModules.push({
        id: crypto.randomUUID(),
        title: suggestedTitle,
        folderPath: rootPath,
        orderIndex: moduleOrderIndex++,
        lessons: rootContent.lessons,
        resources: rootContent.resources
      })
    }

    // Process each subdirectory as a Module
    for (const subDir of sortedSubDirs) {
      const moduleContent = await this.parseModuleContent(
        this.collectAllFilesRecursive(subDir),
        subDir.fullPath
      )
      totalFilesCount += this.countFiles(subDir)

      // A module with just files to read, images, or sidecars is still meaningful.
      if (moduleContent.lessons.length > 0 || moduleContent.resources.length > 0) {
        proposedModules.push({
          id: crypto.randomUUID(),
          title: cleanModuleTitle(subDir.name, moduleOrderIndex),
          folderPath: subDir.fullPath,
          orderIndex: moduleOrderIndex++,
          lessons: moduleContent.lessons,
          resources: moduleContent.resources
        })
      }
    }

    // Content resources require a module owner. Preserve a root-only cover with
    // the first real module instead of creating a module solely for that image.
    if (!hasRootContentBeyondCourseCover && rootContent.resources.length > 0 && proposedModules[0]) {
      proposedModules[0].resources = [
        ...rootContent.resources,
        ...(proposedModules[0].resources || [])
      ]
    }

    // A flat course can consist solely of materials, without a playable lesson.
    if (proposedModules.length === 0 && hasRootContent) {
      proposedModules.push({
        id: crypto.randomUUID(),
        title: suggestedTitle,
        folderPath: rootPath,
        orderIndex: 1,
        lessons: rootContent.lessons,
        resources: rootContent.resources
      })
    }

    // 3. Detect duplicate candidates, but never silently omit or renumber content.
    const duplicates = this.findDuplicateCandidates(proposedModules)

    return {
      suggestedTitle,
      rootPath,
      coverPath,
      modules: proposedModules,
      totalLessons: proposedModules.reduce((acc, module) => acc + module.lessons.length, 0),
      totalFilesScanned: totalFilesCount,
      duplicates: duplicates.length > 0 ? duplicates : undefined
    }
  }

  /**
   * Builds module content from every non-ignored scanned file. Only playable
   * media becomes a lesson; all other files remain represented as resources.
   */
  private async parseModuleContent(
    allFiles: ScannedFile[],
    moduleRootPath: string
  ): Promise<ParsedModuleContent> {
    const preservedFiles = allFiles.filter(
      (file) => !file.isDirectory && isPreservableContentFile(file.fullPath)
    )
    const lessons = await this.buildLessons(
      preservedFiles.filter((file) => isMediaFile(file.fullPath)),
      preservedFiles
    )

    return {
      lessons,
      resources: this.buildResources(preservedFiles, lessons, moduleRootPath)
    }
  }

  /**
   * Reports duplicate candidates without changing module, lesson, or resource
   * membership. Removal is always a later explicit user decision.
   */
  private findDuplicateCandidates(modules: ProposedModule[]): DuplicateFile[] {
    const seen = new Map<string, DuplicateCandidate>()
    const duplicates = new Map<string, DuplicateFile>()

    for (const module of modules) {
      const files: DuplicateCandidate[] = [
        ...(module.resources || []).map((resource) => ({
          fileName: resource.name,
          filePath: resource.filePath,
          fileSize: resource.fileSize,
          fingerprint: resource.fingerprint
        })),
        ...module.lessons.flatMap((lesson) => [
          {
            fileName: lesson.originalFileName,
            filePath: lesson.filePath,
            fileSize: lesson.fileSize,
            fingerprint: lesson.fingerprint
          },
          ...(lesson.contentResources || []).map((resource) => ({
            fileName: resource.name,
            filePath: resource.filePath,
            fileSize: resource.fileSize,
            fingerprint: resource.fingerprint
          }))
        ])
      ]

      for (const file of files) {
        const key = file.fingerprint ?? `${file.fileName}::${file.fileSize}`
        const first = seen.get(key)
        if (!first) {
          seen.set(key, file)
          continue
        }

        const duplicate = duplicates.get(key) ?? {
          fileName: file.fileName,
          fileSize: file.fileSize,
          count: 1,
          paths: [first.filePath]
        }
        duplicate.count += 1
        duplicate.paths.push(file.filePath)
        duplicates.set(key, duplicate)
      }
    }

    return [...duplicates.values()]
  }

  private collectAllFilesRecursive(dir: ScannedDirectory): ScannedFile[] {
    const files: ScannedFile[] = [...dir.files]
    for (const sub of dir.subDirectories) {
      files.push(...this.collectAllFilesRecursive(sub))
    }
    return files
  }

  /**
   * Sorts playable files naturally and maps them to ProposedLesson items.
   * Companion images are retained as resources while also serving as the lesson cover.
   */
  private async buildLessons(mediaFiles: ScannedFile[], allFiles: ScannedFile[]): Promise<ProposedLesson[]> {
    const sortedFiles = [...mediaFiles].sort((a, b) => naturalCompare(a.name, b.name))
    const imageFiles = allFiles.filter((file) => isImageFile(file.fullPath))

    const lessons: ProposedLesson[] = []

    for (const [index, file] of sortedFiles.entries()) {
      const title = cleanTitle(file.name)
      const companionImg = imageFiles.find((image) => this.isCompanionImageForLesson(image, file))
      const coverPath = companionImg ? companionImg.fullPath : await generateTextCover(title)

      lessons.push({
        id: crypto.randomUUID(),
        title,
        originalFileName: file.name,
        filePath: file.fullPath,
        fileExtension: file.extension.replace(/^\./, ''),
        mediaType: getMediaType(file.fullPath),
        fileSize: file.sizeBytes,
        orderIndex: index + 1,
        coverPath,
        fingerprint: file.fingerprint,
        contentResources: []
      })
    }

    return lessons
  }

  private buildResources(
    allFiles: ScannedFile[],
    lessons: ProposedLesson[],
    moduleRootPath: string
  ): ProposedContentResource[] {
    const moduleResources: ProposedContentResource[] = []
    const resourceFiles = allFiles
      .filter((file) => !isMediaFile(file.fullPath))
      .sort((a, b) => naturalCompare(a.name, b.name))

    for (const file of resourceFiles) {
      const matchingLesson = isImageFile(file.fullPath)
        ? this.findLessonForCompanionImage(file, lessons)
          : this.findLessonForAssociatedResource(file, lessons, moduleRootPath)
      const isLessonSubtitle = isSubtitleFile(file.fullPath) && matchingLesson !== undefined
      const resource = this.createProposedResource(file, isLessonSubtitle ? 'subtitle' : 'resource')

      if (matchingLesson) {
        matchingLesson.contentResources!.push(resource)
      } else {
        moduleResources.push(resource)
      }
    }

    return moduleResources
  }

  private createProposedResource(
    file: ScannedFile,
    role: ProposedContentResource['role']
  ): ProposedContentResource {
    return {
      id: crypto.randomUUID(),
      name: file.name,
      filePath: file.fullPath,
      fileExtension: file.extension.replace(/^\./, ''),
      fileSize: file.sizeBytes,
      type: this.resourceTypeFor(file),
      role,
      fingerprint: file.fingerprint
    }
  }

  private resourceTypeFor(file: ScannedFile): ProposedContentResource['type'] {
    if (isSubtitleFile(file.fullPath)) return 'document'

    const mediaType = getMediaType(file.fullPath)
    if (
      mediaType === 'pdf' ||
      mediaType === 'document' ||
      mediaType === 'archive' ||
      mediaType === 'image'
    ) {
      return mediaType
    }
    return 'other'
  }

  private findLessonForAssociatedResource(
    resource: ScannedFile,
    lessons: ProposedLesson[],
    moduleRootPath: string
  ): ProposedLesson | undefined {
    const resourceStem = this.fileStem(resource.name)
    const exactLesson = lessons.find((lesson) => this.fileStem(lesson.originalFileName) === resourceStem)
    if (exactLesson) return exactLesson

    const stemMatch = lessons
      .filter((lesson) => this.isStemVariant(resourceStem, this.fileStem(lesson.originalFileName)))
      .sort(
        (a, b) =>
          this.fileStem(b.originalFileName).length - this.fileStem(a.originalFileName).length
      )[0]
    if (stemMatch) return stemMatch

    const resourceDirectory = path.normalize(path.dirname(resource.fullPath))
    if (resourceDirectory === path.normalize(moduleRootPath)) return undefined

    const lessonsInSameDirectory = lessons.filter(
      (lesson) => path.normalize(path.dirname(lesson.filePath)) === resourceDirectory
    )
    return lessonsInSameDirectory.length === 1 ? lessonsInSameDirectory[0] : undefined
  }

  private findLessonForCompanionImage(
    image: ScannedFile,
    lessons: ProposedLesson[]
  ): ProposedLesson | undefined {
    return lessons.find((lesson) => this.isCompanionImageForLesson(image, lesson))
  }

  private isCompanionImageForLesson(
    image: ScannedFile,
    lesson: ScannedFile | ProposedLesson
  ): boolean {
    const imageStem = this.fileStem(image.name)
    const lessonFileName = 'originalFileName' in lesson ? lesson.originalFileName : lesson.name
    const lessonStem = this.fileStem(lessonFileName)
    return imageStem === lessonStem || this.stripCompanionSuffix(imageStem) === lessonStem
  }

  private isStemVariant(stem: string, lessonStem: string): boolean {
    return (
      stem === lessonStem ||
      stem.startsWith(`${lessonStem}.`) ||
      stem.startsWith(`${lessonStem}_`) ||
      stem.startsWith(`${lessonStem}-`) ||
      stem.startsWith(`${lessonStem} `)
    )
  }

  private stripCompanionSuffix(stem: string): string {
    return stem.replace(/[-_\s](?:cover|thumb|thumbnail|poster|folder|front|capa|banner)$/i, '')
  }

  private fileStem(fileName: string): string {
    return path.basename(fileName, path.extname(fileName)).toLowerCase()
  }

  /**
   * Searches for a course cover image in the ROOT directory only.
   * Only explicit cover-named images qualify — module covers, lesson
   * companion thumbnails, or arbitrary frames must NEVER become the
   * course cover (falls back to the branded SVG).
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
