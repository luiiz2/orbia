import React from 'react'
import { useTranslation } from 'react-i18next'
import { Play, Layers, HardDrive, Link as LinkIcon, BookOpen, Clock, CheckCircle2 } from 'lucide-react'
import type { Course } from '@shared'
import { Card, CardContent, Badge } from '../ui'
import { useLibraryStore, useNavigationStore } from '../../stores'
import { formatDurationHuman } from '../../lib/formatters'

interface CourseCardProps {
  course: Course
}

export function CourseCard({ course }: CourseCardProps): React.JSX.Element {
  const { t } = useTranslation()
  const { progressSummaries } = useLibraryStore()
  const { navigateToCourse } = useNavigationStore()

  const summary = progressSummaries[course.id]
  const percentage = summary ? summary.percentage : 0
  const isCompleted = percentage >= 100

  const coverUrl = course.coverPath
    ? `media://${encodeURI(course.coverPath.replace(/\\/g, '/'))}`
    : null

  return (
    <Card
      onClick={() => navigateToCourse(course.id)}
      className="group relative flex flex-col overflow-hidden border-border/80 bg-card hover:border-primary/50 hover:shadow-xl hover:shadow-orange-500/10 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer rounded-2xl"
    >
      {/* Cover Aspect Ratio Container */}
      <div className="relative aspect-video w-full bg-secondary/60 overflow-hidden flex items-center justify-center border-b border-border/50">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={course.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-secondary via-secondary/70 to-card text-muted-foreground group-hover:text-primary transition-colors p-4">
            <BookOpen className="w-10 h-10 mb-2 opacity-50 group-hover:scale-110 transition-transform duration-300" />
            <span className="text-[11px] font-medium text-muted-foreground text-center line-clamp-1 max-w-[80%]">
              {course.title}
            </span>
          </div>
        )}

        {/* Overlay Play Button on Hover */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
          <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-orange-500 to-amber-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/40 transform scale-75 group-hover:scale-100 transition-transform duration-200">
            <Play className="w-5 h-5 ml-0.5 fill-current" />
          </div>
        </div>

        {/* Top Status & Source Badges */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
          {course.sourceType === 'local-ref' ? (
            <Badge
              variant="secondary"
              className="text-[10px] bg-black/70 backdrop-blur-md border-white/10 text-slate-300 flex items-center gap-1 py-0.5 px-2"
            >
              <LinkIcon className="w-2.5 h-2.5 text-primary" />
              Ref
            </Badge>
          ) : (
            <Badge
              variant="secondary"
              className="text-[10px] bg-black/70 backdrop-blur-md border-white/10 text-slate-300 flex items-center gap-1 py-0.5 px-2"
            >
              <HardDrive className="w-2.5 h-2.5 text-purple-400" />
              Vault
            </Badge>
          )}

          {isCompleted ? (
            <Badge variant="success" className="gap-1 shadow-sm">
              <CheckCircle2 className="h-3 w-3" />
              <span>{t('course.completed')}</span>
            </Badge>
          ) : percentage > 0 ? (
            <Badge variant="info" className="shadow-sm font-bold">
              {percentage}%
            </Badge>
          ) : null}
        </div>

        {/* Bottom Progress Bar Overlay */}
        {percentage > 0 && (
          <div className="absolute bottom-0 inset-x-0 h-1 bg-black/60 z-10">
            <div
              className={`h-full transition-all duration-300 ${
                isCompleted
                  ? 'bg-emerald-400'
                  : 'bg-gradient-to-r from-orange-500 to-amber-400'
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        )}
      </div>

      {/* Content Area */}
      <CardContent className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div>
          <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
            {course.title}
          </h3>
        </div>

        <div className="space-y-2 pt-2 border-t border-border/40 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[11px]">
              <Layers className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span>
                {course.moduleCount} {t('course.modules')} • {course.lessonCount} {t('course.lessons')}
              </span>
            </span>

            {course.totalDuration > 0 && (
              <span className="flex items-center gap-1 font-mono text-[11px]">
                <Clock className="h-3 w-3" />
                <span>{formatDurationHuman(course.totalDuration)}</span>
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

