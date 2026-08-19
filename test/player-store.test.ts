import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { usePlayerStore } from '../src/renderer/src/stores/usePlayerStore'
import type { Course, Lesson } from '../src/types'

describe('PlayerStore State Machine', () => {
  const mockCourse: Course = {
    id: 'course-p1',
    title: 'Advanced React',
    slug: 'advanced-react',
    sourceType: 'local-vault',
    rootPath: '/courses/react',
    totalDuration: 1800,
    moduleCount: 1,
    lessonCount: 2,
    createdAt: 1000,
    updatedAt: 1000
  }

  const mockLessons: Lesson[] = [
    {
      id: 'lp-1',
      moduleId: 'mp-1',
      courseId: 'course-p1',
      title: 'Hooks Internals',
      orderIndex: 1,
      filePath: '/react/01.mp4',
      fileName: '01.mp4',
      fileExtension: 'mp4',
      mediaType: 'video',
      duration: 600,
      fileSize: 100000,
      availability: 'local',
      createdAt: 1000
    },
    {
      id: 'lp-2',
      moduleId: 'mp-1',
      courseId: 'course-p1',
      title: 'Fiber Reconciler',
      orderIndex: 2,
      filePath: '/react/02.mp4',
      fileName: '02.mp4',
      fileExtension: 'mp4',
      mediaType: 'video',
      duration: 1200,
      fileSize: 200000,
      availability: 'local',
      createdAt: 1000
    }
  ]

  const mockModules = [
    {
      id: 'mp-1',
      courseId: 'course-p1',
      title: 'Module 1',
      orderIndex: 1,
      duration: 1800,
      lessonCount: 2,
      createdAt: 1000,
      lessons: mockLessons
    }
  ]

  beforeEach(() => {
    // Mock global window and API
    const mockWindow = {
      api: {
        player: {
          saveProgress: vi.fn().mockResolvedValue(true),
          getProgress: vi.fn().mockResolvedValue(null),
          toggleLessonCompletion: vi.fn().mockResolvedValue(true),
          addWatchHistory: vi.fn().mockResolvedValue(true)
        }
      }
    }

    ;(globalThis as unknown as { window: typeof mockWindow }).window = mockWindow

    usePlayerStore.getState().reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('manages play, pause, volume, mute, and rate controls', () => {
    const { play, pause, setVolume, toggleMute, setPlaybackRate, toggleFullscreen, toggleTheater } =
      usePlayerStore.getState()

    play()
    expect(usePlayerStore.getState().isPlaying).toBe(true)

    pause()
    expect(usePlayerStore.getState().isPlaying).toBe(false)

    setVolume(0.75)
    expect(usePlayerStore.getState().volume).toBe(0.75)
    expect(usePlayerStore.getState().isMuted).toBe(false)

    setVolume(0)
    expect(usePlayerStore.getState().isMuted).toBe(true)

    toggleMute()
    expect(usePlayerStore.getState().isMuted).toBe(false)

    setPlaybackRate(1.5)
    expect(usePlayerStore.getState().playbackRate).toBe(1.5)

    toggleFullscreen()
    expect(usePlayerStore.getState().isFullscreen).toBe(true)

    toggleTheater()
    expect(usePlayerStore.getState().theaterMode).toBe(true)
  })

  it('loads hierarchy, selects initial lesson, and retrieves saved progress', async () => {
    vi.mocked(window.api.player.getProgress).mockResolvedValueOnce({
      lessonId: 'lp-1',
      courseId: 'course-p1',
      currentTime: 120,
      duration: 600,
      completed: false,
      updatedAt: 1000
    })

    await usePlayerStore.getState().loadHierarchy(mockCourse, mockModules)

    const state = usePlayerStore.getState()
    expect(state.activeCourse?.id).toBe('course-p1')
    expect(state.activeLesson?.id).toBe('lp-1')
    expect(state.activeModule?.id).toBe('mp-1')
    expect(state.currentTime).toBe(120)
    expect(state.duration).toBe(600)
    expect(state.isPlaying).toBe(true)
    expect(window.api.player.addWatchHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonId: 'lp-1',
        courseId: 'course-p1'
      })
    )
  })

  it('navigates next and previous lessons smoothly', async () => {
    await usePlayerStore.getState().loadHierarchy(mockCourse, mockModules)
    expect(usePlayerStore.getState().activeLesson?.id).toBe('lp-1')

    // Navigate to next
    const hasNext = await usePlayerStore.getState().nextLesson()
    expect(hasNext).toBe(true)
    expect(usePlayerStore.getState().activeLesson?.id).toBe('lp-2')

    // No next after lp-2
    const hasAnotherNext = await usePlayerStore.getState().nextLesson()
    expect(hasAnotherNext).toBe(false)

    // Navigate to prev
    const hasPrev = await usePlayerStore.getState().prevLesson()
    expect(hasPrev).toBe(true)
    expect(usePlayerStore.getState().activeLesson?.id).toBe('lp-1')
  })

  it('updates progress and persists to main process', async () => {
    await usePlayerStore.getState().loadHierarchy(mockCourse, mockModules)

    await usePlayerStore.getState().updateProgress(300, 600)

    expect(usePlayerStore.getState().currentTime).toBe(300)
    expect(window.api.player.saveProgress).toHaveBeenCalledWith({
      lessonId: 'lp-1',
      courseId: 'course-p1',
      currentTime: 300,
      duration: 600,
      completed: false // 300 / 600 = 50% < 90%
    })

    // Update to 550 / 600 = 91.6% (>= 90%)
    await usePlayerStore.getState().updateProgress(550, 600)
    expect(window.api.player.saveProgress).toHaveBeenCalledWith({
      lessonId: 'lp-1',
      courseId: 'course-p1',
      currentTime: 550,
      duration: 600,
      completed: true
    })
  })

  it('toggles completion status via window.api', async () => {
    await usePlayerStore.getState().loadHierarchy(mockCourse, mockModules)

    await usePlayerStore.getState().toggleComplete('lp-1')

    expect(window.api.player.toggleLessonCompletion).toHaveBeenCalledWith('lp-1', 'course-p1')
    expect(usePlayerStore.getState().progressMap['lp-1']?.completed).toBe(true)
  })
})
