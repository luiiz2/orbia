import { create } from 'zustand'

export type ViewType =
  'home' | 'discover' | 'course' | 'player' | 'history' | 'review' | 'settings'

export interface SourceNavigationIntent {
  courseId: string
  lessonId?: string
  timestampSeconds?: number
  resourceId?: string
  pdfPage?: number
}

export interface NavigationState {
  currentView: ViewType
  selectedCourseId: string | null
  sourceNavigationTarget: SourceNavigationIntent | null
  isImportModalOpen: boolean
  isVaultModalOpen: boolean
  isThemeModalOpen: boolean
  isProfileModalOpen: boolean
  isShortcutsModalOpen: boolean

  // Actions
  setView: (view: ViewType, courseId?: string) => void
  openSourceTarget: (target: SourceNavigationIntent) => void
  consumeSourceTarget: () => SourceNavigationIntent | null
  navigateToHome: () => void
  navigateToDiscover: () => void
  navigateToCourse: (courseId: string) => void
  navigateToPlayer: (courseId?: string) => void
  navigateToHistory: () => void
  navigateToReview: () => void
  navigateToSettings: () => void
  setImportModalOpen: (open: boolean) => void
  setVaultModalOpen: (open: boolean) => void
  setThemeModalOpen: (open: boolean) => void
  setProfileModalOpen: (open: boolean) => void
  setShortcutsModalOpen: (open: boolean) => void
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  currentView: 'home',
  selectedCourseId: null,
  sourceNavigationTarget: null,
  isImportModalOpen: false,
  isVaultModalOpen: false,
  isThemeModalOpen: false,
  isProfileModalOpen: false,
  isShortcutsModalOpen: false,

  setView: (view, courseId) =>
    set({
      currentView: view,
      selectedCourseId: courseId !== undefined ? courseId : null
    }),

  openSourceTarget: (target) =>
    set({
      currentView: target.lessonId ? 'player' : 'course',
      selectedCourseId: target.courseId,
      sourceNavigationTarget: target
    }),

  consumeSourceTarget: () => {
    const current = get().sourceNavigationTarget
    if (current) {
      set({ sourceNavigationTarget: null })
    }
    return current
  },

  navigateToHome: () =>
    set({
      currentView: 'home',
      selectedCourseId: null
    }),

  navigateToDiscover: () =>
    set({
      currentView: 'discover',
      selectedCourseId: null
    }),

  navigateToCourse: (courseId: string) =>
    set({
      currentView: 'course',
      selectedCourseId: courseId
    }),

  navigateToPlayer: (courseId?: string) =>
    set((state) => ({
      currentView: 'player',
      selectedCourseId:
        courseId !== undefined ? courseId : state.selectedCourseId
    })),

  navigateToHistory: () =>
    set({
      currentView: 'history'
    }),

  navigateToReview: () =>
    set({
      currentView: 'review'
    }),

  navigateToSettings: () =>
    set({
      currentView: 'settings'
    }),

  setImportModalOpen: (isImportModalOpen) =>
    set({
      isImportModalOpen
    }),

  setVaultModalOpen: (isVaultModalOpen) =>
    set({
      isVaultModalOpen
    }),

  setThemeModalOpen: (isThemeModalOpen) =>
    set({
      isThemeModalOpen
    }),

  setProfileModalOpen: (isProfileModalOpen) =>
    set({
      isProfileModalOpen
    }),

  setShortcutsModalOpen: (isShortcutsModalOpen) =>
    set({
      isShortcutsModalOpen
    })
}))
