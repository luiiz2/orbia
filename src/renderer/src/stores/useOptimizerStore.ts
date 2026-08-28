import { create } from 'zustand'
import type {
  HardwareCapabilities,
  OptimizationExclusionRule,
  OptimizationProfile,
  OptimizationQueueItem,
  OptimizationRecord,
  OptimizationSettings,
  StorageOptimizerMetrics,
  VaultOptimizationAnalysis,
  VisualComparisonResult
} from '@shared'

interface OptimizerState {
  metrics: StorageOptimizerMetrics | null
  analysis: VaultOptimizationAnalysis | null
  queue: OptimizationQueueItem[]
  records: OptimizationRecord[]
  exclusions: OptimizationExclusionRule[]
  hardwareCapabilities: HardwareCapabilities | null
  settings: OptimizationSettings | null
  visualComparison: VisualComparisonResult | null
  isAnalyzing: boolean
  isComparing: boolean
  isOptimizerModalOpen: boolean
  isVisualComparatorOpen: boolean
  activeTab: 'overview' | 'analyze' | 'queue' | 'history' | 'settings'

  setOptimizerModalOpen: (open: boolean) => void
  setVisualComparatorOpen: (open: boolean) => void
  setActiveTab: (
    tab: 'overview' | 'analyze' | 'queue' | 'history' | 'settings'
  ) => void

  fetchMetrics: () => Promise<void>
  fetchQueue: () => Promise<void>
  fetchRecords: () => Promise<void>
  fetchHardware: () => Promise<void>
  fetchSettings: () => Promise<void>
  updateSettings: (updates: Partial<OptimizationSettings>) => Promise<boolean>
  analyzeVault: (
    profile?: OptimizationProfile
  ) => Promise<VaultOptimizationAnalysis | null>
  queueVaultOptimization: (options?: {
    profile?: OptimizationProfile
    excludedLessonIds?: string[]
    allowSharedOptimization?: boolean
  }) => Promise<number>
  queueLessonOptimization: (
    lessonId: string,
    profile?: OptimizationProfile,
    allowShared?: boolean
  ) => Promise<boolean>
  pauseJob: (jobId: string) => Promise<void>
  resumeJob: (jobId: string) => Promise<void>
  cancelJob: (jobId: string) => Promise<void>
  retryJob: (jobId: string) => Promise<void>
  clearCompletedQueue: () => Promise<void>
  pauseAll: () => Promise<void>
  resumeAll: () => Promise<void>
  generateVisualComparison: (
    lessonId: string,
    profile?: OptimizationProfile
  ) => Promise<void>
  restoreOriginal: (recordId: string) => Promise<boolean>
  reoptimizeLesson: (
    lessonId: string,
    profile?: OptimizationProfile
  ) => Promise<boolean>
  setExclusion: (
    scopeType: OptimizationExclusionRule['scopeType'],
    scopeId: string,
    isExcluded: boolean
  ) => Promise<void>
  subscribeToProgress: () => () => void
}

