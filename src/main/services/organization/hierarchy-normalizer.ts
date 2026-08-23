import crypto from 'node:crypto'
import path from 'node:path'
import type {
  ProposedCourseStructure,
  ProposedModule,
  ProposedLesson,
  ProposedContentResource
} from '../../../types'
import type { ScannedDirectory, ScannedFile } from '../scanner.service'
import { isMediaFile, isPreservableContentFile, isImageFile, isSubtitleFile, getMediaType, toResourceType } from '../../utils/file-utils'
import { cleanCourseTitle, cleanModuleTitle, cleanTitle } from '../../utils/title-cleaner'
import { naturalCompare } from '../../utils/natural-sort'
import { classifyFolderName } from './auxiliary-classifier'
import { groupMultipartLessons } from './multipart-detector'
import { resolveSequenceOrdering, extractExplicitNumber } from './title-sequence-resolver'
import { ensureCourseCover, ensureLessonCover } from '../../utils/cover-generator'
import { probeMediaDurationsBatch } from '../../utils/media-probe'

export interface NormalizedHierarchyOptions {
  detectCovers?: boolean
}

/**
 * Normalizes physical directory trees into the standard 4-layer hierarchy model:
 * Course ➔ Module ➔ Section ➔ Lesson.
 * INVARIANT: Never loses content. Non-destructive and read-only.
 */
export async function normalizeCourseHierarchy(
  scannedDir: ScannedDirectory,
  options: NormalizedHierarchyOptions = { detectCovers: true }
): Promise<ProposedCourseStructure> {
  const rootPath = scannedDir.fullPath
  const suggestedTitle = cleanCourseTitle(scannedDir.name)

  // 1. Find course cover
  let coverPath: string | undefined
  if (options.detectCovers) {
    const coverFile = scannedDir.files.find((f) => isImageFile(f.fullPath) && /^(?:cover|capa|poster|banner|thumb)$/i.test(path.basename(f.name, path.extname(f.name))))
    if (coverFile) {
      coverPath = coverFile.fullPath
    } else {
      const allFiles = collectAllFiles(scannedDir)
      const firstVideo = allFiles.find((f) => isMediaFile(f.fullPath))
      coverPath = await ensureCourseCover(rootPath, suggestedTitle, firstVideo?.fullPath)
    }
  }

  // 2. Identify root-level files vs subdirectory modules
  const rootPreserved = scannedDir.files.filter((f) => !f.isDirectory && isPreservableContentFile(f.fullPath))
  const rootMedia = rootPreserved.filter((f) => isMediaFile(f.fullPath))
  const rootNonMedia = rootPreserved.filter((f) => !isMediaFile(f.fullPath))

  const proposedModules: ProposedModule[] = []
  let moduleOrderIndex = 1

  // Handle root loose media -> "Sem módulo" / "No module"
  if (rootMedia.length > 0) {
    const rootLessons = await buildLessonsFromFiles(rootMedia)
    const rootResources = buildResourcesFromFiles(rootNonMedia)

    proposedModules.push({
      id: crypto.randomUUID(),
      title: 'Sem módulo',
      folderPath: rootPath,
      orderIndex: moduleOrderIndex++,
      lessons: rootLessons,
      resources: rootResources
    })
  } else if (rootNonMedia.length > 0 && scannedDir.subDirectories.length === 0) {
    // Single flat course with materials only
    const rootResources = buildResourcesFromFiles(rootNonMedia)
    proposedModules.push({
      id: crypto.randomUUID(),
      title: 'Materiais gerais',
      folderPath: rootPath,
      orderIndex: moduleOrderIndex++,
      lessons: [],
      resources: rootResources
    })
  }

  // 3. Process subdirectories as Modules / Sections
  const sortedSubDirs = [...scannedDir.subDirectories].sort((a, b) => naturalCompare(a.name, b.name))

  for (const subDir of sortedSubDirs) {
    const folderClass = classifyFolderName(subDir.name)

    // Collect all preserved files within subDir (collapsing deeper folders meaningfully)
    const subFiles = collectPreservedFilesWithSections(subDir)
    const mediaFiles = subFiles.filter((f) => isMediaFile(f.file.fullPath))
    const nonMediaFiles = subFiles.filter((f) => !isMediaFile(f.file.fullPath))

    if (mediaFiles.length === 0 && nonMediaFiles.length === 0) {
      continue
    }

    const lessons = await buildLessonsFromFlattened(mediaFiles)
    const resources = buildResourcesFromFiles(nonMediaFiles.map((n) => n.file))

    const rawModuleTitle = cleanModuleTitle(subDir.name, moduleOrderIndex)
    const isAuxiliary = folderClass === 'auxiliary_section'

    proposedModules.push({
      id: crypto.randomUUID(),
      title: rawModuleTitle,
      folderPath: subDir.fullPath,
      orderIndex: moduleOrderIndex++,
      duration: lessons.reduce((sum, l) => sum + (l.duration || 0), 0),
      lessons,
      resources: resources.length > 0 ? resources : undefined,
      ...(isAuxiliary ? { isAuxiliary: true } : {})
    })
  }

  // Attach root non-media materials if not already attached
  if (rootNonMedia.length > 0 && rootMedia.length === 0 && proposedModules.length > 0) {
    const rootResources = buildResourcesFromFiles(rootNonMedia)
    if (proposedModules[0].resources) {
      proposedModules[0].resources = [...rootResources, ...proposedModules[0].resources]
    } else {
      proposedModules[0].resources = rootResources
    }
  }

  const totalLessons = proposedModules.reduce((sum, m) => sum + m.lessons.length, 0)
  const totalDuration = proposedModules.reduce((sum, m) => sum + (m.duration || 0), 0)
  const totalFilesCount = countTotalFiles(scannedDir)

  return {
    suggestedTitle,
    rootPath,
    coverPath,
    totalDuration,
    modules: proposedModules,
    totalLessons,
    totalFilesScanned: totalFilesCount
  }
}

