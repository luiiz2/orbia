import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Clock,
  Plus,
  Pencil,
  Trash2,
  Download,
  Check,
  X,
  Loader2,
  BookOpen
} from 'lucide-react'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { Button } from '../ui/button'
import { formatTime } from '../../lib/formatters'
import { cn } from '../../lib/utils'

export interface NotesPanelProps {
  className?: string
}

export function NotesPanel({ className }: NotesPanelProps): React.JSX.Element {
  const { t } = useTranslation()
  const {
    activeCourse,
    activeLesson,
    currentTime,
    notes,
    isLoadingNotes,
    seek,
    addNote,
    updateNote,
    deleteNote,
    exportNotes
  } = usePlayerStore()

  const [newContent, setNewContent] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState<string>('')
  const [isExporting, setIsExporting] = useState<boolean>(false)
  const [exportSuccess, setExportSuccess] = useState<boolean>(false)

  const handleAddNote = async (e?: React.FormEvent): Promise<void> => {
    if (e) e.preventDefault()
    if (!newContent.trim() || isSubmitting) return

    setIsSubmitting(true)
    try {
      await addNote(newContent)
      setNewContent('')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleAddNote()
    }
  }

  const startEdit = (id: string, currentContent: string): void => {
    setEditingId(id)
    setEditingContent(currentContent)
  }

  const cancelEdit = (): void => {
    setEditingId(null)
    setEditingContent('')
  }

  const saveEdit = async (id: string): Promise<void> => {
    if (!editingContent.trim()) return
    await updateNote(id, editingContent)
    setEditingId(null)
    setEditingContent('')
  }

  const handleExport = async (): Promise<void> => {
    if (!activeCourse || isExporting) return

    setIsExporting(true)
    try {
      const markdown = await exportNotes(activeCourse.id)
      if (markdown) {
        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const cleanTitle = (activeCourse.title || 'course')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
        a.download = `${cleanTitle}-notes.md`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        setExportSuccess(true)
        setTimeout(() => setExportSuccess(false), 3000)
      }
    } catch (err) {
      console.error('Failed to export notes:', err)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className={cn('flex flex-col h-full space-y-3', className)}>
      {/* Header with Export Action */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5 text-primary" />
          <span>
            {t('player.notes')}: <strong className="text-foreground">{notes.length}</strong>
          </span>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={!activeCourse || isExporting}
          className={cn(
            'h-7 px-2.5 text-[11px] font-medium gap-1.5 rounded-lg border-border/80 hover:bg-secondary transition-all',
            exportSuccess && 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10'
          )}
          title={t('player.exportNotes')}
        >
          {isExporting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : exportSuccess ? (
            <Check className="h-3 w-3 text-emerald-400" />
          ) : (
            <Download className="h-3 w-3" />
          )}
          <span>{exportSuccess ? t('player.notesExported') : t('player.exportNotes')}</span>
        </Button>
      </div>

      {/* New Note Input Form */}
      <div className="rounded-xl border border-border/80 bg-card/60 p-2.5 space-y-2 shadow-sm focus-within:border-primary/50 transition-colors">
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('player.addNotePlaceholder')}
          rows={2}
          disabled={!activeLesson}
          className="w-full resize-none bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
        />

        <div className="flex items-center justify-between pt-1 border-t border-border/40">
          <span className="text-[10px] text-muted-foreground">
            <kbd className="px-1 py-0.5 rounded bg-secondary text-[9px] font-mono border border-border/60">
              Ctrl+Enter
            </kbd>{' '}
            {t('common.save')}
          </span>

          <Button
            size="sm"
            onClick={() => handleAddNote()}
            disabled={!newContent.trim() || isSubmitting || !activeLesson}
            className="h-7 px-2.5 text-[11px] font-semibold gap-1 rounded-lg"
          >
            {isSubmitting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            <span>{t('player.addNoteAt', { time: formatTime(currentTime) })}</span>
          </Button>
        </div>
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {isLoadingNotes ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-xs">{t('common.loading')}</p>
          </div>
        ) : notes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 p-6 text-center space-y-2">
            <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <BookOpen className="h-5 w-5" />
            </div>
            <h4 className="text-xs font-semibold text-foreground">{t('player.noNotes')}</h4>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {t('player.noNotesSubtitle')}
            </p>
          </div>
        ) : (
          notes.map((note) => {
            const isEditing = editingId === note.id

            return (
              <div
                key={note.id}
                className={cn(
                  'group relative rounded-xl border border-border/80 bg-secondary/20 p-2.5 text-xs transition-all hover:bg-secondary/40 hover:border-border shadow-sm'
                )}
              >
                {/* Note Header: Timestamp badge & Actions */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <button
                    type="button"
                    onClick={() => seek(note.timestampSeconds)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary font-mono text-[11px] font-semibold hover:bg-primary/20 transition-colors cursor-pointer"
                    title={`Seek to ${formatTime(note.timestampSeconds)}`}
                  >
                    <Clock className="h-3 w-3" />
                    <span>{formatTime(note.timestampSeconds)}</span>
                  </button>

                  {/* Edit / Delete actions */}
                  {!isEditing && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startEdit(note.id, note.content)}
                        className="h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-secondary"
                        title={t('player.editNote')}
                        aria-label={t('player.editNote')}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteNote(note.id)}
                        className="h-6 w-6 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title={t('player.deleteNote')}
                        aria-label={t('player.deleteNote')}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Note Content / Editing Form */}
                {isEditing ? (
                  <div className="space-y-2 mt-1">
                    <textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      rows={3}
                      className="w-full resize-none rounded-lg border border-border bg-card p-2 text-xs text-foreground focus:outline-none focus:border-primary"
                      autoFocus
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cancelEdit}
                        className="h-6 px-2 text-[11px]"
                      >
                        <X className="h-3 w-3 mr-1" />
                        {t('common.cancel')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveEdit(note.id)}
                        disabled={!editingContent.trim()}
                        className="h-6 px-2 text-[11px]"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        {t('common.save')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => seek(note.timestampSeconds)}
                    className="cursor-pointer text-foreground/90 whitespace-pre-wrap leading-relaxed select-text"
                  >
                    {note.content}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
