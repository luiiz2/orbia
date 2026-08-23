import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { MediaCard } from '../src/renderer/src/components/streaming/MediaCard'
import { MediaRail } from '../src/renderer/src/components/streaming/MediaRail'
import { StreamingHero } from '../src/renderer/src/components/streaming/StreamingHero'
import { PlaybackQueueDrawer } from '../src/renderer/src/components/player/PlaybackQueueDrawer'
import { MiniPlayer } from '../src/renderer/src/components/player/MiniPlayer'
import type { Course } from '@shared'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultVal?: string) => defaultVal || key
  })
}))

const mockCourse: Course = {
  id: 'course-1',
  title: 'TypeScript e React Profissional',
  slug: 'typescript-e-react-profissional',
  sourceType: 'local-vault',
  rootPath: 'C:/Vault/Courses/React',
  description: 'Aprenda padrões avançados de desenvolvimento front-end moderno.',
  totalDuration: 7200,
  moduleCount: 4,
  lessonCount: 24,
  isFavorite: true,
  createdAt: Date.now(),
  updatedAt: Date.now()
}

vi.mock('../src/renderer/src/stores/usePlayerStore', () => ({
  usePlayerStore: () => ({
    activeCourse: mockCourse,
    activeLesson: {
      id: 'lesson-1',
      title: 'Aula 01: Introdução ao Curso',
      duration: 1200,
      filePath: 'C:/media.mp4',
      mediaType: 'video'
    },
    playbackQueue: [
      { id: 'lesson-2', title: 'Aula 02: Setup do Projeto', duration: 1800 }
    ],
    isPlaying: true,
    currentTime: 300,
    duration: 1200,
    volume: 1,
    isMuted: false,
    playbackRate: 1,
    isMiniPlayerActive: true,
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    nextLesson: vi.fn(),
    loadLesson: vi.fn(),
    removeFromQueue: vi.fn(),
    reorderQueue: vi.fn(),
    clearQueue: vi.fn(),
    dismissMiniPlayer: vi.fn(),
    updateProgress: vi.fn()
  })
}))

vi.mock('../src/renderer/src/stores/useNavigationStore', () => ({
  useNavigationStore: () => ({
    currentView: 'home',
    navigateToPlayer: vi.fn()
  })
}))

vi.mock('../src/renderer/src/components/ui/tooltip', async () => {
  const ReactModule = await import('react')
  return {
    Tooltip: ({ children }: { children?: React.ReactNode }) => ReactModule.createElement(ReactModule.Fragment, null, children),
    TooltipTrigger: ({ children }: { children?: React.ReactNode }) => ReactModule.createElement(ReactModule.Fragment, null, children),
    TooltipContent: ({ children }: { children?: React.ReactNode }) => ReactModule.createElement('div', null, children)
  }
})

describe('Streaming Components (v0.4)', () => {
  it('renders MediaCard with title, duration, and badges', () => {
    const markup = renderToStaticMarkup(
      <MediaCard
        id="course-1"
        title="TypeScript Masterclass"
        subtitle="12 Aulas"
        duration={3600}
        progressPercentage={50}
        isFavorite={true}
        badge="Ref"
        onPlay={vi.fn()}
      />
    )

    expect(markup).toContain('TypeScript Masterclass')
    expect(markup).toContain('12 Aulas')
    expect(markup).toContain('50%')
    expect(markup).toContain('Ref')
  })

  it('renders MediaRail with title, count, and scrollable container', () => {
    const markup = renderToStaticMarkup(
      <MediaRail title="Continuar Assistindo" count={3}>
        <div key="1">Card 1</div>
        <div key="2">Card 2</div>
      </MediaRail>
    )

    expect(markup).toContain('Continuar Assistindo')
    expect(markup).toContain('3')
    expect(markup).toContain('Card 1')
    expect(markup).toContain('Card 2')
  })

  it('renders StreamingHero with course details, progress, and CTA buttons', () => {
    const markup = renderToStaticMarkup(
      <StreamingHero
        course={mockCourse}
        summary={{
          courseId: 'course-1',
          totalLessons: 24,
          completedLessons: 12,
          percentage: 50,
          totalDuration: 7200,
          remainingDuration: 3600,
          lastPlayedLessonTitle: 'Aula 12: Custom Hooks'
        }}
        onPlay={vi.fn()}
        onViewDetails={vi.fn()}
      />
    )

    expect(markup).toContain('TypeScript e React Profissional')
    expect(markup).toContain('Continuar Estudando')
    expect(markup).toContain('Aula Atual:')
    expect(markup).toContain('Aula 12: Custom Hooks')
    expect(markup).toContain('50%')
    expect(markup).toContain('Continuar Assistindo')
    expect(markup).toContain('Detalhes do Curso')
  })

  it('renders PlaybackQueueDrawer with current playing item and upcoming queued lessons', () => {
    const markup = renderToStaticMarkup(<PlaybackQueueDrawer />)

    expect(markup).toContain('Fila de Reprodução')
    expect(markup).toContain('Tocando Agora')
    expect(markup).toContain('Aula 01: Introdução ao Curso')
    expect(markup).toContain('A Seguir')
    expect(markup).toContain('Aula 02: Setup do Projeto')
  })

  it('renders MiniPlayer when isMiniPlayerActive is true and outside player view', () => {
    const markup = renderToStaticMarkup(<MiniPlayer />)

    expect(markup).toContain('Aula 01: Introdução ao Curso')
    expect(markup).toContain('TypeScript e React Profissional')
  })
})