interface FlattenedFile {
  file: ScannedFile
  sectionPath: string[] // e.g. ["Unit 01", "Part 02"]
}

function collectPreservedFilesWithSections(dir: ScannedDirectory, parentSections: string[] = []): FlattenedFile[] {
  const results: FlattenedFile[] = []

  for (const f of dir.files) {
    if (!f.isDirectory && isPreservableContentFile(f.fullPath)) {
      results.push({ file: f, sectionPath: parentSections })
    }
  }

  for (const sub of dir.subDirectories) {
    results.push(...collectPreservedFilesWithSections(sub, [...parentSections, sub.name]))
  }

  return results
}

async function buildLessonsFromFlattened(
  mediaFiles: FlattenedFile[]
): Promise<ProposedLesson[]> {
  const durations = await probeMediaDurationsBatch(mediaFiles.map((m) => m.file.fullPath))

  // Map to raw items for multipart detection
  const rawItems = mediaFiles.map((m) => {
    return {
      id: crypto.randomUUID(),
      fileName: m.file.name,
      filePath: m.file.fullPath,
      fileExtension: m.file.extension.replace(/^\./, ''),
      duration: durations.get(m.file.fullPath) || 0,
      fileSize: m.file.sizeBytes,
      fingerprint: m.file.fingerprint,
      sectionLabel: m.sectionPath.length > 0 ? m.sectionPath.map(cleanTitle).filter(Boolean).join(' · ') : undefined
    }
  })

  // Detect multipart lessons
  const multipartGroups = groupMultipartLessons(rawItems)

  const lessons: ProposedLesson[] = []

  for (const [idx, group] of multipartGroups.entries()) {
    const mainFile = group.parts[0]
    let title = group.compositeTitle
    if (mainFile.sectionLabel) {
      title = `${mainFile.sectionLabel} · ${title}`
    }

    const coverPath = await ensureLessonCover(mainFile.filePath, title)

    lessons.push({
      id: group.id,
      title,
      originalFileName: mainFile.fileName,
      filePath: mainFile.filePath,
      fileExtension: mainFile.fileExtension,
      mediaType: getMediaType(mainFile.filePath),
      fileSize: group.totalFileSize,
      orderIndex: idx + 1,
      duration: group.totalDuration,
      coverPath,
      fingerprint: mainFile.fingerprint,
      contentResources: []
    })
  }

  // Sequence ordering resolution (gaps and ordering)
  const resolved = resolveSequenceOrdering(
    lessons.map((l) => ({
      id: l.id,
      rawFileName: l.originalFileName,
      cleanTitle: l.title,
      filePath: l.filePath,
      explicitNumber: extractExplicitNumber(l.originalFileName) ?? extractExplicitNumber(l.title),
      orderIndex: l.orderIndex,
      displayOrder: l.orderIndex
    }))
  )

  return lessons.map((l, idx) => {
    const match = resolved.items.find((r) => r.id === l.id)
    return {
      ...l,
      orderIndex: match?.orderIndex ?? idx + 1
    }
  })
}

async function buildLessonsFromFiles(
  mediaFiles: ScannedFile[]
): Promise<ProposedLesson[]> {
  const flattened = mediaFiles.map((file) => ({ file, sectionPath: [] }))
  return buildLessonsFromFlattened(flattened)
}

function buildResourcesFromFiles(
  resourceFiles: ScannedFile[]
): ProposedContentResource[] {
  const result: ProposedContentResource[] = []

  for (const file of resourceFiles) {
    const isSub = isSubtitleFile(file.fullPath)
    result.push({
      id: crypto.randomUUID(),
      name: file.name,
      filePath: file.fullPath,
      fileExtension: file.extension.replace(/^\./, ''),
      fileSize: file.sizeBytes,
      type: isSub ? 'document' : toResourceType(file.fullPath),
      role: isSub ? 'subtitle' : 'resource',
      fingerprint: file.fingerprint
    })
  }

  return result
}

function collectAllFiles(dir: ScannedDirectory): ScannedFile[] {
  const res = [...dir.files]
  for (const sub of dir.subDirectories) {
    res.push(...collectAllFiles(sub))
  }
  return res
}

function countTotalFiles(dir: ScannedDirectory): number {
  let count = dir.files.length
  for (const sub of dir.subDirectories) {
    count += countTotalFiles(sub)
  }
  return count
}
