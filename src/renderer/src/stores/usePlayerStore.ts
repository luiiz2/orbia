import { create } from 'zustand'
import type { Course, Module, Lesson, LessonProgress, LessonNote } from '@shared'
import { mediaUrl } from '../lib/utils'

export interface PlayerModuleWithLessons extends Module {
  lessons: Lesson[]
}

export interface PlayerState {
  activeCourse: Course | null
  activeLesson: Lesson | null
  activeModule: Module | null
  modulesWithLessons: PlayerModuleWithLessons[]
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
  playbackRate: number
  isFullscreen: boolean
  theaterMode: boolean
  progressMap: Record<string, LessonProgress>

  // Notes
  notes: LessonNote[]
  isLoadingNotes: boolean

  // Subtitles
  activeSubtitleTrack: string | null
  subtitleTracks: { id: string; label: string; vttUrl: string }[]

  // Picture-in-Picture
  isPiP: boolean

  // Actions
  play: () => void
  pause: () => void
  seek: (time: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  setPlaybackRate: (rate: number) => void
  toggleFullscreen: () => void
  setFullscreen: (fullscreen: boolean) => void
  toggleTheater: () => void
  setTheaterMode: (theater: boolean) => void
  togglePiP: () => void
  setPiP: (isPiP: boolean) => void
  loadHierarchy: (
    course: Course,
    modules: PlayerModuleWithLessons[],
    initialLessonId?: string
  ) => Promise<void>
  loadLesson: (lessonId: string) => Promise<void>
  nextLesson: () => Promise<boolean>
  prevLesson: () => Promise<boolean>
  toggleComplete: (lessonId?: string) => Promise<void>
  updateProgress: (currentTime: number, duration: number, completed?: boolean) => Promise<void>
  setCurrentTime: (currentTime: number) => void
  setDuration: (duration: number) => void

  // Note actions
  fetchNotes: (lessonId: string) => Promise<void>
  addNote: (content: string) => Promise<void>
  updateNote: (id: string, content: string) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  exportNotes: (courseId: string) => Promise<string>

  // Subtitle actions
  setSubtitleTrack: (id: string | null) => void

  reset: () => void
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  activeCourse: null,
  activeLesson: null,
  activeModule: null,
  modulesWithLessons: [],
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  isMuted: false,
  playbackRate: 1,
  isFullscreen: false,
  theaterMode: false,
  progressMap: {},

  // Notes state
  notes: [],
  isLoadingNotes: false,

  // Subtitles state
  activeSubtitleTrack: null,
  subtitleTracks: [],

  // PiP state
  isPiP: false,

  play: () => {
    set({ isPlaying: true })
  },

  pause: () => {
    set({ isPlaying: false })
    const { activeLesson, activeCourse, currentTime, duration, progressMap } = get()
    if (activeLesson && activeCourse && duration > 0) {
      const isCompleted =
        progressMap[activeLesson.id]?.completed ||
        (duration > 0 && currentTime / duration >= 0.9)

      window.api.player
        .saveProgress({
          lessonId: activeLesson.id,
          courseId: activeCourse.id,
          currentTime,
          duration,
          completed: isCompleted
        })
        .catch((err) => console.error('Failed to save progress on pause:', err))
    }
  },

  seek: (time: number) => {
    const clampedTime = Math.max(0, time)
    set({ currentTime: clampedTime })
    const { activeLesson, activeCourse, duration, progressMap } = get()
    if (activeLesson && activeCourse && duration > 0) {
      const isCompleted =
        progressMap[activeLesson.id]?.completed ||
        (duration > 0 && clampedTime / duration >= 0.9)

      window.api.player
        .saveProgress({
          lessonId: activeLesson.id,
          courseId: activeCourse.id,
          currentTime: clampedTime,
          duration,
          completed: isCompleted
        })
        .catch((err) => console.error('Failed to save progress on seek:', err))
    }
  },

  setVolume: (volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume))
    set({ volume: clamped, isMuted: clamped === 0 ? true : get().isMuted })
  },

  toggleMute: () => {
    set((state) => ({ isMuted: !state.isMuted }))
  },

  setPlaybackRate: (rate: number) => {
    set({ playbackRate: rate })
  },

  toggleFullscreen: () => {
    set((state) => ({ isFullscreen: !state.isFullscreen }))
  },

  setFullscreen: (fullscreen: boolean) => {
    set({ isFullscreen: fullscreen })
  },

  toggleTheater: () => {
    set((state) => ({ theaterMode: !state.theaterMode }))
  },

  setTheaterMode: (theaterMode: boolean) => {
    set({ theaterMode })
  },

  togglePiP: () => {
    set((state) => ({ isPiP: !state.isPiP }))
  },

  setPiP: (isPiP: boolean) => {
    set({ isPiP })
  },

  loadHierarchy: async (course, modules, initialLessonId) => {
    set({
      activeCourse: course,
      modulesWithLessons: modules
    })

    let targetLessonId = initialLessonId
    if (!targetLessonId) {
      for (const mod of modules) {
        if (mod.lessons && mod.lessons.length > 0) {
          targetLessonId = mod.lessons[0].id
          break
        }
      }
    }

    if (targetLessonId) {
      await get().loadLesson(targetLessonId)
    }
  },

  loadLesson: async (lessonId: string) => {
    const { modulesWithLessons, activeCourse, subtitleTracks: oldTracks } = get()
    let foundLesson: Lesson | null = null
    let foundModule: Module | null = null

    for (const mod of modulesWithLessons) {
      const lesson = mod.lessons.find((l) => l.id === lessonId)
      if (lesson) {
        foundLesson = lesson
        foundModule = mod
        break
      }
    }

    if (!foundLesson) {
      console.warn(`Lesson with id ${lessonId} not found in current hierarchy`)
      return
    }

    // Clean up previous blob URLs
    for (const track of oldTracks) {
      if (track.vttUrl.startsWith('blob:')) {
        URL.revokeObjectURL(track.vttUrl)
      }
    }

    // Prepare subtitle tracks
    const preparedTracks: { id: string; label: string; vttUrl: string }[] = []
    if (foundLesson.subtitles && foundLesson.subtitles.length > 0) {
      for (const sub of foundLesson.subtitles) {
        let vttUrl = mediaUrl(sub.filePath)
        if (sub.format === 'srt' || sub.filePath.toLowerCase().endsWith('.srt')) {
          try {
            const res = await window.api.courses.convertSrtToVtt(sub.filePath)
            if (res.success && res.vttContent) {
              const blob = new Blob([res.vttContent], { type: 'text/vtt' })
              vttUrl = URL.createObjectURL(blob)
            }
          } catch (e) {
            console.warn('Failed to convert SRT to VTT for subtitle:', sub.label, e)
          }
        }
        preparedTracks.push({
          id: sub.id,
          label: sub.label || sub.language || 'Subtitles',
          vttUrl
        })
      }
    }

    let initialTime = 0
    let lessonDuration = foundLesson.duration || 0

    try {
      const savedProgress = await window.api.player.getProgress(lessonId)
      if (savedProgress) {
        set((state) => ({
          progressMap: {
            ...state.progressMap,
            [lessonId]: savedProgress
          }
        }))

        if (savedProgress.duration > 0) {
          lessonDuration = savedProgress.duration
        }

        // Resume from saved position if not completed and within bounds
        if (!savedProgress.completed && savedProgress.currentTime < savedProgress.duration * 0.95) {
          initialTime = savedProgress.currentTime
        }
      }
    } catch (err) {
      console.error('Failed to get saved progress for lesson:', err)
    }

    set({
      activeLesson: foundLesson,
      activeModule: foundModule,
      currentTime: initialTime,
      duration: lessonDuration,
      isPlaying: true,
      subtitleTracks: preparedTracks,
      activeSubtitleTrack: preparedTracks.length > 0 ? preparedTracks[0].id : null
    })

    // Fetch notes for the active lesson
    await get().fetchNotes(foundLesson.id)

    // Record watch history
    if (activeCourse) {
      window.api.player
        .addWatchHistory({
          lessonId: foundLesson.id,
          courseId: activeCourse.id,
          lessonTitle: foundLesson.title,
          courseTitle: activeCourse.title,
          coverPath: activeCourse.coverPath,
          duration: lessonDuration,
          currentTime: initialTime
        })
        .catch((err) => console.error('Failed to add watch history:', err))
    }
  },

  nextLesson: async () => {
    const { modulesWithLessons, activeLesson } = get()
    if (!activeLesson) return false

    const allLessons: Lesson[] = []
    for (const mod of modulesWithLessons) {
      if (mod.lessons) {
        allLessons.push(...mod.lessons)
      }
    }

    const currentIndex = allLessons.findIndex((l) => l.id === activeLesson.id)
    if (currentIndex !== -1 && currentIndex + 1 < allLessons.length) {
      const next = allLessons[currentIndex + 1]
      await get().loadLesson(next.id)
      return true
    }

    return false
  },

  prevLesson: async () => {
    const { modulesWithLessons, activeLesson } = get()
    if (!activeLesson) return false

    const allLessons: Lesson[] = []
    for (const mod of modulesWithLessons) {
      if (mod.lessons) {
        allLessons.push(...mod.lessons)
      }
    }

    const currentIndex = allLessons.findIndex((l) => l.id === activeLesson.id)
    if (currentIndex > 0) {
      const prev = allLessons[currentIndex - 1]
      await get().loadLesson(prev.id)
      return true
    }

    return false
  },

  toggleComplete: async (lessonId?: string) => {
    const { activeLesson, activeCourse, progressMap } = get()
    const targetId = lessonId || activeLesson?.id
    if (!targetId || !activeCourse) return

    try {
      const completed = await window.api.player.toggleLessonCompletion(targetId, activeCourse.id)
      const existing = progressMap[targetId] || {
        lessonId: targetId,
        courseId: activeCourse.id,
        currentTime: 0,
        duration: 0,
        completed: false,
        updatedAt: Date.now()
      }

      set((state) => ({
        progressMap: {
          ...state.progressMap,
          [targetId]: {
            ...existing,
            completed,
            updatedAt: Date.now()
          }
        }
      }))
    } catch (err) {
      console.error('Failed to toggle lesson completion:', err)
    }
  },

  updateProgress: async (currentTime: number, duration: number, completed?: boolean) => {
    const { activeLesson, activeCourse, progressMap } = get()
    if (!activeLesson || !activeCourse) return

    const isCompleted =
      completed !== undefined
        ? completed
        : (progressMap[activeLesson.id]?.completed || (duration > 0 && currentTime / duration >= 0.9))

    const newProgress: LessonProgress = {
      lessonId: activeLesson.id,
      courseId: activeCourse.id,
      currentTime,
      duration,
      completed: isCompleted,
      updatedAt: Date.now()
    }

    set((state) => ({
      currentTime,
      duration,
      progressMap: {
        ...state.progressMap,
        [activeLesson.id]: newProgress
      }
    }))

    try {
      await window.api.player.saveProgress({
        lessonId: activeLesson.id,
        courseId: activeCourse.id,
        currentTime,
        duration,
        completed: isCompleted
      })
    } catch (err) {
      console.error('Failed to persist progress:', err)
    }
  },

  setCurrentTime: (currentTime: number) => {
    set({ currentTime })
  },

  setDuration: (duration: number) => {
    set({ duration })
  },

  fetchNotes: async (lessonId: string) => {
    set({ isLoadingNotes: true })
    try {
      const notes = await window.api.player.getLessonNotes(lessonId)
      const sorted = (notes || []).slice().sort((a, b) => a.timestampSeconds - b.timestampSeconds)
      set({ notes: sorted, isLoadingNotes: false })
    } catch (err) {
      console.error('Failed to fetch lesson notes:', err)
      set({ notes: [], isLoadingNotes: false })
    }
  },

  addNote: async (content: string) => {
    const { activeLesson, activeCourse, currentTime } = get()
    if (!activeLesson || !activeCourse || !content.trim()) return

    try {
      const newNote = await window.api.player.addLessonNote({
        lessonId: activeLesson.id,
        courseId: activeCourse.id,
        timestampSeconds: Math.floor(currentTime),
        content: content.trim()
      })
      set((state) => ({
        notes: [...state.notes, newNote].sort((a, b) => a.timestampSeconds - b.timestampSeconds)
      }))
    } catch (err) {
      console.error('Failed to add lesson note:', err)
    }
  },

  updateNote: async (id: string, content: string) => {
    try {
      const success = await window.api.player.updateLessonNote(id, content.trim())
      if (success) {
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id ? { ...n, content: content.trim(), updatedAt: Date.now() } : n
          )
        }))
      }
    } catch (err) {
      console.error('Failed to update lesson note:', err)
    }
  },

  deleteNote: async (id: string) => {
    try {
      const success = await window.api.player.deleteLessonNote(id)
      if (success) {
        set((state) => ({
          notes: state.notes.filter((n) => n.id !== id)
        }))
      }
    } catch (err) {
      console.error('Failed to delete lesson note:', err)
    }
  },

  exportNotes: async (courseId: string) => {
    try {
      return await window.api.player.exportCourseNotes(courseId)
    } catch (err) {
      console.error('Failed to export course notes:', err)
      return ''
    }
  },

  setSubtitleTrack: (id: string | null) => {
    set({ activeSubtitleTrack: id })
  },

  reset: () => {
    const tracks = get().subtitleTracks
    for (const track of tracks) {
      if (track.vttUrl.startsWith('blob:')) {
        URL.revokeObjectURL(track.vttUrl)
      }
    }

    set({
      activeCourse: null,
      activeLesson: null,
      activeModule: null,
      modulesWithLessons: [],
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      isFullscreen: false,
      theaterMode: false,
      notes: [],
      isLoadingNotes: false,
      activeSubtitleTrack: null,
      subtitleTracks: [],
      isPiP: false
    })
  }
}))
