import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Keyboard,
  Search,
  Monitor,
  PlaySquare,
  BookOpen,
  X
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '../ui/dialog'
import { Input } from '../ui/input'

interface KeyboardShortcutsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ShortcutItem {
  id: string
  keys: string[]
  descriptionKey: string
  category: 'general' | 'player' | 'study'
}

const SHORTCUTS_DATA: ShortcutItem[] = [
  // General & Navigation
  {
    id: 'search',
    keys: ['Ctrl', 'K'],
    descriptionKey: 'shortcuts.openSearch',
    category: 'general'
  },
  {
    id: 'import',
    keys: ['Ctrl', 'I'],
    descriptionKey: 'shortcuts.openImport',
    category: 'general'
  },
  {
    id: 'settings',
    keys: ['Ctrl', ','],
    descriptionKey: 'shortcuts.openSettings',
    category: 'general'
  },
  {
    id: 'help',
    keys: ['?'],
    descriptionKey: 'shortcuts.openShortcuts',
    category: 'general'
  },
  {
    id: 'close',
    keys: ['Esc'],
    descriptionKey: 'shortcuts.closeModal',
    category: 'general'
  },
  {
    id: 'tabs',
    keys: ['Alt', '1-5'],
    descriptionKey: 'shortcuts.switchTabs',
    category: 'general'
  },

  // Video Player
  {
    id: 'play_pause',
    keys: ['Espaço', 'K'],
    descriptionKey: 'shortcuts.playPause',
    category: 'player'
  },
  {
    id: 'seek_5',
    keys: ['←', '→'],
    descriptionKey: 'shortcuts.seekBackward',
    category: 'player'
  },
  {
    id: 'seek_10',
    keys: ['J', 'L'],
    descriptionKey: 'shortcuts.seekBackward10',
    category: 'player'
  },
  {
    id: 'volume',
    keys: ['↑', '↓'],
    descriptionKey: 'shortcuts.volumeUp',
    category: 'player'
  },
  {
    id: 'mute',
    keys: ['M'],
    descriptionKey: 'shortcuts.toggleMute',
    category: 'player'
  },
  {
    id: 'fullscreen',
    keys: ['F'],
    descriptionKey: 'shortcuts.toggleFullscreen',
    category: 'player'
  },
  {
    id: 'subtitles',
    keys: ['C'],
    descriptionKey: 'shortcuts.toggleSubtitles',
    category: 'player'
  },
  {
    id: 'pip',
    keys: ['P'],
    descriptionKey: 'shortcuts.togglePip',
    category: 'player'
  },
  {
    id: 'speed',
    keys: ['<', '>'],
    descriptionKey: 'shortcuts.speedUp',
    category: 'player'
  },
  {
    id: 'next_lesson',
    keys: ['N'],
    descriptionKey: 'shortcuts.nextLesson',
    category: 'player'
  },
  {
    id: 'bookmark',
    keys: ['B'],
    descriptionKey: 'shortcuts.addBookmark',
    category: 'player'
  },

  // Study & Notes
  {
    id: 'new_note',
    keys: ['Shift', 'N'],
    descriptionKey: 'shortcuts.newNote',
    category: 'study'
  },
  {
    id: 'save_note',
    keys: ['Ctrl', 'Enter'],
    descriptionKey: 'shortcuts.saveNote',
    category: 'study'
  }
]

export function KeyboardShortcutsModal({
  open,
  onOpenChange
}: KeyboardShortcutsModalProps): React.JSX.Element {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')

  const filteredShortcuts = useMemo(() => {
    if (!searchQuery.trim()) return SHORTCUTS_DATA
    const q = searchQuery.toLowerCase()
    return SHORTCUTS_DATA.filter((item) => {
      const desc = t(item.descriptionKey).toLowerCase()
      const keyStr = item.keys.join(' ').toLowerCase()
      return desc.includes(q) || keyStr.includes(q)
    })
  }, [searchQuery, t])

  const generalItems = useMemo(
    () => filteredShortcuts.filter((s) => s.category === 'general'),
    [filteredShortcuts]
  )
  const playerItems = useMemo(
    () => filteredShortcuts.filter((s) => s.category === 'player'),
    [filteredShortcuts]
  )
  const studyItems = useMemo(
    () => filteredShortcuts.filter((s) => s.category === 'study'),
    [filteredShortcuts]
  )

  const renderCategory = (
    title: string,
    icon: React.ReactNode,
    items: ShortcutItem[]
  ): React.ReactNode => {
    if (items.length === 0) return null

    return (
      <div className="space-y-2.5">
        <div className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {icon}
          <span>{title}</span>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card divide-y divide-border/40 overflow-hidden shadow-xs">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between px-3.5 py-2.5 hover:bg-secondary/30 transition-colors text-xs"
            >
              <span className="font-medium text-foreground">
                {t(item.descriptionKey)}
              </span>
              <div className="flex items-center gap-1">
                {item.keys.map((k) => (
                  <kbd
                    key={k}
                    className="inline-flex min-w-[24px] items-center justify-center rounded-lg border border-border/90 bg-secondary/60 px-2 py-0.5 font-mono text-[11px] font-semibold text-foreground shadow-2xs"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
        <DialogHeader className="p-6 pb-4 border-b border-border/70">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/80 bg-secondary/50 text-primary shadow-inner">
              <Keyboard className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                {t('shortcuts.title', 'Atalhos de Teclado')}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {t(
                  'shortcuts.subtitle',
                  'Navegue e controle seus estudos rapidamente sem usar o mouse.'
                )}
              </DialogDescription>
            </div>
          </div>

          <div className="relative mt-4">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('shortcuts.searchPlaceholder', 'Buscar atalho...')}
              className="pl-9 pr-8 bg-secondary/40 border-border/80 text-xs rounded-xl focus-visible:ring-1"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {filteredShortcuts.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              Nenhum atalho correspondente para &quot;{searchQuery}&quot;.
            </div>
          ) : (
            <>
              {renderCategory(
                t('shortcuts.categoryGeneral', 'Geral & Navegação'),
                <Monitor className="h-3.5 w-3.5 text-primary" />,
                generalItems
              )}
              {renderCategory(
                t('shortcuts.categoryPlayer', 'Player de Vídeo'),
                <PlaySquare className="h-3.5 w-3.5 text-primary" />,
                playerItems
              )}
              {renderCategory(
                t('shortcuts.categoryStudy', 'Estudo & Anotações'),
                <BookOpen className="h-3.5 w-3.5 text-primary" />,
                studyItems
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
