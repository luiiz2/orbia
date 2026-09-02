import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useLibraryStore } from '../src/renderer/src/stores/useLibraryStore'
import type { Course, Lesson } from '@shared'

describe('Zustand Stores', () => {
  beforeEach(() => {
    // Reset stores
    useLibraryStore.setState({
      courses: [],
      activeCourse: null,
      activeCourseHierarchy: null,
      progressSummaries: {},
      searchQuery: '',
      isLoading: false,
      error: null
    })
  })

  it('toggles course favorite optimistically and calls window.api.courses.toggleFavorite', async () => {
    const mockCourse = {
      id: 'c-fav-1',
      title: 'Rust Programming',
      slug: 'rust-programming',
      sourceType: 'local-vault' as const,
      rootPath: '/path',
      totalDuration: 1200,
      moduleCount: 2,
      lessonCount: 4,
      isFavorite: false,
      createdAt: 1000,
      updatedAt: 1000
    }

    // Mock global window and API
    ;(global as any).window = {
      api: {
        courses: {
          toggleFavorite: vi.fn().mockResolvedValue(true)
        }
      }
    }

    useLibraryStore.setState({
      courses: [mockCourse],
      activeCourse: mockCourse,
      activeCourseHierarchy: {
        course: mockCourse,
        modules: []
      }
    })

    const { toggleFavorite } = useLibraryStore.getState()
    const result = await toggleFavorite('c-fav-1')

    expect(result).toBe(true)
    expect(window.api.courses.toggleFavorite).toHaveBeenCalledWith('c-fav-1')

    const state = useLibraryStore.getState()
    expect(state.courses[0].isFavorite).toBe(true)
    expect(state.activeCourse?.isFavorite).toBe(true)
    expect(state.activeCourseHierarchy?.course.isFavorite).toBe(true)
  })

  it('moves a lesson to a distant position within its module', async () => {
    const course: Course = {
      id: 'course-reorder',
      title: 'Course reorder',
      slug: 'course-reorder',
      sourceType: 'local-vault',
      rootPath: 'C:\\vault',
      totalDuration: 0,
      moduleCount: 1,
      lessonCount: 3,
      createdAt: 1,
      updatedAt: 1
    }
    const makeLesson = (id: string, orderIndex: number): Lesson => ({
      id,
      moduleId: 'module-reorder',
      courseId: course.id,
      title: id,
      orderIndex,
      filePath: `C:\\vault\\${id}.mp4`,
      fileName: `${id}.mp4`,
      fileExtension: '.mp4',
      mediaType: 'video',
      duration: 0,
      fileSize: 1,
      availability: 'local',
      createdAt: 1
    })
    const initialLessons = [
      makeLesson('lesson-1', 1),
      makeLesson('lesson-2', 2),
      makeLesson('lesson-3', 3)
    ]
    const finalLessons = [
      initialLessons[1],
      initialLessons[2],
      initialLessons[0]
    ]
    const initialHierarchy = {
      course,
      modules: [
        {
          id: 'module-reorder',
          courseId: course.id,
          title: 'Module reorder',
          orderIndex: 1,
          duration: 0,
          lessonCount: 3,
          createdAt: 1,
          lessons: initialLessons
        }
      ]
    }
    const reorder = vi.fn().mockResolvedValue({ success: true })

    ;(global as any).window = {
      api: {
        courses: {
          reorderLesson: reorder,
          getById: vi.fn().mockResolvedValue({
            ...initialHierarchy,
            modules: [{ ...initialHierarchy.modules[0], lessons: finalLessons }]
          })
        }
      }
    }
    useLibraryStore.setState({
      courses: [course],
      activeCourse: course,
      activeCourseHierarchy: initialHierarchy
    })

    const loadingStates: boolean[] = []
    const unsubscribe = useLibraryStore.subscribe((state) => {
      loadingStates.push(state.isLoading)
    })

    const reorderToIndex = useLibraryStore.getState().reorderLesson as (
      lessonId: string,
      direction: 'up' | 'down',
      targetIndex?: number
    ) => Promise<void>

    await reorderToIndex('lesson-1', 'down', 2)
    unsubscribe()

    expect(reorder).toHaveBeenNthCalledWith(1, 'lesson-1', 'down')
    expect(reorder).toHaveBeenNthCalledWith(2, 'lesson-1', 'down')
    expect(loadingStates).not.toContain(true)
    expect(
      useLibraryStore
        .getState()
        .activeCourseHierarchy?.modules[0].lessons.map((lesson) => lesson.id)
    ).toEqual(['lesson-2', 'lesson-3', 'lesson-1'])
  })
})
