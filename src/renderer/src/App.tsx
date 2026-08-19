import React, { useEffect, useState } from 'react'
import { ThemeProvider } from './components/layout/ThemeProvider'
import { AppShell } from './components/layout/AppShell'
import { SplashScreen } from './components/layout/SplashScreen'
import { HomeView } from './pages/HomeView'
import { CourseView } from './pages/CourseView'
import { PlayerView } from './pages/PlayerView'
import { HistoryView } from './pages/HistoryView'
import { SettingsView } from './pages/SettingsView'
import { ImportWizard } from './components/import/ImportWizard'
import { VaultModal } from './components/vault/VaultModal'
import { VaultSelector } from './components/vault/VaultSelector'
import { useNavigationStore } from './stores/useNavigationStore'
import { useVaultStore } from './stores/useVaultStore'
import { useSettingsStore } from './stores/useSettingsStore'
import { useLibraryStore } from './stores/useLibraryStore'
import { TooltipProvider } from './components/ui/tooltip'

export function App(): React.JSX.Element {
  const { currentView, isImportModalOpen, setImportModalOpen } = useNavigationStore()
  const { init: initVault, currentVault } = useVaultStore()
  const { init: initSettings } = useSettingsStore()
  const { fetchCourses } = useLibraryStore()
  const [isAppReady, setIsAppReady] = useState(false)
  const [isSplashDone, setIsSplashDone] = useState(false)

  useEffect(() => {
    async function preloadData(): Promise<void> {
      try {
        await initSettings()
        await initVault()
        await fetchCourses()
      } catch (err) {
        console.warn('[App] Preload error:', err)
      } finally {
        setIsAppReady(true)
      }
    }

    preloadData()
  }, [initSettings, initVault, fetchCourses])

  const renderActiveView = (): React.ReactNode => {
    switch (currentView) {
      case 'home':
        return <HomeView />
      case 'course':
        return <CourseView />
      case 'player':
        return <PlayerView />
      case 'history':
        return <HistoryView />
      case 'settings':
        return <SettingsView />
      default:
        return <HomeView />
    }
  }

  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={150}>
        {!isSplashDone && (
          <SplashScreen isReady={isAppReady} onFinish={() => setIsSplashDone(true)} />
        )}
        {!currentVault ? (
          <VaultSelector />
        ) : (
          <>
            <AppShell>{renderActiveView()}</AppShell>
            <ImportWizard open={isImportModalOpen} onOpenChange={setImportModalOpen} />
            <VaultModal />
          </>
        )}
      </TooltipProvider>
    </ThemeProvider>
  )
}

export default App

