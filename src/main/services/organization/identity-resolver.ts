import path from 'node:path'
import type { Lesson } from '../../../types'
import {
  verifyMediaEquality,
  type MediaIdentityDescriptor
} from './duplicate-detector'

export interface ResolvedFileIdentity {
  type:
    | 'UNCHANGED'
    | 'RENAMED_IN_PLACE'
    | 'MOVED_IN_COURSE'
    | 'MOVED_ACROSS_COURSES'
    | 'NEW_LESSON'
    | 'MISSING'
  lessonId?: string
  originalLesson?: Lesson
  newFilePath: string
  newFileName: string
  newModuleId?: string
  confidence: 'EXACT_PATH' | 'MATCHED_HASH' | 'HIGH_SIZE_DURATION' | 'NONE'
}

/**
 * Resolves the identity of scanned media files against existing registered lessons in a course.
 * Preserves user metadata (progress, notes, history, favorites) across external file renames and moves.
 */
export async function resolveLessonIdentities(
  scannedFiles: Array<{
    filePath: string
    fileName: string
    sizeBytes: number
    duration?: number
    moduleId?: string
    fingerprint?: string
  }>,
  existingLessons: (Lesson & { contentHash?: string })[],
  currentCourseId: string
): Promise<ResolvedFileIdentity[]> {
  const existingByPath = new Map<string, Lesson & { contentHash?: string }>()
  const unlinkedExisting = new Set<Lesson & { contentHash?: string }>()

  for (const lesson of existingLessons) {
    const norm = path.resolve(lesson.filePath).toLowerCase()
    existingByPath.set(norm, lesson)
    unlinkedExisting.add(lesson)
  }

  const results: ResolvedFileIdentity[] = []
  const remainingScanned: typeof scannedFiles = []

  // Stage 1: Match files with exact same path
  for (const file of scannedFiles) {
    const norm = path.resolve(file.filePath).toLowerCase()
    const match = existingByPath.get(norm)
    if (match) {
      unlinkedExisting.delete(match)
      results.push({
        type: 'UNCHANGED',
        lessonId: match.id,
        originalLesson: match,
        newFilePath: file.filePath,
        newFileName: file.fileName,
        newModuleId: file.moduleId || match.moduleId,
        confidence: 'EXACT_PATH'
      })
    } else {
      remainingScanned.push(file)
    }
  }

  // Stage 2: For remaining scanned files and unlinked existing lessons, match by size + duration + hash
  for (const file of remainingScanned) {
    let matchedLesson: (Lesson & { contentHash?: string }) | undefined
    let matchConfidence: ResolvedFileIdentity['confidence'] = 'NONE'

    for (const candidate of unlinkedExisting) {
      const candidateDesc: MediaIdentityDescriptor = {
        id: candidate.id,
        courseId: candidate.courseId,
        moduleId: candidate.moduleId,
        filePath: candidate.filePath,
        fileName: candidate.fileName,
        sizeBytes: candidate.fileSize,
        duration: candidate.duration,
        contentHash: candidate.contentHash
      }

      const fileDesc: MediaIdentityDescriptor = {
        filePath: file.filePath,
        fileName: file.fileName,
        sizeBytes: file.sizeBytes,
        duration: file.duration,
        fingerprint: file.fingerprint
      }

      const equality = await verifyMediaEquality(candidateDesc, fileDesc)
      if (equality.isDuplicate) {
        matchedLesson = candidate
        matchConfidence =
          equality.confidence === 'CONFIRMED_HASH'
            ? 'MATCHED_HASH'
            : 'HIGH_SIZE_DURATION'
        break
      }
    }

    if (matchedLesson) {
      unlinkedExisting.delete(matchedLesson)

      if (matchedLesson.courseId !== currentCourseId) {
        // Moved from another course -> Course Boundary is strict
        results.push({
          type: 'MOVED_ACROSS_COURSES',
          originalLesson: matchedLesson,
          newFilePath: file.filePath,
          newFileName: file.fileName,
          newModuleId: file.moduleId,
          confidence: matchConfidence
        })
      } else {
        const sameDir =
          path.dirname(path.resolve(file.filePath)).toLowerCase() ===
          path.dirname(path.resolve(matchedLesson.filePath)).toLowerCase()

        if (sameDir) {
          // Renamed in place within the same folder/module
          results.push({
            type: 'RENAMED_IN_PLACE',
            lessonId: matchedLesson.id,
            originalLesson: matchedLesson,
            newFilePath: file.filePath,
            newFileName: file.fileName,
            newModuleId: matchedLesson.moduleId,
            confidence: matchConfidence
          })
        } else {
          // Moved to a different folder/module inside the same course
          results.push({
            type: 'MOVED_IN_COURSE',
            lessonId: matchedLesson.id,
            originalLesson: matchedLesson,
            newFilePath: file.filePath,
            newFileName: file.fileName,
            newModuleId: file.moduleId,
            confidence: matchConfidence
          })
        }
      }
    } else {
      // Completely new lesson
      results.push({
        type: 'NEW_LESSON',
        newFilePath: file.filePath,
        newFileName: file.fileName,
        newModuleId: file.moduleId,
        confidence: 'NONE'
      })
    }
  }

  // Any remaining unlinked existing lessons are truly missing on disk
  for (const missing of unlinkedExisting) {
    results.push({
      type: 'MISSING',
      lessonId: missing.id,
      originalLesson: missing,
      newFilePath: missing.filePath,
      newFileName: missing.fileName,
      confidence: 'NONE'
    })
  }

  return results
}
