import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Rewind,
  FastForward,
  Maximize,
  Minimize,
  CheckCircle2,
  Circle,
  Tv,
  PictureInPicture2
} from 'lucide-react'
import { ProgressBar } from './ProgressBar'
import { VolumeControl } from './VolumeControl'
import { SpeedMenu } from './SpeedMenu'
import { SubtitleMenu } from './SubtitleMenu'
import { Button, Tooltip, TooltipTrigger, TooltipContent } from '../ui'
import { formatTime } from '../../lib/formatters'
import { cn } from '../../lib/utils'

export interface PlayerControlsProps {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
  playbackRate: number
  isFullscreen: boolean
  isPiP?: boolean
  theaterMode?: boolean
  isCompleted?: boolean
  hasNextLesson: boolean
  hasPrevLesson: boolean
  bufferedEnd?: number
  notes?: import('@shared').LessonNote[]
  bookmarks?: import('@shared').VideoBookmark[]
  onTogglePlay: () => void
  onSeek: (time: number) => void
  onSeekRelative: (deltaSeconds: number) => void
  onVolumeChange: (vol: number) => void
  onToggleMute: () => void
  onRateChange: (rate: number) => void
  onToggleFullscreen: () => void
  onTogglePiP?: () => void
  onToggleTheater?: () => void
  onToggleCompletion: () => void
  onNextLesson: () => void
  onPrevLesson: () => void
  className?: string
}

