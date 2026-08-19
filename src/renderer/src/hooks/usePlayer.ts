import { useEffect, useRef, useState, useCallback } from 'react'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useSettingsStore } from '../stores/useSettingsStore'

export interface UsePlayerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  containerRef?: React.RefObject<HTMLDivElement | null>
}

export interface UsePlayerReturn {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
  playbackRate: number
  isFullscreen: boolean
  showControls: boolean
  autoAdvanceCountdown: number | null
  nextLessonTitle: string | null
  hasNextLesson: boolean
  hasPrevLesson: boolean
  togglePlay: () => void
  play: () => void
  pause: () => void
  seekTo: (time: number) => void
  seekRelative: (deltaSeconds: number) => void
  setVolume: (vol: number) => void
  toggleMute: () => void
  setPlaybackRate: (rate: number) => void
  toggleFullscreen: () => void
  toggleCompletion: () => void
  nextLesson: () => Promise<boolean>
  prevLesson: () => Promise<boolean>
  cancelAutoAdvance: () => void
  skipToNextNow: () => void
  handleUserActivity: () => void
}

const SPEED_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0]

export function usePlayer({ videoRef, containerRef }: UsePlayerProps): UsePlayerReturn {
  const {
    activeCourse,
    activeLesson,
    modulesWithLessons,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    playbackRate,
    isFullscreen,
    progressMap,
    play: storePlay,
    pause: storePause,
    seek: storeSeek,
    setVolume: storeSetVolume,
    toggleMute: storeToggleMute,
    setPlaybackRate: storeSetPlaybackRate,
    setFullscreen: storeSetFullscreen,
    setCurrentTime: storeSetCurrentTime,
    setDuration: storeSetDuration,
    toggleComplete,
    nextLesson: storeNextLesson,
    prevLesson: storePrevLesson
  } = usePlayerStore()

  const { settings } = useSettingsStore()

  const [showControls, setShowControls] = useState<boolean>(true)
  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState<number | null>(null)

  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastSaveTimeRef = useRef<number>(0)
  const autoAdvanceIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Determine if next / prev lessons exist
  const allLessons = modulesWithLessons.flatMap((m) => m.lessons || [])
  const currentIndex = activeLesson ? allLessons.findIndex((l) => l.id === activeLesson.id) : -1
  const hasNextLesson = currentIndex !== -1 && currentIndex + 1 < allLessons.length
  const hasPrevLesson = currentIndex > 0
  const nextLessonObj = hasNextLesson ? allLessons[currentIndex + 1] : null
  const nextLessonTitle = nextLessonObj ? nextLessonObj.title : null

  /**
   * Activity tracking: keep controls visible while active, hide after 2.5s if playing
   */
  const handleUserActivity = useCallback(() => {
    setShowControls(true)
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current)
    }

    if (isPlaying) {
      inactivityTimerRef.current = setTimeout(() => {
        setShowControls(false)
      }, 2500)
    }
  }, [isPlaying])

  /**
   * Persist progress helper
   */
  const persistProgress = useCallback(
    (time: number, totalDuration: number, forceCompleted?: boolean) => {
      if (!activeLesson || !activeCourse || totalDuration <= 0) return

      const threshold = settings.completionThreshold || 0.9
      const isAutoCompleted = totalDuration > 0 && time / totalDuration >= threshold
      const isCompleted =
        forceCompleted !== undefined
          ? forceCompleted
          : progressMap[activeLesson.id]?.completed || isAutoCompleted

      window.api.player
        .saveProgress({
          lessonId: activeLesson.id,
          courseId: activeCourse.id,
          currentTime: time,
          duration: totalDuration,
          completed: isCompleted
        })
        .catch((err) => console.error('Failed to save progress:', err))
    },
    [activeLesson, activeCourse, settings.completionThreshold, progressMap]
  )

  /**
   * Play / Pause toggle
   */
  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    if (video.paused) {
      video.play().catch(console.warn)
      storePlay()
      cancelAutoAdvance()
    } else {
      video.pause()
      storePause()
      persistProgress(video.currentTime, video.duration)
    }
  }, [videoRef, storePlay, storePause, persistProgress])

  const play = useCallback(() => {
    const video = videoRef.current
    if (video && video.paused) {
      video.play().catch(console.warn)
      storePlay()
      cancelAutoAdvance()
    }
  }, [videoRef, storePlay])

  const pause = useCallback(() => {
    const video = videoRef.current
    if (video && !video.paused) {
      video.pause()
      storePause()
      persistProgress(video.currentTime, video.duration)
    }
  }, [videoRef, storePause, persistProgress])

  /**
   * Seek absolute
   */
  const seekTo = useCallback(
    (targetTime: number) => {
      const video = videoRef.current
      if (!video) return

      const clamped = Math.max(0, Math.min(video.duration || Infinity, targetTime))
      video.currentTime = clamped
      storeSeek(clamped)
      persistProgress(clamped, video.duration)
    },
    [videoRef, storeSeek, persistProgress]
  )

  /**
   * Seek relative (e.g. +5s, -10s)
   */
  const seekRelative = useCallback(
    (delta: number) => {
      const video = videoRef.current
      if (!video) return

      const newTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + delta))
      video.currentTime = newTime
      storeSeek(newTime)
      persistProgress(newTime, video.duration)
    },
    [videoRef, storeSeek, persistProgress]
  )

  /**
   * Volume & Mute
   */
  const setVolume = useCallback(
    (newVol: number) => {
      const video = videoRef.current
      if (!video) return

      const clamped = Math.max(0, Math.min(1, newVol))
      video.volume = clamped
      video.muted = clamped === 0
      storeSetVolume(clamped)
    },
    [videoRef, storeSetVolume]
  )

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    video.muted = !video.muted
    storeToggleMute()
  }, [videoRef, storeToggleMute])

  /**
   * Playback Rate
   */
  const setPlaybackRate = useCallback(
    (rate: number) => {
      const video = videoRef.current
      if (!video) return

      video.playbackRate = rate
      storeSetPlaybackRate(rate)
    },
    [videoRef, storeSetPlaybackRate]
  )

  /**
   * Fullscreen
   */
  const toggleFullscreen = useCallback(() => {
    const targetElement = containerRef?.current || videoRef.current?.parentElement || videoRef.current
    if (!targetElement) return

    if (!document.fullscreenElement) {
      targetElement.requestFullscreen().catch(console.warn)
      storeSetFullscreen(true)
    } else {
      document.exitFullscreen().catch(console.warn)
      storeSetFullscreen(false)
    }
  }, [containerRef, videoRef, storeSetFullscreen])

  /**
   * Auto-advance countdown
   */
  const cancelAutoAdvance = useCallback(() => {
    if (autoAdvanceIntervalRef.current) {
      clearInterval(autoAdvanceIntervalRef.current)
      autoAdvanceIntervalRef.current = null
    }
    setAutoAdvanceCountdown(null)
  }, [])

  const skipToNextNow = useCallback(() => {
    cancelAutoAdvance()
    storeNextLesson()
  }, [cancelAutoAdvance, storeNextLesson])

  const startAutoAdvanceCountdown = useCallback(() => {
    if (!hasNextLesson || !settings.autoPlayNext) return

    cancelAutoAdvance()
    setAutoAdvanceCountdown(5)

    autoAdvanceIntervalRef.current = setInterval(() => {
      setAutoAdvanceCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (autoAdvanceIntervalRef.current) {
            clearInterval(autoAdvanceIntervalRef.current)
            autoAdvanceIntervalRef.current = null
          }
          storeNextLesson()
          return null
        }
        return prev - 1
      })
    }, 1000)
  }, [hasNextLesson, settings.autoPlayNext, cancelAutoAdvance, storeNextLesson])

  /**
   * Synchronize video element on activeLesson change
   */
  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeLesson) return

    cancelAutoAdvance()
    video.playbackRate = playbackRate
    video.volume = volume
    video.muted = isMuted

    // When new lesson loads, reset throttled timer
    lastSaveTimeRef.current = Date.now()
  }, [activeLesson?.id, videoRef, cancelAutoAdvance, playbackRate, volume, isMuted])

  /**
   * Listen to fullscreen change events
   */
  useEffect(() => {
    const handleFullscreenChange = (): void => {
      const isDocFs = !!document.fullscreenElement
      storeSetFullscreen(isDocFs)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [storeSetFullscreen])

  /**
   * Keyboard shortcuts
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Ignore when typing inside input elements
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }

      handleUserActivity()

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault()
          togglePlay()
          break

        case 'ArrowLeft':
          e.preventDefault()
          seekRelative(-5)
          break

        case 'ArrowRight':
          e.preventDefault()
          seekRelative(5)
          break

        case 'j':
        case 'J':
          e.preventDefault()
          seekRelative(-10)
          break

        case 'l':
        case 'L':
          e.preventDefault()
          seekRelative(10)
          break

        case 'm':
        case 'M':
          e.preventDefault()
          toggleMute()
          break

        case 'f':
        case 'F':
          e.preventDefault()
          toggleFullscreen()
          break

        case 'ArrowUp':
          e.preventDefault()
          setVolume(Math.min(1, volume + 0.1))
          break

        case 'ArrowDown':
          e.preventDefault()
          setVolume(Math.max(0, volume - 0.1))
          break

        case 'n':
        case 'N':
          e.preventDefault()
          if (hasNextLesson) {
            storeNextLesson()
          }
          break

        case 'p':
        case 'P':
          e.preventDefault()
          if (hasPrevLesson) {
            storePrevLesson()
          }
          break

        case ']':
        case '>':
        case '.': {
          // Increase speed
          const currIdx = SPEED_PRESETS.findIndex((s) => Math.abs(s - playbackRate) < 0.05)
          if (currIdx !== -1 && currIdx + 1 < SPEED_PRESETS.length) {
            setPlaybackRate(SPEED_PRESETS[currIdx + 1])
          }
          break
        }

        case '[':
        case '<':
        case ',': {
          // Decrease speed
          const currIdx = SPEED_PRESETS.findIndex((s) => Math.abs(s - playbackRate) < 0.05)
          if (currIdx > 0) {
            setPlaybackRate(SPEED_PRESETS[currIdx - 1])
          }
          break
        }

        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    handleUserActivity,
    togglePlay,
    seekRelative,
    toggleMute,
    toggleFullscreen,
    setVolume,
    volume,
    playbackRate,
    setPlaybackRate,
    hasNextLesson,
    hasPrevLesson,
    storeNextLesson,
    storePrevLesson
  ])

  /**
   * Throttled progress save during continuous playback + Video event attachments
   */
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = (): void => {
      const cur = video.currentTime
      const dur = video.duration || 0
      storeSetCurrentTime(cur)

      // Check auto-completion (90%+)
      const threshold = settings.completionThreshold || 0.9
      if (dur > 0 && cur / dur >= threshold && activeLesson) {
        if (!progressMap[activeLesson.id]?.completed) {
          persistProgress(cur, dur, true)
        }
      }

      // Throttled persistence every 3 seconds
      const now = Date.now()
      if (now - lastSaveTimeRef.current >= 3000) {
        lastSaveTimeRef.current = now
        persistProgress(cur, dur)
      }
    }

    const handleLoadedMetadata = (): void => {
      if (video.duration && !isNaN(video.duration)) {
        storeSetDuration(video.duration)
      }
      // If we have saved progress to seek to
      if (currentTime > 0 && Math.abs(video.currentTime - currentTime) > 1) {
        video.currentTime = currentTime
      }
    }

    const handlePlay = (): void => {
      storePlay()
      cancelAutoAdvance()
      handleUserActivity()
    }

    const handlePause = (): void => {
      storePause()
      persistProgress(video.currentTime, video.duration)
      setShowControls(true)
    }

    const handleEnded = (): void => {
      storePause()
      persistProgress(video.currentTime, video.duration, true)
      setShowControls(true)
      startAutoAdvanceCountdown()
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('ended', handleEnded)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', handleEnded)
    }
  }, [
    videoRef,
    activeLesson,
    currentTime,
    settings.completionThreshold,
    progressMap,
    storeSetCurrentTime,
    storeSetDuration,
    storePlay,
    storePause,
    persistProgress,
    cancelAutoAdvance,
    handleUserActivity,
    startAutoAdvanceCountdown
  ])

  // Save progress on unmount / window unload
  useEffect(() => {
    const handleBeforeUnload = (): void => {
      const video = videoRef.current
      if (video && activeLesson && activeCourse) {
        persistProgress(video.currentTime, video.duration)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      cancelAutoAdvance()
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
      }
    }
  }, [videoRef, activeLesson, activeCourse, persistProgress, cancelAutoAdvance])

  return {
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    playbackRate,
    isFullscreen,
    showControls,
    autoAdvanceCountdown,
    nextLessonTitle,
    hasNextLesson,
    hasPrevLesson,
    togglePlay,
    play,
    pause,
    seekTo,
    seekRelative,
    setVolume,
    toggleMute,
    setPlaybackRate,
    toggleFullscreen,
    toggleCompletion: () => toggleComplete(),
    nextLesson: storeNextLesson,
    prevLesson: storePrevLesson,
    cancelAutoAdvance,
    skipToNextNow,
    handleUserActivity
  }
}
