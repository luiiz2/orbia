import { describe, expect, it, vi, beforeEach } from 'vitest'
import { usePlayerStore } from '../src/renderer/src/stores/usePlayerStore'
import type { Lesson, Course } from '@shared'

const mockCourse: Course = {
  id: 'course-1',
  title: 'React Streaming Masterclass',
  slug: 'react-streaming-masterclass',
  sourceType: 'local-vault',
  rootPath: 'C:/Vault/Courses/React',
  totalDuration: 3600,
  moduleCount: 1,
  lessonCount: 3,
  createdAt: Date.now(),
  updatedAt: Date.now()
}

const mockLesson1: Lesson = {
  id: 'lesson-1',
  moduleId: 'module-1',
  courseId: 'course-1',
  title: '01 - Introdução ao Streaming',
  orderIndex: 1,
  filePath: 'C:/Vault/Courses/React/01.mp4',
  fileName: '01.mp4',
  fileExtension: 'mp4',
  mediaType: 'video',
  duration: 600,
  fileSize: 1000000,
  availability: 'local',
  createdAt: Date.now()
}

const mockLesson2: Lesson = {
  id: 'lesson-2',
  moduleId: 'module-1',
  courseId: 'course-1',
  title: '02 - Componentes e Hooks',
  orderIndex: 2,
  filePath: 'C:/Vault/Courses/React/02.mp4',
  fileName: '02.mp4',
  fileExtension: 'mp4',
  mediaType: 'video',
  duration: 900,
  fileSize: 1500000,
  availability: 'local',
  createdAt: Date.now()
}

const mockLesson3: Lesson = {
  id: 'lesson-3',
  moduleId: 'module-1',
  courseId: 'course-1',
  title: '03 - Mini Player Persistente',
  orderIndex: 3,
  filePath: 'C:/Vault/Courses/React/03.mp4',
  fileName: '03.mp4',
  fileExtension: 'mp4',
  mediaType: 'video',
  duration: 1200,
  fileSize: 2000000,
  availability: 'local',
  createdAt: Date.now()
}

// Mock window.api
const windowApi = {
  player: {
    getProgress: vi.fn().mockResolvedValue(null),
    saveProgress: vi.fn().mockResolvedValue(undefined),
    addWatchHistory: vi.fn().mockResolvedValue(undefined),
    getLessonNotes: vi.fn().mockResolvedValue([]),
    getCourseProgress: vi.fn().mockResolvedValue(null)
  },
  bookmarks: {
    listByLesson: vi.fn().mockResolvedValue([])
  },
  flashcards: {
    listByLesson: vi.fn().mockResolvedValue([])
  },
  courses: {
    convertSrtToVtt: vi.fn().mockResolvedValue({ success: false })
  }
}

globalThis.window = {
  api: windowApi
} as unknown as Window & typeof globalThis

describe('usePlayerStore v0.4 Streaming Experience', () => {
  beforeEach(() => {
    usePlayerStore.getState().reset()
  })

  it('manages Playback Queue ("A Seguir") adding, removing, and reordering', () => {
    const store = usePlayerStore.getState()

    // 1. Add lessons to queue
    store.addToQueue(mockLesson1)
    store.addToQueue(mockLesson2)
    store.addToQueue(mockLesson3)

    expect(usePlayerStore.getState().playbackQueue).toHaveLength(3)
    expect(usePlayerStore.getState().playbackQueue[0].id).toBe('lesson-1')
    expect(usePlayerStore.getState().playbackQueue[1].id).toBe('lesson-2')
    expect(usePlayerStore.getState().playbackQueue[2].id).toBe('lesson-3')

    // 2. Prevent duplicates in queue
    store.addToQueue(mockLesson1)
    expect(usePlayerStore.getState().playbackQueue).toHaveLength(3)

    // 3. Reorder queue
    store.reorderQueue(0, 2)
    expect(usePlayerStore.getState().playbackQueue[0].id).toBe('lesson-2')
    expect(usePlayerStore.getState().playbackQueue[1].id).toBe('lesson-3')
    expect(usePlayerStore.getState().playbackQueue[2].id).toBe('lesson-1')

    // 4. Remove from queue
    store.removeFromQueue('lesson-3')
    expect(usePlayerStore.getState().playbackQueue).toHaveLength(2)
    expect(usePlayerStore.getState().playbackQueue.map((l) => l.id)).toEqual([
      'lesson-2',
      'lesson-1'
    ])

    // 5. Clear queue
    store.clearQueue()
    expect(usePlayerStore.getState().playbackQueue).toHaveLength(0)
  })

  it('plays the next queued lesson when nextLesson() is called', async () => {
    const store = usePlayerStore.getState()

    await store.loadHierarchy(
      mockCourse,
      [
        {
          ...mockCourse,
          courseId: 'course-1',
          id: 'module-1',
          title: 'Módulo 1',
          orderIndex: 1,
          duration: 3600,
          lessonCount: 3,
          createdAt: Date.now(),
          lessons: [mockLesson1, mockLesson2]
        }
      ],
      'lesson-1'
    )

    // Add lesson-3 (from another module/course) to queue
    store.addToQueue(mockLesson3)
    expect(usePlayerStore.getState().playbackQueue).toHaveLength(1)

    // Call nextLesson -> should pop lesson-3 from queue instead of linear hierarchy
    const advanced = await usePlayerStore.getState().nextLesson()
    expect(advanced).toBe(true)
    expect(usePlayerStore.getState().playbackQueue).toHaveLength(0)
  })

  it('manages Mini-Player activation and dismissal', () => {
    const store = usePlayerStore.getState()

    expect(store.isMiniPlayerActive).toBe(false)

    // Activate mini-player
    store.setMiniPlayerActive(true)
    expect(usePlayerStore.getState().isMiniPlayerActive).toBe(true)

    // Dismiss mini player
    store.dismissMiniPlayer()
    expect(usePlayerStore.getState().isMiniPlayerActive).toBe(false)
    expect(usePlayerStore.getState().isPlaying).toBe(false)
  })
})
