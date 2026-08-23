import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VideoPlayer } from '../src/renderer/src/components/player/VideoPlayer'

const state = vi.hoisted(() => ({
  useRef: vi.fn(),
  useState: vi.fn(),
  player: null as Record<string, unknown> | null,
  hook: null as Record<string, unknown> | null,
  buttons: [] as Array<{ children?: unknown; onClick?: () => void }>
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, useRef: state.useRef, useState: state.useState }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('lucide-react', () => ({
  AlertCircle: () => null,
  ChevronLeft: () => null,
  FastForward: () => null,
  Play: () => null,
  Trash2: () => null,
  X: () => null
}))

vi.mock('../src/renderer/src/hooks/usePlayer', () => ({
  usePlayer: () => state.hook
}))

vi.mock('../src/renderer/src/stores/usePlayerStore', () => ({
  usePlayerStore: () => state.player
}))

vi.mock('../src/renderer/src/stores/useNavigationStore', () => ({
  useNavigationStore: () => ({ setView: vi.fn() })
}))

vi.mock('../src/renderer/src/components/player/PlayerControls', () => ({
  PlayerControls: () => null
}))

vi.mock('../src/renderer/src/components/player/DocumentLessonView', () => ({
  DocumentLessonView: () => null
}))

vi.mock('../src/renderer/src/components/ui', async () => {
  const ReactModule = await import('react')
  const passthrough = ({ children }: { children?: React.ReactNode }) =>
    ReactModule.createElement(ReactModule.Fragment, null, children)

  return {
    Button: ({ children, ...props }: { children?: React.ReactNode; onClick?: () => void }) => {
      state.buttons.push({ children, onClick: props.onClick })
      return ReactModule.createElement('button', props, children)
    },
    Tooltip: passthrough,
    TooltipTrigger: passthrough,
    TooltipContent: passthrough
  }
})

describe('VideoPlayer media URL', () => {
  beforeEach(() => {
    state.buttons = []
    state.useRef.mockReset()
    state.useRef.mockReturnValue({ current: null })
    state.useState.mockReset()
    state.useState
      .mockImplementationOnce(() => [0, vi.fn()])
      .mockImplementationOnce(() => [false, vi.fn()])
      .mockImplementationOnce(() => [false, vi.fn()])
      .mockImplementationOnce(() => ['', vi.fn()])

    state.player = {
      activeCourse: { id: 'course-1', title: 'Curso' },
      activeLesson: {
        id: 'lesson-1',
        title: 'Aula',
        filePath: 'C:\\Cursos\\aula #1.mp4',
        fileName: 'aula #1.mp4',
        mediaType: 'video'
      },
      activeModule: null,
      theaterMode: false,
      toggleTheater: vi.fn(),
      subtitleTracks: [],
      activeSubtitleTrack: null,
      progressMap: {}
    }
    state.hook = {
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 1,
      isMuted: false,
      playbackRate: 1,
      isFullscreen: false,
      isPiP: false,
      showControls: true,
      autoAdvanceCountdown: null,
      nextLessonTitle: null,
      hasNextLesson: false,
      hasPrevLesson: false,
      togglePlay: vi.fn(),
      seekTo: vi.fn(),
      seekRelative: vi.fn(),
      setVolume: vi.fn(),
      toggleMute: vi.fn(),
      setPlaybackRate: vi.fn(),
      toggleFullscreen: vi.fn(),
      togglePiP: vi.fn(),
      toggleCompletion: vi.fn(),
      nextLesson: vi.fn(),
      prevLesson: vi.fn(),
      cancelAutoAdvance: vi.fn(),
      skipToNextNow: vi.fn(),
      handleUserActivity: vi.fn()
    }
  })

  it('renders a Windows lesson through the canonical media host', () => {
    const markup = renderToStaticMarkup(React.createElement(VideoPlayer))

    expect(markup).toContain('media://local-media/C%3A/Cursos/aula%20%231.mp4')
    expect(markup).not.toContain('media://C%3A/')
  })

  it('registers an error-recovery advance before reloading the video', () => {
    const actions: string[] = []
    const video = {
      currentTime: 120,
      duration: 600,
      load: vi.fn(() => actions.push('load')),
      play: vi.fn(() => {
        actions.push('play')
        return Promise.resolve()
      })
    }
    const seekTo = vi.fn((time: number) => actions.push(`seek:${time}`))

    state.useRef.mockReset()
    state.useRef
      .mockImplementationOnce(() => ({ current: video }))
      .mockImplementationOnce(() => ({ current: null }))
    state.useState.mockReset()
    state.useState
      .mockImplementationOnce(() => [0, vi.fn()])
      .mockImplementationOnce(() => [false, vi.fn()])
      .mockImplementationOnce(() => [true, vi.fn()])
      .mockImplementationOnce(() => ['', vi.fn()])
    state.hook = { ...state.hook, seekTo }

    renderToStaticMarkup(React.createElement(VideoPlayer))

    const skipGlitch = state.buttons.find((button) => button.children === 'player.skipGlitch')
    expect(skipGlitch?.onClick).toBeTypeOf('function')
    skipGlitch?.onClick?.()

    expect(actions).toEqual(['seek:121', 'load', 'play'])
  })
})
