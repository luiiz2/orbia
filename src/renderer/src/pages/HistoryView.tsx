import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { History, Play, Clock, Calendar, BookOpen } from 'lucide-react'
import { useNavigationStore } from '../stores/useNavigationStore'
import { usePlayerStore } from '../stores/usePlayerStore'
import { formatTime } from '../lib/formatters'
import type { WatchHistoryEntry } from '@shared'

export function HistoryView(): React.JSX.Element {
  const { t } = useTranslation()
  const { navigateToPlayer } = useNavigationStore()
  const { loadHierarchy } = usePlayerStore()

  const [historyEntries, setHistoryEntries] = useState<WatchHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)

  useEffect(() => {
    const fetchHistory = async (): Promise<void> => {
      try {
        const entries = await window.api.player.getWatchHistory(100)
        setHistoryEntries(entries || [])
      } catch (err) {
        console.error('Failed to load watch history:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchHistory().catch(console.warn)
  }, [])

  const handlePlayEntry = async (entry: WatchHistoryEntry): Promise<void> => {
    try {
      const hierarchy = await window.api.courses.getById(entry.courseId)
      if (hierarchy) {
        await loadHierarchy(hierarchy.course, hierarchy.modules, entry.lessonId)
        navigateToPlayer(entry.courseId)
      }
    } catch (err) {
      console.error('Failed to open lesson from history:', err)
    }
  }

  // Format date helper
  const formatDateGroup = (timestamp: number): string => {
    const date = new Date(timestamp)
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(today.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return t('history.today')
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return t('history.yesterday')
    }
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    })
  }

  // Group entries by date
  const groupedEntries: Record<string, WatchHistoryEntry[]> = {}
  for (const entry of historyEntries) {
    const groupKey = formatDateGroup(entry.watchedAt)
    if (!groupedEntries[groupKey]) {
      groupedEntries[groupKey] = []
    }
    groupedEntries[groupKey].push(entry)
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 sm:px-6 space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
          <History className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {t('history.title')}
          </h1>
          <p className="text-xs text-muted-foreground">
            {historyEntries.length} {historyEntries.length === 1 ? 'study session' : 'study sessions'} recorded
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-16 rounded-2xl border border-border/40 bg-card/40 animate-pulse" />
          ))}
        </div>
      ) : historyEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-12 text-center bg-card/30 space-y-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/80 text-muted-foreground shadow-inner">
            <History className="h-8 w-8 text-primary opacity-60" />
          </div>
          <div className="space-y-1 max-w-md">
            <h3 className="text-base font-bold text-foreground">{t('history.title')}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{t('history.empty')}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedEntries).map(([groupTitle, entries]) => (
            <div key={groupTitle} className="space-y-2">
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 px-1">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                <span>{groupTitle}</span>
              </h2>

              <div className="rounded-2xl border border-border/80 bg-card divide-y divide-border/40 overflow-hidden shadow-sm">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    onClick={() => handlePlayEntry(entry)}
                    className="flex items-center justify-between p-3.5 sm:p-4 hover:bg-secondary/60 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3.5 overflow-hidden">
                      {/* Play Action Badge */}
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-md group-hover:shadow-orange-500/20 transition-all">
                        <Play className="h-4 w-4 fill-current ml-0.5" />
                      </div>

                      <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                          {entry.lessonTitle}
                        </span>
                        <span className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                          <BookOpen className="h-3 w-3" />
                          <span>{entry.courseTitle}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground/70" />
                        <span className="font-semibold text-foreground">{formatTime(entry.currentTime)}</span>
                        {entry.duration > 0 && <span>/ {formatTime(entry.duration)}</span>}
                      </span>
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

