import { create } from 'zustand'

export type ViewType = 'home' | 'discover' | 'course' | 'player' | 'history' | 'review' | 'settings' | 'studio'

export interface NavigationState {
  currentView: ViewType
  selectedCourseId: string | null
  isSidebarCollapsed: boolean
  isImportModalOpen: boolean
  isVaultModalOpen: boolean
  isThemeModalOpen: boolean
  isProfileModalOpen: boolean

  // Actions
  setView: (view: ViewType, courseId?: string) => void
  navigateToHome: () => void
  navigateToDiscover: () => void
  navigateToCourse: (courseId: string) => void
  navigateToPlayer: (courseId?: string) => void
  navigateToHistory: () => void
  navigateToReview: () => void
  navigateToStudio: () => void
  navigateToSettings: () => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setImportModalOpen: (open: boolean) => void
  setVaultModalOpen: (open: boolean) => void
  setThemeModalOpen: (open: boolean) => void
  setProfileModalOpen: (open: boolean) => void
}

export const useNavigationStore = create<NavigationState>((set) => ({
  currentView: 'home',
  selectedCourseId: null,
  isSidebarCollapsed: false,
  isImportModalOpen: false,
  isVaultModalOpen: false,
  isThemeModalOpen: false,
  isProfileModalOpen: false,

  setView: (view, courseId) =>
    set({
      currentView: view,
      selectedCourseId: courseId !== undefined ? courseId : null
    }),

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
      selectedCourseId: courseId !== undefined ? courseId : state.selectedCourseId
    })),

  navigateToHistory: () =>
    set({
      currentView: 'history'
    }),

  navigateToReview: () =>
    set({
      currentView: 'review'
    }),

  navigateToStudio: () =>
    set({
      currentView: 'studio'
    }),

  navigateToSettings: () =>
    set({
      currentView: 'settings'
    }),

  toggleSidebar: () =>
    set((state) => ({
      isSidebarCollapsed: !state.isSidebarCollapsed
    })),

  setSidebarCollapsed: (isSidebarCollapsed) =>
    set({
      isSidebarCollapsed
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
    })
}))

