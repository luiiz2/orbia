import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderPlus, FolderOpen, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input
} from '../ui'
import { useVaultStore } from '../../stores'

interface VaultCreatorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function VaultCreator({ open, onOpenChange, onSuccess }: VaultCreatorProps): React.JSX.Element {
  const { t } = useTranslation()
  const { createVault, selectDirectory, isLoading, error, clearError } = useVaultStore()

  const [vaultName, setVaultName] = useState('')
  const [vaultPath, setVaultPath] = useState('')
  const [isSelectingDir, setIsSelectingDir] = useState(false)

  const handleSelectDirectory = async (): Promise<void> => {
    setIsSelectingDir(true)
    try {
      const selected = await selectDirectory()
      if (selected) {
        setVaultPath(selected)
        if (!vaultName) {
          // Default name from folder name
          const base = selected.split(/[\\/]/).filter(Boolean).pop()
          if (base) setVaultName(base)
        }
      }
    } finally {
      setIsSelectingDir(false)
    }
  }

  const handleCreate = async (): Promise<void> => {
    if (!vaultPath.trim()) return
    const success = await createVault(vaultPath.trim(), vaultName.trim())
    if (success) {
      setVaultName('')
      setVaultPath('')
      onOpenChange(false)
      onSuccess?.()
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) clearError()
        onOpenChange(v)
      }}
    >
      <DialogContent className="sm:max-w-[480px] bg-card border-border text-foreground rounded-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <FolderPlus className="w-5 h-5" />
            <DialogTitle className="text-lg font-bold">{t('vault.createNew')}</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">{t('vault.subtitle')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div className="p-3 text-xs bg-destructive/15 border border-destructive/30 rounded-xl text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">
              {t('vault.vaultLocation')} <span className="text-destructive">*</span>
            </label>
            <div className="flex gap-2">
              <Input
                value={vaultPath}
                onChange={(e) => setVaultPath(e.target.value)}
                placeholder="C:\Users\...\MinhaPastaDeEstudo"
                className="text-xs font-mono rounded-xl"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSelectDirectory}
                disabled={isSelectingDir || isLoading}
                className="shrink-0 text-xs rounded-xl"
              >
                <FolderOpen className="w-3.5 h-3.5 mr-1 text-primary" />
                {t('vault.browse')}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">
              {t('vault.vaultName')}
            </label>
            <Input
              value={vaultName}
              onChange={(e) => setVaultName(e.target.value)}
              placeholder="Minha Pasta de Estudo"
              className="text-xs rounded-xl"
            />
          </div>
        </div>

        <DialogFooter className="border-t border-border pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="rounded-xl text-xs"
          >
            {t('vault.cancel')}
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleCreate}
            disabled={!vaultPath.trim() || isLoading}
            className="font-semibold shadow-lg shadow-orange-500/20 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-primary-foreground rounded-xl text-xs"
          >
            {isLoading && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            {t('vault.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

