import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CourseView } from '../src/renderer/src/pages/CourseView'

const state = vi.hoisted(() => ({
  courseHierarchy: null as Record<string, unknown> | null
}))

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

vi.mock('../src/renderer/src/stores/useLibraryStore', () => ({
  useLibraryStore: () => ({
    activeCourseHierarchy: state.courseHierarchy,
    fetchCourseById: async () => null,
    fetchCourseProgress: async () => undefined,
    deleteCourse: async () => ({ success: true }),
    updateCourseCover: async () => true,
    updateLessonCover: async () => true,
    toggleFavorite: async () => true,
    isLoading: false
  })
}))

vi.mock('../src/renderer/src/stores/usePlayerStore', () => ({
  usePlayerStore: () => ({ loadHierarchy: async () => undefined })
}))

vi.mock('../src/renderer/src/stores/useNavigationStore', () => ({
  useNavigationStore: () => ({
    selectedCourseId: 'course-1',
    navigateToHome: vi.fn(),
    navigateToPlayer: vi.fn()
  })
}))

vi.mock('../src/renderer/src/hooks/useCourseProgress', () => ({
  useCourseProgress: () => ({
    coursePercentage: 0,
    completedLessons: 0,
    totalLessons: 1,
    totalDuration: 0,
    isCompleted: false,
    moduleProgress: {},
    getLessonProgress: () => undefined,
    isLessonCompleted: () => false
  })
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
    Badge: passthrough,
    Skeleton: () => null,
    Tooltip: passthrough,
    TooltipTrigger: passthrough,
    TooltipContent: passthrough,
    Accordion: passthrough,
    AccordionItem: passthrough,
    AccordionTrigger: passthrough,
    AccordionContent: passthrough,
    Dialog: passthrough,
    DialogContent: passthrough,
    DialogDescription: passthrough,
    DialogFooter: passthrough,
    DialogHeader: passthrough,
    DialogTitle: passthrough
  }
})

describe('CourseView resources', () => {
  it('shows canonical module and lesson materials without duplicating the legacy projection', () => {
    state.courseHierarchy = {
      course: {
        id: 'course-1',
        title: 'Curso de teste',
        sourceType: 'local-vault',
        moduleCount: 1,
        lessonCount: 1,
        isFavorite: false
      },
      modules: [
        {
          id: 'module-1',
          courseId: 'course-1',
          title: 'Dia 1',
          duration: 0,
          lessonCount: 1,
          resources: [
            {
              id: 'module-resource-1',
              courseId: 'course-1',
              moduleId: 'module-1',
              role: 'resource',
              name: 'material-do-modulo.pdf',
              filePath: 'C:/course/material-do-modulo.pdf',
              fileExtension: 'pdf',
              fileSize: 10,
              type: 'pdf'
            },
            {
              id: 'module-resource-unsupported',
              courseId: 'course-1',
              moduleId: 'module-1',
              role: 'resource',
              name: 'material-arquivado.zip',
              filePath: 'C:/course/material-arquivado.zip',
              fileExtension: 'zip',
              fileSize: 11,
              type: 'archive'
            }
          ],
          lessons: [
            {
              id: 'lesson-1',
              moduleId: 'module-1',
              courseId: 'course-1',
              title: 'Aula 1',
              duration: 0,
              contentResources: [
                {
                  id: 'lesson-resource-1',
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
                id: 'lesson-resource-unsupported',
                courseId: 'course-1',
                moduleId: 'module-1',
                lessonId: 'lesson-1',
                role: 'resource',
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
            }
          ]
        }
      ]
    }

    const markup = renderToStaticMarkup(React.createElement(CourseView))

    expect(markup).toContain('course.moduleMaterials:2')
    expect(markup).toContain('material-do-modulo.pdf')
    expect(markup).toContain('material-canonico.pdf')
    expect(markup).toContain('material-arquivado.zip')
    expect(markup).toContain('legenda.ass')
    expect(markup).toContain('PDF')
    expect(markup).toContain('documents.previewUnavailable')
    expect(markup).not.toContain('course.viewResource:material-arquivado.zip')
    expect(markup).not.toContain('course.viewResource:legenda.ass')
    expect(markup).not.toContain('material-legado.docx')
  })
})
