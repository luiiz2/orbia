import { describe, it, expect, beforeEach } from 'vitest'
import { isTheaterModeShortcut } from '../src/renderer/src/hooks/usePlayer'
import { useNavigationStore } from '../src/renderer/src/stores/useNavigationStore'

describe('Global Keyboard Shortcuts & Navigation', () => {
  beforeEach(() => {
    useNavigationStore.setState({
      currentView: 'home',
      selectedCourseId: null,
      sourceNavigationTarget: null,
      isShortcutsModalOpen: false,
      isImportModalOpen: false,
      isVaultModalOpen: false,
      isThemeModalOpen: false,
      isProfileModalOpen: false
    })
  })

  it('toggles shortcuts modal state in useNavigationStore', () => {
    const store = useNavigationStore.getState()
    expect(store.isShortcutsModalOpen).toBe(false)

    store.setShortcutsModalOpen(true)
    expect(useNavigationStore.getState().isShortcutsModalOpen).toBe(true)

    store.setShortcutsModalOpen(false)
    expect(useNavigationStore.getState().isShortcutsModalOpen).toBe(false)
  })

  it('recognizes T as the theater mode shortcut', () => {
    expect(isTheaterModeShortcut('T')).toBe(true)
    expect(isTheaterModeShortcut('t')).toBe(true)
    expect(isTheaterModeShortcut('F')).toBe(false)
  })

  it('navigates cleanly across the core view routes', () => {
    const store = useNavigationStore.getState()

    store.navigateToDiscover()
    expect(useNavigationStore.getState().currentView).toBe('discover')

    store.navigateToReview()
    expect(useNavigationStore.getState().currentView).toBe('review')

    store.navigateToHistory()
    expect(useNavigationStore.getState().currentView).toBe('history')

    store.navigateToSettings()
    expect(useNavigationStore.getState().currentView).toBe('settings')

    store.navigateToHome()
    expect(useNavigationStore.getState().currentView).toBe('home')
  })
})
