import React from 'react'
import { Play, Star, Info, Clock, Layers, Sparkles } from 'lucide-react'
import type { Course, CourseProgressSummary } from '@shared'
import { Button } from '../ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import { CourseCover } from '../ui/CourseCover'
import { formatDurationHuman } from '../../lib/formatters'

export interface StreamingHeroProps {
  course: Course
  summary?: CourseProgressSummary | null
  onPlay: () => void
  onViewDetails: () => void
  onToggleFavorite?: () => void
  className?: string
}

export function StreamingHero({
  course,
  summary,
  onPlay,
  onViewDetails,
  onToggleFavorite,
  className = ''
}: StreamingHeroProps): React.JSX.Element {
  const percentage = summary ? summary.percentage : 0
  const isStarted = percentage > 0 && percentage < 100
  const lastLessonTitle = summary?.lastPlayedLessonTitle

  return (
    <div
      className={`relative w-full rounded-2xl overflow-hidden border border-white/[0.08] bg-[#07090E] shadow-2xl ${className}`}
    >
      {/* Background Media Art with Cinematic Gradient Fades */}
      <div className="absolute inset-0 z-0">
        <CourseCover
          src={course.coverPath}
          title={course.title}
          className="w-full h-full object-cover scale-105 filter blur-xs opacity-40 brightness-75 transition-transform duration-1000 ease-out hover:scale-110"
        />
        {/* Multi-directional vignette to ensure text contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#07090E] via-[#07090E]/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07090E] via-[#07090E]/80 to-transparent w-full md:w-3/4" />
        {/* Radial ambient spotlight */}
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-orange-500/10 blur-3xl pointer-events-none" />
      </div>

      {/* Content Layer */}
      <div className="relative z-10 p-6 sm:p-8 md:p-10 flex flex-col justify-end min-h-[300px] sm:min-h-[340px] md:min-h-[380px] max-w-3xl space-y-4">
        {/* Tag Pill */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/20 backdrop-blur-md border border-primary/30 text-primary text-[10px] sm:text-xs font-bold tracking-wider uppercase font-mono shadow-xs">
            <Sparkles className="w-3 h-3" />
            <span>{isStarted ? 'Continuar Estudando' : 'Destaque'}</span>
          </div>

          {course.isFavorite && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 backdrop-blur-md border border-amber-500/30 text-amber-400 text-[10px] sm:text-xs font-bold font-mono">
              <Star className="w-3 h-3 fill-amber-400" />
              <span>Favorito</span>
            </div>
          )}
        </div>

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white leading-tight tracking-tight drop-shadow-md">
          {course.title}
        </h1>

        {/* Description or In-Progress Lesson */}
        {isStarted && lastLessonTitle ? (
          <div className="space-y-1.5 max-w-xl">
            <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-300 font-medium">
              <span className="text-amber-400 font-semibold">Aula Atual:</span>
              <span className="truncate text-white">{lastLessonTitle}</span>
            </div>
            {/* Embedded Mini Progress Bar */}
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-48 sm:w-64 rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="text-xs font-mono font-bold text-amber-400">{percentage}%</span>
            </div>
          </div>
        ) : course.description ? (
          <p className="text-xs sm:text-sm text-slate-300/90 line-clamp-2 leading-relaxed max-w-xl">
            {course.description}
          </p>
        ) : null}

        {/* Course Quick Metadata */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-medium">
          <span className="flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-primary" />
            {course.moduleCount} Módulos • {course.lessonCount} Aulas
          </span>
          {course.totalDuration > 0 && (
            <span className="flex items-center gap-1 font-mono">
              <Clock className="w-3.5 h-3.5 text-primary" />
              {formatDurationHuman(course.totalDuration)}
            </span>
          )}
        </div>

        {/* Primary & Secondary Call to Actions */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button
            size="lg"
            onClick={onPlay}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-primary/25 gap-2 cursor-pointer transition-all hover:scale-102 active:scale-98"
          >
            <Play className="w-5 h-5 fill-current ml-0.5" />
            <span>{isStarted ? 'Continuar Assistindo' : 'Começar a Assistir'}</span>
          </Button>

          {onToggleFavorite && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onToggleFavorite}
                  className={`h-11 w-11 rounded-xl backdrop-blur-md border border-white/15 cursor-pointer transition-all ${
                    course.isFavorite
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                      : 'bg-black/40 text-white hover:bg-black/60 hover:text-amber-400'
                  }`}
                  aria-label="Favoritar"
                >
                  <Star className={`w-5 h-5 ${course.isFavorite ? 'fill-amber-400' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {course.isFavorite ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}
              </TooltipContent>
            </Tooltip>
          )}

          <Button
            variant="outline"
            size="lg"
            onClick={onViewDetails}
            className="bg-black/40 hover:bg-black/60 text-white border border-white/15 backdrop-blur-md rounded-xl px-5 py-2.5 gap-2 cursor-pointer font-semibold transition-all hover:border-white/30"
          >
            <Info className="w-4 h-4" />
            <span>Detalhes do Curso</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
