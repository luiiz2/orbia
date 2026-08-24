import { describe, it, expect, beforeEach } from 'vitest'
import { useSelectionStore } from '../../src/renderer/src/stores/useSelectionStore'

describe('Selection Store (Global Multi-Selection)', () => {
  beforeEach(() => {
    useSelectionStore.getState().clearSelection()
  })

  it('toggles selection and calculates correct counts by type', () => {
    const store = useSelectionStore.getState()

    store.toggleSelect({
      id: 'c1',
      appearanceId: 'app_c1',
      type: 'course',
      title: 'Curso 1'
    })

    store.toggleSelect({
      id: 'l1',
      appearanceId: 'app_l1',
      type: 'lesson',
      title: 'Aula 1'
    })

    expect(useSelectionStore.getState().selectedMap.size).toBe(2)
    expect(useSelectionStore.getState().isSelected('app_c1')).toBe(true)

    const counts = useSelectionStore.getState().getCountsByType()
    expect(counts.course).toBe(1)
    expect(counts.lesson).toBe(1)
    expect(counts.module).toBe(0)

    // Toggle off
    useSelectionStore.getState().toggleSelect({
      id: 'c1',
      appearanceId: 'app_c1',
      type: 'course',
      title: 'Curso 1'
    })
    expect(useSelectionStore.getState().selectedMap.size).toBe(1)
  })

  it('selects and deselects groups of items', () => {
    const items = [
      { id: '1', appearanceId: 'app_1', type: 'lesson' as const, title: 'Aula 1' },
      { id: '2', appearanceId: 'app_2', type: 'lesson' as const, title: 'Aula 2' }
    ]

    useSelectionStore.getState().selectGroup(items)
    expect(useSelectionStore.getState().selectedMap.size).toBe(2)

    useSelectionStore.getState().deselectGroup(['app_1'])
    expect(useSelectionStore.getState().selectedMap.size).toBe(1)
    expect(useSelectionStore.getState().isSelected('app_2')).toBe(true)
  })
})
