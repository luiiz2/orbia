import { create } from 'zustand'
import type {
  Flashcard,
  FlashcardReviewGrade,
  FlashcardState,
  VideoBookmark,
  StudyQueueItem,
  StudyQueueEntityType,
  ReviewDashboardStats
} from '@shared'

export interface ReviewState {
  dashboardStats: ReviewDashboardStats | null
  dueFlashcards: Flashcard[]
  allFlashcards: Flashcard[]
  recentBookmarks: VideoBookmark[]
  studyQueue: StudyQueueItem[]
  isLoading: boolean
  isReviewSessionActive: boolean
  activeCardIndex: number
  activeFilter: 'all' | 'due' | 'flashcards' | 'bookmarks' | 'queue'
  searchQuery: string

  // Actions
  fetchDashboardStats: () => Promise<void>
  fetchDueFlashcards: () => Promise<void>
  fetchAllFlashcards: (courseId?: string) => Promise<void>
  fetchRecentBookmarks: (limit?: number) => Promise<void>
  fetchStudyQueue: () => Promise<void>
  createFlashcard: (card: {
    courseId?: string
    moduleId?: string
    lessonId?: string
    timestamp?: number
    question: string
    answer: string
    state?: FlashcardState
    dueAt?: number
  }) => Promise<Flashcard>
  updateFlashcard: (id: string, updates: Partial<Flashcard>) => Promise<boolean>
  deleteFlashcard: (id: string) => Promise<boolean>
  reviewCard: (id: string, grade: FlashcardReviewGrade) => Promise<void>
  startReviewSession: () => void
  endReviewSession: () => void
  nextCard: () => void
  addToStudyQueue: (
    entityType: StudyQueueEntityType,
    entityId: string
  ) => Promise<StudyQueueItem>
  removeFromStudyQueue: (id: string) => Promise<boolean>
  reorderStudyQueue: (id: string, direction: 'up' | 'down') => Promise<boolean>
  deleteBookmark: (id: string) => Promise<boolean>
  setActiveFilter: (
    filter: 'all' | 'due' | 'flashcards' | 'bookmarks' | 'queue'
  ) => void
  setSearchQuery: (query: string) => void
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  dashboardStats: null,
  dueFlashcards: [],
  allFlashcards: [],
  recentBookmarks: [],
  studyQueue: [],
  isLoading: false,
  isReviewSessionActive: false,
  activeCardIndex: 0,
  activeFilter: 'all',
  searchQuery: '',

  fetchDashboardStats: async () => {
    try {
      const stats = await window.api.review.getDashboardStats()
      set({ dashboardStats: stats })
    } catch (err) {
      console.warn('Failed to fetch review dashboard stats:', err)
    }
  },

  fetchDueFlashcards: async () => {
    try {
      const cards = await window.api.flashcards.getDue(100)
      set({ dueFlashcards: cards })
    } catch (err) {
      console.warn('Failed to fetch due flashcards:', err)
    }
  },

  fetchAllFlashcards: async (courseId) => {
    try {
      const cards = await window.api.flashcards.listAll(courseId)
      set({ allFlashcards: cards })
    } catch (err) {
      console.warn('Failed to fetch all flashcards:', err)
    }
  },

  fetchRecentBookmarks: async (limit = 30) => {
    try {
      const bookmarks = await window.api.bookmarks.listRecent(limit)
      set({ recentBookmarks: bookmarks })
    } catch (err) {
      console.warn('Failed to fetch recent bookmarks:', err)
    }
  },

  fetchStudyQueue: async () => {
    try {
      const queue = await window.api.studyQueue.list()
      set({ studyQueue: queue })
    } catch (err) {
      console.warn('Failed to fetch study queue:', err)
    }
  },

  createFlashcard: async (card) => {
    const created = await window.api.flashcards.create(card)
    await Promise.all([
      get().fetchDueFlashcards(),
      get().fetchAllFlashcards(),
      get().fetchDashboardStats()
    ])
    return created
  },

  updateFlashcard: async (id, updates) => {
    const ok = await window.api.flashcards.update(id, updates)
    if (ok) {
      await Promise.all([
        get().fetchDueFlashcards(),
        get().fetchAllFlashcards()
      ])
    }
    return ok
  },

  deleteFlashcard: async (id) => {
    const ok = await window.api.flashcards.delete(id)
    if (ok) {
      set((state) => ({
        dueFlashcards: state.dueFlashcards.filter((c) => c.id !== id),
        allFlashcards: state.allFlashcards.filter((c) => c.id !== id)
      }))
      await get().fetchDashboardStats()
    }
    return ok
  },

  reviewCard: async (id, grade) => {
    const res = await window.api.flashcards.review(id, grade)
    if (res.success) {
      set((state) => {
        const nextIndex = state.activeCardIndex + 1
        const isFinished = nextIndex >= state.dueFlashcards.length
        return {
          activeCardIndex: isFinished ? 0 : nextIndex,
          isReviewSessionActive: !isFinished
        }
      })
      await Promise.all([
        get().fetchDueFlashcards(),
        get().fetchDashboardStats()
      ])
    }
  },

  startReviewSession: () => {
    set({
      isReviewSessionActive: true,
      activeCardIndex: 0
    })
  },

  endReviewSession: () => {
    set({
      isReviewSessionActive: false,
      activeCardIndex: 0
    })
  },

  nextCard: () => {
    set((state) => {
      const next = state.activeCardIndex + 1
      if (next >= state.dueFlashcards.length) {
        return { isReviewSessionActive: false, activeCardIndex: 0 }
      }
      return { activeCardIndex: next }
    })
  },

  addToStudyQueue: async (entityType, entityId) => {
    const item = await window.api.studyQueue.add(entityType, entityId)
    await Promise.all([get().fetchStudyQueue(), get().fetchDashboardStats()])
    return item
  },

  removeFromStudyQueue: async (id) => {
    const ok = await window.api.studyQueue.remove(id)
    if (ok) {
      set((state) => ({
        studyQueue: state.studyQueue.filter((i) => i.id !== id)
      }))
      await get().fetchDashboardStats()
    }
    return ok
  },

  reorderStudyQueue: async (id, direction) => {
    set((state) => {
      const idx = state.studyQueue.findIndex((i) => i.id === id)
      if (idx === -1) return state
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= state.studyQueue.length) return state
      const newQueue = [...state.studyQueue]
      const [moved] = newQueue.splice(idx, 1)
      newQueue.splice(targetIdx, 0, moved)
      return { studyQueue: newQueue }
    })
    const ok = await window.api.studyQueue.reorder(id, direction)
    if (ok) {
      await get().fetchStudyQueue()
    }
    return ok
  },

  deleteBookmark: async (id) => {
    const ok = await window.api.bookmarks.delete(id)
    if (ok) {
      set((state) => ({
        recentBookmarks: state.recentBookmarks.filter((b) => b.id !== id)
      }))
      await get().fetchDashboardStats()
    }
    return ok
  },

  setActiveFilter: (filter) => set({ activeFilter: filter }),
  setSearchQuery: (query) => set({ searchQuery: query })
}))
