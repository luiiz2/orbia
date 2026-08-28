import { create } from 'zustand'
import type { SummaryRecord, SummaryScope } from '@shared'

interface SummariesState {
  isOpen: boolean
  scope: SummaryScope | null
  summary: SummaryRecord | null
  isLoading: boolean
  error: string | null

  openSummary: (scope: SummaryScope) => Promise<void>
  generateSummary: (forceRegenerate?: boolean) => Promise<void>
  closeSummary: () => void
}

export const useSummariesStore = create<SummariesState>((set, get) => ({
  isOpen: false,
  scope: null,
  summary: null,
  isLoading: false,
  error: null,

  openSummary: async (scope: SummaryScope) => {
    set({ isOpen: true, scope, isLoading: true, error: null })
    try {
      const existing = await window.api.summaries.get(scope)
      if (existing) {
        set({ summary: existing, isLoading: false })
      } else {
        // Automatically generate if no existing summary exists yet
        const result = await window.api.summaries.generate({
          scope,
          forceRegenerate: false
        })
        set({ summary: result.summary, isLoading: false })
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Falha ao carregar resumo.'
      set({ error: message, isLoading: false })
    }
  },

  generateSummary: async (forceRegenerate = true) => {
    const { scope } = get()
    if (!scope) return

    set({ isLoading: true, error: null })
    try {
      const result = await window.api.summaries.generate({
        scope,
        forceRegenerate
      })
      set({ summary: result.summary, isLoading: false })
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Falha ao gerar resumo.'
      set({ error: message, isLoading: false })
    }
  },

  closeSummary: () => {
    set({
      isOpen: false,
      scope: null,
      summary: null,
      error: null,
      isLoading: false
    })
  }
}))
