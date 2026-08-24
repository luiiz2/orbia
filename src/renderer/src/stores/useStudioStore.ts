import { create } from 'zustand'
import type {
  LibraryAppearance,
  LibrarySection,
  Collection,
  CustomFieldDefinition,
  StudioHistoryEntry,
  AutomationRule,
  SpreadsheetDraftChange
} from '@shared'

interface StudioStoreState {
  appearances: LibraryAppearance[]
  sections: LibrarySection[]
  collections: Collection[]
  customFields: CustomFieldDefinition[]
  history: StudioHistoryEntry[]
  automationRules: AutomationRule[]
  draftChanges: SpreadsheetDraftChange[]
  includeHidden: boolean
  isDraftModalOpen: boolean
  isHistoryModalOpen: boolean
  isRenameModalOpen: boolean
  isCustomFieldsModalOpen: boolean
  isAutomationModalOpen: boolean
  isLoading: boolean

  fetchAppearances: (courseId?: string) => Promise<void>
  fetchSections: (courseId: string) => Promise<void>
  fetchCollections: () => Promise<void>
  fetchCustomFields: () => Promise<void>
  fetchHistory: () => Promise<void>
  fetchAutomationRules: () => Promise<void>

  addDraftChange: (change: SpreadsheetDraftChange) => void
  removeDraftChange: (index: number) => void
  clearDraftChanges: () => void
  applyDraftChanges: () => Promise<boolean>

  undoHistoryEntry: (historyId: string) => Promise<boolean>
  toggleIncludeHidden: () => void
  setDraftModalOpen: (open: boolean) => void
  setHistoryModalOpen: (open: boolean) => void
  setRenameModalOpen: (open: boolean) => void
  setCustomFieldsModalOpen: (open: boolean) => void
  setAutomationModalOpen: (open: boolean) => void
}

export const useStudioStore = create<StudioStoreState>((set, get) => ({
  appearances: [],
  sections: [],
  collections: [],
  customFields: [],
  history: [],
  automationRules: [],
  draftChanges: [],
  includeHidden: false,
  isDraftModalOpen: false,
  isHistoryModalOpen: false,
  isRenameModalOpen: false,
  isCustomFieldsModalOpen: false,
  isAutomationModalOpen: false,
  isLoading: false,

  fetchAppearances: async (courseId?: string) => {
    set({ isLoading: true })
    try {
      const apps = await window.api.studio.listAppearances(courseId, get().includeHidden)
      set({ appearances: apps })
    } catch (err) {
      console.warn('Failed to fetch appearances:', err)
    } finally {
      set({ isLoading: false })
    }
  },

  fetchSections: async (courseId: string) => {
    try {
      const secs = await window.api.studio.listSections(courseId)
      set({ sections: secs })
    } catch (err) {
      console.warn('Failed to fetch sections:', err)
    }
  },

  fetchCollections: async () => {
    try {
      const cols = await window.api.studio.listCollections()
      set({ collections: cols })
    } catch (err) {
      console.warn('Failed to fetch collections:', err)
    }
  },

  fetchCustomFields: async () => {
    try {
      const fields = await window.api.studio.listCustomFieldDefinitions()
      set({ customFields: fields })
    } catch (err) {
      console.warn('Failed to fetch custom fields:', err)
    }
  },

  fetchHistory: async () => {
    try {
      const hist = await window.api.studio.listHistory(50)
      set({ history: hist })
    } catch (err) {
      console.warn('Failed to fetch studio history:', err)
    }
  },

  fetchAutomationRules: async () => {
    try {
      const rules = await window.api.studio.listAutomationRules()
      set({ automationRules: rules })
    } catch (err) {
      console.warn('Failed to fetch automation rules:', err)
    }
  },

  addDraftChange: (change: SpreadsheetDraftChange) => {
    set((state) => {
      // If a draft change for this appearance and field already exists, replace it
      const filtered = state.draftChanges.filter(
        (c) => !(c.appearanceId === change.appearanceId && c.field === change.field)
      )
      return { draftChanges: [...filtered, change] }
    })
  },

  removeDraftChange: (index: number) => {
    set((state) => ({
      draftChanges: state.draftChanges.filter((_, i) => i !== index)
    }))
  },

  clearDraftChanges: () => {
    set({ draftChanges: [] })
  },

  applyDraftChanges: async () => {
    const { draftChanges, fetchAppearances } = get()
    if (draftChanges.length === 0) return true
    set({ isLoading: true })
    try {
      const res = await window.api.studio.applySpreadsheetDraft(draftChanges)
      if (res.success) {
        set({ draftChanges: [], isDraftModalOpen: false })
        await fetchAppearances()
        return true
      }
      return false
    } catch (err) {
      console.warn('Failed to apply draft changes:', err)
      return false
    } finally {
      set({ isLoading: false })
    }
  },

  undoHistoryEntry: async (historyId: string) => {
    set({ isLoading: true })
    try {
      const res = await window.api.studio.undo(historyId)
      if (res.success) {
        await Promise.all([get().fetchAppearances(), get().fetchHistory()])
        return true
      }
      return false
    } catch (err) {
      console.warn('Failed to undo history entry:', err)
      return false
    } finally {
      set({ isLoading: false })
    }
  },

  toggleIncludeHidden: () => {
    set((state) => ({ includeHidden: !state.includeHidden }))
    get().fetchAppearances().catch(console.warn)
  },

  setDraftModalOpen: (open: boolean) => set({ isDraftModalOpen: open }),
  setHistoryModalOpen: (open: boolean) => set({ isHistoryModalOpen: open }),
  setRenameModalOpen: (open: boolean) => set({ isRenameModalOpen: open }),
  setCustomFieldsModalOpen: (open: boolean) => set({ isCustomFieldsModalOpen: open }),
  setAutomationModalOpen: (open: boolean) => set({ isAutomationModalOpen: open })
}))
