import React, { useRef, useEffect } from 'react'
import {
  Play,
  Pause,
  Maximize2,
  X,
  RotateCcw,
  RotateCw,
  SkipForward
} from 'lucide-react'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { mediaUrl } from '../../lib/utils'
import { formatTime } from '../../lib/formatters'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'

export function MiniPlayer(): React.JSX.Element | null {
  const {
    activeLesson,
    activeCourse,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    playbackRate,
    isMiniPlayerActive,
    play,
    pause,
    seek,
    nextLesson,
    dismissMiniPlayer,
    updateProgress
  } = usePlayerStore()

  const { currentView, navigateToPlayer } = useNavigationStore()
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const isVisible = Boolean(
    isMiniPlayerActive && currentView !== 'player' && activeLesson
  )

  // Sync playback state with video element (always called, guarded internally)
  useEffect(() => {
    if (!isVisible) return
    const video = videoRef.current
    if (!video) return

    if (isPlaying) {
      video
        .play()
        .catch((err) => console.warn('MiniPlayer autoplay prevented:', err))
    } else {
      video.pause()
    }
  }, [isVisible, isPlaying])

  useEffect(() => {
    if (!isVisible) return
    const video = videoRef.current
    if (!video) return
    video.volume = isMuted ? 0 : volume
  }, [isVisible, volume, isMuted])

  useEffect(() => {
    if (!isVisible) return
    const video = videoRef.current
    if (!video) return
    video.playbackRate = playbackRate
  }, [isVisible, playbackRate])

  // Sync initial position when mounted or activeLesson changes
  useEffect(() => {
    if (!isVisible) return
    const video = videoRef.current
    if (!video) return
    if (Math.abs(video.currentTime - currentTime) > 1.5) {
      video.currentTime = currentTime
    }
  }, [isVisible, activeLesson?.id])

  // If not visible, return null AFTER all hooks are called
  if (!isVisible || !activeLesson) {
    return null
  }

  const isVideo =
    activeLesson.mediaType === 'video' ||
    activeLesson.fileExtension?.toLowerCase() === 'mp4' ||
    activeLesson.fileExtension?.toLowerCase() === 'mkv' ||
    activeLesson.fileExtension?.toLowerCase() === 'webm'

  const handleTimeUpdate = (): void => {
    const video = videoRef.current
    if (!video) return
    // Throttled update to store
    if (Math.abs(video.currentTime - currentTime) >= 1) {
      updateProgress(video.currentTime, video.duration || duration)
    }
  }

  const handleExpand = (): void => {
    if (activeCourse) {
      navigateToPlayer(activeCourse.id)
    } else {
      navigateToPlayer()
    }
  }

  const percentage = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div
      role="region"
      aria-label="Mini Player de Vídeo"
      className="fixed bottom-6 right-6 z-50 w-72 sm:w-84 md:w-96 aspect-video rounded-2xl bg-black/95 border border-white/20 shadow-2xl shadow-black/80 overflow-hidden group select-none transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
    >
      {/* Video Element */}
      {isVideo ? (
        <video
          ref={videoRef}
          src={mediaUrl(activeLesson.filePath)}
          className="w-full h-full object-contain bg-black"
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => nextLesson()}
          playsInline
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase font-mono tracking-wider">
            Documento em Estudo
          </p>
          <h4 className="text-sm font-semibold text-white mt-1 line-clamp-1">
            {activeLesson.title}
          </h4>
        </div>
      )}

      {/* Top Controls Overlay (Hover) */}
      <div className="absolute top-0 inset-x-0 p-2.5 bg-gradient-to-b from-black/90 via-black/40 to-transparent flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-30">
        <div className="flex-1 min-w-0 pr-2">
          <h4 className="text-xs font-semibold text-white truncate drop-shadow-sm">
            {activeLesson.title}
          </h4>
          {activeCourse && (
            <p className="text-[10px] text-slate-300/80 truncate">
              {activeCourse.title}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleExpand}
                aria-label="Expandir para o player completo"
                className="p-1.5 rounded-lg bg-black/60 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Expandir
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={dismissMiniPlayer}
                aria-label="Fechar mini player"
                className="p-1.5 rounded-lg bg-black/60 hover:bg-rose-500/80 text-white transition-colors cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Fechar
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Center / Bottom Playback Controls Overlay (Hover) */}
      <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20 pointer-events-none">
        <button
          type="button"
          onClick={() => {
            const video = videoRef.current
            if (video) {
              const target = Math.max(0, video.currentTime - 10)
              video.currentTime = target
              seek(target)
            }
          }}
          aria-label="Voltar 10 segundos"
          className="p-2 rounded-full bg-black/60 hover:bg-black/85 text-white pointer-events-auto transition-transform hover:scale-110 cursor-pointer shadow-md"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => (isPlaying ? pause() : play())}
          aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
          className="p-3 rounded-full bg-primary text-primary-foreground pointer-events-auto transition-transform hover:scale-110 cursor-pointer shadow-lg shadow-primary/30"
        >
          {isPlaying ? (
            <Pause className="h-5 w-5 fill-current" />
          ) : (
            <Play className="h-5 w-5 fill-current ml-0.5" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            const video = videoRef.current
            if (video) {
              const target = Math.min(
                video.duration || duration,
                video.currentTime + 10
              )
              video.currentTime = target
              seek(target)
            }
          }}
          aria-label="Avançar 10 segundos"
          className="p-2 rounded-full bg-black/60 hover:bg-black/85 text-white pointer-events-auto transition-transform hover:scale-110 cursor-pointer shadow-md"
        >
          <RotateCw className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => nextLesson()}
          aria-label="Próxima aula"
          className="p-2 rounded-full bg-black/60 hover:bg-black/85 text-white pointer-events-auto transition-transform hover:scale-110 cursor-pointer shadow-md"
        >
          <SkipForward className="h-4 w-4" />
        </button>
      </div>

      {/* Bottom Bar: Timestamps and Progress */}
      <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col justify-end z-20 pointer-events-none">
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-300 px-0.5 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Progress Line */}
        <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-150"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  )
}
