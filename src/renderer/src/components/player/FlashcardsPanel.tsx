import React, { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useTranslation } from 'react-i18next'
import { Sparkles, Plus, Trash2, Clock, Check, X, Layers } from 'lucide-react'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { Button } from '../ui/button'
import { formatTime } from '../../lib/formatters'
import type { Flashcard } from '@shared'

export function FlashcardsPanel(): React.JSX.Element {
  const { t } = useTranslation()
  const {
    currentTime,
    seek,
    flashcards,
    isLoadingFlashcards,
    addFlashcard,
    deleteFlashcard
  } = usePlayerStore(
    useShallow((state) => ({
      currentTime: state.currentTime,
      seek: state.seek,
      flashcards: state.flashcards,
      isLoadingFlashcards: state.isLoadingFlashcards,
      addFlashcard: state.addFlashcard,
      deleteFlashcard: state.deleteFlashcard
    }))
  )

  const [isCreating, setIsCreating] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [includeTimestamp, setIncludeTimestamp] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!question.trim() || !answer.trim()) return

    await addFlashcard(
      question.trim(),
      answer.trim(),
      includeTimestamp ? currentTime : undefined
    )

    setQuestion('')
    setAnswer('')
    setIsCreating(false)
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await deleteFlashcard(id)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex flex-col h-full bg-card/60 select-none overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/70 bg-card/40">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <span className="font-semibold text-sm text-foreground">
            {t('player.flashcards', 'Flashcards')} ({flashcards.length})
          </span>
        </div>
        {!isCreating && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs border-accent/30 hover:border-accent/60 text-accent hover:text-accent bg-accent/10 hover:bg-accent/20"
            onClick={() => setIsCreating(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            {t('player.addFlashcard', '+ Flashcard')}
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
            <label className="flex items-center gap-1.5 cursor-pointer text-accent font-medium select-none">
              <input
                type="checkbox"
                checked={includeTimestamp}
                onChange={(e) => setIncludeTimestamp(e.target.checked)}
                className="rounded border-border"
              />
              <Clock className="h-3 w-3" />
              <span>
                {t('player.linkTimestamp', 'Vincular a')}{' '}
                {formatTime(currentTime)}
              </span>
            </label>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t('player.flashcardQuestion', 'Pergunta')}
            </label>
            <input
              type="text"
              placeholder={t(
                'player.questionPlaceholder',
                'Ex: O que é memoization?'
              )}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full text-xs bg-background/80 border border-border/80 rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t('player.flashcardAnswer', 'Resposta')}
            </label>
            <textarea
              rows={2}
              placeholder={t(
                'player.answerPlaceholder',
                'Ex: Técnica de otimização que armazena resultados de chamadas caras...'
              )}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="w-full text-xs bg-background/80 border border-border/80 rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
            />
          </div>

          <div className="flex justify-end gap-1.5 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => {
                setIsCreating(false)
                setQuestion('')
                setAnswer('')
              }}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              {t('common.cancel', 'Cancelar')}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!question.trim() || !answer.trim()}
              className="h-7 text-xs px-2.5 bg-accent hover:bg-accent text-accent-foreground font-medium disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              {t('common.save', 'Salvar')}
            </Button>
          </div>
        </form>
      )}

      {/* Flashcards List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoadingFlashcards ? (
          <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
            {t('common.loading', 'Carregando...')}
          </div>
        ) : flashcards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-4">
            <Layers className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">
              {t('player.noFlashcards', 'Nenhum flashcard criado nesta aula.')}
            </p>
            <p className="text-[11px] text-muted-foreground/70 mt-1">
              {t(
                'player.flashcardHint',
                'Crie flashcards rápidos sobre os conceitos explicados para revisar depois.'
              )}
            </p>
          </div>
        ) : (
          flashcards.map((card: Flashcard) => (
            <div
              key={card.id}
              className="group relative p-2.5 rounded-lg border border-border/60 bg-card/40 hover:bg-accent/40 hover:border-border transition-all flex flex-col gap-1.5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-foreground leading-snug">
                  {card.question}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground/60 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0 -mr-1 -mt-1"
                  disabled={deletingId === card.id}
                  onClick={() => handleDelete(card.id)}
                  title={t('common.delete', 'Excluir')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="p-2 rounded bg-background/50 border border-border/40 text-xs text-muted-foreground">
                {card.answer}
              </div>

              {card.timestamp !== undefined && card.timestamp !== null && (
                <button
                  type="button"
                  onClick={() => seek(card.timestamp!)}
                  className="flex items-center gap-1 text-[11px] text-accent hover:text-accent w-fit font-mono font-medium hover:underline pt-0.5"
                >
                  <Clock className="h-3 w-3" />
                  <span>{formatTime(card.timestamp)}</span>
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