export function PlayerControls({
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  playbackRate,
  isFullscreen,
  isPiP,
  theaterMode,
  isCompleted,
  hasNextLesson,
  hasPrevLesson,
  bufferedEnd,
  notes,
  bookmarks,
  onTogglePlay,
  onSeek,
  onSeekRelative,
  onVolumeChange,
  onToggleMute,
  onRateChange,
  onToggleFullscreen,
  onTogglePiP,
  onToggleTheater,
  onToggleCompletion,
  onNextLesson,
  onPrevLesson,
  className
}: PlayerControlsProps): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'w-full bg-gradient-to-t from-black/95 via-black/70 to-transparent px-4 pb-3.5 pt-10 select-none transition-opacity duration-300',
        className
      )}
    >
      {/* Top: Interactive Progress Bar */}
      <ProgressBar
        currentTime={currentTime}
        duration={duration}
        bufferedEnd={bufferedEnd}
        notes={notes}
        bookmarks={bookmarks}
        onSeek={onSeek}
        className="mb-2"
      />

      {/* Bottom Controls Row */}
      <div className="flex items-center justify-between gap-2 text-white">
        {/* Left: Playback & Volume */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Previous Lesson */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onPrevLesson}
                disabled={!hasPrevLesson}
                className="h-8.5 w-8.5 rounded-xl text-white/90 hover:bg-white/15 hover:text-white disabled:opacity-30 cursor-pointer"
                aria-label={t('player.prevLesson')}
              >
                <SkipBack className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="flex items-center gap-1.5 bg-black/90 text-white border-white/20">
              <span>{t('player.prevLesson')}</span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-mono">Shift+P</kbd>
            </TooltipContent>
          </Tooltip>

          {/* Rewind 5s */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onSeekRelative(-5)}
                className="h-8.5 w-8.5 rounded-xl text-white/90 hover:bg-white/15 hover:text-white cursor-pointer"
                aria-label={t('player.rewind5')}
              >
                <Rewind className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="flex items-center gap-1.5 bg-black/90 text-white border-white/20">
              <span>{t('player.rewind5')}</span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-mono">←</kbd>
            </TooltipContent>
          </Tooltip>

          {/* Play / Pause Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onTogglePlay}
                className="h-9.5 w-9.5 rounded-full bg-white/15 text-white hover:bg-white/25 hover:scale-105 active:scale-95 transition-all shadow-md shadow-black/40 cursor-pointer"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="h-4.5 w-4.5 fill-current" />
                ) : (
                  <Play className="h-4.5 w-4.5 fill-current ml-0.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="flex items-center gap-1.5 bg-black/90 text-white border-white/20">
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-mono">Space</kbd>
            </TooltipContent>
          </Tooltip>

          {/* Forward 5s */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onSeekRelative(5)}
                className="h-8.5 w-8.5 rounded-xl text-white/90 hover:bg-white/15 hover:text-white cursor-pointer"
                aria-label={t('player.forward5')}
              >
                <FastForward className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="flex items-center gap-1.5 bg-black/90 text-white border-white/20">
              <span>{t('player.forward5')}</span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-mono">→</kbd>
            </TooltipContent>
          </Tooltip>

          {/* Next Lesson */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onNextLesson}
                disabled={!hasNextLesson}
                className="h-8.5 w-8.5 rounded-xl text-white/90 hover:bg-white/15 hover:text-white disabled:opacity-30 cursor-pointer"
                aria-label={t('player.nextLesson')}
              >
                <SkipForward className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="flex items-center gap-1.5 bg-black/90 text-white border-white/20">
              <span>{t('player.nextLesson')}</span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-mono">Shift+N</kbd>
            </TooltipContent>
          </Tooltip>

          {/* Volume Control */}
          <VolumeControl
            volume={volume}
            isMuted={isMuted}
            onVolumeChange={onVolumeChange}
            onToggleMute={onToggleMute}
          />

          {/* Timestamp Display */}
          <div className="ml-2 flex items-center gap-1 font-mono text-xs text-white/80 select-none">
            <span className="font-bold text-white">{formatTime(currentTime)}</span>
            <span className="opacity-60">/</span>
            <span className="opacity-80">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: Actions, Speed, Subtitles, PiP & Display Mode */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Mark Complete Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleCompletion}
                className={cn(
                  'h-8 px-2.5 text-xs font-medium gap-1.5 rounded-xl transition-all cursor-pointer',
                  isCompleted
                    ? 'bg-emerald-500/25 text-emerald-300 hover:bg-emerald-500/35 border border-emerald-500/40'
                    : 'text-white/80 hover:bg-white/15 hover:text-white'
                )}
                aria-label={isCompleted ? t('player.completed') : t('player.markCompleted')}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Circle className="h-3.5 w-3.5 opacity-60" />
                )}
                <span className="hidden md:inline font-semibold">
                  {isCompleted ? t('player.completed') : t('player.markCompleted')}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-black/90 text-white border-white/20">
              {isCompleted ? t('player.completed') : t('player.markCompleted')}
            </TooltipContent>
          </Tooltip>

          {/* Subtitles Menu */}
          <SubtitleMenu />

          {/* Picture-in-Picture Toggle */}
          {onTogglePiP && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onTogglePiP}
                  className={cn(
                    'h-8 w-8 rounded-xl text-white/90 hover:bg-white/15 hover:text-white transition-colors cursor-pointer',
                    isPiP && 'text-primary'
                  )}
                  aria-label={t('player.pip')}
                >
                  <PictureInPicture2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="flex items-center gap-1.5 bg-black/90 text-white border-white/20">
                <span>{t('player.pip')}</span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-mono">P</kbd>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Speed Selector */}
          <SpeedMenu playbackRate={playbackRate} onRateChange={onRateChange} />

          {/* Theater Mode Toggle */}
          {onToggleTheater && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggleTheater}
                  className={cn(
                    'h-8 w-8 rounded-xl text-white/90 hover:bg-white/15 hover:text-white hidden sm:inline-flex cursor-pointer',
                    theaterMode && 'text-primary bg-white/10'
                  )}
                  aria-label="Theater Mode"
                >
                  <Tv className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="bg-black/90 text-white border-white/20">
                Theater Mode
              </TooltipContent>
            </Tooltip>
          )}

          {/* Fullscreen Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleFullscreen}
                className="h-8 w-8 rounded-xl text-white/90 hover:bg-white/15 hover:text-white cursor-pointer"
                aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? (
                  <Minimize className="h-4 w-4" />
                ) : (
                  <Maximize className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="flex items-center gap-1.5 bg-black/90 text-white border-white/20">
              <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-mono">F</kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
