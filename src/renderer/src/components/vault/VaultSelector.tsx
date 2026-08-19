import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FolderPlus,
  FolderOpen,
  Clock,
  ChevronRight,
  HardDrive,
  Loader2,
  Trash2
} from 'lucide-react'
import type { Vault } from '@shared'
import { Card, CardHeader, CardTitle, CardDescription, Button } from '../ui'
import { useVaultStore } from '../../stores'
import { VaultCreator } from './VaultCreator'
import { DeleteVaultModal } from './DeleteVaultModal'
import appLogo from '../../assets/icon.png'

export function VaultSelector(): React.JSX.Element {
  const { t } = useTranslation()
  const { recentVaults, openVault, selectDirectory, isLoading, error } = useVaultStore()
  const [creatorOpen, setCreatorOpen] = useState(false)
  const [openingPath, setOpeningPath] = useState<string | null>(null)
  const [vaultToDelete, setVaultToDelete] = useState<Vault | null>(null)
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false)

  const handleOpenExisting = async (): Promise<void> => {
    const selected = await selectDirectory()
    if (selected) {
      setOpeningPath(selected)
      await openVault(selected)
      setOpeningPath(null)
    }
  }

  const handleOpenRecent = async (path: string): Promise<void> => {
    setOpeningPath(path)
    await openVault(path)
    setOpeningPath(null)
  }

  const formatRelativeTime = (timestamp: number): string => {
    const diff = Date.now() - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'Just now'
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 bg-background text-foreground selection:bg-primary/30">
      <div className="w-full max-w-xl space-y-8 animate-in fade-in zoom-in-95 duration-300">
        {/* Header Branding */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl p-2 bg-gradient-to-br from-orange-500/20 via-purple-600/15 to-blue-600/10 shadow-2xl shadow-orange-500/15 ring-1 ring-orange-500/30 mb-1 hover:scale-105 transition-transform duration-300">
            <img
              src={appLogo}
              alt="Orbia Logo"
              className="w-full h-full object-contain drop-shadow-lg"
            />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-orbia-gradient">
            {t('app.name')}
          </h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto font-normal">
            {t('vault.subtitle')}
          </p>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-3 text-xs bg-destructive/15 border border-destructive/40 rounded-xl text-destructive text-center">
            {error}
          </div>
        )}

        {/* Main Action Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card
            className="cursor-pointer border-border hover:border-primary/60 bg-card hover:bg-secondary/50 transition-all duration-200 group relative overflow-hidden shadow-lg hover:shadow-orange-500/10 rounded-2xl"
            onClick={() => setCreatorOpen(true)}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-purple-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardHeader className="pb-4">
              <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary mb-3 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground transition-all shadow-md">
                <FolderPlus className="w-5 h-5" />
              </div>
              <CardTitle className="text-base font-semibold group-hover:text-primary transition-colors">
                {t('vault.createNew')}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Create a dedicated local folder for your study library.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card
            className="cursor-pointer border-border hover:border-purple-500/60 bg-card hover:bg-secondary/50 transition-all duration-200 group relative overflow-hidden shadow-lg hover:shadow-purple-500/10 rounded-2xl"
            onClick={handleOpenExisting}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-blue-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardHeader className="pb-4">
              <div className="w-11 h-11 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-3 group-hover:scale-110 group-hover:bg-purple-600 group-hover:text-white transition-all shadow-md">
                <FolderOpen className="w-5 h-5" />
              </div>
              <CardTitle className="text-base font-semibold group-hover:text-purple-400 transition-colors">
                {t('vault.openExisting')}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Open a folder containing an existing Orbia study library.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Recent Vaults Section */}
        {recentVaults.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              <Clock className="w-3.5 h-3.5 text-primary" />
              <span>{t('vault.recentVaults')}</span>
            </div>

            <div className="space-y-2">
              {recentVaults.map((vault) => {
                const isOpening = openingPath === vault.path && isLoading
                return (
                  <div
                    key={vault.id || vault.path}
                    onClick={() => handleOpenRecent(vault.path)}
                    className="w-full text-left p-3 rounded-xl bg-card border border-border hover:border-primary/40 hover:bg-secondary/50 transition-all flex items-center justify-between group cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground shrink-0 group-hover:text-primary transition-colors">
                        <HardDrive className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-foreground truncate group-hover:text-primary">
                          {vault.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate max-w-sm font-mono">
                          {vault.path}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-[11px] text-muted-foreground">
                        {formatRelativeTime(vault.lastOpened)}
                      </span>
                      {isOpening ? (
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          setVaultToDelete(vault)
                          setDeleteModalOpen(true)
                        }}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg cursor-pointer transition-colors ml-1"
                        title={t('common.delete', 'Excluir / Desvincular')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <VaultCreator
        open={creatorOpen}
        onOpenChange={setCreatorOpen}
      />

      <DeleteVaultModal
        vault={vaultToDelete}
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
      />
    </div>
  )
}
