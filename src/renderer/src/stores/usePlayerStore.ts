import { create } from 'zustand'
import type {
  Course,
  Module,
  Lesson,
  LessonProgress,
  LessonNote,
  VideoBookmark,
  Flashcard,
  LessonChapter
} from '@shared'
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

  // Chapters (v0.9 Phase 6)
  chapters: LessonChapter[]
  isLoadingChapters: boolean
  isGeneratingChapters: boolean

  // Bookmarks (v0.3)
  bookmarks: VideoBookmark[]
  isLoadingBookmarks: boolean

  // Flashcards (v0.3)
  flashcards: Flashcard[]
  isLoadingFlashcards: boolean

  // Subtitles
  activeSubtitleTrack: string | null
  subtitleTracks: { id: string; label: string; vttUrl: string }[]

  // Picture-in-Picture & Mini-Player (v0.4)
  isPiP: boolean
  isMiniPlayerActive: boolean

  // Playback Queue ("A Seguir" / Up Next) (v0.4)
  playbackQueue: Lesson[]

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
  setMiniPlayerActive: (active: boolean) => void
  dismissMiniPlayer: () => void

  // Playback Queue Actions (v0.4)
  addToQueue: (lesson: Lesson) => void
  removeFromQueue: (lessonId: string) => void
  reorderQueue: (fromIndex: number, toIndex: number) => void
  clearQueue: () => void
  loadHierarchy: (
    course: Course,
    modules: PlayerModuleWithLessons[],
    initialLessonId?: string
  ) => Promise<void>
  loadLesson: (lessonId: string) => Promise<void>
  nextLesson: () => Promise<boolean>
  prevLesson: () => Promise<boolean>
  toggleComplete: (lessonId?: string) => Promise<void>
  updateProgress: (
    currentTime: number,
    duration: number,
    completed?: boolean
  ) => Promise<void>
  setCurrentTime: (currentTime: number) => void
  setDuration: (duration: number) => void

  // Note actions
  fetchNotes: (lessonId: string) => Promise<void>
  addNote: (content: string) => Promise<void>
  updateNote: (id: string, content: string) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  exportNotes: (courseId: string) => Promise<string>

  // Chapter actions (v0.9 Phase 6)
  fetchChapters: (lessonId: string) => Promise<void>
  generateChapters: () => Promise<void>
  addChapter: (title: string, timestampSeconds: number) => Promise<void>
  updateChapter: (
    id: string,
    title?: string,
    timestampSeconds?: number
  ) => Promise<void>
  deleteChapter: (id: string) => Promise<void>

  // Bookmark actions (v0.3)
  fetchBookmarks: (lessonId: string) => Promise<void>
  addBookmark: (
    title?: string,
    color?: string,
    timestamp?: number
  ) => Promise<VideoBookmark | null>
  updateBookmark: (
    id: string,
    updates: { title?: string; color?: string; timestamp?: number }
  ) => Promise<boolean>
  deleteBookmark: (id: string) => Promise<boolean>

  // Flashcard actions (v0.3)
  fetchFlashcards: (lessonId: string) => Promise<void>
  addFlashcard: (
    question: string,
    answer: string,
    timestamp?: number
  ) => Promise<Flashcard | null>
  deleteFlashcard: (id: string) => Promise<boolean>

  // Subtitle actions
  setSubtitleTrack: (id: string | null) => void

  // Broken / Error Lessons
  brokenLessonIds: string[]
  markLessonBroken: (lessonId: string) => void
  deleteLesson: (
    lessonId: string,
    deleteFileFromDisk?: boolean
  ) => Promise<{ success: boolean; error?: string }>

  reset: () => void
}

