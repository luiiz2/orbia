import React, { useEffect, useState } from 'react'
import { Sparkles, Play, RefreshCw, X, BookOpen, CheckCircle2 } from 'lucide-react'
import { useDiscoveryStore } from '../../stores/useDiscoveryStore'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { Button } from '../ui'
import { CourseCover } from '../ui/CourseCover'

export function SurpriseModal(): React.JSX.Element | null {
  const { isSurpriseModalOpen, setSurpriseModalOpen, surprise, fetchSurpriseMe } = useDiscoveryStore()
  const { navigateToCourse, navigateToPlayer } = useNavigationStore()

  const [mode, setMode] = useState<'continue' | 'start_new' | 'quick_lesson' | 'random'>('continue')
  const [isRolling, setIsRolling] = useState<boolean>(false)

  useEffect(() => {
    if (isSurpriseModalOpen) {
      fetchSurpriseMe(undefined, mode)
    }
  }, [isSurpriseModalOpen, mode])

  if (!isSurpriseModalOpen) return null

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-card border border-border/80 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col relative">
        {/* Header */}
        <div className="p-6 pb-4 flex items-center justify-between border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500 shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Surpreenda-me</h2>
              <p className="text-xs text-muted-foreground">Sorteio ponderado inteligente da sua própria biblioteca</p>
            </div>
          </div>
          <button
            onClick={() => setSurpriseModalOpen(false)}
            className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

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
                onClick={() => setMode(m.id)}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
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
              className={`bg-gradient-to-b from-secondary/40 to-secondary/20 border border-border/60 rounded-2xl p-5 transition-all duration-300 ${
                isRolling ? 'scale-[0.98] opacity-50 blur-[1px]' : 'scale-100 opacity-100'
              }`}
            >
              <div className="text-xs font-bold text-amber-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                {surprise.headline}
              </div>

              <div className="flex gap-4 items-start">
                <div className="w-28 shrink-0">
                  <CourseCover
                    src={surprise.item.course.coverPath}
                    title={surprise.item.course.title}
                    aspectRatio="video"
                    className="rounded-xl shadow-md"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-foreground leading-tight mb-2">
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
                      <span>{Math.round(surprise.item.course.totalDuration / 60)} min totais</span>
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
                  className="gap-2 text-xs font-semibold"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRolling ? 'animate-spin' : ''}`} />
                  Tentar Outro
                </Button>

                <Button
                  onClick={handleStartStudying}
                  size="sm"
                  className="flex-1 gap-2 shadow-lg shadow-primary/20"
                >
                  <Play className="w-4 h-4 fill-current" />
                  {surprise.item.progressPercent > 0 ? 'Continuar Agora' : 'Começar Curso'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              <p>Nenhum curso disponível para este modo.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
