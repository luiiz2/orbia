import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  Trash2,
  Loader2,
  HardDrive,
  ShieldAlert
} from 'lucide-react'
import type { Vault } from '@shared'
import { useVaultStore } from '../../stores/useVaultStore'
import { useLibraryStore } from '../../stores/useLibraryStore'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button
} from '../ui'

export interface DeleteVaultModalProps {
  vault: Vault | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}

export function DeleteVaultModal({
  vault,
  open,
  onOpenChange,
  onDeleted
}: DeleteVaultModalProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const { deleteVault, currentVault } = useVaultStore()
  const { fetchCourses } = useLibraryStore()

  const [deleteFiles, setDeleteFiles] = useState<boolean>(false)
  const [isDeleting, setIsDeleting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  if (!vault) return null

  const isCurrentActive = currentVault?.path === vault.path

  const handleDelete = async (): Promise<void> => {
    setIsDeleting(true)
    setError(null)
    try {
      const res = await deleteVault(vault.path, deleteFiles)
      if (res.success) {
        if (isCurrentActive) {
          await fetchCourses().catch(() => {})
        }
        onOpenChange(false)
        setDeleteFiles(false)
        if (onDeleted) {
          onDeleted()
        }
      } else {
        setError(res.error || 'Falha ao excluir vault')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir vault')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleClose = (): void => {
    if (!isDeleting) {
      setDeleteFiles(false)
      setError(null)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md bg-card border-border text-foreground rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/15 text-destructive border border-destructive/30 shadow-md">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                {deleteFiles
                  ? t('vault.deletePermanentTitle', 'Excluir Vault e Arquivos')
                  : t('vault.unlinkTitle', 'Desvincular Vault do Orbia')}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {t(
                  'vault.deleteSubtitle',
                  'Escolha se deseja apenas desvincular ou apagar permanentemente.'
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {error && (
          <div className="rounded-xl bg-destructive/15 border border-destructive/30 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-4 my-2">
          {/* Target Vault Details */}
          <div className="p-3.5 rounded-xl border border-border/80 bg-secondary/30 space-y-1">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-primary shrink-0" />
              <span className="text-xs font-bold text-foreground truncate">
                {vault.name}
              </span>
              {isCurrentActive && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/20 text-primary border border-primary/30 ml-auto">
                  Ativo
                </span>
              )}
            </div>
            <p className="text-[11px] font-mono text-muted-foreground truncate pl-6">
              {vault.path}
            </p>
          </div>

          {/* Delete Files Checkbox */}
          <div className="p-3.5 rounded-xl border border-destructive/30 bg-destructive/5 space-y-2">
            <label className="flex items-start gap-2.5 text-xs text-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={deleteFiles}
                onChange={(e) => setDeleteFiles(e.target.checked)}
                className="mt-0.5 rounded border-destructive/50 bg-background text-destructive focus:ring-destructive h-4 w-4 cursor-pointer"
              />
              <div className="space-y-0.5">
                <span className="font-bold text-destructive">
                  {t(
                    'vault.deleteFilesCheckbox',
                    'Excluir permanentemente todos os arquivos do disco'
                  )}
                </span>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {deleteFiles
                    ? t(
                        'vault.deleteFilesWarning',
                        'Atenção: Todos os vídeos, apostilas e pastas dentro deste diretório serão apagados permanentemente!'
                      )
                    : t(
                        'vault.unlinkExpl',
                        'Ao desmarcar, o vault é apenas removido do Orbia. Seus arquivos originais no computador permanecem 100% seguros e intactos.'
                      )}
                </p>
              </div>
            </label>
          </div>

          {deleteFiles && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>Esta ação é irreversível e não poderá ser desfeita.</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            disabled={isDeleting}
            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            {t('common.cancel', 'Cancelar')}
          </Button>

          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
            className="gap-1.5 text-xs font-bold shadow-md shadow-destructive/20 cursor-pointer min-h-[36px]"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{t('common.loading', 'Excluindo...')}</span>
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5" />
                <span>
                  {deleteFiles
                    ? t('vault.confirmDeleteFiles', 'Apagar Permanentemente')
                    : t('vault.confirmUnlink', 'Desvincular Vault')}
                </span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
