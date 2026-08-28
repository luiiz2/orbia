import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Sparkles,
  Clock,
  RefreshCw,
  AlertTriangle,
  FileText,
  Tag,
  ListCheck,
  CheckCircle2,
  X
} from 'lucide-react'
import { useSummariesStore } from '../../stores/useSummariesStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { Badge } from '../ui/badge'
import { formatTime } from '../../lib/formatters'

export function SummaryViewModal(): React.JSX.Element {
  const { t } = useTranslation()
  const { isOpen, summary, isLoading, error, generateSummary, closeSummary } = useSummariesStore()
  const { seek } = usePlayerStore()
  const [viewMarkdown, setViewMarkdown] = useState(false)

  if (!isOpen) return <></>

  const getScopeBadge = (type?: string) => {
    switch (type) {
      case 'lesson':
        return <Badge variant="secondary" className="text-xs bg-sky-500/10 text-sky-400 border-sky-500/20">{t('summaries.scopeLesson', 'Aula')}</Badge>
      case 'module':
        return <Badge variant="secondary" className="text-xs bg-indigo-500/10 text-indigo-400 border-indigo-500/20">{t('summaries.scopeModule', 'Módulo')}</Badge>
      case 'course':
        return <Badge variant="secondary" className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/20">{t('summaries.scopeCourse', 'Curso')}</Badge>
      default:
        return null
    }
  }

  const handleSeek = (seconds: number) => {
    seek(seconds)
    closeSummary()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeSummary()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden bg-background border-border/80 text-foreground">
        {/* Header */}
        <DialogHeader className="p-5 border-b border-border/60 bg-muted/20 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-lg font-bold truncate max-w-md">
                  {summary?.title || t('summaries.title', 'Resumo com IA')}
                </DialogTitle>
                {summary && getScopeBadge(summary.scopeType)}
              </div>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {t('summaries.subtitle', 'Síntese estruturada do conteúdo de estudo')}
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={isLoading}
              onClick={() => generateSummary(true)}
              className="h-8 gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              {t('summaries.regenerate', 'Regenerar')}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={closeSummary}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Provenance & Staleness Alert */}
        {summary && (
          <div className="px-5 py-2.5 bg-muted/40 border-b border-border/40 flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span>{t('summaries.model', 'Modelo')}: <strong className="text-foreground">{summary.modelId || summary.providerId}</strong></span>
              <span>•</span>
              <span>{new Date(summary.updatedAt || summary.createdAt).toLocaleDateString()}</span>
            </div>

            {summary.isStale && (
              <div className="flex items-center gap-1.5 text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded text-xs border border-amber-500/20">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>{t('summaries.staleNotice', 'Conteúdo fonte alterado')}</span>
              </div>
            )}
          </div>
        )}

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {isLoading && !summary && (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">{t('summaries.generating', 'Gerando resumo estruturado...')}</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-3 text-sm">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {summary && (
            <>
              {/* Overview */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  {t('summaries.overview', 'Visão Geral')}
                </h3>
                <p className="text-foreground/90 leading-relaxed bg-muted/30 p-3.5 rounded-lg border border-border/40">
                  {summary.overview}
                </p>
              </div>

              {/* Key Concepts */}
              {summary.keyConcepts && summary.keyConcepts.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-primary" />
                    {t('summaries.keyConcepts', 'Conceitos-Chave')}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {summary.keyConcepts.map((concept, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 p-2.5 rounded-md bg-muted/20 border border-border/40 text-xs"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                        <span className="text-foreground/90">{concept}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Topics Covered */}
              {summary.topicsCovered && summary.topicsCovered.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <ListCheck className="h-3.5 w-3.5 text-primary" />
                    {t('summaries.topicsCovered', 'Tópicos Abordados')}
                  </h3>
                  <ul className="space-y-1.5 pl-2">
                    {summary.topicsCovered.map((topic, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-xs text-foreground/80">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                        <span>{topic}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Important Details */}
              {summary.importantDetails && summary.importantDetails.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    {t('summaries.importantDetails', 'Detalhes Importantes & Nuances')}
                  </h3>
                  <div className="space-y-2">
                    {summary.importantDetails.map((detail, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-md bg-amber-500/5 border border-amber-500/20 text-xs text-foreground/90"
                      >
                        {detail}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Relevant Timestamps */}
              {summary.timestamps && summary.timestamps.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    {t('summaries.timestamps', 'Momentos Relevantes')}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {summary.timestamps.map((ts, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSeek(ts.timestampSeconds)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary text-xs font-medium transition-colors"
                      >
                        <Clock className="h-3 w-3" />
                        <span>{formatTime(ts.timestampSeconds)}</span>
                        <span className="text-foreground/70 font-normal truncate max-w-[180px]">{ts.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Markdown Toggle */}
              <div className="pt-3 border-t border-border/40">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMarkdown(!viewMarkdown)}
                  className="text-xs text-muted-foreground hover:text-foreground h-7"
                >
                  {viewMarkdown ? t('summaries.hideRawMarkdown', 'Ocultar Markdown') : t('summaries.viewRawMarkdown', 'Ver Markdown Completo')}
                </Button>

                {viewMarkdown && (
                  <pre className="mt-2 p-3 rounded bg-muted/40 text-xs font-mono text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {summary.fullMarkdown}
                  </pre>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
