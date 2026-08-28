import React, { useRef, useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, ChevronLeft, FastForward, X, AlertCircle, Trash2 } from 'lucide-react'
import { usePlayer } from '../../hooks/usePlayer'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { PlayerControls } from './PlayerControls'
import { FocusTimer } from './FocusTimer'
import { DocumentLessonView } from './DocumentLessonView'
import { Button, Tooltip, TooltipTrigger, TooltipContent } from '../ui'
import { cn, mediaUrl } from '../../lib/utils'

export interface VideoPlayerProps {
  className?: string
  onBack?: () => void
}

export function VideoPlayer({ className, onBack }: VideoPlayerProps): React.JSX.Element {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const {
    activeCourse,
    activeLesson,
    activeModule,
    theaterMode,
    toggleTheater,
    notes,
    bookmarks,
    chapters,
    subtitleTracks,
    activeSubtitleTrack,
    progressMap,
    markLessonBroken,
    deleteLesson,
    setMiniPlayerActive
  } = usePlayerStore()
  const { setView } = useNavigationStore()

  const [bufferedEnd, setBufferedEnd] = useState<number>(0)
  const [isBuffering, setIsBuffering] = useState<boolean>(false)
  const [isVideoError, setIsVideoError] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string>('')

  const {
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    playbackRate,
    isFullscreen,
    isPiP,
    showControls,
    autoAdvanceCountdown,
    nextLessonTitle,
    hasNextLesson,
    hasPrevLesson,
    togglePlay,
    seekTo,
    seekRelative,
    setVolume,
    toggleMute,
    setPlaybackRate,
    toggleFullscreen,
    togglePiP,
    toggleCompletion,
    nextLesson,
    prevLesson,
    cancelAutoAdvance,
    skipToNextNow,
    handleUserActivity
  } = usePlayer({ videoRef, containerRef })

  // Update buffered percentage on progress event
  const handleProgress = useCallback(() => {
    const video = videoRef.current
    if (video && video.buffered.length > 0) {
      try {
        const end = video.buffered.end(video.buffered.length - 1)
        setBufferedEnd(end)
      } catch (err) {
        console.warn('Could not read buffered range:', err)
      }
    }
  }, [])

  const videoSrc = activeLesson?.filePath ? mediaUrl(activeLesson.filePath) : ''

  // Reset error state on lesson change
  useEffect(() => {
    setIsVideoError(false)
    setErrorMessage('')
    setBufferedEnd(0)
  }, [activeLesson?.id])

  // Synchronize HTML5 textTracks mode with activeSubtitleTrack
  useEffect(() => {
    const video = videoRef.current
    if (!video || !video.textTracks) return
    for (let i = 0; i < video.textTracks.length; i++) {
      const track = video.textTracks[i]
      const matching = subtitleTracks.find((s) => s.id === track.id || s.label === track.label)
      if (matching && activeSubtitleTrack === matching.id) {
        track.mode = 'showing'
      } else {
        track.mode = 'disabled'
      }
    }
  }, [activeSubtitleTrack, subtitleTracks])

  const handleVideoError = (): void => {
    const video = videoRef.current
    setIsVideoError(true)
    if (activeLesson) {
      markLessonBroken(activeLesson.id)
    }
    const err = video?.error
    setErrorMessage(
      err?.message ||
        `Unable to load video file: ${activeLesson?.fileName || 'Unknown file'}. Please check if the file exists on disk.`
    )
  }

  const handleBackClick = (): void => {
    if (isPlaying) {
      setMiniPlayerActive(true)
    }
    if (onBack) {
      onBack()
    } else if (activeCourse) {
      setView('course', activeCourse.id)
    } else {
      setView('home')
    }
  }

  const isCompleted = activeLesson ? Boolean(progressMap[activeLesson.id]?.completed) : false

  // Non-video lessons (PDF, image, link, document, archive) render in DocumentLessonView
  const isPlayableMedia =
    activeLesson?.mediaType === 'video' || activeLesson?.mediaType === 'audio'

  if (!isPlayableMedia) {
    return <DocumentLessonView onBack={onBack} />
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'group/player relative flex h-full w-full select-none items-center justify-center overflow-hidden bg-black',
        className
      )}
      onMouseMove={handleUserActivity}
    >
      {/* HTML5 Native Video Stream Element */}
      {videoSrc ? (
        <video
          ref={videoRef}
          src={videoSrc}
          className="h-full w-full object-contain"
          playsInline
          preload="auto"
          crossOrigin="anonymous"
          onClick={togglePlay}
          onDoubleClick={toggleFullscreen}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => {
            setIsBuffering(false)
            setIsVideoError(false)
          }}
          onCanPlay={() => setIsBuffering(false)}
          onProgress={handleProgress}
          onError={handleVideoError}
        >
          {subtitleTracks.map((sub) => (
            <track
              key={sub.id}
              id={sub.id}
              label={sub.label}
              kind="subtitles"
              src={sub.vttUrl}
              default={activeSubtitleTrack === sub.id}
            />
          ))}
        </video>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-400">
          <p className="text-sm font-medium">{t('player.noLessonSelected', 'Nenhuma aula selecionada')}</p>
        </div>
      )}

      {/* Buffering Spinner */}
      {isBuffering && !isVideoError && videoSrc && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="h-12 w-12 rounded-full border-4 border-white/20 border-t-orange-500 animate-spin" />
        </div>
      )}

      {/* Error Fallback Overlay */}
      {isVideoError && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/95 p-6 text-center text-white space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/15 text-destructive border border-destructive/30 shadow-lg animate-in fade-in zoom-in-95 duration-200">
            <AlertCircle className="h-7 w-7" />
          </div>
          <div className="space-y-1.5 max-w-lg">
            <h3 className="text-base font-bold text-white">
              {t('player.errorTitle', 'Erro de Reprodução')}
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed font-mono px-4 py-2 rounded-xl bg-white/5 border border-white/10 break-all">
              {errorMessage || t('player.errorDesc', 'Não foi possível decodificar este vídeo ou o arquivo contém trechos corrompidos.')}
            </p>
          </div>
          <div className="flex flex-col items-center gap-2.5 pt-1 w-full max-w-md">
            {/* Primary Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsVideoError(false)
                  if (videoRef.current) {
                    videoRef.current.load()
                    videoRef.current.play().catch(console.warn)
                  }
                }}
                className="text-xs rounded-xl border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800 cursor-pointer"
              >
                {t('player.retry', 'Tentar Novamente')}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsVideoError(false)
                  if (videoRef.current) {
                    const targetTime = (videoRef.current.currentTime || 0) + 1.0
                    seekTo(targetTime)
                    videoRef.current.load()
                    videoRef.current.play().catch(console.warn)
                  }
                }}
                className="text-xs rounded-xl border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 cursor-pointer"
              >
                {t('player.skipGlitch', 'Pular 1s (Avançar)')}
              </Button>

              {hasNextLesson && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    setIsVideoError(false)
                    nextLesson()
                  }}
                  className="text-xs rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-primary-foreground font-bold cursor-pointer"
                >
                  {t('player.skipNext', 'Pular para Próxima Aula')}
                </Button>
              )}
            </div>

            {/* Dedicated Delete Button */}
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                if (activeLesson) {
                  await deleteLesson(activeLesson.id, false)
                  setIsVideoError(false)
                }
              }}
              className="text-xs rounded-xl bg-red-600/90 hover:bg-red-600 text-white font-bold cursor-pointer gap-1.5 px-4 shadow-lg shadow-red-950/50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('player.removeBrokenLesson', 'Excluir esta aula do curso')}
            </Button>
          </div>
        </div>
      )}

      {/* Top Overlay Header: Course & Lesson Title */}
      <div
        className={cn(
          'absolute left-0 right-0 top-0 z-30 flex items-center justify-between bg-gradient-to-b from-black/85 via-black/45 to-transparent p-4 transition-opacity duration-300',
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleBackClick}
                className="h-8.5 w-8.5 rounded-xl text-white/90 hover:bg-white/15 hover:text-white shrink-0 cursor-pointer"
                aria-label="Voltar para o curso"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="flex items-center gap-1.5 bg-black/90 text-white border-white/20">
              <span>Voltar para o curso</span>
            </TooltipContent>
          </Tooltip>

          <div className="flex flex-col overflow-hidden">
            {activeCourse && (
              <span className="text-[11px] font-medium text-zinc-400 truncate">
                {activeCourse.title} {activeModule ? `• ${activeModule.title}` : ''}
              </span>
            )}
            <h2 className="text-sm font-semibold text-white truncate">
              {activeLesson?.title || 'Lesson'}
            </h2>
          </div>
        </div>

        {/* Top Right: Focus Timer (v0.3) */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <FocusTimer />
        </div>
      </div>

      {/* Center Big Play/Pause Overlay Indicator (when paused) */}
      {!isPlaying && !isVideoError && videoSrc && (
        <button
          type="button"
          onClick={togglePlay}
          className={cn(
            'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex h-16 w-16 items-center justify-center rounded-full bg-black/60 text-white shadow-2xl backdrop-blur-sm transition-all duration-200 hover:scale-110 hover:bg-black/80 active:scale-95 cursor-pointer',
            showControls ? 'opacity-100' : 'opacity-0'
          )}
          aria-label="Play"
        >
          <Play className="h-8 w-8 fill-current ml-1" />
        </button>
      )}

      {/* Auto-Advance Countdown Banner */}
      {autoAdvanceCountdown !== null && (
        <div className="absolute inset-x-0 bottom-24 z-30 mx-auto flex max-w-md items-center justify-between rounded-xl border border-white/20 bg-black/80 p-3.5 shadow-2xl backdrop-blur-md text-white animate-in fade-in-0 zoom-in-95">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary font-bold text-sm">
              {autoAdvanceCountdown}s
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-xs text-zinc-400 font-medium">
                {t('player.nextIn', { seconds: autoAdvanceCountdown })}
              </span>
              <span className="text-xs font-semibold text-white truncate">
                {nextLessonTitle || t('player.nextLesson')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={cancelAutoAdvance}
              className="h-8 px-2.5 text-xs text-zinc-300 hover:text-white hover:bg-white/10"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              {t('common.cancel')}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={skipToNextNow}
              className="h-8 px-3 text-xs font-medium gap-1"
            >
              <FastForward className="h-3.5 w-3.5" />
              {t('player.nextLesson')}
            </Button>
          </div>
        </div>
      )}

      {/* Bottom Controls Overlay */}
      <PlayerControls
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        isMuted={isMuted}
        playbackRate={playbackRate}
        isFullscreen={isFullscreen}
        isPiP={isPiP}
        theaterMode={theaterMode}
        isCompleted={Boolean(isCompleted)}
        hasNextLesson={hasNextLesson}
        hasPrevLesson={hasPrevLesson}
        bufferedEnd={bufferedEnd}
        notes={notes}
        bookmarks={bookmarks}
        chapters={chapters}
        onTogglePlay={togglePlay}
        onSeek={seekTo}
        onSeekRelative={seekRelative}
        onVolumeChange={setVolume}
        onToggleMute={toggleMute}
        onRateChange={setPlaybackRate}
        onToggleFullscreen={toggleFullscreen}
        onTogglePiP={togglePiP}
        onToggleTheater={toggleTheater}
        onToggleCompletion={toggleCompletion}
        onNextLesson={() => nextLesson()}
        onPrevLesson={() => prevLesson()}
        className={cn(
          'absolute bottom-0 left-0 right-0 z-30 transition-opacity duration-300',
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      />
    </div>
  )
}
