import { ipcMain } from 'electron'
import type { AiNoteAction, AiNoteRequest } from '../../types/ai-notes'
import { aiNotesService } from '../services/ai-notes/ai-notes.service'

const VALID_ACTIONS: AiNoteAction[] = [
  'create_from_selection',
  'explain_and_save',
  'summarize_segment',
  'improve_note',
  'organize_note'
]

function readAiNoteRequest(value: unknown): AiNoteRequest {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid AI note request')
  }
  const raw = value as Record<string, unknown>
  const action = raw.action as AiNoteAction
  if (!VALID_ACTIONS.includes(action)) {
    throw new Error('Invalid AI note action')
  }
  if (typeof raw.lessonId !== 'string' || !raw.lessonId.trim()) {
    throw new Error('Invalid lessonId')
  }
  if (typeof raw.courseId !== 'string' || !raw.courseId.trim()) {
    throw new Error('Invalid courseId')
  }

  return {
    action,
    lessonId: raw.lessonId.trim(),
    courseId: raw.courseId.trim(),
    timestampSeconds: typeof raw.timestampSeconds === 'number' ? raw.timestampSeconds : undefined,
    selectedText: typeof raw.selectedText === 'string' ? raw.selectedText.trim() : undefined,
    noteId: typeof raw.noteId === 'string' ? raw.noteId.trim() : undefined,
    existingContent: typeof raw.existingContent === 'string' ? raw.existingContent : undefined,
    instruction: typeof raw.instruction === 'string' ? raw.instruction.trim() : undefined,
    cloudConsent: raw.cloudConsent === true
  }
}

export function registerAiNotesIpc(): void {
  ipcMain.handle('ai-notes:suggest', async (_event, payload: unknown) => {
    const request = readAiNoteRequest(payload)
    return aiNotesService.suggestNote(request)
  })
}
