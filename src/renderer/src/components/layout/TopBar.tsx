import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Search,
  Sun,
  Moon,
  Laptop,
  FolderOpen,
  Plus,
  X,
  Sparkles,
  HelpCircle,
  Palette,
  HardDriveDownload,
  MoreHorizontal
} from 'lucide-react'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { useLibrarySearchStore } from '../../stores/useLibrarySearchStore'
import { useVaultStore } from '../../stores/useVaultStore'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { useProfileStore } from '../../stores/useProfileStore'
import { useOptimizerStore } from '../../stores/useOptimizerStore'
import { useGroundedChatStore } from '../../stores/useGroundedChatStore'
import { useTheme } from './ThemeProvider'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '../ui/dropdown-menu'
import { cn, mediaUrl } from '../../lib/utils'
import appLogo from '../../assets/icon.png'

export function TopBar(): React.JSX.Element {
  const { t } = useTranslation()
  const { searchQuery, setSearchQuery } = useLibraryStore()
  const { open: openLibrarySearch } = useLibrarySearchStore()
  const { currentVault } = useVaultStore()
  const { currentView, setView, setImportModalOpen, setVaultModalOpen } =
    useNavigationStore()
  const { activeProfile } = useProfileStore()
  const { setOptimizerModalOpen, queue } = useOptimizerStore()
  const { theme, setTheme } = useTheme()

  const navItems = [
    {
      id: 'home' as const,
      label: t('nav.library', 'Biblioteca'),
      isActive:
        currentView === 'home' ||
        currentView === 'course' ||
        currentView === 'player'
    },
    {
      id: 'discover' as const,
      label: t('nav.discover', 'Descobrir'),
      isActive: currentView === 'discover'
    },
    {
      id: 'review' as const,
      label: t('nav.review', 'Revisão'),
      isActive: currentView === 'review'
    },
    {
      id: 'history' as const,
      label: t('nav.history', 'Histórico'),
      isActive: currentView === 'history'
    },
    {
      id: 'settings' as const,
      label: t('nav.settings', 'Configurações'),
      isActive: currentView === 'settings'
    }
  ]

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center border-b border-border/60 bg-background/90 px-3 backdrop-blur-xl transition-colors select-none sm:px-4 lg:px-5">
      <div className="flex w-full min-w-0 items-center gap-2 lg:gap-3">
        {/* Left: brand and primary navigation */}
        <div className="flex min-w-0 flex-1 items-center gap-2 lg:gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <img
              src={appLogo}
              alt="Orbia"
              className="h-7 w-7 object-contain drop-shadow"
            />
            <span className="text-base font-extrabold tracking-tight text-orbia-mark hidden sm:inline">
              {t('app.name')}
            </span>
          </div>

          <nav
            aria-label="Navegação principal"
            className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                aria-current={item.isActive ? 'page' : undefined}
                className={cn(
                  'relative shrink-0 whitespace-nowrap rounded-md px-2 py-1.5 text-[12px] font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:px-2.5 lg:text-[13px]',
                  item.isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {item.label}
                {item.isActive && (
                  <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Center: dominant global search */}
        <div className="mx-1 flex min-w-0 flex-[1.35] items-center gap-1.5 sm:mx-2 sm:gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder={`${t('common.search')}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  openLibrarySearch(searchQuery, true)
                }
              }}
              aria-label={t('common.search')}
              aria-keyshortcuts="Enter"
              className="h-8.5 w-full rounded-lg border-border/60 bg-black/5 pl-9 pr-8 text-xs text-foreground transition-all placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/60 dark:bg-white/5"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-full p-0.5 text-muted-foreground hover:bg-black/10 hover:text-foreground dark:hover:bg-white/10"
                title="Clear search"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openLibrarySearch(searchQuery, true)}
            className="h-8.5 shrink-0 gap-1.5 rounded-lg px-2 text-xs sm:px-2.5"
            aria-label="Find in Library"
            title="Find in Library"
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden min-[1180px]:inline">Find in Library</span>
          </Button>
        </div>

        {/* Right: high-priority actions and secondary controls */}
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  useGroundedChatStore
                    .getState()
                    .open({ scope: { type: 'vault' } })
                }
                className="h-8.5 w-8.5 gap-1.5 rounded-lg border-primary/40 bg-primary/10 px-0 text-xs font-semibold text-primary shadow-xs transition-all hover:bg-primary/20 min-[1180px]:w-auto min-[1180px]:px-2.5"
                aria-label={t('chat.askOrbia', 'Perguntar à Orbia')}
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="hidden min-[1180px]:inline">
                  {t('chat.askOrbia', 'Perguntar à Orbia')}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t(
                'chat.askOrbiaTooltip',
                'Fazer perguntas sobre toda a sua biblioteca de cursos'
              )}
            </TooltipContent>
          </Tooltip>

          <Button
            size="sm"
            onClick={() => setImportModalOpen(true)}
            className="h-8.5 w-8.5 gap-1.5 rounded-lg bg-primary px-0 text-xs font-semibold text-primary-foreground transition-all hover:opacity-95 active:scale-[0.98] min-[1180px]:w-auto min-[1180px]:px-3"
            aria-label={t('nav.importCourse')}
            title={t('nav.importCourse')}
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            <span className="hidden min-[1180px]:inline">
              {t('nav.importCourse')}
            </span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setVaultModalOpen(true)}
            className="h-8.5 w-8.5 gap-1.5 rounded-lg px-0 text-xs text-muted-foreground transition-all hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5 min-[1180px]:w-auto min-[1180px]:px-2.5"
            title={currentVault ? currentVault.path : t('nav.changeVault')}
            aria-label={currentVault?.name || t('nav.changeVault')}
          >
            <FolderOpen className="h-3.5 w-3.5 text-primary" />
            <span className="hidden max-w-[120px] truncate font-medium min-[1180px]:inline">
              {currentVault?.name || t('nav.changeVault')}
            </span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8.5 w-8.5 rounded-lg text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
                aria-label="Mais opções"
                title="Mais opções"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className="w-64 rounded-xl border-border bg-card/95 p-1.5 shadow-xl backdrop-blur-md"
            >
              <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Mais opções
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="my-1" />

              <DropdownMenuItem
                onClick={() =>
                  useNavigationStore.getState().setThemeModalOpen(true)
                }
                className="gap-2 rounded-lg py-2 text-xs"
              >
                <Palette className="h-4 w-4 text-primary" />
                <span>
                  {t(
                    'settings.themeCustomizer',
                    'Personalizar Aparência & Tema'
                  )}
                </span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => setOptimizerModalOpen(true)}
                className="gap-2 rounded-lg py-2 text-xs"
              >
                <HardDriveDownload className="h-4 w-4 text-accent" />
                <span className="min-w-0 flex-1 truncate">
                  {t('optimizer.title', 'Otimizador de Armazenamento de Vídeo')}
                </span>
                {queue.some((q) => q.status === 'encoding') && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-primary animate-pulse"
                    aria-label="Otimização em andamento"
                  />
                )}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() =>
                  useNavigationStore.getState().setProfileModalOpen(true)
                }
                className="gap-2 rounded-lg py-2 text-xs"
              >
                {activeProfile?.avatarPath ? (
                  <img
                    src={mediaUrl(activeProfile.avatarPath)}
                    alt=""
                    className="h-4 w-4 rounded-full object-cover border border-border/80"
                  />
                ) : (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                    {activeProfile
                      ? activeProfile.name.charAt(0).toUpperCase()
                      : 'P'}
                  </span>
                )}
                <span>{`Perfil: ${activeProfile?.name || 'Principal'}`}</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() =>
                  useNavigationStore.getState().setShortcutsModalOpen(true)
                }
                className="gap-2 rounded-lg py-2 text-xs"
              >
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                <span>{t('shortcuts.title', 'Atalhos de Teclado')}</span>
                <kbd className="ml-auto rounded bg-secondary px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                  ?
                </kbd>
              </DropdownMenuItem>

              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2 rounded-lg py-2 text-xs">
                  {theme === 'light' ? (
                    <Sun className="h-4 w-4 text-primary" />
                  ) : theme === 'dark' ? (
                    <Moon className="h-4 w-4 text-accent" />
                  ) : (
                    <Laptop className="h-4 w-4" />
                  )}
                  <span>{t('settings.theme')}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-40 rounded-xl border-border bg-card/95 p-1.5 shadow-xl backdrop-blur-md">
                  <DropdownMenuItem
                    onClick={() => setTheme('light')}
                    className="gap-2 rounded-lg py-2 text-xs"
                  >
                    <Sun className="h-3.5 w-3.5 text-primary" />
                    <span>{t('settings.themeLight')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setTheme('dark')}
                    className="gap-2 rounded-lg py-2 text-xs"
                  >
                    <Moon className="h-3.5 w-3.5 text-accent" />
                    <span>{t('settings.themeDark')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setTheme('system')}
                    className="gap-2 rounded-lg py-2 text-xs"
                  >
                    <Laptop className="h-3.5 w-3.5 text-slate-400" />
                    <span>{t('settings.themeSystem')}</span>
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
