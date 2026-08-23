import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContinueWatchingRail } from '../src/renderer/src/components/library/ContinueWatchingRail'
import type { WatchHistoryEntry } from '../src/types'

const state = vi.hoisted(() => ({
  useState: vi.fn(),
  history: [] as WatchHistoryEntry[]
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, useState: state.useState }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('../src/renderer/src/stores', () => ({
  useNavigationStore: () => ({ navigateToPlayer: vi.fn() }),
  usePlayerStore: () => ({ loadHierarchy: vi.fn() })
}))

vi.mock('../src/renderer/src/components/ui', async () => {
  const ReactModule = await import('react')
  const passthrough = ({ children }: { children?: React.ReactNode }) =>
    ReactModule.createElement(ReactModule.Fragment, null, children)

  return {
    Button: ({ children, ...props }: { children?: React.ReactNode }) =>
      ReactModule.createElement('button', props, children),
    Skeleton: () => null,
    Tooltip: passthrough,
    TooltipTrigger: passthrough,
    TooltipContent: passthrough,
    CourseCover: passthrough
  }
})

describe('ContinueWatchingRail', () => {
  beforeEach(() => {
    state.history = [
      {
        id: 'zero-progress',
        lessonId: 'lesson-zero-progress',
        courseId: 'course-1',
        lessonTitle: 'Zero progress video',
        courseTitle: 'Course',
        watchedAt: 1,
        duration: 600,
        currentTime: 0
      },
      {
        id: 'in-progress',
        lessonId: 'lesson-in-progress',
        courseId: 'course-1',
        lessonTitle: 'In progress video',
        courseTitle: 'Course',
        watchedAt: 2,
        duration: 600,
        currentTime: 60
      }
    ]

    state.useState.mockReset()
    state.useState
      .mockImplementationOnce(() => [state.history, vi.fn()])
      .mockImplementationOnce(() => [false, vi.fn()])
      .mockImplementation(() => [false, vi.fn()])
  })

  it('includes in-progress videos and excludes videos with 0 progress', () => {
    const markup = renderToStaticMarkup(React.createElement(ContinueWatchingRail, { isLoading: false }))

    expect(markup).toContain('In progress video')
    expect(markup).not.toContain('Zero progress video')
  })
})
