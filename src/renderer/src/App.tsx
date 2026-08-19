import React, { useEffect } from 'react'
import { ThemeProvider } from './components/layout/ThemeProvider'
import { AppShell } from './components/layout/AppShell'
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
import { Loader2 } from 'lucide-react'

export function App(): React.JSX.Element {
  const { currentView, isImportModalOpen, setImportModalOpen } = useNavigationStore()
  const { init: initVault, currentVault, isLoading: isVaultLoading } = useVaultStore()
  const { init: initSettings } = useSettingsStore()
  const { fetchCourses } = useLibraryStore()

  useEffect(() => {
    initSettings().catch(console.warn)
    initVault()
      .then(() => {
        fetchCourses().catch(console.warn)
      })
      .catch(console.warn)
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
      {isVaultLoading && !currentVault ? (
        <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <span className="text-xs font-mono">Loading Orbia...</span>
        </div>
      ) : !currentVault ? (
        <VaultSelector />
      ) : (
        <>
          <AppShell>{renderActiveView()}</AppShell>
          <ImportWizard open={isImportModalOpen} onOpenChange={setImportModalOpen} />
          <VaultModal />
        </>
      )}
    </ThemeProvider>
  )
}

export default App
