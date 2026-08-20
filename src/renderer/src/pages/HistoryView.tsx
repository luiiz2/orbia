import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { History, Play, Clock, Calendar, BookOpen, FileArchive, CheckCircle2, Trash2 } from 'lucide-react'
import { useNavigationStore } from '../stores/useNavigationStore'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useLibraryStore } from '../stores/useLibraryStore'
import { formatTime, formatBytes } from '../lib/formatters'
import { Button } from '../components/ui'
import type { WatchHistoryEntry } from '@shared'

export function HistoryView(): React.JSX.Element {
  const { t } = useTranslation()
  const { navigateToPlayer } = useNavigationStore()
  const { loadHierarchy } = usePlayerStore()
  const { importHistory, fetchImportHistory, clearImportHistory } = useLibraryStore()

  const [activeTab, setActiveTab] = useState<'watch' | 'imports'>('watch')
  const [historyEntries, setHistoryEntries] = useState<WatchHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)

  useEffect(() => {
    const fetchHistory = async (): Promise<void> => {
      try {
        const [entries] = await Promise.all([
          window.api.player.getWatchHistory(100),
          fetchImportHistory()
        ])
        setHistoryEntries(entries || [])
      } catch (err) {
        console.error('Failed to load watch history:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchHistory().catch(console.warn)
  }, [fetchImportHistory])

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t('history.title', 'Histórico')}
            </h1>
            <p className="text-xs text-muted-foreground">
              {activeTab === 'watch'
                ? t('history.lessonsRecorded', { count: historyEntries.length })
                : t('history.filesImported', { count: importHistory.length })}
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-secondary/60 p-1 rounded-xl border border-border/80 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('watch')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === 'watch'
                ? 'bg-card text-foreground shadow-sm border border-border/50'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Play className="h-3.5 w-3.5 text-primary fill-primary" />
            <span>{t('history.watchHistory')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('imports')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === 'imports'
                ? 'bg-card text-foreground shadow-sm border border-border/50'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileArchive className="h-3.5 w-3.5 text-purple-400" />
            <span>{t('history.importHistory')}</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-16 rounded-2xl border border-border/40 bg-card/40 animate-pulse" />
          ))}
        </div>
      ) : activeTab === 'imports' ? (
        /* Import History Tab */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {t('history.importsSubtitle')}
            </span>
            {importHistory.length > 0 && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => clearImportHistory()}
                className="text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1 rounded-lg"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{t('history.clearImports')}</span>
              </Button>
            )}
          </div>

          {importHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-12 text-center bg-card/30 space-y-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/80 text-muted-foreground shadow-inner">
                <FileArchive className="h-8 w-8 text-purple-400 opacity-60" />
              </div>
              <div className="space-y-1 max-w-md">
                <h3 className="text-base font-bold text-foreground">{t('history.noImportsTitle')}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t('history.noImportsDesc')}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/80 bg-card divide-y divide-border/40 overflow-hidden shadow-sm">
              {importHistory.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3.5 sm:p-4 hover:bg-secondary/40 transition-colors"
                >
                  <div className="flex items-center gap-3.5 overflow-hidden">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-sm">
                      <FileArchive className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {item.fileName}
                      </span>
                      <span className="text-xs text-muted-foreground truncate flex items-center gap-2 mt-0.5">
                        {item.courseTitle && (
                          <span className="flex items-center gap-1 text-primary">
                            <BookOpen className="h-3 w-3" />
                            <span>{item.courseTitle}</span>
                          </span>
                        )}
                        {item.fileSize > 0 && <span>{formatBytes(item.fileSize)}</span>}
                        {item.extractedFiles > 0 && (
                          <span>• {t('history.filesExtracted', { count: item.extractedFiles })}</span>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                    <span className="text-[11px] font-mono">
                      {new Date(item.createdAt).toLocaleDateString(undefined, {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>{t('history.completed')}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : historyEntries.length === 0 ? (
        /* Watch History Empty */
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
        /* Watch History Grouped by Date */
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

