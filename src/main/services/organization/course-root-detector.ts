import type { ScannedDirectory } from '../scanner.service'
import { isMediaFile } from '../../utils/file-utils'

export type RootDetectionResult =
  | { type: 'single_course'; root: ScannedDirectory }
  | { type: 'batch_multi_course'; courseRoots: ScannedDirectory[] }

/**
 * Determines whether a scanned directory is a single course or a parent container of multiple courses.
 * INVARIANT: Never combines multiple distinct courses into one monster course.
 */
export function detectCourseRoots(
  scannedDir: ScannedDirectory
): RootDetectionResult {
  // If the directory has direct media files, it's definitely a single course root
  const hasDirectMedia = scannedDir.files.some((f) => isMediaFile(f.fullPath))
  if (hasDirectMedia) {
    return { type: 'single_course', root: scannedDir }
  }

  // If there are no subdirectories, it's a single course (even if empty or material-only)
  if (scannedDir.subDirectories.length <= 1) {
    return { type: 'single_course', root: scannedDir }
  }

  // Check the structure of child subdirectories:
  // If most child directories themselves have subdirectories containing media files,
  // then the child directories are course roots (e.g. Parent/CourseA/Module1/video.mp4).
  let childrenWithNestedModules = 0
  let childrenWithDirectMedia = 0

  for (const subDir of scannedDir.subDirectories) {
    const subHasDirectMedia = subDir.files.some((f) => isMediaFile(f.fullPath))
    const subHasSubDirsWithMedia = subDir.subDirectories.some(
      (nested) =>
        nested.files.some((f) => isMediaFile(f.fullPath)) ||
        nested.subDirectories.length > 0
    )

    if (subHasDirectMedia && !subHasSubDirsWithMedia) {
      childrenWithDirectMedia++
    } else if (subHasSubDirsWithMedia) {
      childrenWithNestedModules++
    }
  }

  // If the majority of subdirectories look like courses (they have their own modules/subdirectories),
  // then this is a multi-course container!
  if (
    childrenWithNestedModules >= 2 &&
    childrenWithNestedModules >= childrenWithDirectMedia
  ) {
    const courseRoots = scannedDir.subDirectories.filter((subDir) => {
      const hasFiles = subDir.files.length > 0
      const hasSubDirs = subDir.subDirectories.length > 0
      return hasFiles || hasSubDirs
    })

    return {
      type: 'batch_multi_course',
      courseRoots
    }
  }

  return { type: 'single_course', root: scannedDir }
}
