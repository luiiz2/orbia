import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FolderSync,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  Loader2,
  FileVideo,
  Sparkles
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import type { OperationPlan } from '@shared'

interface ReorganizeCourseModalProps {
  courseId: string
  courseTitle: string
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function ReorganizeCourseModal({
  courseId,
  courseTitle,
  isOpen,
  onClose,
  onSuccess
}: ReorganizeCourseModalProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const [plan, setPlan] = useState<OperationPlan | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isApplying, setIsApplying] = useState<boolean>(false)
  const [isUndoing, setIsUndoing] = useState<boolean>(false)
  const [appliedGroupId, setAppliedGroupId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const fetchPlan = useCallback(async (): Promise<void> => {
    if (!courseId) return
    setIsLoading(true)
    setErrorMessage(null)
    setSuccessMessage(null)
    setAppliedGroupId(null)

    try {
      const res = await window.api.courses.getReorganizePlan(courseId)
      if (res.success && res.plan) {
        setPlan(res.plan)
      } else {
        setErrorMessage(
          res.error || 'Não foi possível gerar o plano de organização.'
        )
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [courseId])

  useEffect(() => {
    if (isOpen) {
      void fetchPlan()
    }
  }, [isOpen, fetchPlan])

  if (!isOpen) return null

  const handleApply = async (): Promise<void> => {
    if (!plan || plan.proposedMutations.length === 0) return
    setIsApplying(true)
    setErrorMessage(null)

    try {
      const res = await window.api.courses.applyReorganizePlan(
        plan.groupId,
        plan.proposedMutations,
        courseId
      )

      if (res.success) {
        setAppliedGroupId(plan.groupId)
        setSuccessMessage(
          `Organização física concluída com sucesso! ${res.appliedCount || 0} arquivos foram padronizados no disco.`
        )
        if (onSuccess) onSuccess()
      } else {
        setErrorMessage(res.error || 'Erro ao aplicar a reorganização física.')
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setIsApplying(false)
    }
  }

  const handleUndo = async (): Promise<void> => {
    if (!appliedGroupId) return
    setIsUndoing(true)
    setErrorMessage(null)

    try {
      const res = await window.api.courses.undoReorganizePlan(appliedGroupId)
      if (res.success) {
        setAppliedGroupId(null)
        setSuccessMessage(
          'A reorganização foi desfeita. Todos os arquivos retornaram aos nomes originais.'
        )
        void fetchPlan()
        if (onSuccess) onSuccess()
      } else {
        setErrorMessage(res.error || 'Não foi possível desfazer as operações.')
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setIsUndoing(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl w-[92vw] max-h-[88vh] p-0 overflow-hidden rounded-2xl flex flex-col gap-0 border-border/80 bg-card shadow-2xl">
        {/* Header Bar */}
        <DialogHeader className="px-5 py-4 border-b border-border/80 bg-card flex flex-row items-center justify-between space-y-0 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden mr-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/20">
              <FolderSync className="h-5 w-5" />
            </div>
            <div className="flex flex-col overflow-hidden min-w-0">
              <DialogTitle className="text-sm sm:text-base font-bold text-foreground truncate">
                Organizar Arquivos no Disco
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground truncate">
                Padronizar pastas e arquivos físicos do curso{' '}
                <span className="font-semibold text-foreground">
                  "{courseTitle}"
                </span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-xs">
                Analisando nomes e estruturas de arquivos...
              </p>
            </div>
          ) : errorMessage ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Ocorreu um problema</p>
                <p className="mt-1">{errorMessage}</p>
              </div>
            </div>
          ) : successMessage ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-300 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-emerald-400" />
              <div className="space-y-1">
                <p className="font-bold text-emerald-400">Sucesso</p>
                <p>{successMessage}</p>
              </div>
            </div>
          ) : plan && plan.proposedMutations.length === 0 ? (
            <div className="rounded-2xl border border-border/80 bg-secondary/20 p-8 text-center space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400 mx-auto">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h4 className="font-bold text-sm text-foreground">
                Estrutura 100% Organizada!
              </h4>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Todas as pastas e nomes de arquivos físicos deste curso já
                seguem a numeração e ordem perfeitas no seu computador. Nenhuma
                alteração é necessária.
              </p>
            </div>
          ) : plan ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 flex items-start gap-3 text-xs text-foreground">
                <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-semibold text-primary">
                    Prévia Segura:{' '}
                  </span>
                  O Orbia criará cópias organizadas e renomeará{' '}
                  <span className="font-bold text-foreground">
                    {plan.proposedMutations.length} arquivos
                  </span>{' '}
                  de acordo com a ordem oficial das aulas. Esta ação é
                  registrada em diário e{' '}
                  <span className="underline decoration-primary font-semibold">
                    pode ser desfeita a qualquer momento
                  </span>
                  .
                </div>
              </div>

              {plan.hasConflicts && plan.conflictDetails && (
                <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-primary space-y-1">
                  <div className="flex items-center gap-2 font-bold text-primary">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Conflitos Detectados</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-primary">
                    {plan.conflictDetails.map((detail, idx) => (
                      <li key={idx}>{detail}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Operations Table */}
              <div className="rounded-xl border border-border/80 overflow-hidden">
                <div className="bg-secondary/60 px-3 py-2 border-b border-border/70 text-[11px] font-semibold text-muted-foreground flex justify-between items-center">
                  <span>
                    Renomeações Propostas ({plan.proposedMutations.length})
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[10px] py-0 border-emerald-500/40 text-emerald-400"
                  >
                    Reversível
                  </Badge>
                </div>
                <div className="divide-y divide-border/40 max-h-72 overflow-y-auto">
                  {plan.proposedMutations.map((mut, idx) => (
                    <div
                      key={idx}
                      className="p-3 text-xs flex items-center justify-between gap-3 hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden flex-1 min-w-0">
                        <FileVideo className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex flex-col overflow-hidden min-w-0">
                          <span
                            className="text-muted-foreground truncate text-[11px]"
                            title={mut.originalFileName}
                          >
                            {mut.originalFileName}
                          </span>
                          <span
                            className="font-semibold text-primary truncate text-xs"
                            title={mut.newFileName}
                          >
                            {mut.newFileName}
                          </span>
                        </div>
                      </div>

                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer Buttons */}
        <DialogFooter className="px-5 py-3 border-t border-border/80 bg-card flex flex-row items-center justify-between sm:justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isApplying || isUndoing}
            className="rounded-xl text-xs h-8.5"
          >
            {t('common.cancel', 'Fechar')}
          </Button>

          <div className="flex items-center gap-2">
            {appliedGroupId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleUndo()}
                disabled={isUndoing}
                className="gap-1.5 rounded-xl text-xs border-primary/40 text-primary hover:bg-primary/10 h-8.5 cursor-pointer"
              >
                {isUndoing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                <span>Desfazer Organização</span>
              </Button>
            )}

            {!appliedGroupId && plan && plan.proposedMutations.length > 0 && (
              <Button
                variant="default"
                size="sm"
                onClick={() => void handleApply()}
                disabled={isApplying || plan.hasConflicts}
                className="gap-1.5 rounded-xl text-xs h-8.5 font-semibold cursor-pointer"
              >
                {isApplying ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Aplicando...</span>
                  </>
                ) : (
                  <>
                    <FolderSync className="h-3.5 w-3.5" />
                    <span>Aplicar Organização</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
