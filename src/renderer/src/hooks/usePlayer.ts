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
  isPiP: boolean
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
  togglePiP: () => void
  toggleSubtitles: () => void
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
    isPiP,
    activeSubtitleTrack,
    subtitleTracks,
    progressMap,
    play: storePlay,
    pause: storePause,
    seek: storeSeek,
    setVolume: storeSetVolume,
    toggleMute: storeToggleMute,
    setPlaybackRate: storeSetPlaybackRate,
    setFullscreen: storeSetFullscreen,
    setPiP: storeSetPiP,
    setSubtitleTrack: storeSetSubtitleTrack,
    setCurrentTime: storeSetCurrentTime,
    setDuration: storeSetDuration,
    toggleComplete,
    updateProgress: storeUpdateProgress,
    nextLesson: storeNextLesson,
    prevLesson: storePrevLesson
  } = usePlayerStore()

  const { settings } = useSettingsStore()

  const [showControls, setShowControls] = useState<boolean>(true)
  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState<number | null>(null)

  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastSaveTimeRef = useRef<number>(0)
  const autoAdvanceIntervalRef = useRef<NodeJS.Timeout | null>(null)
  // In-flight user seek: target position + timestamp. While set, timeupdate
  // stores are ignored so a stale position can never snap the bar/video back.
  const pendingSeekRef = useRef<{ time: number; at: number } | null>(null)
  // Resume-from-saved-position runs exactly once per lesson, never re-applies
  // on repeated loadedmetadata (which caused the video to jump back).
  const resumedRef = useRef<boolean>(false)

  // Reset per-lesson flags when the active lesson changes
  useEffect(() => {
    pendingSeekRef.current = null
    resumedRef.current = false
  }, [activeLesson?.id])

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
   * Persist progress helper. Delegates to the store's updateProgress so the
   * reactive progressMap is updated (checkmarks reflect completion instantly).
   */
  const persistProgress = useCallback(
    (time: number, totalDuration: number, forceCompleted?: boolean) => {
      if (!activeLesson || !activeCourse || totalDuration <= 0) return
      void storeUpdateProgress(time, totalDuration, forceCompleted)
    },
    [activeLesson, activeCourse, storeUpdateProgress]
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
      pendingSeekRef.current = { time: clamped, at: Date.now() }
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
      pendingSeekRef.current = { time: newTime, at: Date.now() }
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
   * Picture-in-Picture
   */
  const togglePiP = useCallback(async () => {
    const video = videoRef.current
    if (!video) return

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture()
      }
    } catch (err) {
      console.warn('PiP error:', err)
    }
  }, [videoRef])

  /**
   * Subtitle toggle
   */
  const toggleSubtitles = useCallback(() => {
    if (activeSubtitleTrack !== null) {
      storeSetSubtitleTrack(null)
    } else if (subtitleTracks.length > 0) {
      storeSetSubtitleTrack(subtitleTracks[0].id)
    }
  }, [activeSubtitleTrack, subtitleTracks, storeSetSubtitleTrack])

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

    // The store marks the lesson as "playing" on load; actually start playback
    // once the element is ready (no-op when already playing).
    if (isPlaying && video.paused) {
      video.play().catch(() => {
        /* autoplay may fail until metadata loads; retried on play event */
      })
    }
  }, [activeLesson?.id, videoRef, cancelAutoAdvance, playbackRate, volume, isMuted, isPlaying])

  /**
   * Synchronize active subtitle track with video TextTracks
   */
  useEffect(() => {
    const video = videoRef.current
    if (!video || !video.textTracks) return

    const activeTrackObj = subtitleTracks.find((t) => t.id === activeSubtitleTrack)

    for (let i = 0; i < video.textTracks.length; i++) {
      const textTrack = video.textTracks[i]
      if (
        activeTrackObj &&
        (textTrack.label === activeTrackObj.label || textTrack.id === activeTrackObj.id)
      ) {
        textTrack.mode = 'showing'
      } else {
        textTrack.mode = 'hidden'
      }
    }
  }, [videoRef, activeSubtitleTrack, subtitleTracks])

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
   * Listen to Picture-in-Picture change events
   */
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleEnterPiP = (): void => storeSetPiP(true)
    const handleLeavePiP = (): void => storeSetPiP(false)

    video.addEventListener('enterpictureinpicture', handleEnterPiP)
    video.addEventListener('leavepictureinpicture', handleLeavePiP)

    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnterPiP)
      video.removeEventListener('leavepictureinpicture', handleLeavePiP)
    }
  }, [videoRef, storeSetPiP])

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

        case 'c':
        case 'C':
          e.preventDefault()
          toggleSubtitles()
          break

        case 'p':
        case 'P':
          e.preventDefault()
          togglePiP()
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
    toggleSubtitles,
    togglePiP,
    setVolume,
    volume,
    playbackRate,
    setPlaybackRate,
    hasNextLesson,
    storeNextLesson
  ])

  /**
   * Throttled progress save during continuous playback + Video event attachments.
   * Listeners attach once per lesson (no currentTime in deps) so in-flight
   * 'seeked' events can never be dropped by re-attachment mid-seek.
   */
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = (): void => {
      const cur = video.currentTime
      const dur = video.duration || 0

      // While a user seek is in flight, ignore stale positions — unless the
      // video has actually reached the target (fallback if 'seeked' never fires).
      const pending = pendingSeekRef.current
      if (pending !== null) {
        if (Math.abs(cur - pending.time) > 1.5) return
        pendingSeekRef.current = null
      }

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
        const completed = dur > 0 && cur / dur >= threshold ? true : undefined
        persistProgress(cur, dur, completed)
      }
    }

    const handleLoadedMetadata = (): void => {
      if (video.duration && !isNaN(video.duration)) {
        storeSetDuration(video.duration)
        // Lazy duration probe: persist once so course totals become accurate.
        if (activeLesson && (!activeLesson.duration || activeLesson.duration <= 0)) {
          void window.api.courses
            .updateLessonDuration(activeLesson.id, video.duration)
            .catch(() => undefined)
        }
      }
      // A user seek may already be in flight before metadata arrives —
      // re-apply the seek target instead of the saved resume position.
      if (pendingSeekRef.current !== null) {
        video.currentTime = pendingSeekRef.current.time
        return
      }
      // Resume saved progress exactly once per lesson — repeated
      // loadedmetadata must never re-seek (that snapped video backwards).
      if (resumedRef.current) return
      resumedRef.current = true
      // Read the store synchronously: a stale timeupdate from the previous
      // lesson can never poison this (it only reflects current state).
      const saved = usePlayerStore.getState().currentTime
      if (saved > 0 && Math.abs(video.currentTime - saved) > 1) {
        video.currentTime = saved
      }
    }

    const handleSeeked = (): void => {
      if (pendingSeekRef.current === null) return
      pendingSeekRef.current = null
      // Record the position the video actually landed on, not the requested
      // target — avoids storing a phantom position for imprecise seeking.
      const landed = video.currentTime
      storeSetCurrentTime(landed)
      persistProgress(landed, video.duration)
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
    video.addEventListener('seeked', handleSeeked)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('ended', handleEnded)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('seeked', handleSeeked)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', handleEnded)
    }
  }, [
    videoRef,
    activeLesson,
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
    isPiP,
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
    togglePiP,
    toggleSubtitles,
    toggleCompletion: () => toggleComplete(),
    nextLesson: storeNextLesson,
    prevLesson: storePrevLesson,
    cancelAutoAdvance,
    skipToNextNow,
    handleUserActivity
  }
}
