import React, { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, Sparkles, BookOpen, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { Card, Button, Progress, Skeleton, Tooltip, TooltipTrigger, TooltipContent } from '../ui'
import { useLibraryStore, useNavigationStore, usePlayerStore } from '../../stores'
import type { Course } from '@shared'

interface ContinueWatchingRailProps {
  className?: string
  isLoading?: boolean
}

export function ContinueWatchingRail({ className, isLoading }: ContinueWatchingRailProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const { courses, progressSummaries } = useLibraryStore()
  const { navigateToPlayer } = useNavigationStore()
  const { loadHierarchy } = usePlayerStore()
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Loading skeleton state
  if (isLoading) {
    return (
      <section className={`space-y-3.5 ${className || ''}`} aria-label="Loading continue watching">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-lg" />
            <Skeleton className="h-5 w-36 rounded-md" />
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>
        </div>
        <div className="flex gap-4 overflow-hidden pt-1">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="flex w-[280px] sm:w-[320px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-0"
            >
              <Skeleton className="aspect-video w-full rounded-none" />
              <div className="p-3.5 space-y-3">
                <Skeleton className="h-4 w-3/4 rounded-md" />
                <Skeleton className="h-3 w-1/2 rounded-md" />
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <Skeleton className="h-2 w-full rounded-full" />
                  <Skeleton className="h-8 w-full rounded-xl" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  // Filter courses that are in progress (0 < percentage < 100)
  const inProgressList = courses
    .map((course) => ({
      course,
      summary: progressSummaries[course.id]
    }))
    .filter(
      (item) =>
        item.summary &&
        item.summary.percentage > 0 &&
        item.summary.percentage < 100
    )
    .sort((a, b) => (b.summary?.lastPlayedAt || 0) - (a.summary?.lastPlayedAt || 0))

  if (inProgressList.length === 0) {
    return null
  }

  const handleResume = async (course: Course, targetLessonId?: string): Promise<void> => {
    try {
      const hierarchy = await window.api.courses.getById(course.id)
      if (hierarchy) {
        const lessonId =
          targetLessonId ||
          hierarchy.modules[0]?.lessons[0]?.id

        await loadHierarchy(hierarchy.course, hierarchy.modules, lessonId)
        navigateToPlayer(course.id)
      }
    } catch (err) {
      console.error('Failed to resume course from rail:', err)
    }
  }

  const scroll = (direction: 'left' | 'right'): void => {
    if (scrollContainerRef.current) {
      const { scrollLeft, clientWidth } = scrollContainerRef.current
      const scrollAmount = clientWidth * 0.75
      scrollContainerRef.current.scrollTo({
        left: direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount,
        behavior: 'smooth'
      })
    }
  }

  return (
    <section className={`space-y-3.5 ${className || ''}`} aria-label={t('home.continueWatching', 'Continue Watching')}>
      {/* Header with Title and Scroll Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/15 text-primary shadow-xs">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground">
              {t('home.continueWatching', 'Continue Watching')}
            </h2>
          </div>
          <span className="ml-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-bold text-primary border border-primary/20">
            {inProgressList.length}
          </span>
        </div>

        {inProgressList.length > 2 && (
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => scroll('left')}
                  className="h-8 w-8 rounded-xl border-border/80 bg-card hover:bg-secondary hover:text-foreground cursor-pointer shadow-xs focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Scroll left"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Scroll left</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => scroll('right')}
                  className="h-8 w-8 rounded-xl border-border/80 bg-card hover:bg-secondary hover:text-foreground cursor-pointer shadow-xs focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Scroll right"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Scroll right</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Rail Scroll Container */}
      <div
        ref={scrollContainerRef}
        className="flex gap-4 overflow-x-auto pb-2 pt-1 no-scrollbar scroll-smooth snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {inProgressList.map(({ course, summary }) => {
          const percentage = summary?.percentage || 0
          const coverUrl = course.coverPath
            ? `media://${encodeURI(course.coverPath.replace(/\\/g, '/'))}`
            : null

          const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleResume(course, summary?.lastPlayedLessonId)
            }
          }

          return (
            <Card
              key={course.id}
              role="button"
              tabIndex={0}
              onKeyDown={handleKeyDown}
              className="group relative flex w-[280px] sm:w-[320px] shrink-0 flex-col overflow-hidden rounded-2xl border-border/80 bg-card hover:border-primary/60 hover:shadow-2xl hover:shadow-orange-500/10 hover:-translate-y-1.5 transition-all duration-300 ease-out snap-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background select-none"
            >
              {/* Thumbnail Container */}
              <div
                onClick={() => handleResume(course, summary?.lastPlayedLessonId)}
                className="relative aspect-video w-full cursor-pointer overflow-hidden bg-secondary/70 border-b border-border/50 flex items-center justify-center"
              >
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt={course.title}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-secondary via-secondary/70 to-card text-muted-foreground group-hover:text-primary transition-colors p-4">
                    <BookOpen className="h-8 w-8 opacity-60 group-hover:scale-110 transition-transform duration-300" />
                  </div>
                )}

                {/* Play Button Overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center backdrop-blur-[2px]">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-tr from-orange-500 via-orange-600 to-amber-500 text-white shadow-lg shadow-orange-500/40 transform scale-75 group-hover:scale-100 transition-transform duration-200 ease-out">
                    <Play className="h-5 w-5 fill-current ml-0.5" />
                  </div>
                </div>

                {/* Top Duration / Progress Badge */}
                <div className="absolute top-2.5 right-2.5 z-10 pointer-events-none">
                  <span className="rounded-md bg-black/75 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-white/10 shadow-xs">
                    {percentage}%
                  </span>
                </div>

                {/* Bottom mini progress line on image */}
                <div className="absolute bottom-0 inset-x-0 h-1 bg-black/60 z-10">
                  <div
                    className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-300"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>

              {/* Card Body */}
              <div className="flex flex-1 flex-col justify-between p-3.5 space-y-3">
                <div className="space-y-1.5 min-w-0">
                  <h3
                    onClick={() => handleResume(course, summary?.lastPlayedLessonId)}
                    className="cursor-pointer text-xs sm:text-sm font-bold text-foreground hover:text-primary transition-colors truncate leading-tight"
                    title={course.title}
                  >
                    {course.title}
                  </h3>

                  {summary?.lastPlayedLessonTitle ? (
                    <p
                      className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5"
                      title={summary.lastPlayedLessonTitle}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 animate-pulse" />
                      <span className="font-medium text-foreground/90 truncate">
                        {summary.lastPlayedLessonTitle}
                      </span>
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>
                        {summary?.completedLessons || 0} / {course.lessonCount} {t('course.lessons')}
                      </span>
                    </p>
                  )}
                </div>

                {/* Progress bar and Quick Action Button */}
                <div className="space-y-2.5 pt-1 border-t border-border/40">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-medium text-muted-foreground">
                      <span>{t('course.inProgress', 'In progress')}</span>
                      <span className="font-semibold text-primary">{percentage}%</span>
                    </div>
                    <Progress
                      value={percentage}
                      className="h-1.5"
                      indicatorClassName="bg-gradient-to-r from-orange-500 via-amber-500 to-purple-600"
                    />
                  </div>

                  <Button
                    size="sm"
                    onClick={() => handleResume(course, summary?.lastPlayedLessonId)}
                    className="w-full h-8 text-xs font-semibold gap-1.5 rounded-xl shadow-md shadow-orange-500/20 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-white cursor-pointer hover:opacity-95 active:scale-[0.98] transition-all"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>{t('home.continueLesson', 'Continuar Aula')}</span>
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
