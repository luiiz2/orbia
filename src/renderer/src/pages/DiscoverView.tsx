import React, { useEffect, useMemo } from 'react'
import {
  Compass,
  Clock,
  Sparkles,
  BarChart3,
  LayoutGrid,
  GitFork,
  ThumbsUp,
  EyeOff
} from 'lucide-react'
import { useDiscoveryStore } from '../stores/useDiscoveryStore'
import { useVaultStore } from '../stores/useVaultStore'
import { useNavigationStore } from '../stores/useNavigationStore'
import { Button, Skeleton } from '../components/ui'
import { CourseCard } from '../components/library/CourseCard'
import {
  DiscoverHero,
  TimePickerModal,
  SurpriseModal,
  InsightsModal,
  CourseRelationshipsModal,
  CategoriesModal
} from '../components/discovery'

export function DiscoverView(): React.JSX.Element {
  const { currentVault } = useVaultStore()
  const {
    rails,
    isLoading,
    fetchRails,
    setTimeModalOpen,
    setSurpriseModalOpen,
    setInsightsModalOpen,
    setRelationshipsModalOpen,
    setCategoriesModalOpen,
    submitFeedback
  } = useDiscoveryStore()

  const { navigateToCourse, navigateToPlayer } = useNavigationStore()

  useEffect(() => {
    if (currentVault) {
      fetchRails()
    }
  }, [currentVault, fetchRails])

  const handlePlay = (courseId: string) => {
    navigateToPlayer(courseId)
  }

  // Choose the best item for the Hero: prefer journey or top For You item
  const heroItem = useMemo(() => {
    const journeyRail = rails.find((r) => r.railType === 'continue_journey')
    if (journeyRail && journeyRail.items.length > 0) return journeyRail.items[0]

    const forYouRail = rails.find((r) => r.railType === 'for_you')
    if (forYouRail && forYouRail.items.length > 0) return forYouRail.items[0]

    if (rails.length > 0 && rails[0].items.length > 0) return rails[0].items[0]
    return null
  }, [rails])

  return (
    <div className="min-h-full pb-20 p-6 md:p-8 max-w-[1600px] mx-auto animate-in fade-in duration-300">
      {/* Modals */}
      <TimePickerModal />
      <SurpriseModal />
      <InsightsModal />
      <CourseRelationshipsModal />
      <CategoriesModal />

      {/* Top Header & Quick Discovery Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2.5 text-primary text-xs font-bold uppercase tracking-wider mb-1">
            <Compass className="w-4 h-4" />
            <span>Descoberta Inteligente</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight">
            Descubra o que estudar agora
          </h1>
        </div>

        {/* Quick Tools Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setTimeModalOpen(true)}
            variant="outline"
            size="sm"
            className="gap-2 rounded-xl border-border/80 hover:border-primary/50 text-xs font-semibold"
          >
            <Clock className="w-3.5 h-3.5 text-primary" />
            Tenho X Minutos
          </Button>

          <Button
            onClick={() => setSurpriseModalOpen(true)}
            variant="outline"
            size="sm"
            className="gap-2 rounded-xl border-border/80 hover:border-primary/50 text-xs font-semibold text-primary hover:text-primary"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Surpreenda-me
          </Button>

          <Button
            onClick={() => setCategoriesModalOpen(true)}
            variant="outline"
            size="sm"
            className="gap-2 rounded-xl border-border/80 text-xs font-semibold"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Categorias
          </Button>

          <Button
            onClick={() => setInsightsModalOpen(true)}
            variant="outline"
            size="sm"
            className="gap-2 rounded-xl border-border/80 text-xs font-semibold"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Insights
          </Button>

          <Button
            onClick={() => setRelationshipsModalOpen(true)}
            variant="outline"
            size="sm"
            className="gap-2 rounded-xl border-border/80 text-xs font-semibold"
          >
            <GitFork className="w-3.5 h-3.5" />
            Jornadas
          </Button>
        </div>
      </div>

      {/* Hero Section */}
      {heroItem && (
        <DiscoverHero
          item={heroItem}
          onPlay={handlePlay}
          onOpenDetails={navigateToCourse}
        />
      )}

      {/* Discovery Rails */}
      {isLoading ? (
        <div className="space-y-8 mt-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-6 w-48 rounded-lg" />
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {[1, 2, 3, 4, 5, 6].map((j) => (
                  <Skeleton key={j} className="h-64 rounded-2xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : rails.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          <Compass className="w-12 h-12 mx-auto mb-3 opacity-20 text-primary" />
          <h3 className="text-base font-bold text-foreground mb-1">
            Nenhum curso disponível
          </h3>
          <p className="text-xs">
            Importe cursos para o seu Vault para gerar recomendações locais.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {rails.map((rail) => (
            <div key={rail.id} className="space-y-4">
              {/* Rail Header */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg md:text-xl font-bold text-foreground tracking-tight">
                      {rail.title}
                    </h2>
                    {rail.badge && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                        {rail.badge}
                      </span>
                    )}
                  </div>
                  {rail.subtitle && (
                    <p className="text-xs text-muted-foreground">
                      {rail.subtitle}
                    </p>
                  )}
                </div>
              </div>

              {/* Cards Grid / Carousel */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {rail.items.map((it) => (
                  <div
                    key={it.course.id}
                    className="relative group flex flex-col"
                  >
                    <CourseCard course={it.course} />

                    {/* Explainability Reason & Feedback Actions */}
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground px-1">
                      <span className="truncate pr-1 font-medium">
                        {it.reasons[0]
                          ? it.reasons[0].type === 'because_watched'
                            ? `Similar a ${it.reasons[0].params.targetTitle}`
                            : it.reasons[0].type === 'almost_finished'
                              ? `${it.reasons[0].params.percent}% concluído`
                              : it.reasons[0].type === 'quick_win'
                                ? `Faltam ${it.reasons[0].params.minutes} min`
                                : it.reasons[0].type === 'rediscover'
                                  ? `Parado há ${it.reasons[0].params.days} dias`
                                  : 'Recomendado'
                          : 'Afinidade'}
                      </span>

                      {/* Feedback Buttons */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            submitFeedback(it.course.id, 'like')
                          }}
                          title="Gostei / Recomendar mais"
                          className="p-1 hover:text-emerald-500 rounded hover:bg-secondary transition-colors"
                        >
                          <ThumbsUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            submitFeedback(it.course.id, 'not_interested')
                          }}
                          title="Não tenho interesse"
                          className="p-1 hover:text-rose-500 rounded hover:bg-secondary transition-colors"
                        >
                          <EyeOff className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
