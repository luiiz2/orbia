import React, { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useTranslation } from 'react-i18next'
import {
  ListTree,
  Sparkles,
  Plus,
  Play,
  Pencil,
  Trash2,
  Check,
  X,
  Clock,
  Loader2
} from 'lucide-react'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { Button } from '../ui/button'
import { formatTime } from '../../lib/formatters'
import type { LessonChapter } from '@shared'

export function ChaptersPanel(): React.JSX.Element {
  const { t } = useTranslation()
  const {
    activeLesson,
    currentTime,
    duration,
    chapters,
    isLoadingChapters,
    isGeneratingChapters,
    seek,
    generateChapters,
    addChapter,
    updateChapter,
    deleteChapter
  } = usePlayerStore(
    useShallow((state) => ({
      activeLesson: state.activeLesson,
      currentTime: state.currentTime,
      duration: state.duration,
      chapters: state.chapters,
      isLoadingChapters: state.isLoadingChapters,
      isGeneratingChapters: state.isGeneratingChapters,
      seek: state.seek,
      generateChapters: state.generateChapters,
      addChapter: state.addChapter,
      updateChapter: state.updateChapter,
      deleteChapter: state.deleteChapter
    }))
  )

  const [isAdding, setIsAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newTimestamp, setNewTimestamp] = useState<number>(0)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editTimestamp, setEditTimestamp] = useState<number>(0)

  const activeChapterId = chapters.reduce<string | null>(
    (currentActive, ch, idx) => {
      if (currentTime >= ch.timestampSeconds) {
        const next = chapters[idx + 1]
        if (!next || currentTime < next.timestampSeconds) {
          return ch.id
        }
      }
      return currentActive
    },
    null
  )

  const handleStartAdd = () => {
    setNewTitle('')
    setNewTimestamp(Math.floor(currentTime))
    setIsAdding(true)
  }

  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    await addChapter(newTitle.trim(), newTimestamp)
    setIsAdding(false)
    setNewTitle('')
  }

  const handleStartEdit = (chapter: LessonChapter) => {
    setEditingId(chapter.id)
    setEditTitle(chapter.title)
    setEditTimestamp(chapter.timestampSeconds)
  }

  const handleSaveEdit = async (id: string) => {
    if (!editTitle.trim()) return
    await updateChapter(id, editTitle.trim(), editTimestamp)
    setEditingId(null)
  }

  return (
    <div className="flex flex-col h-full bg-card/60 select-none overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/70 bg-card/40">
        <div className="flex items-center gap-2">
          <ListTree className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">
            {t('player.chapters', 'Capítulos')} ({chapters.length})
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={isGeneratingChapters || !activeLesson}
            onClick={() => generateChapters()}
            className="h-8 gap-1.5 text-xs text-primary hover:text-primary hover:bg-primary/10 border-primary/30"
          >
            {isGeneratingChapters ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {t('player.generateChapters', 'Gerar com IA')}
          </Button>

          {!isAdding && (
            <Button
              size="icon"
              variant="ghost"
              onClick={handleStartAdd}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title={t('player.addChapter', 'Adicionar Capítulo')}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Add Chapter Form */}
      {isAdding && (
        <form
          onSubmit={handleSaveAdd}
          className="p-3 border-b border-border/70 bg-card/90 flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {t('player.newChapter', 'Novo Capítulo')}
            </span>
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <input
                type="number"
                min="0"
                max={Math.floor(duration || 3600)}
                value={newTimestamp}
                onChange={(e) => setNewTimestamp(Number(e.target.value))}
                className="w-16 px-1.5 py-0.5 rounded bg-muted text-foreground text-xs border border-border"
              />
              <span className="text-muted-foreground">
                ({formatTime(newTimestamp)})
              </span>
            </div>
          </div>

          <input
            type="text"
            placeholder={t(
              'player.chapterTitlePlaceholder',
              'Título do capítulo...'
            )}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            autoFocus
            className="w-full px-2.5 py-1 rounded bg-muted/60 text-xs text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary"
          />

          <div className="flex items-center justify-end gap-1.5 pt-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setIsAdding(false)}
              className="h-7 text-xs px-2"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              {t('common.cancel', 'Cancelar')}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!newTitle.trim()}
              className="h-7 text-xs px-2.5 gap-1"
            >
              <Check className="h-3.5 w-3.5" />
              {t('common.save', 'Salvar')}
            </Button>
          </div>
        </form>
      )}

      {/* Chapters List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/40 p-1">
        {isLoadingChapters ? (
          <div className="py-12 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>
              {t('player.loadingChapters', 'Carregando capítulos...')}
            </span>
          </div>
        ) : chapters.length === 0 ? (
          <div className="py-16 px-4 text-center space-y-2">
            <ListTree className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              {t('player.noChapters', 'Nenhum capítulo cadastrado nesta aula.')}
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={isGeneratingChapters || !activeLesson}
              onClick={() => generateChapters()}
              className="text-xs gap-1.5 h-7 text-primary border-primary/20 hover:bg-primary/10"
            >
              <Sparkles className="h-3 w-3" />
              {t('player.generateChapters', 'Gerar com IA')}
            </Button>
          </div>
        ) : (
          chapters.map((ch, idx) => {
            const isActive = ch.id === activeChapterId
            const isEditing = editingId === ch.id

            if (isEditing) {
              return (
                <div
                  key={ch.id}
                  className="p-2.5 bg-card/80 space-y-2 rounded-md"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="flex-1 px-2 py-1 rounded bg-muted text-xs text-foreground border border-border"
                      autoFocus
                    />
                    <input
                      type="number"
                      min="0"
                      max={Math.floor(duration || 3600)}
                      value={editTimestamp}
                      onChange={(e) => setEditTimestamp(Number(e.target.value))}
                      className="w-16 px-1.5 py-1 rounded bg-muted text-xs text-foreground border border-border"
                    />
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                      className="h-6 text-xs px-2"
                    >
                      <X className="h-3 w-3 mr-1" />
                      {t('common.cancel', 'Cancelar')}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleSaveEdit(ch.id)}
                      className="h-6 text-xs px-2"
                    >
                      <Check className="h-3 w-3 mr-1" />
                      {t('common.save', 'Salvar')}
                    </Button>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={ch.id}
                className={`group flex items-center justify-between px-3 py-2 text-xs rounded-md transition-colors ${
                  isActive
                    ? 'bg-primary/15 text-foreground font-medium border-l-2 border-primary'
                    : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                }`}
              >
                <button
                  onClick={() => seek(ch.timestampSeconds)}
                  className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                >
                  <div
                    className={`flex items-center justify-center w-5 h-5 rounded shrink-0 ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/60 text-muted-foreground group-hover:bg-muted'
                    }`}
                  >
                    {isActive ? (
                      <Play className="h-2.5 w-2.5 fill-current" />
                    ) : (
                      <span className="text-[10px] font-mono">{idx + 1}</span>
                    )}
                  </div>
                  <span className="min-w-0 flex-1 break-words whitespace-normal leading-snug">
                    {ch.title}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                    {formatTime(ch.timestampSeconds)}
                  </span>
                </button>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pl-2">
                  <button
                    onClick={() => handleStartEdit(ch)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    title={t('common.edit', 'Editar')}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => deleteChapter(ch.id)}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    title={t('common.delete', 'Excluir')}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
