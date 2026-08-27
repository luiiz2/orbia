import React, { useEffect, useMemo, useState } from 'react'
import { Check, FileText, Loader2, RefreshCw, Search, Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Transcript, TranscriptSegment, TranscriptionOptions } from '@shared'
import { formatTime } from '../../lib/formatters'
import { cn } from '../../lib/utils'

interface SubtitleCandidate {
  resourceId: string
  filePath: string
  language?: string
  label?: string
  sourceRevision: string
  segments: TranscriptSegment[]
}

export interface TranscriptPanelProps {
  transcript: Transcript | null
  subtitleCandidate: SubtitleCandidate | null
  currentTime: number
  isLoading: boolean
  errorMessage: string | null
  progressPercent?: number
  onSeek: (time: number) => void
  onTranscribe: (options?: TranscriptionOptions) => unknown
  onReuseSubtitle: (language?: string) => unknown
  onRetranscribe: (options?: TranscriptionOptions) => unknown
}

export interface HighlightedTranscriptPart {
  text: string
  match: boolean
}

export function highlightTranscriptText(text: string, query: string): HighlightedTranscriptPart[] {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return [{ text, match: false }]
  const escaped = normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'ig'))
  return parts.filter(Boolean).map((part) => ({ text: part, match: part.toLocaleLowerCase() === normalizedQuery.toLocaleLowerCase() }))
}

export function TranscriptPanel({
  transcript,
  subtitleCandidate,
  currentTime,
  isLoading,
  errorMessage,
  progressPercent,
  onSeek,
  onTranscribe,
  onReuseSubtitle,
  onRetranscribe
}: TranscriptPanelProps): React.JSX.Element {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [language, setLanguage] = useState('')

  useEffect(() => {
    setQuery('')
    setLanguage(transcript?.language && transcript.language !== 'und' ? transcript.language : '')
  }, [transcript?.id, transcript?.language])

  const activeSequence = useMemo(() => {
    if (!transcript) return null
    return transcript.segments.find((segment) => currentTime >= segment.start && currentTime < segment.end)?.sequence ?? null
  }, [currentTime, transcript])

  const visibleSegments = useMemo(() => {
    if (!transcript) return []
    const normalized = query.trim().toLocaleLowerCase()
    return normalized
      ? transcript.segments.filter((segment) => segment.text.toLocaleLowerCase().includes(normalized))
      : transcript.segments
  }, [query, transcript])

  const handleTranscribe = (): void => {
    void onTranscribe({
      ...(language ? { language } : {}),
      autoDetect: !language,
      reuseExistingSubtitle: true
    })
  }

  const handleRetranscribe = (): void => {
    void onRetranscribe({
      ...(language ? { language } : {}),
      autoDetect: !language,
      retranscribe: true,
      reuseExistingSubtitle: false
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" role="tabpanel" aria-label={t('player.transcript', 'Transcript')}>
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate">{t('player.transcript', 'Transcript')}</span>
          {transcript && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">{transcript.language}</span>}
        </div>
        {transcript && (
          <button
            type="button"
            onClick={handleRetranscribe}
            disabled={isLoading}
            className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-border/80 px-2 text-[11px] font-medium text-muted-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-3 w-3" />
            {t('player.retranscribe', 'Retranscribe')}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-secondary/30 p-2">
        <label htmlFor="transcript-language" className="text-[11px] font-medium text-muted-foreground">
          {t('player.transcriptLanguage', 'Language')}
        </label>
        <select
          id="transcript-language"
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <option value="">{t('player.autoDetect', 'Auto-detect')}</option>
          <option value="pt">Português</option>
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
        {!transcript && subtitleCandidate && (
          <button
            type="button"
            onClick={() => void onReuseSubtitle(language || subtitleCandidate.language)}
            disabled={isLoading}
            className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 text-[11px] font-medium text-emerald-500 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            <Check className="h-3 w-3" />
            {t('player.reuseSubtitle', 'Reuse subtitle')}
          </button>
        )}
        {!transcript && (
          <button
            type="button"
            onClick={handleTranscribe}
            disabled={isLoading}
            className="inline-flex min-h-[30px] items-center gap-1 rounded-lg bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Volume2 className="h-3 w-3" />}
            {t('player.transcribe', 'Transcribe')}
          </button>
        )}
      </div>

      {(isLoading || progressPercent !== undefined) && !transcript && (
        <div className="space-y-1 px-1" aria-live="polite">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{t('player.transcribing', 'Transcribing…')}</span>
            <span>{Math.round(progressPercent ?? 0)}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, progressPercent ?? 0))}%` }} />
          </div>
        </div>
      )}

      {errorMessage && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">{errorMessage}</p>}

      {transcript && (
        <label className="relative block shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('player.searchTranscript', 'Search transcript')}
            aria-label={t('player.searchTranscript', 'Search transcript')}
            className="h-9 w-full rounded-xl border border-border/80 bg-background pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
          />
        </label>
      )}

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" aria-live="polite">
        {!transcript && !isLoading && !errorMessage && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-muted-foreground">
            <FileText className="h-7 w-7 opacity-40" />
            <p>{subtitleCandidate ? t('player.subtitleAvailable', 'A time-aligned subtitle is available.') : t('player.noTranscript', 'No transcript available yet.')}</p>
          </div>
        )}
        {transcript && visibleSegments.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">{t('player.noTranscriptMatches', 'No transcript matches')}</p>
        )}
        {visibleSegments.map((segment) => {
          const active = segment.sequence === activeSequence
          return (
            <button
              key={`${transcript?.id}-${segment.sequence}`}
              type="button"
              aria-current={active ? 'true' : undefined}
              aria-label={`${formatTime(segment.start)} ${segment.text}`}
              onClick={() => onSeek(segment.start)}
              className={cn(
                'flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left text-xs leading-relaxed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                active ? 'bg-primary/15 text-foreground ring-1 ring-primary/30' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <span className="shrink-0 font-mono text-[10px] text-primary">{formatTime(segment.start)}</span>
              <span>
                {highlightTranscriptText(segment.text, query).map((part, index) =>
                  part.match ? <mark key={index} className="rounded bg-amber-300/40 text-inherit">{part.text}</mark> : <React.Fragment key={index}>{part.text}</React.Fragment>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
