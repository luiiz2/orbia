import React, { useState } from 'react'
import { Clock, Play, Sparkles, X } from 'lucide-react'
import { useDiscoveryStore } from '../../stores/useDiscoveryStore'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { Button } from '../ui'
import { formatTime } from '../../lib/formatters'

export function TimePickerModal(): React.JSX.Element | null {
  const { isTimeModalOpen, setTimeModalOpen, timeRecommendations, fetchTimeRecommendations } = useDiscoveryStore()
  const { navigateToPlayer } = useNavigationStore()
  const { loadLesson } = usePlayerStore()

  const [selectedMinutes, setSelectedMinutes] = useState<number>(30)
  const [hasSearched, setHasSearched] = useState<boolean>(false)

  if (!isTimeModalOpen) return null

  const handleSelectTime = (minutes: number) => {
    setSelectedMinutes(minutes)
    setHasSearched(true)
    fetchTimeRecommendations(minutes)
  }

  const handlePlayLesson = async (courseId: string, lessonId: string) => {
    setTimeModalOpen(false)
    navigateToPlayer(courseId)
    await loadLesson(lessonId)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-card border border-border/80 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-6 border-b border-border/60 flex items-center justify-between bg-secondary/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Quanto tempo você tem agora?</h2>
              <p className="text-xs text-muted-foreground">Encontre aulas perfeitas para a sua janela de estudo disponível</p>
            </div>
          </div>
          <button
            onClick={() => setTimeModalOpen(false)}
            className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Time Selector Chips */}
        <div className="p-6 pb-2">
          <div className="grid grid-cols-4 gap-3">
            {[15, 30, 45, 60].map((mins) => (
              <button
                key={mins}
                onClick={() => handleSelectTime(mins)}
                className={`py-3 px-4 rounded-xl border font-semibold text-sm transition-all flex flex-col items-center gap-1 ${
                  selectedMinutes === mins && hasSearched
                    ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20 scale-[1.02]'
                    : 'bg-secondary/40 border-border/60 text-foreground hover:bg-secondary/80'
                }`}
              >
                <span className="text-base font-bold">{mins} min</span>
                <span className="text-[11px] opacity-70">
                  {mins === 15 ? 'Pausa rápida' : mins === 30 ? 'Foco leve' : mins === 45 ? 'Sessão padrão' : 'Imersão'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {!hasSearched ? (
            <div className="py-12 text-center text-muted-foreground">
              <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30 text-primary" />
              <p className="text-sm font-medium">Selecione uma duração acima para encontrar aulas sob medida</p>
            </div>
          ) : timeRecommendations.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <p className="text-sm">Nenhuma aula pendente encontrada nessa janela de tempo.</p>
              <p className="text-xs mt-1 opacity-70">Tente selecionar 45 ou 60 minutos para mais opções.</p>
            </div>
          ) : (
            timeRecommendations.map((rec) => (
              <div
                key={rec.lessonId}
                className="group flex items-center justify-between p-3.5 bg-secondary/30 hover:bg-secondary/60 border border-border/40 hover:border-border rounded-xl transition-all"
              >
                <div className="flex-1 min-w-0 pr-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-primary truncate mb-0.5">
                    {rec.courseTitle}
                  </div>
                  <div className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                    {rec.lessonTitle}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 font-medium text-foreground/80">
                      <Clock className="w-3.5 h-3.5 text-primary" />
                      Faltam {Math.ceil(rec.remainingDurationSeconds / 60)} min
                    </span>
                    <span>•</span>
                    <span>Total: {formatTime(rec.totalDurationSeconds)}</span>
                    {rec.currentTimeSeconds > 0 && (
                      <>
                        <span>•</span>
                        <span className="text-amber-500 font-medium">Em andamento</span>
                      </>
                    )}
                  </div>
                </div>

                <Button
                  onClick={() => handlePlayLesson(rec.courseId, rec.lessonId)}
                  size="sm"
                  className="shrink-0 gap-1.5 shadow-sm"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Assistir
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
