import React, { useRef, useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, ChevronLeft, FastForward, X, AlertCircle } from 'lucide-react'
import { usePlayer } from '../../hooks/usePlayer'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { PlayerControls } from './PlayerControls'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

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
    subtitleTracks,
    activeSubtitleTrack
  } = usePlayerStore()
  const { setView } = useNavigationStore()

  const [bufferedEnd, setBufferedEnd] = useState<number>(0)
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

  // Construct media:// stream URL
  const videoSrc = activeLesson?.filePath
    ? `media://${encodeURI(activeLesson.filePath.replace(/\\/g, '/'))}`
    : ''

  // Reset error state on lesson change
  useEffect(() => {
    setIsVideoError(false)
    setErrorMessage('')
    setBufferedEnd(0)
  }, [activeLesson?.id])

  const handleVideoError = (): void => {
    const video = videoRef.current
    setIsVideoError(true)
    const err = video?.error
    setErrorMessage(
      err?.message ||
        `Unable to load video file: ${activeLesson?.fileName || 'Unknown file'}. Please check if the file exists on disk.`
    )
  }

  const handleBackClick = (): void => {
    if (onBack) {
      onBack()
    } else if (activeCourse) {
      setView('course', activeCourse.id)
    } else {
      setView('home')
    }
  }

  const isCompleted =
    activeLesson &&
    usePlayerStore.getState().progressMap[activeLesson.id]?.completed

  return (
    <div
      ref={containerRef}
      onMouseMove={handleUserActivity}
      onMouseEnter={handleUserActivity}
      onClick={handleUserActivity}
      className={cn(
        'group relative flex flex-col justify-between overflow-hidden bg-black select-none',
        isFullscreen ? 'h-screen w-screen fixed inset-0 z-50' : 'h-full w-full rounded-xl',
        !showControls && isPlaying ? 'cursor-none' : 'cursor-default',
        className
      )}
    >
      {/* HTML5 Video Element */}
      {videoSrc ? (
        <video
          ref={videoRef}
          src={videoSrc}
          onProgress={handleProgress}
          onError={handleVideoError}
          onClick={togglePlay}
          playsInline
          className="h-full w-full object-contain bg-black"
        >
          {subtitleTracks.map((sub) => (
            <track
              key={sub.id}
              id={sub.id}
              kind="subtitles"
              label={sub.label}
              src={sub.vttUrl}
              default={activeSubtitleTrack === sub.id}
            />
          ))}
        </video>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-400">
          <p className="text-sm font-medium">No lesson selected</p>
        </div>
      )}

      {/* Error Fallback Overlay */}
      {isVideoError && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/90 p-6 text-center text-white">
          <AlertCircle className="mb-3 h-12 w-12 text-destructive" />
          <h3 className="mb-1 text-base font-semibold text-white">Playback Error</h3>
          <p className="max-w-md text-xs text-zinc-400 mb-4">{errorMessage}</p>
          <div className="flex gap-2">
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
              className="text-xs"
            >
              Retry
            </Button>
            {hasNextLesson && (
              <Button variant="default" size="sm" onClick={() => nextLesson()} className="text-xs">
                Skip to Next Lesson
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Top Overlay Header: Course & Lesson Title */}
      <div
        className={cn(
          'absolute left-0 right-0 top-0 z-30 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4 transition-opacity duration-300',
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBackClick}
            className="h-8 w-8 text-white/90 hover:bg-white/10 hover:text-white shrink-0"
            title="Back to Course"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

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
        onTogglePlay={togglePlay}
        onSeek={seekTo}
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
