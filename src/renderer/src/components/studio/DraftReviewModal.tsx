import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
import { Button } from '../ui/button'
import { useStudioStore } from '../../stores/useStudioStore'
import { CheckCircle2, Trash2 } from 'lucide-react'

export function DraftReviewModal(): React.JSX.Element | null {
  const {
    draftChanges,
    isDraftModalOpen,
    setDraftModalOpen,
    removeDraftChange,
    clearDraftChanges,
    applyDraftChanges,
    isLoading
  } = useStudioStore()

  if (draftChanges.length === 0 && !isDraftModalOpen) return null

  return (
    <Dialog open={isDraftModalOpen} onOpenChange={setDraftModalOpen}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <span>Revisar Alterações Pendentes ({draftChanges.length})</span>
          </DialogTitle>
          <DialogDescription>
            Confirme as edições em lote antes de gravá-las no banco de dados.
            Todas as operações são transacionais e reversíveis pelo Histórico.
          </DialogDescription>
        </DialogHeader>

        {/* Changes List */}
        <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[360px] rounded-lg border border-border/40 bg-muted/10 p-2 space-y-1.5 text-xs font-mono">
          {draftChanges.map((change, idx) => (
            <div
              key={`${change.appearanceId}-${change.field}-${idx}`}
              className="flex items-center justify-between gap-3 p-2 rounded bg-background border border-border/30"
            >
              <div className="flex-1 min-w-0">
                <span className="font-bold text-foreground capitalize mr-2">
                  [{change.field}]
                </span>
                <span className="text-muted-foreground line-through mr-2">
                  {String(change.oldValue ?? '(vazio)')}
                </span>
                <span className="text-primary font-semibold">
                  ➔ {String(change.newValue ?? '(vazio)')}
                </span>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeDraftChange(idx)}
                className="h-6 w-6 text-muted-foreground hover:text-destructive rounded"
                aria-label="Descartar esta alteração"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>

        <DialogFooter className="flex items-center justify-between w-full pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearDraftChanges}
            className="text-destructive hover:bg-destructive/10"
          >
            Descartar Todas
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDraftModalOpen(false)}
            >
              Continuar Editando
            </Button>
            <Button
              size="sm"
              onClick={applyDraftChanges}
              disabled={isLoading || draftChanges.length === 0}
            >
              {isLoading
                ? 'Gravando...'
                : `Aplicar ${draftChanges.length} Alterações`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
