import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useProfileStore } from '../../stores/useProfileStore'
import { mediaUrl } from '../../lib/utils'
import { Camera, User, ArrowRight } from 'lucide-react'
import appLogo from '../../assets/icon.png'

interface ProfileOnboardingModalProps {
  open: boolean
  onFinish: () => void
}

export function ProfileOnboardingModal({
  open,
  onFinish
}: ProfileOnboardingModalProps): React.JSX.Element {
  const { profiles, updateProfile, setActiveProfile } = useProfileStore()
  const [userName, setUserName] = useState('')
  const [avatarPath, setAvatarPath] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (open) {
      if (profiles.length > 0) {
        const initial = profiles[0]
        setUserName(initial.name === 'Principal' ? '' : initial.name)
        setAvatarPath(initial.avatarPath || null)
      }
    }
  }, [open, profiles])

  const handleSelectPhoto = async (): Promise<void> => {
    const imgPath = await window.api.courses.selectCoverImage()
    if (imgPath) {
      setAvatarPath(imgPath)
    }
  }

  const handleComplete = async (): Promise<void> => {
    setIsSaving(true)
    try {
      const finalName = userName.trim() || 'Principal'
      if (profiles.length > 0) {
        const target = profiles[0]
        await updateProfile(target.id, {
          name: finalName,
          avatarPath: avatarPath || undefined
        })
        setActiveProfile({
          ...target,
          name: finalName,
          avatarPath: avatarPath || null
        })
      }
      localStorage.setItem('orbia_profile_onboarding_done', 'true')
      onFinish()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-md p-6 bg-card border-border/80 shadow-2xl rounded-3xl text-center flex flex-col items-center [&>button]:hidden"
      >
        {/* App Logo & Header */}
        <div className="flex flex-col items-center gap-2 mb-2">
          <div className="h-14 w-14 rounded-2xl overflow-hidden shadow-lg border border-border/50 bg-black/20 p-2">
            <img src={appLogo} alt="Orbia" className="h-full w-full object-contain" />
          </div>
          <DialogTitle className="text-xl font-extrabold text-foreground">
            Bem-vindo ao Orbia!
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground max-w-xs">
            Sua plataforma offline para organizar e estudar todos os seus cursos com máxima privacidade.
          </DialogDescription>
        </div>

        {/* Avatar Photo Picker */}
        <div className="my-5 flex flex-col items-center gap-2">
          <div
            onClick={handleSelectPhoto}
            className="group relative h-24 w-24 rounded-full overflow-hidden border-2 border-dashed border-primary/60 hover:border-primary flex items-center justify-center bg-muted/20 cursor-pointer shadow-lg transition-transform hover:scale-105"
            title="Escolher Foto"
          >
            {avatarPath ? (
              <img src={mediaUrl(avatarPath)} alt="Foto do Usuário" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-tr from-orange-500 to-amber-400 flex flex-col items-center justify-center text-white">
                {userName.trim() ? (
                  <span className="text-3xl font-extrabold">{userName.trim().charAt(0).toUpperCase()}</span>
                ) : (
                  <User className="h-10 w-10 text-white/90" />
                )}
              </div>
            )}

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-[10px] font-semibold transition-opacity gap-1 backdrop-blur-xs">
              <Camera className="h-5 w-5 text-orange-400" />
              <span>Trocar Foto</span>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSelectPhoto}
            className="text-xs text-muted-foreground hover:text-foreground h-7"
          >
            <Camera className="h-3.5 w-3.5 mr-1 text-primary" />
            <span>{avatarPath ? 'Alterar Foto' : 'Adicionar Foto (Opcional)'}</span>
          </Button>
        </div>

        {/* Name Input Form */}
        <div className="w-full space-y-3">
          <div className="text-left space-y-1">
            <label className="text-xs font-bold text-foreground">Como você gostaria de ser chamado?</label>
            <Input
              autoFocus
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleComplete()}
              placeholder="Digite seu nome ou apelido (ex: Luiz)..."
              className="h-10 rounded-xl bg-background/90 text-sm font-medium"
            />
          </div>

          <Button
            onClick={handleComplete}
            disabled={isSaving}
            className="w-full h-11 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold shadow-lg shadow-orange-500/20 text-sm gap-2"
          >
            <span>Começar a Estudar</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
