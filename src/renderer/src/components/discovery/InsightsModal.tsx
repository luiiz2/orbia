import React, { useEffect } from 'react'
import {
  BarChart3,
  BookOpen,
  Clock,
  CheckCircle,
  Flame,
  Tag,
  Award
} from 'lucide-react'
import { useDiscoveryStore } from '../../stores/useDiscoveryStore'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '../ui'

export function InsightsModal(): React.JSX.Element | null {
  const { isInsightsModalOpen, setInsightsModalOpen, insights, fetchInsights } =
    useDiscoveryStore()

  useEffect(() => {
    if (isInsightsModalOpen) {
      fetchInsights()
    }
  }, [isInsightsModalOpen, fetchInsights])

  return (
    <Dialog open={isInsightsModalOpen} onOpenChange={setInsightsModalOpen}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden flex flex-col rounded-3xl border border-border/80 shadow-2xl">
        {/* Header */}
        <DialogHeader className="p-6 border-b border-border/60 flex flex-row items-center gap-3 bg-secondary/30 text-left">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <DialogTitle className="text-xl font-bold text-foreground">
              Library Insights
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Estatísticas e métricas reais do seu acervo pessoal de estudos
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Main Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-secondary/30 border border-border/60 rounded-2xl">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-1">
                <BookOpen className="w-4 h-4 text-primary" />
                <span>Total de Cursos</span>
              </div>
              <div className="text-2xl font-bold text-foreground">
                {insights?.totalCourses || 0}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {insights?.totalLessons || 0} aulas no acervo
              </div>
            </div>

            <div className="p-4 bg-secondary/30 border border-border/60 rounded-2xl">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-1">
                <Clock className="w-4 h-4 text-primary" />
                <span>Horas Totais</span>
              </div>
              <div className="text-2xl font-bold text-foreground">
                {insights?.totalDurationHours || 0}h
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                de conteúdo disponível
              </div>
            </div>

            <div className="p-4 bg-secondary/30 border border-border/60 rounded-2xl">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-1">
                <Flame className="w-4 h-4 text-primary" />
                <span>Estudado Este Mês</span>
              </div>
              <div className="text-2xl font-bold text-foreground">
                {insights?.watchedHoursThisMonth || 0}h
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                horas assistidas em 30 dias
              </div>
            </div>
          </div>

          {/* Progress Overview */}
          <div className="p-5 bg-secondary/20 border border-border/60 rounded-2xl space-y-3">
            <div className="text-xs font-bold text-foreground uppercase tracking-wider">
              Status do Acervo
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center font-bold text-xs">
                  {insights?.coursesStartedCount || 0}
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    Cursos Iniciados
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Em progresso ativo
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-xs">
                  <CheckCircle className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {insights?.coursesCompletedCount || 0} Concluídos
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Cursos finalizados 100%
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Most Watched Course */}
          {insights?.mostWatchedCourseTitle && (
            <div className="p-4 bg-primary/10 border border-primary/20 rounded-2xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center shrink-0">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-primary">
                  Curso Mais Assistido
                </div>
                <div className="text-sm font-bold text-foreground">
                  {insights.mostWatchedCourseTitle}
                </div>
              </div>
            </div>
          )}

          {/* Top Tags */}
          {insights?.topTags && insights.topTags.length > 0 && (
            <div>
              <div className="text-xs font-bold text-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-primary" />
                Tópicos Principais no Acervo
              </div>
              <div className="flex flex-wrap gap-2">
                {insights.topTags.map((t) => (
                  <span
                    key={t.tag}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-secondary/50 border border-border/60 rounded-lg text-xs font-medium text-foreground"
                  >
                    <span>{t.tag}</span>
                    <span className="text-[10px] opacity-60 bg-background/60 px-1.5 py-0.5 rounded">
                      {t.count}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
