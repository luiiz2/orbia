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
import { useProfileStore } from '../../stores/useProfileStore'
import { User, Plus, Check } from 'lucide-react'

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
    createProfile
  } = useProfileStore()

  const [newProfileName, setNewProfileName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    if (open) {
      fetchProfiles().catch(console.warn)
    }
  }, [open, fetchProfiles])

  const handleCreate = async (): Promise<void> => {
    if (!newProfileName.trim()) return
    setIsCreating(true)
    try {
      const p = await createProfile(newProfileName.trim())
      if (p) {
        setActiveProfile(p)
        setNewProfileName('')
      }
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <span>Perfis de Estudo Locais</span>
          </DialogTitle>
          <DialogDescription>
            Alterne entre perfis de visualização ou crie um novo perfil personalizado. Todos os perfis compartilham a mesma biblioteca de cursos com segurança.
          </DialogDescription>
        </DialogHeader>

        {/* Profiles Grid */}
        <div className="grid grid-cols-2 gap-3 py-3">
          {profiles.map((p) => {
            const isSelected = activeProfile?.id === p.id
            return (
              <button
                type="button"
                key={p.id}
                onClick={() => {
                  setActiveProfile(p)
                  onOpenChange(false)
                }}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-md'
                    : 'border-border/60 bg-card hover:bg-muted/30'
                }`}
              >
                <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-orange-500 to-amber-400 flex items-center justify-center text-white font-bold text-lg shadow-sm mb-2">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-semibold text-foreground truncate max-w-[120px]">{p.name}</span>
                {isSelected && (
                  <span className="flex items-center gap-1 text-[10px] text-primary font-bold mt-1">
                    <Check className="h-3 w-3" /> Ativo
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* New Profile Input */}
        <div className="flex gap-2 pt-2 border-t border-border/50">
          <Input
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            placeholder="Nome do novo perfil..."
            className="h-8 text-xs"
          />
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={isCreating || !newProfileName.trim()}
            className="h-8 text-xs shrink-0"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            <span>Criar</span>
          </Button>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
