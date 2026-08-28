import { create } from 'zustand'
import type { AiNoteRequest, AiNoteSuggestion } from '@shared'
import { usePlayerStore } from './usePlayerStore'

interface AiNotesState {
  isOpen: boolean
  suggestion: AiNoteSuggestion | null
  isLoading: boolean
  error: string | null
  targetNoteId?: string

  requestSuggestion: (input: AiNoteRequest) => Promise<void>
  applySuggestion: () => Promise<void>
  closeModal: () => void
}

export const useAiNotesStore = create<AiNotesState>((set, get) => ({
  isOpen: false,
  suggestion: null,
  isLoading: false,
  error: null,
  targetNoteId: undefined,

  requestSuggestion: async (input: AiNoteRequest) => {
    set({
      isOpen: true,
      isLoading: true,
      error: null,
      targetNoteId: input.noteId,
      suggestion: null
    })

    try {
      const suggestion = await window.api.aiNotes.suggest(input)
      set({ suggestion, isLoading: false })
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Falha ao gerar sugestão de anotação.'
      set({ error: message, isLoading: false })
    }
  },

  applySuggestion: async () => {
    const { suggestion, targetNoteId } = get()
    if (!suggestion) return

    const { addNote, updateNote } = usePlayerStore.getState()

    try {
      if (targetNoteId) {
        await updateNote(targetNoteId, suggestion.suggestedContent)
      } else {
        await addNote(suggestion.suggestedContent)
      }
      set({
        isOpen: false,
        suggestion: null,
        targetNoteId: undefined,
        error: null
      })
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Falha ao salvar anotação.'
      set({ error: message })
    }
  },

  closeModal: () => {
    set({
      isOpen: false,
      suggestion: null,
      targetNoteId: undefined,
      error: null,
      isLoading: false
    })
  }
}))
