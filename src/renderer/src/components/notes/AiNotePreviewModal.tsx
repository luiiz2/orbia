import React from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Check, X, FileText, Info, Loader2 } from 'lucide-react'
import { useAiNotesStore } from '../../stores/useAiNotesStore'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '../ui/dialog'

export function AiNotePreviewModal(): React.JSX.Element {
  const { t } = useTranslation()
  const {
    isOpen,
    suggestion,
    isLoading,
    error,
    targetNoteId,
    applySuggestion,
    closeModal
  } = useAiNotesStore()

  if (!isOpen) return <></>

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col p-0 overflow-hidden bg-background border-border/80 text-foreground">
        {/* Header */}
        <DialogHeader className="p-4 border-b border-border/60 bg-muted/20 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold">
                {suggestion?.titleSuggestion ||
                  t('aiNotes.suggestionTitle', 'Sugestão de Anotação com IA')}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {t(
                  'aiNotes.reviewNotice',
                  'Revise o conteúdo sugerido antes de salvar.'
                )}
              </DialogDescription>
            </div>
          </div>

          <Button
            size="icon"
            variant="ghost"
            onClick={closeModal}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {isLoading && (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs font-medium">
                {t('aiNotes.generating', 'Processando sugestão com IA...')}
              </p>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              {error}
            </div>
          )}

          {suggestion && !isLoading && (
            <>
              {/* Explanation note */}
              {suggestion.explanation && (
                <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/30 border border-border/40 text-muted-foreground">
                  <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <span className="leading-relaxed">
                    {suggestion.explanation}
                  </span>
                </div>
              )}

              {/* Side-by-side or original snippet if existing note was improved */}
              {suggestion.originalContent && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    {t('aiNotes.original', 'Conteúdo Original')}
                  </label>
                  <div className="p-2.5 rounded-md bg-muted/20 border border-border/40 text-muted-foreground line-through max-h-28 overflow-y-auto whitespace-pre-wrap">
                    {suggestion.originalContent}
                  </div>
                </div>
              )}

              {/* Suggested Content */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-foreground uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-primary" />
                  {t('aiNotes.suggested', 'Conteúdo Sugerido')}
                </label>
                <div className="p-3 rounded-md bg-primary/5 border border-primary/20 text-foreground max-h-60 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {suggestion.suggestedContent}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 border-t border-border/60 bg-muted/20 flex items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={closeModal}
            className="h-8 text-xs px-3 text-muted-foreground hover:text-foreground"
          >
            {t('common.discard', 'Descartar')}
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={isLoading || !suggestion}
            onClick={applySuggestion}
            className="h-8 text-xs px-3.5 gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
          >
            <Check className="h-3.5 w-3.5" />
            {targetNoteId
              ? t('aiNotes.updateNote', 'Atualizar Anotação')
              : t('aiNotes.saveNote', 'Salvar como Anotação')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
