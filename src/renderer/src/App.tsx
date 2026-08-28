import React, { useEffect, useState } from 'react'
import { ThemeProvider } from './components/layout/ThemeProvider'
import { AppShell } from './components/layout/AppShell'
import { SplashScreen } from './components/layout/SplashScreen'
import { HomeView } from './pages/HomeView'
import { DiscoverView } from './pages/DiscoverView'
import { CourseView } from './pages/CourseView'
import { PlayerView } from './pages/PlayerView'
import { ReviewView } from './pages/ReviewView'
import { HistoryView } from './pages/HistoryView'
import { SettingsView } from './pages/SettingsView'
import { ImportWizard } from './components/import/ImportWizard'
import { VaultModal } from './components/vault/VaultModal'
import { VaultSelector } from './components/vault/VaultSelector'
import {
  BulkActionBar,
  DraftReviewModal,
  OrganizationHistoryModal,
  CustomFieldsModal,
  AutomationRulesModal,
  ProfileSelectorModal,
  ThemeEditorModal,
  VisualLibraryStudio,
  ProfileOnboardingModal,
  StartupProfilePicker
} from './components/studio'
import {
  OptimizerDashboardModal,
  VisualComparatorModal
} from './components/optimizer'
import { useNavigationStore } from './stores/useNavigationStore'
import { useVaultStore } from './stores/useVaultStore'
import { useSettingsStore } from './stores/useSettingsStore'
import { useLibraryStore } from './stores/useLibraryStore'
import { useProfileStore } from './stores/useProfileStore'
import { TooltipProvider } from './components/ui/tooltip'
import { SectionErrorBoundary } from './components/ui/SectionErrorBoundary'
import { KeyboardShortcutsModal } from './components/layout/KeyboardShortcutsModal'
import { LibrarySearchDialog } from './components/search'
import { GroundedChatPanel } from './components/chat/GroundedChatPanel'
import { useGroundedChatStore } from './stores/useGroundedChatStore'
import { SummaryViewModal } from './components/summaries/SummaryViewModal'
import { AiNotePreviewModal } from './components/notes/AiNotePreviewModal'
import { useGlobalShortcuts } from './hooks'

export function App(): React.JSX.Element {
  useGlobalShortcuts()

  const {
    currentView,
    isImportModalOpen,
    setImportModalOpen,
    isThemeModalOpen,
    setThemeModalOpen,
    isProfileModalOpen,
    setProfileModalOpen,
    isShortcutsModalOpen,
    setShortcutsModalOpen,
    navigateToHome
  } = useNavigationStore()
  const { init: initVault, currentVault } = useVaultStore()
  const { init: initSettings } = useSettingsStore()
  const { fetchCourses } = useLibraryStore()
  const { profiles, fetchProfiles, fetchResolvedTheme, setActiveProfile } =
    useProfileStore()
  const [isAppReady, setIsAppReady] = useState(false)
  const [isSplashDone, setIsSplashDone] = useState(false)

  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean>(
    () => {
      return localStorage.getItem('orbia_profile_onboarding_done') === 'true'
    }
  )
  const [hasSelectedStartupProfile, setHasSelectedStartupProfile] =
    useState<boolean>(false)

  useEffect(() => {
    async function preloadData(): Promise<void> {
      try {
        await initSettings()
        await initVault()
        await fetchCourses()
        await fetchProfiles()
        await fetchResolvedTheme()
      } catch (err) {
        console.warn('[App] Preload error:', err)
      } finally {
        setIsAppReady(true)
      }
    }

    preloadData()
  }, [initSettings, initVault, fetchCourses, fetchProfiles, fetchResolvedTheme])

  const renderActiveView = (): React.ReactNode => {
    let viewContent: React.ReactNode

    switch (currentView) {
      case 'home':
        viewContent = <HomeView />
        break
      case 'discover':
        viewContent = <DiscoverView />
        break
      case 'course':
        viewContent = <CourseView />
        break
      case 'player':
        viewContent = <PlayerView />
        break
      case 'review':
        viewContent = <ReviewView />
        break
      case 'studio':
        viewContent = <VisualLibraryStudio />
        break
      case 'history':
        viewContent = <HistoryView />
        break
      case 'settings':
        viewContent = <SettingsView />
        break
      default:
        viewContent = <HomeView />
    }

    return (
      <SectionErrorBoundary
        key={currentView}
        onNavigateHome={currentView !== 'home' ? navigateToHome : undefined}
      >
        {viewContent}
      </SectionErrorBoundary>
    )
  }

  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={150}>
        {!isSplashDone && (
          <SplashScreen
            isReady={isAppReady}
            onFinish={() => setIsSplashDone(true)}
          />
        )}

        {isSplashDone && !hasCompletedOnboarding && (
          <ProfileOnboardingModal
            open={true}
            onFinish={() => setHasCompletedOnboarding(true)}
          />
        )}

        {isSplashDone &&
          hasCompletedOnboarding &&
          profiles.length > 1 &&
          !hasSelectedStartupProfile && (
            <StartupProfilePicker
              onSelect={(profile) => {
                setActiveProfile(profile)
                setHasSelectedStartupProfile(true)
              }}
            />
          )}

        {isSplashDone &&
          (!hasCompletedOnboarding ? null : profiles.length > 1 &&
            !hasSelectedStartupProfile ? null : !currentVault ? (
            <VaultSelector />
          ) : (
            <>
              <AppShell>{renderActiveView()}</AppShell>
              <LibrarySearchDialog />
              <KeyboardShortcutsModal
                open={isShortcutsModalOpen}
                onOpenChange={setShortcutsModalOpen}
              />
              <ImportWizard
                open={isImportModalOpen}
                onOpenChange={setImportModalOpen}
              />
              <VaultModal />
              <BulkActionBar />
              <DraftReviewModal />
              <OrganizationHistoryModal />
              <CustomFieldsModal />
              <AutomationRulesModal />
              <ProfileSelectorModal
                open={isProfileModalOpen}
                onOpenChange={setProfileModalOpen}
              />
              <ThemeEditorModal
                open={isThemeModalOpen}
                onOpenChange={setThemeModalOpen}
              />
              <OptimizerDashboardModal />
              <VisualComparatorModal />
              <SummaryViewModal />
              <AiNotePreviewModal />
              <GroundedChatPanelWrapper />
            </>
          ))}
      </TooltipProvider>
    </ThemeProvider>
  )
}

function GroundedChatPanelWrapper(): React.JSX.Element | null {
  const isOpen = useGroundedChatStore((s) => s.isOpen)
  if (!isOpen) return null

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl shadow-2xl border-l border-border bg-background animate-in slide-in-from-right duration-200">
      <GroundedChatPanel
        onNavigate={(target) =>
          useNavigationStore.getState().openSourceTarget(target)
        }
      />
    </div>
  )
}

export default App
