import React, { useEffect } from 'react'
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
import { History, RotateCcw, Clock } from 'lucide-react'

export function OrganizationHistoryModal(): React.JSX.Element | null {
  const {
    history,
    isHistoryModalOpen,
    setHistoryModalOpen,
    fetchHistory,
    undoHistoryEntry,
    isLoading
  } = useStudioStore()

  useEffect(() => {
    if (isHistoryModalOpen) {
      fetchHistory().catch(console.warn)
    }
  }, [isHistoryModalOpen, fetchHistory])

  return (
    <Dialog open={isHistoryModalOpen} onOpenChange={setHistoryModalOpen}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <span>Histórico de Organização da Biblioteca</span>
          </DialogTitle>
          <DialogDescription>
            Visualize todas as alterações de estrutura, renomeações em massa e
            automações. É possível desfazer operações de forma segura.
          </DialogDescription>
        </DialogHeader>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto min-h-[220px] max-h-[380px] space-y-2 p-1 text-xs">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <Clock className="h-8 w-8 mb-2 opacity-40" />
              <p>Nenhuma operação registrada no histórico até o momento.</p>
            </div>
          ) : (
            history.map((entry) => (
              <div
                key={entry.id}
                className={`flex items-center justify-between gap-4 p-3 rounded-xl border transition-all ${
                  entry.isUndone
                    ? 'bg-muted/10 border-border/30 opacity-60'
                    : 'bg-card border-border/60 shadow-sm'
                }`}
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                    {entry.isUndone && (
                      <span className="px-1.5 py-0.2 text-[10px] rounded bg-muted text-muted-foreground font-semibold">
                        Desfeita
                      </span>
                    )}
                  </div>
                  <h4 className="break-words whitespace-normal font-semibold text-foreground leading-snug">
                    {entry.description}
                  </h4>
                </div>

                {!entry.isUndone && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => undoHistoryEntry(entry.id)}
                    disabled={isLoading}
                    className="h-8 px-2.5 text-xs rounded-lg flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Desfazer</span>
                  </Button>
                )}
              </div>
            ))
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHistoryModalOpen(false)}
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
