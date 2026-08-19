import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  BookOpen,
  History,
  Settings,
  Plus,
  ChevronLeft,
  ChevronRight,
  Database
} from 'lucide-react'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { useVaultStore } from '../../stores/useVaultStore'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import { cn } from '../../lib/utils'
import appLogo from '../../assets/icon.png'

export function Sidebar(): React.JSX.Element {
  const { t } = useTranslation()
  const {
    currentView,
    setView,
    isSidebarCollapsed,
    toggleSidebar,
    setImportModalOpen,
    setVaultModalOpen
  } = useNavigationStore()
  const { currentVault } = useVaultStore()

  const navItems = [
    {
      id: 'home' as const,
      label: t('nav.library'),
      icon: BookOpen
    },
    {
      id: 'history' as const,
      label: t('nav.history'),
      icon: History
    },
    {
      id: 'settings' as const,
      label: t('nav.settings'),
      icon: Settings
    }
  ]

  return (
    <TooltipProvider delayDuration={150}>
      <aside
        className={cn(
          'relative flex flex-col border-r border-border/80 bg-card/85 backdrop-blur-xl transition-all duration-300 ease-in-out select-none z-20',
          isSidebarCollapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between px-3.5 border-b border-border/70 bg-gradient-to-r from-card via-card/90 to-secondary/20">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl p-0.5 bg-gradient-to-br from-orange-500/20 via-purple-600/15 to-blue-600/10 border border-border shadow-md shadow-orange-500/10 hover:scale-105 transition-transform duration-200">
              <img
                src={appLogo}
                alt="Orbia"
                className="h-full w-full object-contain rounded-lg drop-shadow"
              />
            </div>
            {!isSidebarCollapsed && (
              <div className="flex flex-col overflow-hidden">
                <span className="text-base font-extrabold tracking-tight text-orbia-gradient truncate">
                  {t('app.name')}
                </span>
                <span className="text-[10px] text-muted-foreground truncate font-medium tracking-wide">
                  {t('app.tagline')}
                </span>
              </div>
            )}
          </div>

          {/* Collapse Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className={cn(
              'h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-secondary/80 shrink-0 rounded-lg',
              isSidebarCollapsed && 'hidden'
            )}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        {/* Action Button: Import Course */}
        <div className="p-3">
          {isSidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="icon"
                  onClick={() => setImportModalOpen(true)}
                  className="w-10 h-10 mx-auto rounded-xl bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-white font-semibold shadow-md shadow-orange-500/25 hover:shadow-orange-500/40 hover:scale-105 active:scale-95 transition-all"
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-medium">
                {t('nav.importCourse')}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => setImportModalOpen(true)}
              className="w-full justify-center gap-2 font-semibold shadow-md shadow-orange-500/20 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-white hover:opacity-95 hover:shadow-orange-500/30 active:scale-[0.98] transition-all h-9.5 rounded-xl cursor-pointer"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>{t('nav.importCourse')}</span>
            </Button>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1.5 px-2.5 py-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive =
              currentView === item.id ||
              (item.id === 'home' && (currentView === 'course' || currentView === 'player'))

            const buttonContent = (
              <button
                type="button"
                onClick={() => setView(item.id)}
                className={cn(
                  'flex w-full items-center rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer relative overflow-hidden',
                  isSidebarCollapsed ? 'h-10 justify-center px-0' : 'h-10 justify-start gap-3 px-3',
                  isActive
                    ? 'bg-gradient-to-r from-orange-500/15 via-purple-600/10 to-transparent text-primary font-semibold border-l-2 border-primary shadow-sm'
                    : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
                )}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0 transition-transform duration-200',
                    isActive ? 'text-primary scale-110' : 'text-muted-foreground'
                  )}
                />
                {!isSidebarCollapsed && (
                  <span className="truncate tracking-tight">{item.label}</span>
                )}
              </button>
            )

            if (isSidebarCollapsed) {
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
                  <TooltipContent side="right" className="font-medium">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              )
            }

            return <div key={item.id}>{buttonContent}</div>
          })}
        </nav>

        {/* Vault Information & Switch Footer */}
        <div className="border-t border-border/70 p-2.5 bg-card/50">
          {isSidebarCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setVaultModalOpen(true)}
                    className="h-10 w-10 text-muted-foreground hover:text-primary hover:bg-secondary/80 rounded-xl"
                  >
                    <Database className="h-4 w-4 text-primary" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="font-semibold">{currentVault?.name || t('nav.changeVault')}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{currentVault?.path}</p>
                </TooltipContent>
              </Tooltip>

              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg"
                title="Expand sidebar"
                aria-label="Expand sidebar"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-border/70 bg-secondary/30 p-2.5 hover:border-primary/40 transition-colors">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground overflow-hidden">
                  <Database className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate max-w-[120px]">{currentVault?.name || 'Vault'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setVaultModalOpen(true)}
                  className="text-[11px] text-primary hover:underline cursor-pointer font-medium shrink-0"
                >
                  {t('nav.changeVault')}
                </button>
              </div>
              <p
                className="text-[10px] text-muted-foreground truncate font-mono"
                title={currentVault?.path || ''}
              >
                {currentVault?.path || 'No vault loaded'}
              </p>
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
}

