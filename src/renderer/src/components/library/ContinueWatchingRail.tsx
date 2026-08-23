import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import { Button, Skeleton, Tooltip, TooltipTrigger, TooltipContent, CourseCover } from '../ui'
import { useNavigationStore, usePlayerStore } from '../../stores'
import { formatTime } from '../../lib/formatters'
import type { WatchHistoryEntry } from '@shared'

interface ContinueWatchingRailProps {
  className?: string
  isLoading?: boolean
}

interface ContinueCardProps {
  entry: WatchHistoryEntry
  onResume: (entry: WatchHistoryEntry) => void
}

function ContinueCard({ entry, onResume }: ContinueCardProps): React.JSX.Element {
  const isPdf = entry.fileExtension?.toLowerCase().includes('pdf') || false
  const percentage =
    entry.duration > 0
      ? Math.min(99, Math.round((entry.currentTime / entry.duration) * 100))
      : 0
  const coverPath = entry.lessonCoverPath || entry.coverPath

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onResume(entry)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onResume(entry)}
      onKeyDown={handleKeyDown}
      className="group relative w-[260px] sm:w-[300px] shrink-0 cursor-pointer select-none snap-start rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {/* Thumbnail Container with branded fallback */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-950 flex items-center justify-center">
        <CourseCover
          src={coverPath}
          title={entry.lessonTitle || entry.courseTitle}
          subtitle={entry.courseTitle}
          showPlayOnHover={true}
          badge={isPdf ? 'PDF' : undefined}
          className="h-full w-full"
        />

        {/* Top Progress Badge (video only) */}
        {!isPdf && percentage > 0 && (
          <div className="absolute top-2 right-2 z-30 pointer-events-none">
            <span className="rounded-md bg-black/70 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-white/10 shadow-xs font-mono">
              {percentage}%
            </span>
          </div>
        )}

        {/* PDF badge */}
        {isPdf && (
          <div className="absolute top-2 right-2 z-30 pointer-events-none">
            <span className="rounded-md bg-black/70 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-white/90 border border-white/10 shadow-xs uppercase flex items-center gap-1 font-mono">
              <FileText className="h-2.5 w-2.5 text-amber-400" />
              PDF
            </span>
          </div>
        )}
      </div>

      {/* Meta row below */}
      <div className="pt-2 px-0.5">
        <h3 className="text-[12px] font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
          {entry.lessonTitle}
        </h3>
        <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="truncate">{entry.courseTitle}</span>
          {!isPdf && entry.currentTime > 0 && (
            <span className="font-mono text-amber-400/90 shrink-0 font-medium">
              {formatTime(entry.currentTime)}
              {entry.duration > 0 ? ` / ${formatTime(entry.duration)}` : ''}
            </span>
          )}
        </p>
      </div>
    </div>
  )
}

export function ContinueWatchingRail({ className, isLoading }: ContinueWatchingRailProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const { navigateToPlayer } = useNavigationStore()
  const { loadHierarchy } = usePlayerStore()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [history, setHistory] = useState<WatchHistoryEntry[]>([])
  const [isHistoryLoading, setIsHistoryLoading] = useState<boolean>(true)

  // Fetch watch history once the vault/courses are ready
  useEffect(() => {
    if (isLoading) return
    let cancelled = false
    setIsHistoryLoading(true)
    window.api.player
      .getWatchHistory(20)
      .then((entries) => {
        if (!cancelled) setHistory(entries || [])
      })
      .catch((err) => console.error('Failed to load watch history:', err))
      .finally(() => {
        if (!cancelled) setIsHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isLoading])

  // In-progress lessons: has real position, not finished, latest entry per lesson
  const continueList = useMemo(() => {
    const latestByLesson = new Map<string, WatchHistoryEntry>()
    for (const entry of history) {
      const prev = latestByLesson.get(entry.lessonId)
      if (!prev || entry.watchedAt > prev.watchedAt) {
        latestByLesson.set(entry.lessonId, entry)
      }
    }

    return Array.from(latestByLesson.values())
      .filter((entry) => {
        // PDF lessons have no playback position; always continue-able
        if (entry.fileExtension?.toLowerCase().includes('pdf')) return true
        if (entry.currentTime <= 0) return false
        // A known duration lets us avoid cluttering the rail before meaningful progress
        if (entry.duration <= 0) return true
        const progress = entry.currentTime / entry.duration
        return progress > 0 && progress < 0.98
      })
      .sort((a, b) => b.watchedAt - a.watchedAt)
      .slice(0, 10)
  }, [history])

  // Loading skeleton state
  if (isLoading || isHistoryLoading) {
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

  if (continueList.length === 0) {
    return null
  }

  const handleResume = async (entry: WatchHistoryEntry): Promise<void> => {
    try {
      const hierarchy = await window.api.courses.getById(entry.courseId)
      if (hierarchy) {
        await loadHierarchy(hierarchy.course, hierarchy.modules, entry.lessonId)
        navigateToPlayer(entry.courseId)
      }
    } catch (err) {
      console.error('Failed to resume lesson from rail:', err)
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
              {t('home.continueWatching', 'Continuar Assistindo')}
            </h2>
          </div>
          <span className="ml-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-bold text-primary border border-primary/20">
            {continueList.length}
          </span>
        </div>

        {continueList.length > 2 && (
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => scroll('left')}
                  className="h-8 w-8 rounded-xl border-border/80 bg-card hover:bg-secondary hover:text-foreground cursor-pointer shadow-xs focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={t('home.scrollLeft', 'Rolar para a esquerda')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('home.scrollLeft', 'Rolar para a esquerda')}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => scroll('right')}
                  className="h-8 w-8 rounded-xl border-border/80 bg-card hover:bg-secondary hover:text-foreground cursor-pointer shadow-xs focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={t('home.scrollRight', 'Rolar para a direita')}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('home.scrollRight', 'Rolar para a direita')}</TooltipContent>
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
        {continueList.map((entry) => (
          <ContinueCard key={entry.id} entry={entry} onResume={handleResume} />
        ))}
      </div>
    </section>
  )
}
