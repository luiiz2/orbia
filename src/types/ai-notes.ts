export type AiNoteAction =
  | 'create_from_selection'
  | 'explain_and_save'
  | 'summarize_segment'
  | 'improve_note'
  | 'organize_note'

export interface AiNoteRequest {
  action: AiNoteAction
  lessonId: string
  courseId: string
  timestampSeconds?: number
  selectedText?: string
  noteId?: string
  existingContent?: string
  instruction?: string
  cloudConsent?: boolean
}

export interface AiNoteSuggestion {
  action: AiNoteAction
  lessonId: string
  courseId: string
  timestampSeconds: number
  selectedText?: string
  originalContent?: string
  suggestedContent: string
  titleSuggestion?: string
  explanation?: string
}
