import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload?: unknown) => Promise<unknown> | unknown>(),
  getMergePreview: vi.fn(),
  mergeDuplicateCourses: vi.fn(),
  mergeCourses: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => 'C:/temp') },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, payload?: unknown) => Promise<unknown> | unknown) => {
      state.handlers.set(channel, handler)
    }
  }
}))

vi.mock('../src/main/services/database.service', () => ({
  databaseService: {
    getMergePreview: state.getMergePreview,
    mergeDuplicateCourses: state.mergeDuplicateCourses,
    mergeCourses: state.mergeCourses
  }
}))

import { registerCoursesIpc } from '../src/main/ipc/courses.ipc'

describe('Course Merge IPC Handlers', () => {
  beforeEach(() => {
    state.handlers.clear()
    state.getMergePreview.mockReset()
    state.mergeDuplicateCourses.mockReset()
    state.mergeCourses.mockReset()
    registerCoursesIpc()
  })

  it('provides read-only merge preview', async () => {
    state.getMergePreview.mockReturnValue({ canonicalCourseId: 'course-a', selectedCourseIds: ['course-a', 'course-b'] })
    const handler = state.handlers.get('courses:get-merge-preview')

    expect(handler).toBeDefined()
    await expect(handler!({}, { courseIds: ['course-a', 'course-b'] })).resolves.toEqual({
      success: true,
      preview: { canonicalCourseId: 'course-a', selectedCourseIds: ['course-a', 'course-b'] }
    })
    expect(state.getMergePreview).toHaveBeenCalledWith(['course-a', 'course-b'])
    expect(state.mergeDuplicateCourses).not.toHaveBeenCalled()
    expect(state.mergeCourses).not.toHaveBeenCalled()
  })

  it('executes courses:merge-courses with valid IDs and delegates to database service', async () => {
    state.mergeCourses.mockReturnValue({
      success: true,
      mergedGroupsCount: 1,
      removedCoursesCount: 1,
      details: [{ canonicalCourseId: 'course-a' }]
    })
    const handler = state.handlers.get('courses:merge-courses')

    expect(handler).toBeDefined()
    const response = await handler!({}, { courseIds: ['course-a', 'course-b'] })
    expect(response).toMatchObject({
      success: true,
      mergedGroupsCount: 1
    })
    expect(state.mergeCourses).toHaveBeenCalledWith(['course-a', 'course-b'])
  })

  it('rejects courses:merge-courses when fewer than 2 courses are provided', async () => {
    const handler = state.handlers.get('courses:merge-courses')
    expect(handler).toBeDefined()
    const response = await handler!({}, { courseIds: ['course-a'] })
    expect(response).toMatchObject({
      success: false,
      error: expect.stringMatching(/at least two/i)
    })
    expect(state.mergeCourses).not.toHaveBeenCalled()
  })
})
