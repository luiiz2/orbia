import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload?: unknown) => Promise<unknown> | unknown>(),
  getMergePreview: vi.fn(),
  mergeDuplicateCourses: vi.fn(),
  mergeCoursesByIds: vi.fn()
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
    mergeCoursesByIds: state.mergeCoursesByIds
  }
}))

import { registerCoursesIpc } from '../src/main/ipc/courses.ipc'

describe('mutable merge IPC safety gate', () => {
  beforeEach(() => {
    state.handlers.clear()
    state.getMergePreview.mockReset()
    state.mergeDuplicateCourses.mockReset()
    state.mergeCoursesByIds.mockReset()
    registerCoursesIpc()
  })

  it('keeps the merge preview read-only', async () => {
    state.getMergePreview.mockReturnValue({ canonicalCourse: { id: 'course-a' } })
    const handler = state.handlers.get('courses:get-merge-preview')

    expect(handler).toBeDefined()
    await expect(handler!({}, { courseIds: ['course-a', 'course-b'] })).resolves.toEqual({
      success: true,
      preview: { canonicalCourse: { id: 'course-a' } }
    })
    expect(state.getMergePreview).toHaveBeenCalledWith(['course-a', 'course-b'])
    expect(state.mergeDuplicateCourses).not.toHaveBeenCalled()
    expect(state.mergeCoursesByIds).not.toHaveBeenCalled()
  })

  it('refuses every mutable merge request before it reaches the database', async () => {
    const automaticHandler = state.handlers.get('courses:merge-duplicates')
    const manualHandler = state.handlers.get('courses:merge-courses')

    expect(automaticHandler).toBeDefined()
    expect(manualHandler).toBeDefined()

    await expect(automaticHandler!({}, undefined)).resolves.toMatchObject({
      success: false,
      error: expect.stringMatching(/courses:get-merge-preview/i)
    })
    await expect(manualHandler!({}, { courseIds: ['course-a', 'course-b'], targetTitle: 'Ignored' })).resolves.toMatchObject({
      success: false,
      error: expect.stringMatching(/courses:get-merge-preview/i)
    })
    expect(state.mergeDuplicateCourses).not.toHaveBeenCalled()
    expect(state.mergeCoursesByIds).not.toHaveBeenCalled()
  })
})
