import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useTranslation } from 'react-i18next'
import { Captions, Check } from 'lucide-react'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '../ui/dropdown-menu'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { cn } from '../../lib/utils'

export interface SubtitleMenuProps {
  className?: string
}

export function SubtitleMenu({
  className
}: SubtitleMenuProps): React.JSX.Element {
  const { t } = useTranslation()
  const { subtitleTracks, activeSubtitleTrack, setSubtitleTrack } =
    usePlayerStore(
      useShallow((state) => ({
        subtitleTracks: state.subtitleTracks,
        activeSubtitleTrack: state.activeSubtitleTrack,
        setSubtitleTrack: state.setSubtitleTrack
      }))
    )

  const hasSubtitles = subtitleTracks.length > 0
  const isSubtitlesActive = activeSubtitleTrack !== null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-8 w-8 text-white/90 hover:bg-white/10 hover:text-white transition-colors relative',
            isSubtitlesActive && 'text-primary hover:text-primary',
            className
          )}
          title={`${t('player.subtitles')} (C)`}
          aria-label={t('player.subtitles')}
        >
          <Captions className="h-4 w-4" />
          {isSubtitlesActive && (
            <span className="absolute bottom-1 h-1 w-1 rounded-full bg-primary" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="top"
        sideOffset={8}
        className="w-48 bg-black/90 text-white border-white/20 backdrop-blur-md p-1 z-50"
      >
        <DropdownMenuLabel className="text-[11px] font-semibold text-zinc-400 px-2 py-1 flex items-center justify-between">
          <span>{t('player.subtitles')}</span>
          <kbd className="px-1 py-0.2 rounded bg-white/10 text-[9px] font-mono border border-white/10">
            C
          </kbd>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/10" />

        {/* Off Option */}
        <DropdownMenuItem
          onClick={() => setSubtitleTrack(null)}
          className={cn(
            'flex items-center justify-between text-xs py-1.5 px-2 cursor-pointer rounded transition-colors text-white/80 hover:bg-white/20 hover:text-white',
            activeSubtitleTrack === null && 'font-bold text-white bg-white/15'
          )}
        >
          <span>{t('player.subtitlesOff')}</span>
          {activeSubtitleTrack === null && (
            <Check className="h-3.5 w-3.5 text-primary" />
          )}
        </DropdownMenuItem>

        {/* Track Options */}
        {hasSubtitles ? (
          subtitleTracks.map((track) => {
            const isSelected = activeSubtitleTrack === track.id
            return (
              <DropdownMenuItem
                key={track.id}
                onClick={() => setSubtitleTrack(track.id)}
                className={cn(
                  'flex min-w-0 items-start justify-between text-xs py-1.5 px-2 cursor-pointer rounded transition-colors text-white/80 hover:bg-white/20 hover:text-white',
                  isSelected && 'font-bold text-white bg-white/15'
                )}
              >
                <span className="min-w-0 flex-1 break-words whitespace-normal leading-snug">
                  {track.label}
                </span>
                {isSelected && (
                  <Check className="h-3.5 w-3.5 text-primary shrink-0 ml-2" />
                )}
              </DropdownMenuItem>
            )
          })
        ) : (
          <div className="px-2 py-1.5 text-[11px] text-zinc-500 italic">
            {t('player.noSubtitlesAvailable', {
              defaultValue: 'Nenhuma legenda encontrada'
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
