import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bookmark, Plus, Trash2, Clock, Check, X } from 'lucide-react'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { Button } from '../ui/button'
import { formatTime } from '../../lib/formatters'
import type { VideoBookmark } from '@shared'

const COLOR_PRESETS = [
  { label: 'Cobre', value: '#d08a52' },
  { label: 'Sálvia', value: '#5b7668' },
  { label: 'Verde', value: '#4f8a68' },
  { label: 'Areia', value: '#c9a66b' },
  { label: 'Vermelho', value: '#b9554d' }
]

export function BookmarksPanel(): React.JSX.Element {
  const { t } = useTranslation()
  const {
    activeLesson,
    currentTime,
    seek,
    bookmarks,
    isLoadingBookmarks,
    addBookmark,
    deleteBookmark
  } = usePlayerStore()

  const [isCreating, setIsCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [selectedColor, setSelectedColor] = useState('#d08a52')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeLesson) return

    const title =
      newTitle.trim() ||
      t('player.bookmarkDefaultTitle', { time: formatTime(currentTime) })
    await addBookmark(title, selectedColor, currentTime)
    setNewTitle('')
    setIsCreating(false)
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await deleteBookmark(id)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex flex-col h-full bg-card/60 select-none overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/70 bg-card/40">
        <div className="flex items-center gap-2">
          <Bookmark className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">
            {t('player.bookmarks', 'Marcadores')} ({bookmarks.length})
          </span>
        </div>
        {!isCreating && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs border-primary/30 hover:border-primary/60 text-primary hover:text-primary bg-primary/10 hover:bg-primary/20"
            onClick={() => setIsCreating(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            {t('player.addBookmark', 'Salvar Trecho')}
          </Button>
        )}
      </div>

      {/* Quick Add Form */}
      {isCreating && (
        <form
          onSubmit={handleSave}
          className="p-3.5 border-b border-border/70 bg-card/90 flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1 font-medium text-primary">
              <Clock className="h-3.5 w-3.5" />
              {t('player.bookmarkAt', { time: formatTime(currentTime) })}
            </span>
            <div className="flex items-center gap-1">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setSelectedColor(c.value)}
                  className="w-4 h-4 rounded-full transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c.value,
                    outline:
                      selectedColor === c.value ? '2px solid white' : 'none',
                    outlineOffset: '1px'
                  }}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          <input
            type="text"
            placeholder={t(
              'player.bookmarkPlaceholder',
              'Ex: Revisar este conceito para a prova...'
            )}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full text-xs bg-background/80 border border-border/80 rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            autoFocus
          />

          <div className="flex justify-end gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => {
                setIsCreating(false)
                setNewTitle('')
              }}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              {t('common.cancel', 'Cancelar')}
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-7 text-xs px-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              {t('common.save', 'Salvar')}
            </Button>
          </div>
        </form>
      )}

      {/* Bookmarks List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoadingBookmarks ? (
          <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
            {t('common.loading', 'Carregando...')}
          </div>
        ) : bookmarks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-4">
            <Bookmark className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">
              {t('player.noBookmarks', 'Nenhum trecho salvo nesta aula.')}
            </p>
            <p className="text-[11px] text-muted-foreground/70 mt-1">
              {t(
                'player.bookmarkHint',
                'Use o botão acima para marcar momentos importantes para revisar depois.'
              )}
            </p>
          </div>
        ) : (
          bookmarks.map((bm: VideoBookmark) => (
            <div
              key={bm.id}
              onClick={() => seek(bm.timestamp)}
              className="group relative flex items-start gap-2.5 p-2.5 rounded-lg border border-border/60 bg-card/40 hover:bg-accent/40 hover:border-border transition-all cursor-pointer"
            >
              <div
                className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                style={{ backgroundColor: bm.color || '#d08a52' }}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                    {formatTime(bm.timestamp)}
                  </span>
                </div>
                <p className="text-xs font-medium text-foreground mt-1 line-clamp-2">
                  {bm.title}
                </p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground/60 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                disabled={deletingId === bm.id}
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(bm.id)
                }}
                title={t('common.delete', 'Excluir')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
