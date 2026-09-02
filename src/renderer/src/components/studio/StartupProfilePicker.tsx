import React, { useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useProfileStore } from '../../stores/useProfileStore'
import { mediaUrl } from '../../lib/utils'
import { Plus, Edit2, Trash2, Camera, Save, X, Settings2 } from 'lucide-react'
import type { LocalProfile } from '@shared'

interface StartupProfilePickerProps {
  onSelect: (profile: LocalProfile) => void
}

export function StartupProfilePicker({
  onSelect
}: StartupProfilePickerProps): React.JSX.Element {
  const { profiles, createProfile, updateProfile, deleteProfile } =
    useProfileStore()

  const [isManaging, setIsManaging] = useState(false)
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [newProfileAvatar, setNewProfileAvatar] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

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
        `Deseja realmente excluir o perfil "${name}"? Os cursos e progresso continuarão intactos na biblioteca.`
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
        setNewProfileName('')
        setNewProfileAvatar(null)
        setIsAddingNew(false)
        if (!isManaging) {
          onSelect(p)
        }
      }
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background p-6 select-none animate-in fade-in duration-300">
      {/* Header */}
      <div className="text-center space-y-2 mb-10 max-w-md">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
          Quem está estudando?
        </h1>
        <p className="text-sm text-muted-foreground">
          {isManaging
            ? 'Clique na foto para trocar ou no lápis para renomear qualquer perfil.'
            : 'Selecione o seu perfil para carregar sua experiência personalizada.'}
        </p>
      </div>

      {/* Profiles Cards Grid */}
      <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8 max-w-4xl mb-10">
        {profiles.map((p) => {
          const isEditingThis = editingProfileId === p.id

          return (
            <div
              key={p.id}
              className="group flex flex-col items-center gap-3 transition-transform duration-200 hover:scale-105"
            >
              {/* Avatar Circle */}
              <div className="relative">
                <div
                  onClick={() => {
                    if (!isManaging) {
                      onSelect(p)
                    } else {
                      handleChangeAvatar(p.id)
                    }
                  }}
                  className="h-24 w-24 sm:h-28 sm:w-28 rounded-3xl overflow-hidden border-2 border-border/80 group-hover:border-primary shadow-xl bg-primary flex items-center justify-center text-primary-foreground font-extrabold text-3xl sm:text-4xl cursor-pointer transition-all duration-200"
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

                {/* Change Avatar Button */}
                {isManaging && (
                  <button
                    type="button"
                    onClick={() => handleChangeAvatar(p.id)}
                    className="absolute -bottom-2 -right-2 p-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-110 transition-transform cursor-pointer"
                    title="Alterar Foto"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Profile Name & Inline Edit */}
              {isEditingThis ? (
                <div className="flex items-center gap-1">
                  <Input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName(p.id)
                      if (e.key === 'Escape') setEditingProfileId(null)
                    }}
                    className="h-8 text-xs text-center font-bold px-2 py-0 rounded-xl bg-card w-28"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleSaveName(p.id)}
                    className="h-8 w-8 text-primary hover:bg-primary/10 rounded-xl"
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1.5">
                  <span
                    onClick={() => {
                      if (!isManaging) {
                        onSelect(p)
                      } else {
                        handleStartEdit(p)
                      }
                    }}
                    className="max-w-[120px] break-words whitespace-normal text-sm font-bold text-muted-foreground leading-snug group-hover:text-foreground transition-colors cursor-pointer text-center"
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
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}

              {/* Delete button in manage mode */}
              {isManaging && profiles.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleDelete(p.id, p.name)}
                  className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
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
          <div
            onClick={() => setIsAddingNew(true)}
            className="group flex flex-col items-center gap-3 cursor-pointer transition-transform duration-200 hover:scale-105"
          >
            <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-3xl border-2 border-dashed border-border/80 group-hover:border-primary/80 group-hover:bg-primary/5 flex items-center justify-center text-muted-foreground group-hover:text-primary transition-all">
              <Plus className="h-10 w-10 stroke-[2]" />
            </div>
            <span className="text-sm font-bold text-muted-foreground group-hover:text-foreground transition-colors">
              Adicionar Perfil
            </span>
          </div>
        )}
      </div>

      {/* New Profile Inline Modal / Form */}
      {isAddingNew && (
        <div className="p-5 rounded-3xl border border-primary/40 bg-card shadow-2xl space-y-4 max-w-sm w-full animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">
              Criar Novo Perfil
            </h3>
            <button
              type="button"
              onClick={() => setIsAddingNew(false)}
              className="p-1 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col items-center gap-3">
            <div
              onClick={handleSelectNewAvatar}
              className="h-16 w-16 rounded-2xl overflow-hidden border-2 border-dashed border-primary/60 flex items-center justify-center bg-background cursor-pointer hover:border-primary relative group shadow-md"
              title="Escolher foto"
            >
              {newProfileAvatar ? (
                <img
                  src={mediaUrl(newProfileAvatar)}
                  alt="Avatar"
                  className="h-full w-full object-cover"
                />
              ) : (
                <Camera className="h-6 w-6 text-muted-foreground group-hover:text-primary" />
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSelectNewAvatar}
              className="text-xs text-muted-foreground hover:text-foreground h-6"
            >
              <Camera className="h-3 w-3 mr-1" />
              {newProfileAvatar ? 'Trocar Foto' : 'Adicionar Foto (Opcional)'}
            </Button>
          </div>

          <Input
            autoFocus
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            placeholder="Nome do perfil..."
            className="h-9 text-xs"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />

          <Button
            onClick={handleCreate}
            disabled={isCreating || !newProfileName.trim()}
            className="w-full h-9 text-xs font-bold rounded-xl bg-primary text-primary-foreground"
          >
            Salvar e Entrar
          </Button>
        </div>
      )}

      {/* Bottom Actions */}
      <div className="flex items-center gap-3 mt-4">
        <Button
          variant="outline"
          onClick={() => {
            setIsManaging(!isManaging)
            setEditingProfileId(null)
            setIsAddingNew(false)
          }}
          className="rounded-xl px-5 h-9 text-xs font-semibold gap-2 border-border/80 hover:border-foreground"
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span>{isManaging ? 'Concluir Edição' : 'Gerenciar Perfis'}</span>
        </Button>
      </div>
    </div>
  )
}
