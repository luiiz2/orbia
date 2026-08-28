import React from 'react'
import { Play, Sparkles, Clock, CheckCircle2 } from 'lucide-react'
import type { DiscoveryItem } from '../../../../types/discovery'
import { Button } from '../ui'
import { CourseCover } from '../ui/CourseCover'

interface DiscoverHeroProps {
  item: DiscoveryItem
  onPlay: (courseId: string, lessonId?: string) => void
  onOpenDetails: (courseId: string) => void
}

export function DiscoverHero({
  item,
  onPlay,
  onOpenDetails
}: DiscoverHeroProps): React.JSX.Element {
  const topReason = item.reasons[0]

  return (
    <div className="relative rounded-3xl overflow-hidden border border-border/70 bg-card shadow-2xl p-6 md:p-8 mb-8">
      {/* Subtle Background Glow */}
      <div className="absolute -right-20 -top-20 w-96 h-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-center gap-6 md:gap-8">
        {/* Cover Artwork */}
        <div className="w-40 md:w-52 shrink-0 shadow-2xl rounded-2xl overflow-hidden border border-border/50">
          <CourseCover
            src={item.course.coverPath}
            title={item.course.title}
            aspectRatio="video"
            className="w-full h-auto"
          />
        </div>

        {/* Content Details */}
        <div className="flex-1 min-w-0 text-center md:text-left space-y-3">
          {/* Reason Badge */}
          {topReason && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 border border-primary/30 text-primary text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {topReason.type === 'because_watched'
                  ? `Porque você assistiu ${topReason.params.targetTitle}`
                  : topReason.type === 'journey_next'
                    ? `Próxima etapa da jornada ${topReason.params.sourceTitle}`
                    : topReason.type === 'almost_finished'
                      ? `Quase lá: ${topReason.params.percent}% concluído`
                      : 'Destaque para você'}
              </span>
            </div>
          )}

          <h1 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight leading-tight">
            {item.course.title}
          </h1>

          {item.course.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 max-w-2xl">
              {item.course.description}
            </p>
          )}

          {/* Stats Bar */}
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-xs text-muted-foreground pt-1">
            <span>{item.course.lessonCount} aulas</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-primary" />
              {item.remainingDurationMinutes} min restantes
            </span>
            {item.progressPercent > 0 && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1 text-emerald-500 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {item.progressPercent}% assistido
                </span>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-center md:justify-start gap-3 pt-4">
            <Button
              onClick={() => onPlay(item.course.id, item.nextLessonId)}
              className="gap-2 shadow-lg shadow-primary/25 px-6 font-bold"
            >
              <Play className="w-4 h-4 fill-current" />
              {item.progressPercent > 0 ? 'Continuar Agora' : 'Assistir Curso'}
            </Button>

            <Button
              onClick={() => onOpenDetails(item.course.id)}
              variant="outline"
              className="font-semibold"
            >
              Ver Detalhes
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
