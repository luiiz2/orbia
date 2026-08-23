import React from 'react'
import { useTranslation } from 'react-i18next'
import { PackageCheck, ShieldCheck, Check, X, Layers, FileText, Sparkles, Bookmark } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '../ui/dialog'
import { Button } from '../ui/button'
import type { BackupPreview } from '@shared'

export interface BackupPreviewModalProps {
  open: boolean
  onClose: () => void
  preview: BackupPreview | null
  onConfirmRestore: () => Promise<void>
  isRestoring: boolean
}

export function BackupPreviewModal({
  open,
  onClose,
  preview,
  onConfirmRestore,
  isRestoring
}: BackupPreviewModalProps): React.JSX.Element {
  const { t } = useTranslation()

  if (!preview) return <></>

  const manifest = preview.manifest
  const formattedDate = manifest?.createdAt
    ? new Date(manifest.createdAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : '-'

  return (
    <Dialog open={open} onOpenChange={(val) => !val && !isRestoring && onClose()}>
      <DialogContent className="max-w-md bg-card/95 backdrop-blur-2xl border border-border/80 p-6 shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 border border-primary/30 text-primary">
              <PackageCheck className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                {t('backup.previewTitle', 'Restaurar Backup do Vault')}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {manifest?.vaultName || 'Vault'} · Orbia {manifest?.appVersion || 'v0.3'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Content Summary Cards */}
        <div className="space-y-3 my-3">
          <div className="p-3.5 rounded-2xl bg-secondary/30 border border-border/60 text-xs space-y-2">
            <div className="flex items-center justify-between text-muted-foreground pb-1.5 border-b border-border/40">
              <span>Data de Criação</span>
              <span className="font-semibold text-foreground">{formattedDate}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="flex items-center gap-2 p-2 rounded-xl bg-background/60 border border-border/40">
                <Layers className="h-4 w-4 text-primary" />
                <div>
                  <div className="font-bold text-foreground text-xs">{manifest?.courseCount ?? 0}</div>
                  <div className="text-[10px] text-muted-foreground">Cursos</div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 rounded-xl bg-background/60 border border-border/40">
                <FileText className="h-4 w-4 text-emerald-400" />
                <div>
                  <div className="font-bold text-foreground text-xs">{manifest?.notesCount ?? 0}</div>
                  <div className="text-[10px] text-muted-foreground">Anotações</div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 rounded-xl bg-background/60 border border-border/40">
                <Sparkles className="h-4 w-4 text-purple-400" />
                <div>
                  <div className="font-bold text-foreground text-xs">{manifest?.flashcardsCount ?? 0}</div>
                  <div className="text-[10px] text-muted-foreground">Flashcards</div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 rounded-xl bg-background/60 border border-border/40">
                <Bookmark className="h-4 w-4 text-amber-500" />
                <div>
                  <div className="font-bold text-foreground text-xs">{manifest?.bookmarksCount ?? 0}</div>
                  <div className="text-[10px] text-muted-foreground">Marcadores</div>
                </div>
              </div>
            </div>
          </div>

          {/* Safety Rollback Badge */}
          <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
            <ShieldCheck className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
            <span>
              {t('backup.safetyNotice', 'Uma cópia de segurança do seu banco atual será criada automaticamente antes de restaurar.')}
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isRestoring}
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            {t('common.cancel', 'Cancelar')}
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={isRestoring}
            onClick={onConfirmRestore}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
          >
            {isRestoring ? (
              <span className="flex items-center gap-1.5">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {t('backup.restoring', 'Restaurando...')}
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5" />
                {t('backup.confirmRestore', 'Confirmar Restauração')}
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
