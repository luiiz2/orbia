import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
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
import { Button } from '../ui/button'
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
  onTogglePlay: () => void
  onSeek: (time: number) => void
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
  onTogglePlay,
  onSeek,
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
        'w-full bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-3 pt-8 select-none transition-opacity duration-300',
        className
      )}
    >
      {/* Top: Interactive Progress Bar */}
      <ProgressBar
        currentTime={currentTime}
        duration={duration}
        bufferedEnd={bufferedEnd}
        onSeek={onSeek}
        className="mb-2"
      />

      {/* Bottom Controls Row */}
      <div className="flex items-center justify-between gap-2 text-white">
        {/* Left: Playback & Volume */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Previous Lesson */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onPrevLesson}
            disabled={!hasPrevLesson}
            className="h-8 w-8 text-white/90 hover:bg-white/10 hover:text-white disabled:opacity-40"
            title={t('player.prevLesson')}
            aria-label={t('player.prevLesson')}
          >
            <SkipBack className="h-4 w-4" />
          </Button>

          {/* Play / Pause Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onTogglePlay}
            className="h-9 w-9 rounded-full bg-white/10 text-white hover:bg-white/20 hover:scale-105 active:scale-95 transition-transform"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4 fill-current" />
            ) : (
              <Play className="h-4 w-4 fill-current ml-0.5" />
            )}
          </Button>

          {/* Next Lesson */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onNextLesson}
            disabled={!hasNextLesson}
            className="h-8 w-8 text-white/90 hover:bg-white/10 hover:text-white disabled:opacity-40"
            title={t('player.nextLesson')}
            aria-label={t('player.nextLesson')}
          >
            <SkipForward className="h-4 w-4" />
          </Button>

          {/* Volume Control */}
          <VolumeControl
            volume={volume}
            isMuted={isMuted}
            onVolumeChange={onVolumeChange}
            onToggleMute={onToggleMute}
          />

          {/* Timestamp Display */}
          <div className="ml-2 flex items-center gap-1 font-mono text-xs text-white/80 select-none">
            <span className="font-semibold text-white">{formatTime(currentTime)}</span>
            <span>/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: Actions, Speed, Subtitles, PiP & Display Mode */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Mark Complete Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCompletion}
            className={cn(
              'h-8 px-2.5 text-xs font-medium gap-1.5 transition-colors',
              isCompleted
                ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                : 'text-white/80 hover:bg-white/10 hover:text-white'
            )}
            title={isCompleted ? t('player.completed') : t('player.markCompleted')}
          >
            {isCompleted ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Circle className="h-3.5 w-3.5 opacity-60" />
            )}
            <span className="hidden md:inline">
              {isCompleted ? t('player.completed') : t('player.markCompleted')}
            </span>
          </Button>

          {/* Subtitles Menu */}
          <SubtitleMenu />

          {/* Picture-in-Picture Toggle */}
          {onTogglePiP && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onTogglePiP}
              className={cn(
                'h-8 w-8 text-white/90 hover:bg-white/10 hover:text-white transition-colors',
                isPiP && 'text-primary'
              )}
              title={`${t('player.pip')} (P)`}
              aria-label={t('player.pip')}
            >
              <PictureInPicture2 className="h-4 w-4" />
            </Button>
          )}

          {/* Speed Selector */}
          <SpeedMenu playbackRate={playbackRate} onRateChange={onRateChange} />

          {/* Theater Mode Toggle (Optional) */}
          {onToggleTheater && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleTheater}
              className={cn(
                'h-8 w-8 text-white/90 hover:bg-white/10 hover:text-white hidden sm:inline-flex',
                theaterMode && 'text-primary'
              )}
              title="Theater Mode"
              aria-label="Theater Mode"
            >
              <Tv className="h-4 w-4" />
            </Button>
          )}

          {/* Fullscreen Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleFullscreen}
            className="h-8 w-8 text-white/90 hover:bg-white/10 hover:text-white"
            title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize className="h-4 w-4" />
            ) : (
              <Maximize className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
