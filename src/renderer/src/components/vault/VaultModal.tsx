import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Database,
  FolderPlus,
  FolderOpen,
  AlertCircle,
  Loader2,
  Check,
  Trash2
} from 'lucide-react'
import type { Vault } from '@shared'
import { useVaultStore } from '../../stores/useVaultStore'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { DeleteVaultModal } from './DeleteVaultModal'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

export function VaultModal(): React.JSX.Element {
  const { t } = useTranslation()
  const { isVaultModalOpen, setVaultModalOpen } = useNavigationStore()
  const {
    currentVault,
    recentVaults,
    createVault,
    openVault,
    selectDirectory
  } = useVaultStore()
  const { fetchCourses } = useLibraryStore()

  const [mode, setMode] = useState<'recent' | 'create' | 'open'>('recent')
  const [vaultName, setVaultName] = useState<string>('My Study Vault')
  const [vaultLocation, setVaultLocation] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [vaultToDelete, setVaultToDelete] = useState<Vault | null>(null)
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false)

  const handleBrowseLocation = async (): Promise<void> => {
    try {
      const selected = await selectDirectory()
      if (selected) {
        setVaultLocation(selected)
      }
    } catch (err) {
      console.error('Browse failed:', err)
    }
  }

  const handleCreate = async (): Promise<void> => {
    if (!vaultName.trim() || !vaultLocation.trim()) {
      setErrorMessage('Please provide both vault name and location.')
      return
    }

    setIsProcessing(true)
    setErrorMessage(null)

    try {
      const res = await createVault(vaultLocation.trim(), vaultName.trim())
      if (res.success && res.vault) {
        await fetchCourses()
        setVaultModalOpen(false)
        resetForm()
      } else {
        setErrorMessage(res.error || 'Failed to create vault')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMessage(msg)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleOpenExisting = async (path?: string): Promise<void> => {
    let targetPath = path
    if (!targetPath) {
      targetPath = (await selectDirectory()) || undefined
    }

    if (!targetPath) return

    setIsProcessing(true)
    setErrorMessage(null)

    try {
      const res = await openVault(targetPath)
      if (res.success && res.vault) {
        await fetchCourses()
        setVaultModalOpen(false)
        resetForm()
      } else {
        setErrorMessage(res.error || 'Failed to open vault')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMessage(msg)
    } finally {
      setIsProcessing(false)
    }
  }

  const resetForm = (): void => {
    setMode('recent')
    setVaultName('My Study Vault')
    setVaultLocation('')
    setErrorMessage(null)
    setIsProcessing(false)
  }

  const handleClose = (): void => {
    setVaultModalOpen(false)
    resetForm()
  }

  return (
    <Dialog
      open={isVaultModalOpen}
      onOpenChange={(open) => !open && handleClose()}
    >
      <DialogContent className="max-w-lg rounded-2xl bg-card border-border text-foreground">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Database className="h-5 w-5" />
            <DialogTitle className="text-lg font-bold">
              {t('vault.title')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {t('vault.subtitle')}
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div className="flex items-center gap-2 rounded-xl bg-destructive/15 border border-destructive/30 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Mode Selector Tabs */}
        <div className="flex rounded-xl bg-secondary/80 p-1 text-xs">
          <button
            type="button"
            onClick={() => setMode('recent')}
            className={`flex-1 py-1.5 text-center font-semibold rounded-lg transition-colors cursor-pointer ${
              mode === 'recent'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('vault.recentVaults')}
          </button>
          <button
            type="button"
            onClick={() => setMode('create')}
            className={`flex-1 py-1.5 text-center font-semibold rounded-lg transition-colors cursor-pointer ${
              mode === 'create'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('vault.createNew')}
          </button>
        </div>

        {/* Recent Vaults List */}
        {mode === 'recent' && (
          <div className="space-y-3 py-2">
            {recentVaults.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                {t('vault.noRecent')}
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {recentVaults.map((vault) => {
                  const isActive = currentVault?.path === vault.path
                  return (
                    <div
                      key={vault.id || vault.path}
                      onClick={() =>
                        !isActive && handleOpenExisting(vault.path)
                      }
                      className={`flex items-center justify-between p-3 rounded-xl border text-xs transition-colors ${
                        isActive
                          ? 'border-primary/50 bg-primary/10'
                          : 'border-border/70 bg-secondary/20 hover:bg-secondary/60 cursor-pointer'
                      }`}
                    >
                      <div className="flex min-w-0 items-start gap-2.5">
                        <Database
                          className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
                        />
                        <div className="min-w-0 flex-1">
                          <span className="block break-words whitespace-normal font-bold text-foreground leading-snug">
                            {vault.name}
                          </span>
                          <span className="block break-words whitespace-normal text-[10px] font-mono text-muted-foreground leading-snug">
                            {vault.path}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isActive ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-primary mr-1">
                            <Check className="h-3.5 w-3.5" />
                            Active
                          </span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="xs"
                            className="h-7 text-[11px] rounded-lg"
                          >
                            Open
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            setVaultToDelete(vault)
                            setDeleteModalOpen(true)
                          }}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg cursor-pointer transition-colors"
                          title={t('common.delete', 'Excluir / Desvincular')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenExisting()}
                disabled={isProcessing}
                className="w-full gap-2 text-xs rounded-xl"
              >
                <FolderOpen className="h-4 w-4 text-primary" />
                <span>{t('vault.openExisting')}</span>
              </Button>
            </div>
          </div>
        )}

        {/* Create Vault Form */}
        {mode === 'create' && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">
                {t('vault.vaultName')}
              </label>
              <Input
                value={vaultName}
                onChange={(e) => setVaultName(e.target.value)}
                placeholder="My Study Vault"
                className="h-9 text-xs rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">
                {t('vault.vaultLocation')}
              </label>
              <div className="flex gap-2">
                <Input
                  value={vaultLocation}
                  onChange={(e) => setVaultLocation(e.target.value)}
                  placeholder="C:\StudyVaults"
                  className="h-9 text-xs font-mono rounded-xl"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBrowseLocation}
                  className="h-9 text-xs shrink-0 rounded-xl"
                >
                  {t('vault.browse')}
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={isProcessing}
            className="rounded-xl text-xs"
          >
            {t('vault.cancel')}
          </Button>

          {mode === 'create' && (
            <Button
              onClick={handleCreate}
              disabled={isProcessing}
              className="gap-1.5 font-semibold shadow-lg shadow-primary/20 bg-primary text-primary-foreground rounded-xl text-xs"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t('common.loading')}</span>
                </>
              ) : (
                <>
                  <FolderPlus className="h-4 w-4" />
                  <span>{t('vault.create')}</span>
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      {/* Delete / Unlink Vault Modal */}
      <DeleteVaultModal
        vault={vaultToDelete}
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
      />
    </Dialog>
  )
}
