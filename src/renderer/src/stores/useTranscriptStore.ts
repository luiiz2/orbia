import { create } from 'zustand'
import type {
  Transcript,
  TranscriptProgressEvent,
  TranscriptionEnqueueResult,
  TranscriptionOptions
} from '@shared'

interface TranscriptStoreState {
  lessonId: string | null
  transcript: Transcript | null
  subtitleCandidate: Awaited<
    ReturnType<Window['api']['transcription']['getSubtitleCandidate']>
  >
  isLoading: boolean
  errorMessage: string | null
  progress: TranscriptProgressEvent | null
  load: (lessonId: string) => Promise<void>
  transcribe: (
    options?: TranscriptionOptions
  ) => Promise<TranscriptionEnqueueResult | null>
  retranscribe: (
    options?: TranscriptionOptions
  ) => Promise<TranscriptionEnqueueResult | null>
  reuseSubtitle: (language?: string) => Promise<Transcript | null>
  clear: () => void
}

export const useTranscriptStore = create<TranscriptStoreState>((set, get) => ({
  lessonId: null,
  transcript: null,
  subtitleCandidate: null,
  isLoading: false,
  errorMessage: null,
  progress: null,

  load: async (lessonId: string) => {
    set({
      lessonId,
      transcript: null,
      subtitleCandidate: null,
      isLoading: true,
      errorMessage: null,
      progress: null
    })
    try {
      const [transcript, subtitleCandidate] = await Promise.all([
        window.api.transcription.getCurrent(lessonId),
        window.api.transcription.getSubtitleCandidate(lessonId)
      ])
      if (get().lessonId !== lessonId) return
      set({ transcript, subtitleCandidate, isLoading: false })
    } catch (error) {
      if (get().lessonId !== lessonId) return
      set({
        isLoading: false,
        errorMessage:
          error instanceof Error ? error.message : 'Failed to load transcript'
      })
    }
  },

  transcribe: async (options = {}) => {
    const lessonId = get().lessonId
    if (!lessonId) return null
    set({ errorMessage: null })
    try {
      const result = await window.api.transcription.enqueueLesson(
        lessonId,
        options
      )
      set({
        progress: result.jobId
          ? {
              jobId: result.jobId,
              lessonId,
              status: 'queued',
              progressPercent: 0
            }
          : null
      })
      return result
    } catch (error) {
      set({
        errorMessage:
          error instanceof Error
            ? error.message
            : 'Failed to queue transcription'
      })
      return null
    }
  },

  retranscribe: async (options = {}) =>
    get().transcribe({
      ...options,
      retranscribe: true,
      reuseExistingSubtitle: false
    }),

  reuseSubtitle: async (language?: string) => {
    const lessonId = get().lessonId
    if (!lessonId) return null
    set({ errorMessage: null })
    try {
      const transcript = await window.api.transcription.reuseSubtitle(
        lessonId,
        language
      )
      if (get().lessonId === lessonId)
        set({ transcript, subtitleCandidate: null })
      return transcript
    } catch (error) {
      set({
        errorMessage:
          error instanceof Error ? error.message : 'Failed to reuse subtitle'
      })
      return null
    }
  },

  clear: () =>
    set({
      lessonId: null,
      transcript: null,
      subtitleCandidate: null,
      isLoading: false,
      errorMessage: null,
      progress: null
    })
}))

export function applyTranscriptProgress(event: TranscriptProgressEvent): void {
  const state = useTranscriptStore.getState()
  if (state.lessonId !== event.lessonId) return
  setProgress(event)
}

function setProgress(event: TranscriptProgressEvent): void {
  useTranscriptStore.setState({
    progress: event,
    ...(event.status === 'completed' ? { errorMessage: null } : {}),
    ...(event.errorMessage ? { errorMessage: event.errorMessage } : {})
  })
  if (event.status === 'completed')
    void useTranscriptStore.getState().load(event.lessonId)
}
