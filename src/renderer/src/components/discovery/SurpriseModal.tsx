import React, { useEffect, useState } from 'react'
import { Sparkles, Play, RefreshCw, BookOpen, CheckCircle2 } from 'lucide-react'
import { useDiscoveryStore } from '../../stores/useDiscoveryStore'
import { useNavigationStore } from '../../stores/useNavigationStore'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  CourseCover
} from '../ui'

export function SurpriseModal(): React.JSX.Element | null {
  const {
    isSurpriseModalOpen,
    setSurpriseModalOpen,
    surprise,
    fetchSurpriseMe
  } = useDiscoveryStore()
  const { navigateToCourse, navigateToPlayer } = useNavigationStore()

  const [mode, setMode] = useState<
    'continue' | 'start_new' | 'quick_lesson' | 'random'
  >('continue')
  const [isRolling, setIsRolling] = useState<boolean>(false)

  useEffect(() => {
    if (isSurpriseModalOpen) {
      fetchSurpriseMe(undefined, mode)
    }
  }, [isSurpriseModalOpen, mode, fetchSurpriseMe])

  const handleRollAgain = async () => {
    setIsRolling(true)
    await fetchSurpriseMe(undefined, mode)
    setTimeout(() => setIsRolling(false), 250)
  }

  const handleStartStudying = async () => {
    if (!surprise?.item) return
    setSurpriseModalOpen(false)
    if (surprise.item.nextLessonId) {
      navigateToPlayer(surprise.item.course.id)
    } else {
      navigateToCourse(surprise.item.course.id)
    }
  }

  return (
    <Dialog open={isSurpriseModalOpen} onOpenChange={setSurpriseModalOpen}>
      <DialogContent className="max-w-xl p-0 overflow-hidden flex flex-col rounded-3xl border border-border/80 shadow-2xl">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 flex flex-row items-center gap-3 border-b border-border/40 text-left">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shadow-inner shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <DialogTitle className="text-xl font-bold text-foreground">
              Surpreenda-me
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Sorteio ponderado inteligente da sua própria biblioteca
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Mode Selector */}
        <div className="px-6 pt-4 pb-2">
          <div className="flex items-center gap-1.5 p-1 bg-secondary/40 border border-border/50 rounded-xl">
            {(
              [
                { id: 'continue', label: 'Continuar' },
                { id: 'start_new', label: 'Começar Novo' },
                { id: 'quick_lesson', label: 'Aula Rápida' },
                { id: 'random', label: 'Qualquer Um' }
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  mode === m.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Surprise Card */}
        <div className="p-6">
          {surprise?.item ? (
            <div
              className={`bg-secondary border border-border/60 rounded-2xl p-5 transition-all duration-300 ${
                isRolling
                  ? 'scale-[0.98] opacity-50 blur-[1px]'
                  : 'scale-100 opacity-100'
              }`}
            >
              <div className="text-xs font-bold text-primary uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                {surprise.headline}
              </div>

              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <div className="w-full sm:w-28 shrink-0 aspect-video sm:aspect-auto">
                  <CourseCover
                    src={surprise.item.course.coverPath}
                    title={surprise.item.course.title}
                    className="rounded-xl shadow-md h-full w-full object-cover"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-foreground leading-tight mb-2 truncate">
                    {surprise.item.course.title}
                  </h3>

                  {surprise.item.course.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                      {surprise.item.course.description}
                    </p>
                  )}

                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-3.5 h-3.5 text-primary" />
                      <span>{surprise.item.course.lessonCount} aulas</span>
                      <span>•</span>
                      <span>
                        {Math.round(surprise.item.course.totalDuration / 60)}{' '}
                        min totais
                      </span>
                    </div>

                    {surprise.item.progressPercent > 0 && (
                      <div className="flex items-center gap-2 text-foreground font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span>{surprise.item.progressPercent}% concluído</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border/40">
                <Button
                  onClick={handleRollAgain}
                  variant="outline"
                  size="sm"
                  disabled={isRolling}
                  className="gap-2 text-xs font-semibold cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isRolling ? 'animate-spin' : ''}`}
                  />
                  Tentar Outro
                </Button>

                <Button
                  onClick={handleStartStudying}
                  size="sm"
                  className="flex-1 gap-2 shadow-lg shadow-primary/20 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  {surprise.item.progressPercent > 0
                    ? 'Continuar Agora'
                    : 'Começar Curso'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              <p>Nenhum curso disponível para este modo.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
