import { create } from 'zustand'
import type {
  DiscoveryRail,
  TimeBasedRecommendation,
  SurpriseRecommendation,
  CategoryDiscoveryData,
  LibraryInsights,
  ProfileDiscoveryPreferences,
  RecommendationFeedbackType,
  CourseRelationship,
  CourseRelationshipType
} from '../../../types/discovery'

interface DiscoveryState {
  rails: DiscoveryRail[]
  insights: LibraryInsights | null
  categories: CategoryDiscoveryData[]
  timeRecommendations: TimeBasedRecommendation[]
  surprise: SurpriseRecommendation | null
  relationships: CourseRelationship[]
  preferences: ProfileDiscoveryPreferences | null
  isLoading: boolean
  isTimeModalOpen: boolean
  isSurpriseModalOpen: boolean
  isInsightsModalOpen: boolean
  isRelationshipsModalOpen: boolean
  isCategoriesModalOpen: boolean

  // Modals
  setTimeModalOpen: (open: boolean) => void
  setSurpriseModalOpen: (open: boolean) => void
  setInsightsModalOpen: (open: boolean) => void
  setRelationshipsModalOpen: (open: boolean) => void
  setCategoriesModalOpen: (open: boolean) => void

  // Actions
  fetchRails: (profileId?: string) => Promise<void>
  fetchInsights: () => Promise<void>
  fetchCategories: () => Promise<void>
  fetchTimeRecommendations: (
    minutes: number,
    profileId?: string
  ) => Promise<void>
  fetchSurpriseMe: (
    profileId?: string,
    mode?: 'continue' | 'start_new' | 'quick_lesson' | 'random'
  ) => Promise<void>
  submitFeedback: (
    courseId: string,
    feedbackType: RecommendationFeedbackType,
    profileId?: string
  ) => Promise<void>
  loadRelationships: (courseId?: string) => Promise<void>
  addRelationship: (
    sourceId: string,
    targetId: string,
    type: CourseRelationshipType
  ) => Promise<void>
  deleteRelationship: (id: string) => Promise<void>
  loadPreferences: (profileId: string) => Promise<void>
  savePreferences: (prefs: ProfileDiscoveryPreferences) => Promise<void>
}

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  rails: [],
  insights: null,
  categories: [],
  timeRecommendations: [],
  surprise: null,
  relationships: [],
  preferences: null,
  isLoading: false,
  isTimeModalOpen: false,
  isSurpriseModalOpen: false,
  isInsightsModalOpen: false,
  isRelationshipsModalOpen: false,
  isCategoriesModalOpen: false,

  setTimeModalOpen: (open) => set({ isTimeModalOpen: open }),
  setSurpriseModalOpen: (open) => set({ isSurpriseModalOpen: open }),
  setInsightsModalOpen: (open) => set({ isInsightsModalOpen: open }),
  setRelationshipsModalOpen: (open) => set({ isRelationshipsModalOpen: open }),
  setCategoriesModalOpen: (open) => set({ isCategoriesModalOpen: open }),

  fetchRails: async (profileId?: string) => {
    set({ isLoading: true })
    try {
      if (window.api?.discovery?.getDiscoveryRails) {
        const rails = await window.api.discovery.getDiscoveryRails(profileId)
        set({ rails, isLoading: false })
      } else {
        set({ isLoading: false })
      }
    } catch (err) {
      console.error('Failed to fetch discovery rails:', err)
      set({ isLoading: false })
    }
  },

  fetchInsights: async () => {
    try {
      if (window.api?.discovery?.getLibraryInsights) {
        const insights = await window.api.discovery.getLibraryInsights()
        set({ insights })
      }
    } catch (err) {
      console.error('Failed to fetch insights:', err)
    }
  },

  fetchCategories: async () => {
    try {
      if (window.api?.discovery?.getCategoryDiscovery) {
        const categories = await window.api.discovery.getCategoryDiscovery()
        set({ categories })
      }
    } catch (err) {
      console.error('Failed to fetch category discovery:', err)
    }
  },

  fetchTimeRecommendations: async (minutes: number, profileId?: string) => {
    try {
      if (window.api?.discovery?.getTimeBasedRecommendations) {
        const timeRecommendations =
          await window.api.discovery.getTimeBasedRecommendations(
            minutes,
            profileId
          )
        set({ timeRecommendations })
      }
    } catch (err) {
      console.error('Failed to fetch time recommendations:', err)
    }
  },

  fetchSurpriseMe: async (
    profileId?: string,
    mode?: 'continue' | 'start_new' | 'quick_lesson' | 'random'
  ) => {
    try {
      if (window.api?.discovery?.getSurpriseMe) {
        const surprise = await window.api.discovery.getSurpriseMe(
          profileId,
          mode
        )
        set({ surprise })
      }
    } catch (err) {
      console.error('Failed to fetch surprise me:', err)
    }
  },

  submitFeedback: async (
    courseId: string,
    feedbackType: RecommendationFeedbackType,
    profileId?: string
  ) => {
    try {
      if (window.api?.discovery?.submitFeedback) {
        await window.api.discovery.submitFeedback(
          profileId || 'default_profile',
          courseId,
          feedbackType
        )
        // Refresh rails after feedback
        get().fetchRails(profileId)
      }
    } catch (err) {
      console.error('Failed to submit feedback:', err)
    }
  },

  loadRelationships: async (courseId?: string) => {
    try {
      if (window.api?.discovery?.listCourseRelationships) {
        const relationships =
          await window.api.discovery.listCourseRelationships(courseId)
        set({ relationships })
      }
    } catch (err) {
      console.error('Failed to load relationships:', err)
    }
  },

  addRelationship: async (
    sourceId: string,
    targetId: string,
    type: CourseRelationshipType
  ) => {
    try {
      if (window.api?.discovery?.addCourseRelationship) {
        await window.api.discovery.addCourseRelationship(
          sourceId,
          targetId,
          type
        )
        get().loadRelationships()
      }
    } catch (err) {
      console.error('Failed to add relationship:', err)
    }
  },

  deleteRelationship: async (id: string) => {
    try {
      if (window.api?.discovery?.deleteCourseRelationship) {
        await window.api.discovery.deleteCourseRelationship(id)
        get().loadRelationships()
      }
    } catch (err) {
      console.error('Failed to delete relationship:', err)
    }
  },

  loadPreferences: async (profileId: string) => {
    try {
      if (window.api?.discovery?.getProfileDiscoveryPreferences) {
        const preferences =
          await window.api.discovery.getProfileDiscoveryPreferences(profileId)
        set({ preferences })
      }
    } catch (err) {
      console.error('Failed to load discovery preferences:', err)
    }
  },

  savePreferences: async (prefs: ProfileDiscoveryPreferences) => {
    try {
      if (window.api?.discovery?.saveProfileDiscoveryPreferences) {
        await window.api.discovery.saveProfileDiscoveryPreferences(prefs)
        set({ preferences: prefs })
        get().fetchRails(prefs.profileId)
      }
    } catch (err) {
      console.error('Failed to save discovery preferences:', err)
    }
  }
}))
