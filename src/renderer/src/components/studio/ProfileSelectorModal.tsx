import React, { useState, useEffect } from 'react'
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
import { Badge } from '../ui/badge'
import { useProfileStore } from '../../stores/useProfileStore'
import { mediaUrl } from '../../lib/utils'
import {
  User,
  Plus,
  Check,
  Edit2,
  Trash2,
  Camera,
  Save,
  X,
  Settings2
} from 'lucide-react'
import type { LocalProfile } from '@shared'

export interface ProfileSelectorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProfileSelectorModal({
  open,
  onOpenChange
}: ProfileSelectorModalProps): React.JSX.Element | null {
  const {
    profiles,
    activeProfile,
    fetchProfiles,
    setActiveProfile,
    createProfile,
    updateProfile,
    deleteProfile
  } = useProfileStore()

  const [isManaging, setIsManaging] = useState(false)
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [newProfileName, setNewProfileName] = useState('')
  const [newProfileAvatar, setNewProfileAvatar] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isAddingNew, setIsAddingNew] = useState(false)

  useEffect(() => {
    if (open) {
      fetchProfiles().catch(console.warn)
      setIsManaging(false)
      setEditingProfileId(null)
      setIsAddingNew(false)
    }
  }, [open, fetchProfiles])

  const handleStartEdit = (p: LocalProfile): void => {
    setEditingProfileId(p.id)
    setEditingName(p.name)
  }

  const handleSaveName = async (id: string): Promise<void> => {
    if (!editingName.trim()) return
    await updateProfile(id, { name: editingName.trim() })
    setEditingProfileId(null)
  }

  const handleChangeAvatar = async (id: string): Promise<void> => {
    const imgPath = await window.api.courses.selectCoverImage()
    if (imgPath) {
      await updateProfile(id, { avatarPath: imgPath })
    }
  }

  const handleDelete = async (id: string, name: string): Promise<void> => {
    if (profiles.length <= 1) {
      alert('Você precisa ter pelo menos um perfil cadastrado.')
      return
    }
    if (
      confirm(
        `Deseja realmente excluir o perfil "${name}"? Os cursos e o progresso continuam salvos na biblioteca.`
      )
    ) {
      await deleteProfile(id)
    }
  }

  const handleSelectNewAvatar = async (): Promise<void> => {
    const imgPath = await window.api.courses.selectCoverImage()
    if (imgPath) {
      setNewProfileAvatar(imgPath)
    }
  }

  const handleCreate = async (): Promise<void> => {
    if (!newProfileName.trim()) return
    setIsCreating(true)
    try {
      const p = await createProfile(
        newProfileName.trim(),
        newProfileAvatar || undefined
      )
      if (p) {
        setActiveProfile(p)
        setNewProfileName('')
        setNewProfileAvatar(null)
        setIsAddingNew(false)
      }
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden bg-card border-border/80 shadow-2xl rounded-2xl">
        <DialogHeader className="p-5 pb-3 border-b border-border/50 bg-muted/20">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <User className="h-5 w-5 text-primary" />
              <span>Perfis de Estudo</span>
            </DialogTitle>
            <Button
              variant={isManaging ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setIsManaging(!isManaging)
                setEditingProfileId(null)
                setIsAddingNew(false)
              }}
              className="h-7 text-xs rounded-lg gap-1.5"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span>{isManaging ? 'Concluir' : 'Gerenciar Perfis'}</span>
            </Button>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            {isManaging
              ? 'Clique na foto para alterar ou no lápis para renomear qualquer perfil (inclusive o Principal).'
              : 'Selecione quem está estudando. Todos os perfis compartilham a mesma biblioteca local.'}
          </DialogDescription>
        </DialogHeader>

        {/* Profiles Grid */}
        <div className="p-5 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
            {profiles.map((p) => {
              const isSelected = activeProfile?.id === p.id
              const isEditingThis = editingProfileId === p.id

              return (
                <div
                  key={p.id}
                  className={`group relative flex flex-col items-center p-4 rounded-2xl border transition-all select-none ${
                    isSelected && !isManaging
                      ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-md'
                      : 'border-border/60 bg-muted/10 hover:bg-muted/30 hover:border-border/90'
                  }`}
                >
                  {/* Avatar Container */}
                  <div className="relative mb-3">
                    <div
                      onClick={() => {
                        if (!isManaging) {
                          setActiveProfile(p)
                          onOpenChange(false)
                        } else {
                          handleChangeAvatar(p.id)
                        }
                      }}
                      className="h-16 w-16 rounded-full overflow-hidden border-2 border-border/80 shadow-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl cursor-pointer group-hover:scale-105 transition-transform"
                    >
                      {p.avatarPath ? (
                        <img
                          src={mediaUrl(p.avatarPath)}
                          alt={p.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span>{p.name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>

                    {/* Change Photo Overlay Button */}
                    {isManaging && (
                      <button
                        type="button"
                        onClick={() => handleChangeAvatar(p.id)}
                        className="absolute bottom-0 right-0 p-1.5 rounded-full bg-primary text-primary-foreground shadow-md hover:scale-110 transition-transform cursor-pointer"
                        title="Alterar Foto"
                      >
                        <Camera className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Profile Name & Inline Edit */}
                  {isEditingThis ? (
                    <div className="w-full flex items-center gap-1">
                      <Input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveName(p.id)
                          if (e.key === 'Escape') setEditingProfileId(null)
                        }}
                        className="h-7 text-xs text-center font-bold px-1 py-0 rounded-lg bg-background"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleSaveName(p.id)}
                        className="h-7 w-7 text-primary hover:bg-primary/10 rounded-lg shrink-0"
                        title="Salvar"
                      >
                        <Save className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-1.5 w-full">
                      <span
                        onClick={() => {
                          if (!isManaging) {
                            setActiveProfile(p)
                            onOpenChange(false)
                          } else {
                            handleStartEdit(p)
                          }
                        }}
                        className="max-w-[100px] break-words whitespace-normal text-xs font-bold text-foreground leading-snug cursor-pointer hover:text-primary transition-colors text-center"
                        title={p.name}
                      >
                        {p.name}
                      </span>
                      {isManaging && (
                        <button
                          type="button"
                          onClick={() => handleStartEdit(p)}
                          className="p-1 text-muted-foreground hover:text-foreground cursor-pointer rounded"
                          title="Renomear perfil"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Active / Delete Badges */}
                  {!isManaging && isSelected && (
                    <Badge
                      variant="outline"
                      className="text-[10px] h-4.5 px-1.5 py-0 border-primary/40 text-primary font-semibold mt-1.5 gap-1"
                    >
                      <Check className="h-2.5 w-2.5" /> Ativo
                    </Badge>
                  )}

                  {isManaging && profiles.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id, p.name)}
                      className="mt-2 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2 py-0.5 rounded-md flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Excluir</span>
                    </button>
                  )}
                </div>
              )
            })}

            {/* Add Profile Card */}
            {!isAddingNew && (
              <button
                type="button"
                onClick={() => setIsAddingNew(true)}
                className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-dashed border-border/70 hover:border-primary/60 hover:bg-muted/20 transition-all cursor-pointer min-h-[140px]"
              >
                <div className="h-14 w-14 rounded-full border border-dashed border-border flex items-center justify-center text-muted-foreground group-hover:text-primary mb-2">
                  <Plus className="h-6 w-6" />
                </div>
                <span className="text-xs font-semibold text-muted-foreground">
                  Adicionar Perfil
                </span>
              </button>
            )}
          </div>

          {/* New Profile Creation Form */}
          {isAddingNew && (
            <div className="mt-4 p-4 rounded-2xl border border-primary/30 bg-primary/5 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  Novo Perfil de Estudo
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddingNew(false)}
                  className="p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-3">
                {/* Photo picker */}
                <div
                  onClick={handleSelectNewAvatar}
                  className="h-12 w-12 rounded-full overflow-hidden border-2 border-dashed border-primary/50 flex items-center justify-center bg-background cursor-pointer hover:border-primary shrink-0 relative group"
                  title="Escolher foto"
                >
                  {newProfileAvatar ? (
                    <img
                      src={mediaUrl(newProfileAvatar)}
                      alt="Avatar"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Camera className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                  )}
                </div>

                <div className="flex-1 space-y-1">
                  <Input
                    autoFocus
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    placeholder="Nome do perfil (ex: Maria, Estudos Tech)..."
                    className="h-8 text-xs bg-background"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleSelectNewAvatar}
                      className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <Camera className="h-3 w-3 mr-1" />
                      {newProfileAvatar
                        ? 'Trocar Foto'
                        : 'Adicionar Foto (Opcional)'}
                    </Button>
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={isCreating || !newProfileName.trim()}
                  className="h-8 text-xs font-semibold rounded-xl bg-primary text-primary-foreground shrink-0"
                >
                  Criar
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t border-border/50 bg-muted/20 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            Cada perfil mantém seus próprios temas, visualizações e
            preferências.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="rounded-xl text-xs"
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
