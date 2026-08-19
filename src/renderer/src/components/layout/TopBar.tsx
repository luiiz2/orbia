import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Search,
  Sun,
  Moon,
  Laptop,
  FolderOpen,
  BookOpen,
  History,
  Settings,
  Tv,
  X
} from 'lucide-react'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { useVaultStore } from '../../stores/useVaultStore'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { useTheme } from './ThemeProvider'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../ui/dropdown-menu'

export function TopBar(): React.JSX.Element {
  const { t } = useTranslation()
  const { searchQuery, setSearchQuery } = useLibraryStore()
  const { currentVault } = useVaultStore()
  const { currentView, setVaultModalOpen } = useNavigationStore()
  const { theme, setTheme } = useTheme()

  const getViewTitle = (): string => {
    switch (currentView) {
      case 'home':
        return t('nav.library')
      case 'course':
        return t('nav.library')
      case 'player':
        return t('player.curriculum')
      case 'history':
        return t('nav.history')
      case 'settings':
        return t('nav.settings')
      default:
        return t('app.name')
    }
  }

  const getViewIcon = (): React.ReactNode => {
    switch (currentView) {
      case 'home':
      case 'course':
        return <BookOpen className="h-4.5 w-4.5 text-primary" />
      case 'player':
        return <Tv className="h-4.5 w-4.5 text-primary" />
      case 'history':
        return <History className="h-4.5 w-4.5 text-primary" />
      case 'settings':
        return <Settings className="h-4.5 w-4.5 text-primary" />
      default:
        return null
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-border/80 bg-card/70 px-4 backdrop-blur-xl transition-colors select-none">
      {/* Left: View Title & Icon */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/80 text-primary shrink-0 shadow-sm">
          {getViewIcon()}
        </div>
        <h1 className="text-sm font-bold tracking-tight text-foreground truncate">
          {getViewTitle()}
        </h1>
      </div>

      {/* Center: Global Search Input */}
      <div className="mx-4 flex flex-1 max-w-md items-center">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder={`${t('common.search')}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8.5 w-full rounded-xl bg-secondary/40 pl-9 pr-8 text-xs border-border/80 text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/60 focus-visible:border-primary/50 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary cursor-pointer"
              title="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Right: Vault switcher & Theme toggle */}
      <div className="flex items-center gap-2">
        {/* Vault Switch Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setVaultModalOpen(true)}
          className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground border-border/80 bg-secondary/30 hover:bg-secondary/70 hover:border-primary/40 rounded-xl transition-all"
          title={currentVault ? currentVault.path : t('nav.changeVault')}
        >
          <FolderOpen className="h-3.5 w-3.5 text-primary" />
          <span className="hidden md:inline max-w-[120px] truncate font-medium">
            {currentVault?.name || t('nav.changeVault')}
          </span>
        </Button>

        {/* Theme Selector Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded-xl"
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