export const selectPlayerViewState = (state: PlayerState) => ({
  activeCourse: state.activeCourse,
  activeLesson: state.activeLesson,
  modulesWithLessons: state.modulesWithLessons,
  notes: state.notes,
  chapters: state.chapters,
  bookmarks: state.bookmarks,
  flashcards: state.flashcards,
  playbackQueue: state.playbackQueue,
  loadLesson: state.loadLesson,
  toggleComplete: state.toggleComplete,
  theaterMode: state.theaterMode,
  isFullscreen: state.isFullscreen,
  brokenLessonIds: state.brokenLessonIds,
  deleteLesson: state.deleteLesson,
  seek: state.seek,
  addNote: state.addNote
})

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

  // Chapters state (v0.9 Phase 6)
  chapters: [],
  isLoadingChapters: false,
  isGeneratingChapters: false,

  // Bookmarks state (v0.3)
  bookmarks: [],
  isLoadingBookmarks: false,

  // Flashcards state (v0.3)
  flashcards: [],
  isLoadingFlashcards: false,

  // Subtitles state
  activeSubtitleTrack: null,
  subtitleTracks: [],

  // PiP & Mini-Player state (v0.4)
  isPiP: false,
  isMiniPlayerActive: false,

  // Playback Queue state (v0.4)
  playbackQueue: [],

  play: () => {
    set({ isPlaying: true })
  },

  pause: () => {
    set({ isPlaying: false })
    const { activeLesson, activeCourse, currentTime, duration, progressMap } =
      get()
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

  setMiniPlayerActive: (isMiniPlayerActive: boolean) => {
    set({ isMiniPlayerActive })
  },

  dismissMiniPlayer: () => {
    set({ isMiniPlayerActive: false, isPlaying: false })
  },

  addToQueue: (lesson: Lesson) => {
    set((state) => {
      if (state.playbackQueue.some((l) => l.id === lesson.id)) return state
      return { playbackQueue: [...state.playbackQueue, lesson] }
    })
  },

  removeFromQueue: (lessonId: string) => {
    set((state) => ({
      playbackQueue: state.playbackQueue.filter((l) => l.id !== lessonId)
    }))
  },

  reorderQueue: (fromIndex: number, toIndex: number) => {
    set((state) => {
      const copy = [...state.playbackQueue]
      const [moved] = copy.splice(fromIndex, 1)
      if (moved) {
        copy.splice(toIndex, 0, moved)
      }
      return { playbackQueue: copy }
    })
  },

  clearQueue: () => {
    set({ playbackQueue: [] })
  },

  loadHierarchy: async (course, modules, initialLessonId) => {
    set({
      activeCourse: course,
      modulesWithLessons: modules
    })

    let targetLessonId = initialLessonId
    if (!targetLessonId) {
      try {
        const summary = await window.api.player.getCourseProgress(course.id)
        if (summary?.lastPlayedLessonId) {
          const allLessons = modules.flatMap((m) => m.lessons || [])
          const exists = allLessons.some(
            (l) => l.id === summary.lastPlayedLessonId
          )
          if (exists) {
            targetLessonId = summary.lastPlayedLessonId
          }
        }
      } catch (err) {
        console.warn('Could not load course progress summary for resume:', err)
      }
    }

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
    const {
      modulesWithLessons,
      activeCourse,
      subtitleTracks: oldTracks
    } = get()
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
        if (
          sub.format === 'srt' ||
          sub.filePath.toLowerCase().endsWith('.srt')
        ) {
          try {
            const res = await window.api.courses.convertSrtToVtt(sub.filePath)
            if (res.success && res.vttContent) {
              const blob = new Blob([res.vttContent], { type: 'text/vtt' })
              vttUrl = URL.createObjectURL(blob)
            }
          } catch (e) {
            console.warn(
              'Failed to convert SRT to VTT for subtitle:',
              sub.label,
              e
            )
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

        // Resume from saved position if within bounds (up to 98% of duration)
        if (
          savedProgress.currentTime > 0 &&
          (savedProgress.duration <= 0 ||
            savedProgress.currentTime < savedProgress.duration * 0.98)
        ) {
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
      activeSubtitleTrack:
        preparedTracks.length > 0 ? preparedTracks[0].id : null
    })

    // Fetch notes, chapters, bookmarks, and flashcards for the active lesson
    await Promise.all([
      get().fetchNotes(foundLesson.id),
      get().fetchChapters(foundLesson.id),
      get().fetchBookmarks(foundLesson.id),
      get().fetchFlashcards(foundLesson.id)
    ])

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
    const { playbackQueue, modulesWithLessons, activeLesson } = get()
    if (playbackQueue.length > 0) {
      const [nextQueued, ...rest] = playbackQueue
      set({ playbackQueue: rest })
      await get().loadLesson(nextQueued.id)
      return true
    }

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
      const completed = await window.api.player.toggleLessonCompletion(
        targetId,
        activeCourse.id
      )
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

  updateProgress: async (
    currentTime: number,
    duration: number,
    completed?: boolean
  ) => {
    const { activeLesson, activeCourse, progressMap } = get()
    if (!activeLesson || !activeCourse) return

    const isCompleted =
      completed !== undefined
        ? completed
        : progressMap[activeLesson.id]?.completed ||
          (duration > 0 && currentTime / duration >= 0.9)

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
      const sorted = (notes || [])
        .slice()
        .sort((a, b) => a.timestampSeconds - b.timestampSeconds)
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
        notes: [...state.notes, newNote].sort(
          (a, b) => a.timestampSeconds - b.timestampSeconds
        )
      }))
    } catch (err) {
      console.error('Failed to add lesson note:', err)
    }
  },

  updateNote: async (id: string, content: string) => {
    try {
      const success = await window.api.player.updateLessonNote(
        id,
        content.trim()
      )
      if (success) {
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id
              ? { ...n, content: content.trim(), updatedAt: Date.now() }
              : n
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

  // Chapter actions (v0.9 Phase 6)
  fetchChapters: async (lessonId: string) => {
    set({ isLoadingChapters: true })
    try {
      const chapters = await window.api.chapters.get(lessonId)
      set({ chapters: chapters || [], isLoadingChapters: false })
    } catch (err) {
      console.error('Failed to fetch lesson chapters:', err)
      set({ chapters: [], isLoadingChapters: false })
    }
  },

  generateChapters: async () => {
    const { activeLesson, activeCourse } = get()
    if (!activeLesson || !activeCourse) return

    set({ isGeneratingChapters: true })
    try {
      const res = await window.api.chapters.generate({
        lessonId: activeLesson.id,
        courseId: activeCourse.id
      })
      if (res && Array.isArray(res.chapters)) {
        set({ chapters: res.chapters, isGeneratingChapters: false })
      } else {
        set({ isGeneratingChapters: false })
      }
    } catch (err) {
      console.error('Failed to generate chapters:', err)
      set({ isGeneratingChapters: false })
    }
  },

  addChapter: async (title: string, timestampSeconds: number) => {
    const { activeLesson, activeCourse, chapters } = get()
    if (!activeLesson || !activeCourse || !title.trim()) return

    const newChapterDraft = {
      title: title.trim(),
      timestampSeconds: Math.max(0, timestampSeconds),
      isManual: true
    }

    try {
      const updated = await window.api.chapters.save({
        lessonId: activeLesson.id,
        courseId: activeCourse.id,
        chapters: [...chapters, newChapterDraft]
      })
      set({ chapters: updated })
    } catch (err) {
      console.error('Failed to add chapter:', err)
    }
  },

  updateChapter: async (
    id: string,
    title?: string,
    timestampSeconds?: number
  ) => {
    const { activeLesson, activeCourse } = get()
    if (!activeLesson || !activeCourse) return

    try {
      const updated = await window.api.chapters.update({
        id,
        lessonId: activeLesson.id,
        courseId: activeCourse.id,
        title,
        timestampSeconds
      })
      if (updated) {
        set((state) => ({
          chapters: state.chapters
            .map((c) => (c.id === id ? updated : c))
            .sort((a, b) => a.timestampSeconds - b.timestampSeconds)
        }))
      }
    } catch (err) {
      console.error('Failed to update chapter:', err)
    }
  },

  deleteChapter: async (id: string) => {
    const { activeLesson, activeCourse } = get()
    if (!activeLesson || !activeCourse) return

    try {
      const success = await window.api.chapters.delete({
        id,
        lessonId: activeLesson.id,
        courseId: activeCourse.id
      })
      if (success) {
        set((state) => ({
          chapters: state.chapters.filter((c) => c.id !== id)
        }))
      }
    } catch (err) {
      console.error('Failed to delete chapter:', err)
    }
  },

  // Bookmark actions (v0.3)
  fetchBookmarks: async (lessonId: string) => {
    set({ isLoadingBookmarks: true })
    try {
      const bmarks = await window.api.bookmarks.listByLesson(lessonId)
      set({ bookmarks: bmarks || [], isLoadingBookmarks: false })
    } catch (err) {
      console.error('Failed to fetch bookmarks:', err)
      set({ bookmarks: [], isLoadingBookmarks: false })
    }
  },

  addBookmark: async (title?: string, color?: string, timestamp?: number) => {
    const { activeLesson, activeCourse, currentTime } = get()
    if (!activeLesson || !activeCourse) return null
    const time = timestamp !== undefined ? timestamp : currentTime

    try {
      const bmark = await window.api.bookmarks.create({
        courseId: activeCourse.id,
        lessonId: activeLesson.id,
        timestamp: time,
        title,
        color
      })
      set((state) => ({
        bookmarks: [...state.bookmarks, bmark].sort(
          (a, b) => a.timestamp - b.timestamp
        )
      }))
      return bmark
    } catch (err) {
      console.error('Failed to add bookmark:', err)
      return null
    }
  },

  updateBookmark: async (
    id: string,
    updates: { title?: string; color?: string; timestamp?: number }
  ) => {
    try {
      const ok = await window.api.bookmarks.update(id, updates)
      if (ok) {
        set((state) => ({
          bookmarks: state.bookmarks
            .map((b) =>
              b.id === id ? { ...b, ...updates, updatedAt: Date.now() } : b
            )
            .sort((a, b) => a.timestamp - b.timestamp)
        }))
      }
      return ok
    } catch (err) {
      console.error('Failed to update bookmark:', err)
      return false
    }
  },

  deleteBookmark: async (id: string) => {
    try {
      const ok = await window.api.bookmarks.delete(id)
      if (ok) {
        set((state) => ({
          bookmarks: state.bookmarks.filter((b) => b.id !== id)
        }))
      }
      return ok
    } catch (err) {
      console.error('Failed to delete bookmark:', err)
      return false
    }
  },

  // Flashcard actions (v0.3)
  fetchFlashcards: async (lessonId: string) => {
    set({ isLoadingFlashcards: true })
    try {
      const cards = await window.api.flashcards.listByLesson(lessonId)
      set({ flashcards: cards || [], isLoadingFlashcards: false })
    } catch (err) {
      console.error('Failed to fetch lesson flashcards:', err)
      set({ flashcards: [], isLoadingFlashcards: false })
    }
  },

  addFlashcard: async (
    question: string,
    answer: string,
    timestamp?: number
  ) => {
    const { activeLesson, activeCourse, activeModule, currentTime } = get()
    if (!activeLesson || !question.trim() || !answer.trim()) return null
    const time = timestamp !== undefined ? timestamp : currentTime

    try {
      const card = await window.api.flashcards.create({
        courseId: activeCourse?.id,
        moduleId: activeModule?.id,
        lessonId: activeLesson.id,
        timestamp: time,
        question: question.trim(),
        answer: answer.trim()
      })
      set((state) => ({
        flashcards: [card, ...state.flashcards]
      }))
      return card
    } catch (err) {
      console.error('Failed to add flashcard:', err)
      return null
    }
  },

  deleteFlashcard: async (id: string) => {
    try {
      const ok = await window.api.flashcards.delete(id)
      if (ok) {
        set((state) => ({
          flashcards: state.flashcards.filter((f) => f.id !== id)
        }))
      }
      return ok
    } catch (err) {
      console.error('Failed to delete flashcard:', err)
      return false
    }
  },

  setSubtitleTrack: (id: string | null) => {
    set({ activeSubtitleTrack: id })
  },

  // Broken / Error Lessons
  brokenLessonIds: [],

  markLessonBroken: (lessonId: string) => {
    if (!lessonId) return
    const { brokenLessonIds } = get()
    if (!brokenLessonIds.includes(lessonId)) {
      set({ brokenLessonIds: [...brokenLessonIds, lessonId] })
    }
  },

  deleteLesson: async (lessonId: string, deleteFileFromDisk = false) => {
    try {
      const res = await window.api.courses.deleteLesson(
        lessonId,
        deleteFileFromDisk
      )
      if (res.success) {
        const { activeLesson, modulesWithLessons, nextLesson } = get()
        const isCurrentLesson = activeLesson?.id === lessonId

        // Remove lesson from modules in player state
        const updatedModules = modulesWithLessons
          .map((m) => ({
            ...m,
            lessons: m.lessons.filter((l) => l.id !== lessonId)
          }))
          .filter(
            (m) =>
              m.lessons.length > 0 || (m.resources && m.resources.length > 0)
          )

        set((state) => ({
          modulesWithLessons: updatedModules,
          brokenLessonIds: state.brokenLessonIds.filter((id) => id !== lessonId)
        }))

        // If the active lesson was deleted, advance or find another lesson
        if (isCurrentLesson) {
          const advanced = await nextLesson()
          if (!advanced) {
            // Find first available lesson
            const firstAvailable = updatedModules.flatMap((m) => m.lessons)[0]
            if (firstAvailable) {
              await get().loadLesson(firstAvailable.id)
            } else {
              set({ activeLesson: null, isPlaying: false })
            }
          }
        }

        return { success: true }
      }
      return { success: false, error: res.error || 'Failed to delete lesson' }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      return { success: false, error: errorMsg }
    }
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
      bookmarks: [],
      isLoadingBookmarks: false,
      flashcards: [],
      isLoadingFlashcards: false,
      activeSubtitleTrack: null,
      subtitleTracks: [],
      isPiP: false,
      isMiniPlayerActive: false,
      playbackQueue: [],
      brokenLessonIds: []
    })
  }
}))
