import { describe, expect, it } from 'vitest'
import { normalizeMergePreviewCourseIds } from '../src/main/ipc/courses.ipc'

describe('merge preview IPC payload', () => {
  it('keeps only unique trimmed course IDs and drops renderer paths', () => {
    const courseIds = normalizeMergePreviewCourseIds({
      courseIds: [' course-a ', 'course-b', 'course-a'],
      rootPath: 'C:/private/course',
      targetTitle: 'Ignored renderer value'
    })

    expect(courseIds).toEqual(['course-a', 'course-b'])
    expect(JSON.stringify(courseIds)).not.toContain('C:/private')
  })

  it('rejects malformed or insufficient selections', () => {
    expect(normalizeMergePreviewCourseIds({ courseIds: ['course-a'] })).toBeNull()
    expect(normalizeMergePreviewCourseIds({ courseIds: ['course-a', 42] })).toBeNull()
    expect(normalizeMergePreviewCourseIds({ courseIds: 'course-a,course-b' })).toBeNull()
    expect(normalizeMergePreviewCourseIds({ courseIds: ['C:/private/course', 'course-b'] })).toBeNull()
  })
})
