import { create } from 'zustand'
import type { StudioEntityType } from '@shared'

export interface SelectedEntity {
  id: string
  appearanceId: string
  type: StudioEntityType
  title: string
  courseId?: string
  moduleId?: string
}

interface SelectionStoreState {
  selectedMap: Map<string, SelectedEntity>
  isSelectionMode: boolean
  lastSelectedId: string | null

  toggleSelect: (entity: SelectedEntity) => void
  selectRange: (entities: SelectedEntity[]) => void
  selectGroup: (entities: SelectedEntity[]) => void
  deselectGroup: (appearanceIds: string[]) => void
  isSelected: (appearanceId: string) => boolean
  clearSelection: () => void
  setSelectionMode: (active: boolean) => void
  getSelectedArray: () => SelectedEntity[]
  getCountsByType: () => Record<StudioEntityType, number>
}

export const useSelectionStore = create<SelectionStoreState>((set, get) => ({
  selectedMap: new Map<string, SelectedEntity>(),
  isSelectionMode: false,
  lastSelectedId: null,

  toggleSelect: (entity: SelectedEntity) => {
    set((state) => {
      const nextMap = new Map(state.selectedMap)
      if (nextMap.has(entity.appearanceId)) {
        nextMap.delete(entity.appearanceId)
      } else {
        nextMap.set(entity.appearanceId, entity)
      }
      return {
        selectedMap: nextMap,
        isSelectionMode: nextMap.size > 0,
        lastSelectedId: entity.appearanceId
      }
    })
  },

  selectRange: (entities: SelectedEntity[]) => {
    set((state) => {
      const nextMap = new Map(state.selectedMap)
      for (const e of entities) {
        nextMap.set(e.appearanceId, e)
      }
      return {
        selectedMap: nextMap,
        isSelectionMode: nextMap.size > 0,
        lastSelectedId: entities.length > 0 ? entities[entities.length - 1].appearanceId : state.lastSelectedId
      }
    })
  },

  selectGroup: (entities: SelectedEntity[]) => {
    set((state) => {
      const nextMap = new Map(state.selectedMap)
      for (const e of entities) {
        nextMap.set(e.appearanceId, e)
      }
      return {
        selectedMap: nextMap,
        isSelectionMode: true
      }
    })
  },

  deselectGroup: (appearanceIds: string[]) => {
    set((state) => {
      const nextMap = new Map(state.selectedMap)
      for (const id of appearanceIds) {
        nextMap.delete(id)
      }
      return {
        selectedMap: nextMap,
        isSelectionMode: nextMap.size > 0
      }
    })
  },

  isSelected: (appearanceId: string) => {
    return get().selectedMap.has(appearanceId)
  },

  clearSelection: () => {
    set({
      selectedMap: new Map<string, SelectedEntity>(),
      isSelectionMode: false,
      lastSelectedId: null
    })
  },

  setSelectionMode: (active: boolean) => {
    if (!active) {
      get().clearSelection()
    } else {
      set({ isSelectionMode: true })
    }
  },

  getSelectedArray: () => {
    return Array.from(get().selectedMap.values())
  },

  getCountsByType: () => {
    const counts: Record<StudioEntityType, number> = {
      course: 0,
      module: 0,
      section: 0,
      lesson: 0,
      resource: 0
    }
    for (const item of get().selectedMap.values()) {
      if (counts[item.type] !== undefined) {
        counts[item.type]++
      }
    }
    return counts
  }
}))
