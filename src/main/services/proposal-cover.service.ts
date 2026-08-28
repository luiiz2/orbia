import type { ProposedCourseStructure } from '../../types'
import {
  ensureLessonCover,
  isGeneratedCover,
  persistCover,
  type PersistCoverCopyOperation
} from '../utils/cover-generator'

export interface MaterializeProposalCoversOptions {
  beforeCopy?: (operation: PersistCoverCopyOperation) => void | Promise<void>
}

/**
 * Materializes proposal covers only during the approved import apply stage.
 * Generated preview placeholders are never written beside user content.
 */
export async function materializeProposalCovers(
  proposal: ProposedCourseStructure,
  courseId: string,
  vaultPath: string,
  options: MaterializeProposalCoversOptions = {}
): Promise<ProposedCourseStructure> {
  const persistOptions = { beforeCopy: options.beforeCopy }
  const courseCover = await persistCover(
    proposal.coverPath,
    courseId,
    vaultPath,
    'course',
    persistOptions
  )

  const modules = await Promise.all(
    proposal.modules.map(async (mod) => {
      const lessons = await Promise.all(
        (mod.lessons || []).map(async (lesson) => {
          if (!isGeneratedCover(lesson.coverPath)) {
            return { ...lesson, coverPath: lesson.coverPath }
          }

          const realCover = await ensureLessonCover(
            lesson.filePath,
            lesson.title
          )
          return {
            ...lesson,
            coverPath: await persistCover(
              realCover ?? lesson.coverPath,
              courseId,
              vaultPath,
              'lesson',
              persistOptions
            )
          }
        })
      )
      return { ...mod, lessons }
    })
  )

  return { ...proposal, coverPath: courseCover, modules }
}
