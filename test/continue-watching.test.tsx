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
    TooltipContent: passthrough
  }
})

describe('ContinueWatchingRail', () => {
  beforeEach(() => {
    state.history = [
      {
        id: 'below-ten',
        lessonId: 'lesson-below-ten',
        courseId: 'course-1',
        lessonTitle: 'Below ten percent',
        courseTitle: 'Course',
        watchedAt: 1,
        duration: 600,
        currentTime: 59
      },
      {
        id: 'exactly-ten',
        lessonId: 'lesson-exactly-ten',
        courseId: 'course-1',
        lessonTitle: 'Exactly ten percent',
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

  it('includes a video at exactly 10% and excludes videos below the threshold', () => {
    const markup = renderToStaticMarkup(React.createElement(ContinueWatchingRail, { isLoading: false }))

    expect(markup).toContain('Exactly ten percent')
    expect(markup).not.toContain('Below ten percent')
  })
})
