import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Play,
  Link as LinkIcon,
  BookOpen,
  Clock,
  CheckCircle2,
  Star
} from 'lucide-react'
import type { Course } from '@shared'
import { Badge, Tooltip, TooltipTrigger, TooltipContent } from '../ui'
import { useLibraryStore, useNavigationStore } from '../../stores'
import { formatDurationHuman } from '../../lib/formatters'
import { mediaUrl } from '../../lib/utils'

interface CourseCardProps {
  course: Course
}

export function CourseCard({ course }: CourseCardProps): React.JSX.Element {
  const { t } = useTranslation()
  const { progressSummaries, toggleFavorite } = useLibraryStore()
  const { navigateToCourse } = useNavigationStore()

  const summary = progressSummaries[course.id]
  const percentage = summary ? summary.percentage : 0
  const isCompleted = percentage >= 100

  const [coverFailed, setCoverFailed] = React.useState(false)
  const coverUrl = course.coverPath && !coverFailed
    ? mediaUrl(course.coverPath)
    : null

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
      {/* Cover — streaming card, no chrome */}
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-secondary/60 flex items-center justify-center">
        {/* Favorite Button (Top Left) */}
        <div
          className="absolute top-2 left-2 z-20"
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
        </div>

        {coverUrl ? (
          <img
            src={coverUrl}
            alt={course.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out"
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-secondary via-secondary/70 to-card text-muted-foreground group-hover:text-primary transition-colors p-4">
            <BookOpen className="w-10 h-10 mb-2 opacity-50 group-hover:scale-110 transition-transform duration-300" />
          </div>
        )}

        {/* Hover overlay — dark gradient + play */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black shadow-lg shadow-black/50 transform scale-75 group-hover:scale-100 transition-transform duration-200 ease-out">
            <Play className="h-5 w-5 fill-current ml-0.5" />
          </div>
        </div>

        {/* Top status badges */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10 pointer-events-none">
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