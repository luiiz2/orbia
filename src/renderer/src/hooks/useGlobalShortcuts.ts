import { useEffect, useCallback } from 'react'
import { useNavigationStore } from '../stores/useNavigationStore'
import { useLibrarySearchStore } from '../stores/useLibrarySearchStore'

export function useGlobalShortcuts(): void {
  const {
    isShortcutsModalOpen,
    setShortcutsModalOpen,
    setImportModalOpen,
    navigateToHome,
    navigateToDiscover,
    navigateToStudio,
    navigateToReview,
    navigateToHistory,
    navigateToSettings
  } = useNavigationStore()

  const {
    isOpen: isSearchOpen,
    open: openSearch,
    close: closeSearch
  } = useLibrarySearchStore()

  const handleKeyDown = useCallback(
    (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)

      // Always allow Escape to close top-level dialogs
      if (e.key === 'Escape') {
        if (isShortcutsModalOpen) {
          e.preventDefault()
          setShortcutsModalOpen(false)
          return
        }
        if (isSearchOpen) {
          e.preventDefault()
          closeSearch()
          return
        }
      }

      // If user is currently typing in an input field, do not trigger single-key navigation shortcuts
      if (isInput) return

      const isMac = navigator.platform.toUpperCase().includes('MAC')
      const modifier = isMac ? e.metaKey : e.ctrlKey

      // 1. Help / Cheatsheet (? or F1)
      if (e.key === '?' || (e.shiftKey && e.key === '/') || e.key === 'F1') {
        e.preventDefault()
        setShortcutsModalOpen(!isShortcutsModalOpen)
        return
      }

      // 2. Global Search (Ctrl+K / Cmd+K)
      if (modifier && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        if (isSearchOpen) {
          closeSearch()
        } else {
          openSearch()
        }
        return
      }

      // 3. Import Wizard (Ctrl+I / Cmd+I)
      if (modifier && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault()
        setImportModalOpen(true)
        return
      }

      // 4. Settings (Ctrl+, / Cmd+,)
      if (modifier && e.key === ',') {
        e.preventDefault()
        navigateToSettings()
        return
      }

      // 5. Quick Tab Switching (Alt+1..6)
      if (e.altKey && !modifier) {
        switch (e.key) {
          case '1':
            e.preventDefault()
            navigateToHome()
            break
          case '2':
            e.preventDefault()
            navigateToDiscover()
            break
          case '3':
            e.preventDefault()
            navigateToStudio()
            break
          case '4':
            e.preventDefault()
            navigateToReview()
            break
          case '5':
            e.preventDefault()
            navigateToHistory()
            break
          case '6':
            e.preventDefault()
            navigateToSettings()
            break
          default:
            break
        }
      }
    },
    [
      isShortcutsModalOpen,
      setShortcutsModalOpen,
      isSearchOpen,
      openSearch,
      closeSearch,
      setImportModalOpen,
      navigateToHome,
      navigateToDiscover,
      navigateToStudio,
      navigateToReview,
      navigateToHistory,
      navigateToSettings
    ]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])
}
