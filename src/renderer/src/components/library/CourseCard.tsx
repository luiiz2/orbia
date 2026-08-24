import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Link as LinkIcon,
  Clock,
  CheckCircle2,
  Star,
  SlidersHorizontal
} from 'lucide-react'
import type { Course } from '@shared'
import { Badge, Tooltip, TooltipTrigger, TooltipContent, CourseCover } from '../ui'
import { useLibraryStore, useNavigationStore } from '../../stores'
import { formatDurationHuman } from '../../lib/formatters'

interface CourseCardProps {
  course: Course
  onOrganize?: () => void
}

export function CourseCard({ course, onOrganize }: CourseCardProps): React.JSX.Element {
  const { t } = useTranslation()
  const { progressSummaries, toggleFavorite } = useLibraryStore()
  const { navigateToCourse } = useNavigationStore()

  const summary = progressSummaries[course.id]
  const percentage = summary ? summary.percentage : 0
  const isCompleted = percentage >= 100

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      navigateToCourse(course.id)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigateToCourse(course.id)}
      onKeyDown={handleKeyDown}
      className="group relative cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-lg"
    >
      {/* Cover — streaming card */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl">
        {/* CourseCover handles both image loading and stylish branded fallback */}
        <CourseCover
          src={course.coverPath}
          title={course.title}
          showPlayOnHover={true}
          className="h-full w-full"
        />

        {/* Actions (Top Left): Favorite + Quick Organize */}
        <div
          className="absolute top-2 left-2 z-30 flex items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleFavorite(course.id).catch(console.warn)
                }}
                className={`flex h-7.5 w-7.5 items-center justify-center rounded-md backdrop-blur-md transition-all duration-200 cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                  course.isFavorite
                    ? 'bg-amber-500/25 text-amber-400 border border-amber-500/50 opacity-100 shadow-amber-500/20'
                    : 'bg-black/60 text-white/70 hover:text-amber-400 hover:bg-black/85 border border-white/15 opacity-0 group-hover:opacity-100'
                }`}
                aria-label={
                  course.isFavorite
                    ? t('course.favorited', 'Remover dos favoritos')
                    : t('course.favorite', 'Adicionar aos favoritos')
                }
              >
                <Star
                  className={`h-4 w-4 transition-transform active:scale-125 duration-150 ${
                    course.isFavorite ? 'fill-amber-400 text-amber-400' : ''
                  }`}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs font-semibold">
              {course.isFavorite
                ? t('course.favorited', 'Favoritado')
                : t('course.favorite', 'Adicionar aos Favoritos')}
            </TooltipContent>
          </Tooltip>

          {onOrganize && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOrganize()
                  }}
                  className="flex h-7.5 w-7.5 items-center justify-center rounded-md bg-black/60 text-white/80 hover:text-white hover:bg-orange-600 border border-white/15 backdrop-blur-md transition-all duration-200 cursor-pointer shadow-xs opacity-0 group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Organizar curso"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs font-semibold">
                Organizar Curso
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Top status badges */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5 z-30 pointer-events-none">
          {course.sourceType === 'local-ref' ? (
            <Badge
              variant="secondary"
              className="text-[10px] bg-black/70 backdrop-blur-md border-white/10 text-slate-300 flex items-center gap-1 py-0.5 px-2 font-mono"
            >
              <LinkIcon className="w-2.5 h-2.5 text-primary" />
              Ref
            </Badge>
          ) : (
            <Badge
              variant="secondary"
              className="text-[10px] bg-black/70 backdrop-blur-md border-white/10 text-slate-300 flex items-center gap-1 py-0.5 px-2 font-mono"
            >
              Pasta
            </Badge>
          )}

          {isCompleted ? (
            <Badge variant="success" className="gap-1 shadow-sm font-semibold">
              <CheckCircle2 className="h-3 w-3" />
              <span>{t('course.completed')}</span>
            </Badge>
          ) : percentage > 0 ? (
            <Badge variant="info" className="shadow-sm font-bold">
              {percentage}%
            </Badge>
          ) : null}
        </div>

        {/* Bottom progress line overlay */}
        {percentage > 0 && (
          <div className="absolute bottom-0 inset-x-0 h-[3px] bg-black/60 z-10">
            <div
              className={`h-full transition-all duration-300 ${
                isCompleted ? 'bg-emerald-400' : 'bg-gradient-to-r from-orange-500 to-amber-400'
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        )}
      </div>

      {/* Title row below — minimal, no card chrome */}
      <div className="pt-2 px-0.5">
        <h3 className="text-[13px] font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
          {course.title}
        </h3>
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>
            {course.moduleCount} {t('course.modules')} • {course.lessonCount} {t('course.lessons')}
          </span>
          {course.totalDuration > 0 && (
            <span className="flex items-center gap-1 font-mono">
              <Clock className="h-3 w-3" />
              <span>{formatDurationHuman(course.totalDuration)}</span>
            </span>
          )}
        </p>
      </div>
    </div>
  )
}