export const useOptimizerStore = create<OptimizerState>((set, get) => ({
  metrics: null,
  analysis: null,
  queue: [],
  records: [],
  exclusions: [],
  hardwareCapabilities: null,
  settings: null,
  visualComparison: null,
  isAnalyzing: false,
  isComparing: false,
  isOptimizerModalOpen: false,
  isVisualComparatorOpen: false,
  activeTab: 'overview',

  setOptimizerModalOpen: (open) => {
    set({ isOptimizerModalOpen: open })
    if (open) {
      void get().fetchMetrics()
      void get().fetchQueue()
      void get().fetchHardware()
      void get().fetchSettings()
    }
  },

  setVisualComparatorOpen: (open) => set({ isVisualComparatorOpen: open }),
  setActiveTab: (activeTab) => set({ activeTab }),

  fetchMetrics: async () => {
    try {
      const metrics = await window.api.optimizer.getMetrics()
      set({ metrics })
    } catch (err) {
      console.warn('Failed to fetch optimizer metrics:', err)
    }
  },

  fetchQueue: async () => {
    try {
      const queue = await window.api.optimizer.listQueue()
      set({ queue })
    } catch (err) {
      console.warn('Failed to fetch optimizer queue:', err)
    }
  },

  fetchRecords: async () => {
    try {
      const records = await window.api.optimizer.listRecords(100)
      set({ records })
    } catch (err) {
      console.warn('Failed to fetch optimizer records:', err)
    }
  },

  fetchHardware: async () => {
    try {
      const hardwareCapabilities =
        await window.api.optimizer.getHardwareCapabilities()
      set({ hardwareCapabilities })
    } catch (err) {
      console.warn('Failed to fetch hardware capabilities:', err)
    }
  },

  fetchSettings: async () => {
    try {
      const settings = await window.api.optimizer.getSettings()
      set({ settings })
    } catch (err) {
      console.warn('Failed to fetch optimizer settings:', err)
    }
  },

  updateSettings: async (updates) => {
    try {
      const ok = await window.api.optimizer.updateSettings(updates)
      if (ok) {
        await get().fetchSettings()
      }
      return ok
    } catch (err) {
      console.warn('Failed to update optimizer settings:', err)
      return false
    }
  },

  analyzeVault: async (profile) => {
    set({ isAnalyzing: true })
    try {
      const analysis = await window.api.optimizer.analyzeVault(profile)
      set({ analysis, activeTab: 'analyze' })
      return analysis
    } catch (err) {
      console.warn('Failed to analyze vault:', err)
      return null
    } finally {
      set({ isAnalyzing: false })
    }
  },

  queueVaultOptimization: async (options) => {
    try {
      const res = await window.api.optimizer.queueVaultOptimization(options)
      await get().fetchQueue()
      await get().fetchMetrics()
      set({ activeTab: 'queue' })
      return res.queuedCount
    } catch (err) {
      console.warn('Failed to queue vault optimization:', err)
      return 0
    }
  },

  queueLessonOptimization: async (lessonId, profile, allowShared) => {
    try {
      const res = await window.api.optimizer.queueLessonOptimization(
        lessonId,
        profile,
        allowShared
      )
      await get().fetchQueue()
      await get().fetchMetrics()
      return res.success
    } catch (err) {
      console.warn('Failed to queue lesson optimization:', err)
      return false
    }
  },

  pauseJob: async (jobId) => {
    await window.api.optimizer.pauseJob(jobId)
    await get().fetchQueue()
  },

  resumeJob: async (jobId) => {
    await window.api.optimizer.resumeJob(jobId)
    await get().fetchQueue()
  },

  cancelJob: async (jobId) => {
    await window.api.optimizer.cancelJob(jobId)
    await get().fetchQueue()
  },

  retryJob: async (jobId) => {
    await window.api.optimizer.retryJob(jobId)
    await get().fetchQueue()
  },

  clearCompletedQueue: async () => {
    await window.api.optimizer.clearCompletedQueue()
    await get().fetchQueue()
  },

  pauseAll: async () => {
    await window.api.optimizer.pauseAll()
    await get().fetchQueue()
  },

  resumeAll: async () => {
    await window.api.optimizer.resumeAll()
    await get().fetchQueue()
  },

  generateVisualComparison: async (lessonId, profile) => {
    set({ isComparing: true, isVisualComparatorOpen: true })
    try {
      const res = await window.api.optimizer.generateVisualComparison(
        lessonId,
        profile
      )
      set({ visualComparison: res })
    } catch (err) {
      console.warn('Failed to generate visual comparison:', err)
    } finally {
      set({ isComparing: false })
    }
  },

  restoreOriginal: async (recordId) => {
    try {
      const res = await window.api.optimizer.restoreOriginal(recordId)
      if (res.success) {
        await get().fetchRecords()
        await get().fetchMetrics()
      }
      return res.success
    } catch (err) {
      console.warn('Failed to restore original file:', err)
      return false
    }
  },

  reoptimizeLesson: async (lessonId, profile) => {
    try {
      const res = await window.api.optimizer.reoptimizeLesson(lessonId, profile)
      if (res.success) {
        await get().fetchQueue()
        set({ activeTab: 'queue' })
      }
      return res.success
    } catch (err) {
      console.warn('Failed to reoptimize lesson:', err)
      return false
    }
  },

  setExclusion: async (scopeType, scopeId, isExcluded) => {
    await window.api.optimizer.setExclusion(scopeType, scopeId, isExcluded)
    const exclusions = await window.api.optimizer.listExclusions()
    set({ exclusions })
  },

  subscribeToProgress: () => {
    return window.api.optimizer.onProgress((item) => {
      set((state) => {
        const queue = state.queue.map((q) => (q.id === item.id ? item : q))
        if (!state.queue.some((q) => q.id === item.id)) {
          queue.unshift(item)
        }
        return { queue }
      })
    })
  }
}))
