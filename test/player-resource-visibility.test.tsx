import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerView } from '../src/renderer/src/pages/PlayerView'

const state = vi.hoisted(() => ({
  useState: vi.fn(),
  player: null as Record<string, unknown> | null
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, useState: state.useState }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number; name?: string }) =>
      options?.count !== undefined
        ? `${key}:${options.count}`
        : options?.name
          ? `${key}:${options.name}`
          : key
  })
}))

vi.mock('../src/renderer/src/stores/usePlayerStore', () => ({
  usePlayerStore: () => state.player,
  selectPlayerViewState: (player: Record<string, unknown>) => player
}))

vi.mock('../src/renderer/src/stores/useNavigationStore', () => ({
  useNavigationStore: () => ({ setView: vi.fn() })
}))

vi.mock('../src/renderer/src/hooks/useCourseProgress', () => ({
  useCourseProgress: () => ({
    coursePercentage: 0,
    completedLessons: 0,
    totalLessons: 0,
    totalDuration: 0,
    isCompleted: false,
    moduleProgress: {},
    getLessonProgress: () => undefined,
    isLessonCompleted: () => false
  })
}))

vi.mock('../src/renderer/src/components/player/VideoPlayer', () => ({
  VideoPlayer: () => null
}))

vi.mock('../src/renderer/src/components/player/NotesPanel', () => ({
  NotesPanel: () => null
}))

vi.mock('../src/renderer/src/components/player/BookmarksPanel', () => ({
  BookmarksPanel: () => null
}))

vi.mock('../src/renderer/src/components/player/FlashcardsPanel', () => ({
  FlashcardsPanel: () => null
}))

vi.mock('../src/renderer/src/components/documents/PdfViewerModal', () => ({
  PdfViewerModal: () => null
}))

vi.mock('../src/renderer/src/components/ui', async () => {
  const ReactModule = await import('react')
  const passthrough = ({ children }: { children?: React.ReactNode }) =>
    ReactModule.createElement(ReactModule.Fragment, null, children)

  return {
    Button: ({ children, ...props }: { children?: React.ReactNode }) =>
      ReactModule.createElement('button', props, children),
    Progress: () => null,
    Tooltip: passthrough,
    TooltipTrigger: passthrough,
    TooltipContent: passthrough,
    Dialog: passthrough,
    DialogContent: passthrough,
    DialogHeader: passthrough,
    DialogTitle: passthrough,
    DialogDescription: passthrough,
    DialogFooter: passthrough
  }
})

describe('PlayerView resources', () => {
  beforeEach(() => {
    state.useState.mockReset()
    state.useState.mockImplementation((initial: unknown) => [initial, vi.fn()])
    state.useState
      .mockImplementationOnce(() => ['conteudo', vi.fn()])
      .mockImplementationOnce(() => ['materiais', vi.fn()])
      .mockImplementationOnce(() => ['anotacoes', vi.fn()])
      .mockImplementationOnce(() => [true, vi.fn()])
      .mockImplementationOnce(() => [null, vi.fn()])
      .mockImplementationOnce(() => [false, vi.fn()])

    state.player = {
      activeCourse: { id: 'course-1', title: 'Curso de teste' },
      activeLesson: {
        id: 'lesson-1',
        contentResources: [
          {
            id: 'canonical-resource-1',
            courseId: 'course-1',
            moduleId: 'module-1',
            lessonId: 'lesson-1',
            role: 'resource',
            name: 'material-canonico.pdf',
            filePath: 'C:/course/material-canonico.pdf',
            fileExtension: 'pdf',
            fileSize: 20,
            type: 'pdf'
          },
          {
            id: 'canonical-resource-unsupported',
            courseId: 'course-1',
            moduleId: 'module-1',
            lessonId: 'lesson-1',
            role: 'subtitle',
            name: 'legenda.ass',
            filePath: 'C:/course/legenda.ass',
            fileExtension: 'ass',
            fileSize: 2,
            type: 'document'
          }
        ],
        resources: [
          {
            id: 'legacy-resource-1',
            lessonId: 'lesson-1',
            name: 'material-legado.docx',
            filePath: 'C:/course/material-legado.docx',
            fileExtension: 'docx',
            fileSize: 30,
            type: 'document'
          }
        ]
      },
      modulesWithLessons: [],
      notes: [],
      loadLesson: vi.fn(),
      toggleComplete: vi.fn(),
      theaterMode: false,
      isFullscreen: false
    }
  })

  it('hides the curriculum panel while theater mode is active', () => {
    state.player = { ...state.player!, theaterMode: true }

    const markup = renderToStaticMarkup(React.createElement(PlayerView))

    expect(markup).not.toContain('<aside')
  })

  it('lists canonical lesson materials in the resource panel instead of their legacy projection', () => {
    const markup = renderToStaticMarkup(React.createElement(PlayerView))

    expect(markup).toContain('player.lessonMaterials:2')
    expect(markup).toContain('material-canonico.pdf')
    expect(markup).toContain('legenda.ass')
    expect(markup).toContain('PDF')
    expect(markup).toContain('player.viewResource:material-canonico.pdf')
    expect(markup).not.toContain('material-legado.docx')
  })
})
