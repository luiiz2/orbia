import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Search,
  Sun,
  Moon,
  Laptop,
  FolderOpen,
  Plus,
  X
} from 'lucide-react'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { useVaultStore } from '../../stores/useVaultStore'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { useProfileStore } from '../../stores/useProfileStore'
import { useTheme } from './ThemeProvider'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../ui/dropdown-menu'
import { cn, mediaUrl } from '../../lib/utils'
import appLogo from '../../assets/icon.png'

export function TopBar(): React.JSX.Element {
  const { t } = useTranslation()
  const { searchQuery, setSearchQuery } = useLibraryStore()
  const { currentVault } = useVaultStore()
  const { currentView, setView, setImportModalOpen, setVaultModalOpen } = useNavigationStore()
  const { activeProfile } = useProfileStore()
  const { theme, setTheme } = useTheme()

  const navItems = [
    {
      id: 'home' as const,
      label: t('nav.library'),
      isActive: currentView === 'home' || currentView === 'course' || currentView === 'player'
    },
    {
      id: 'discover' as const,
      label: 'Descobrir',
      isActive: currentView === 'discover'
    },
    {
      id: 'studio' as const,
      label: 'Studio',
      isActive: currentView === 'studio'
    },
    {
      id: 'history' as const,
      label: t('nav.history'),
      isActive: currentView === 'history'
    },
    {
      id: 'settings' as const,
      label: t('nav.settings'),
      isActive: currentView === 'settings'
    }
  ]

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between gap-4 border-b border-border/60 bg-background/90 px-4 backdrop-blur-xl transition-colors select-none">
      {/* Left: Logo + Streaming-style Nav Links */}
      <div className="flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <img src={appLogo} alt="Orbia" className="h-7 w-7 object-contain drop-shadow" />
          <span className="text-base font-extrabold tracking-tight text-orbia-gradient hidden sm:inline">
            {t('app.name')}
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-1 shrink-0">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={cn(
                'relative px-3 py-1.5 text-[13px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                item.isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {item.label}
              {item.isActive && (
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-400" />
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Center: Global Search Input */}
      <div className="flex flex-1 items-center justify-center max-w-md mx-2 min-w-0">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder={`${t('common.search')}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8.5 w-full rounded-lg bg-black/5 dark:bg-white/5 pl-9 pr-8 text-xs border-border/60 text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/60 focus-visible:border-primary/50 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
              title="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Right: Import / Vault / Theme */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <Button
          size="sm"
          onClick={() => setImportModalOpen(true)}
          className="h-8 gap-1.5 px-3 text-xs font-semibold rounded-lg bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-primary-foreground hover:opacity-95 active:scale-[0.98] transition-all shrink-0"
        >
          <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
          <span className="hidden sm:inline">{t('nav.importCourse')}</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setVaultModalOpen(true)}
          className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-all shrink-0"
          title={currentVault ? currentVault.path : t('nav.changeVault')}
        >
          <FolderOpen className="h-3.5 w-3.5 text-primary" />
          <span className="hidden lg:inline max-w-[120px] truncate font-medium">
            {currentVault?.name || t('nav.changeVault')}
          </span>
        </Button>

        {/* Studio Theme Editor Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => useNavigationStore.getState().setThemeModalOpen(true)}
          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-lg shrink-0"
          title="Personalizar Aparência & Tema"
        >
          <span className="text-xs">🎨</span>
        </Button>

        {/* Local Profile Switcher Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => useNavigationStore.getState().setProfileModalOpen(true)}
          className="h-8 w-8 p-0 rounded-full hover:ring-2 hover:ring-primary/40 transition-all shrink-0 cursor-pointer overflow-hidden"
          title={`Perfil: ${activeProfile?.name || 'Principal'}`}
        >
          {activeProfile?.avatarPath ? (
            <img
              src={mediaUrl(activeProfile.avatarPath)}
              alt={activeProfile.name}
              className="h-7 w-7 rounded-full object-cover border border-border/80"
            />
          ) : (
            <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-orange-500 to-amber-400 text-white font-bold text-xs flex items-center justify-center shadow-xs">
              {activeProfile ? activeProfile.name.charAt(0).toUpperCase() : 'P'}
            </div>
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-lg shrink-0"
              aria-label={t('settings.theme')}
            >
              {theme === 'light' ? (
                <Sun className="h-4 w-4 text-amber-500" />
              ) : theme === 'dark' ? (
                <Moon className="h-4 w-4 text-indigo-400" />
              ) : (
                <Laptop className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36 rounded-xl border-border bg-card/95 backdrop-blur-md shadow-xl">
            <DropdownMenuItem
              onClick={() => setTheme('light')}
              className="flex items-center gap-2 text-xs cursor-pointer py-1.5 rounded-lg"
            >
              <Sun className="h-3.5 w-3.5 text-amber-500" />
              <span>{t('settings.themeLight')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTheme('dark')}
              className="flex items-center gap-2 text-xs cursor-pointer py-1.5 rounded-lg"
            >
              <Moon className="h-3.5 w-3.5 text-indigo-400" />
              <span>{t('settings.themeDark')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTheme('system')}
              className="flex items-center gap-2 text-xs cursor-pointer py-1.5 rounded-lg"
            >
              <Laptop className="h-3.5 w-3.5 text-slate-400" />
              <span>{t('settings.themeSystem')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}