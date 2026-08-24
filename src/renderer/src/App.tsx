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
import { useNavigationStore } from './stores/useNavigationStore'
import { useVaultStore } from './stores/useVaultStore'
import { useSettingsStore } from './stores/useSettingsStore'
import { useLibraryStore } from './stores/useLibraryStore'
import { useProfileStore } from './stores/useProfileStore'
import { TooltipProvider } from './components/ui/tooltip'

export function App(): React.JSX.Element {
  const {
    currentView,
    isImportModalOpen,
    setImportModalOpen,
    isThemeModalOpen,
    setThemeModalOpen,
    isProfileModalOpen,
    setProfileModalOpen
  } = useNavigationStore()
  const { init: initVault, currentVault } = useVaultStore()
  const { init: initSettings } = useSettingsStore()
  const { fetchCourses } = useLibraryStore()
  const { profiles, fetchProfiles, fetchResolvedTheme, setActiveProfile } = useProfileStore()
  const [isAppReady, setIsAppReady] = useState(false)
  const [isSplashDone, setIsSplashDone] = useState(false)

  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean>(() => {
    return localStorage.getItem('orbia_profile_onboarding_done') === 'true'
  })
  const [hasSelectedStartupProfile, setHasSelectedStartupProfile] = useState<boolean>(false)

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
    switch (currentView) {
      case 'home':
        return <HomeView />
      case 'discover':
        return <DiscoverView />
      case 'course':
        return <CourseView />
      case 'player':
        return <PlayerView />
      case 'review':
        return <ReviewView />
      case 'studio':
        return <VisualLibraryStudio />
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

        {isSplashDone && !hasCompletedOnboarding && (
          <ProfileOnboardingModal
            open={true}
            onFinish={() => setHasCompletedOnboarding(true)}
          />
        )}

        {isSplashDone && hasCompletedOnboarding && profiles.length > 1 && !hasSelectedStartupProfile && (
          <StartupProfilePicker
            onSelect={(profile) => {
              setActiveProfile(profile)
              setHasSelectedStartupProfile(true)
            }}
          />
        )}

        {isSplashDone &&
          (!hasCompletedOnboarding
            ? null
            : profiles.length > 1 && !hasSelectedStartupProfile
            ? null
            : !currentVault
            ? <VaultSelector />
            : (
              <>
                <AppShell>{renderActiveView()}</AppShell>
                <ImportWizard open={isImportModalOpen} onOpenChange={setImportModalOpen} />
                <VaultModal />
                <BulkActionBar />
                <DraftReviewModal />
                <OrganizationHistoryModal />
                <CustomFieldsModal />
                <AutomationRulesModal />
                <ProfileSelectorModal open={isProfileModalOpen} onOpenChange={setProfileModalOpen} />
                <ThemeEditorModal open={isThemeModalOpen} onOpenChange={setThemeModalOpen} />
              </>
            ))}
      </TooltipProvider>
    </ThemeProvider>
  )
}

export default App


