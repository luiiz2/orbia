import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useReviewStore } from '../src/renderer/src/stores/useReviewStore'

describe('useReviewStore', () => {
  beforeEach(() => {
    useReviewStore.setState({
      dueFlashcards: [],
      allFlashcards: [],
      recentBookmarks: [],
      studyQueue: [],
      dashboardStats: null,
      activeCardIndex: 0,
      isReviewSessionActive: false
    })

    const mockApi = {
      flashcards: {
        getDue: vi.fn().mockResolvedValue([
          { id: 'c1', question: 'Q1', answer: 'A1', state: 'DUE', dueAt: Date.now() - 1000, intervalDays: 0, successCount: 0, createdAt: 1, updatedAt: 1 }
        ]),
        listAll: vi.fn().mockResolvedValue([
          { id: 'c1', question: 'Q1', answer: 'A1', state: 'DUE', dueAt: Date.now() - 1000, intervalDays: 0, successCount: 0, createdAt: 1, updatedAt: 1 }
        ]),
        listByLesson: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation(async (data) => ({
          id: 'c2',
          ...data,
          state: 'NEW',
          dueAt: Date.now(),
          intervalDays: 0,
          successCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now()
        })),
        update: vi.fn().mockResolvedValue(true),
        delete: vi.fn().mockResolvedValue(true),
        review: vi.fn().mockResolvedValue({
          id: 'c1',
          state: 'LEARNING',
          dueAt: Date.now() + 600000,
          intervalDays: 0,
          successCount: 0
        })
      },
      bookmarks: {
        listRecent: vi.fn().mockResolvedValue([
          { id: 'b1', courseId: 'crs1', lessonId: 'les1', timestamp: 120, title: 'B1', createdAt: 1, updatedAt: 1 }
        ]),
        listByLesson: vi.fn().mockResolvedValue([]),
        listByCourse: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation(async (data) => ({
          id: 'b2',
          ...data,
          createdAt: Date.now(),
          updatedAt: Date.now()
        })),
        update: vi.fn().mockResolvedValue(true),
        delete: vi.fn().mockResolvedValue(true)
      },
      review: {
        getDashboardStats: vi.fn().mockResolvedValue({
          dueFlashcardsCount: 1,
          totalFlashcardsCount: 1,
          bookmarksCount: 1,
          studyQueueCount: 2,
          recentNotesCount: 0,
          activeStreakDays: 3
        })
      }
    }

    if (typeof globalThis.window === 'undefined') {
      globalThis.window = { api: mockApi } as unknown as Window & typeof globalThis
    } else {
      globalThis.window.api = mockApi as unknown as typeof window.api
    }
  })

  it('fetches dashboard stats and due flashcards correctly', async () => {
    const store = useReviewStore.getState()
    await store.fetchDashboardStats()
    await store.fetchDueFlashcards()

    const state = useReviewStore.getState()
    expect(state.dashboardStats?.activeStreakDays).toBe(3)
    expect(state.dueFlashcards).toHaveLength(1)
    expect(state.dueFlashcards[0].question).toBe('Q1')
  })

  it('manages review session lifecycle and card grading', async () => {
    const store = useReviewStore.getState()
    await store.fetchDueFlashcards()

    store.startReviewSession()
    expect(useReviewStore.getState().isReviewSessionActive).toBe(true)
    expect(useReviewStore.getState().activeCardIndex).toBe(0)

    await store.reviewCard('c1', 'AGAIN')
    expect(window.api.flashcards.review).toHaveBeenCalledWith('c1', 'AGAIN')
  })

})
