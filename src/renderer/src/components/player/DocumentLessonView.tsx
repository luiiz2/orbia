import React, { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  ExternalLink,
  FolderOpen,
  Link2,
  FileText,
  CheckCircle2,
  Circle
} from 'lucide-react'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { Button, Tooltip, TooltipTrigger, TooltipContent } from '../ui'
import { cn, mediaUrl as createMediaUrl } from '../../lib/utils'

export interface DocumentLessonViewProps {
  className?: string
  onBack?: () => void
}

/**
 * Viewer for non-video lessons: PDFs (inline iframe), images, text/markdown,
 * web links (.url/.webloc parsed and opened in the default browser), and any
 * other importable file (opened with the OS default application).
 */
export function DocumentLessonView({
  className,
  onBack
}: DocumentLessonViewProps): React.JSX.Element {
  const { t } = useTranslation()
  const { activeCourse, activeLesson, toggleComplete, progressMap } =
    usePlayerStore(
      useShallow((state) => ({
        activeCourse: state.activeCourse,
        activeLesson: state.activeLesson,
        toggleComplete: state.toggleComplete,
        progressMap: state.progressMap
      }))
    )
  const { setView } = useNavigationStore()

  const [linkUrl, setLinkUrl] = useState<string | null>(null)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<boolean>(false)

  const mediaUrl = activeLesson?.filePath
    ? createMediaUrl(activeLesson.filePath)
    : ''

  const mediaType = activeLesson?.mediaType || 'other'

  useEffect(() => {
    setLinkUrl(null)
    setTextContent(null)
    setLoadError(false)

    if (!activeLesson) return

    if (mediaType === 'link') {
      const ext = (activeLesson.fileExtension || '').toLowerCase()
      if (ext === 'url' || ext === 'webloc') {
        fetch(mediaUrl)
          .then((res) => (res.ok ? res.text() : ''))
          .then((content) => {
            const match =
              content.match(/URL=(https?:\/\/[^\s]+)/i) ||
              content.match(/<string>(https?:\/\/[^<]+)<\/string>/i)
            setLinkUrl(match?.[1] || null)
          })
          .catch(() => setLoadError(true))
      }
    } else if (mediaType === 'document') {
      const ext = (activeLesson.fileExtension || '').toLowerCase()
      if (ext === 'txt' || ext === 'md') {
        fetch(mediaUrl)
          .then((res) => (res.ok ? res.text() : ''))
          .then(setTextContent)
          .catch(() => setLoadError(true))
      }
    }
  }, [activeLesson?.id, mediaType, mediaUrl])

  const handleBackClick = (): void => {
    if (onBack) {
      onBack()
    } else if (activeCourse) {
      setView('course', activeCourse.id)
    } else {
      setView('home')
    }
  }

  const isCompleted = Boolean(
    activeLesson && progressMap[activeLesson.id]?.completed
  )

  const handleToggleComplete = (): void => {
    if (activeLesson && activeCourse) {
      void toggleComplete(activeLesson.id)
    }
  }

  const handleOpenExternal = (): void => {
    if (linkUrl) {
      void window.api.system.openExternal(linkUrl)
    }
  }

  const handleOpenPath = (): void => {
    if (activeLesson) {
      void window.api.system.openPath(activeLesson.filePath)
    }
  }

  if (!activeLesson) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-400">
        <p className="text-sm font-medium">
          {t('player.noLessonSelected', 'Nenhuma aula selecionada')}
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative flex h-full w-full flex-col overflow-hidden bg-zinc-950 select-none',
        className
      )}
    >
      {/* Header */}
      <div className="absolute left-0 right-0 top-0 z-30 flex items-center justify-between bg-gradient-to-b from-black/85 via-black/45 to-transparent p-4">
        <div className="min-w-0 flex-1 flex items-start gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleBackClick}
                className="h-8.5 w-8.5 rounded-xl text-white/90 hover:bg-white/15 hover:text-white shrink-0 cursor-pointer"
                aria-label="Voltar para o curso"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              className="flex items-center gap-1.5 bg-black/90 text-white border-white/20"
            >
              <span>Voltar para o curso</span>
            </TooltipContent>
          </Tooltip>

          <div className="min-w-0 flex-1">
            {activeCourse && (
              <span className="block break-words whitespace-normal text-[11px] font-medium text-zinc-400 leading-snug">
                {activeCourse.title}
              </span>
            )}
            <h2 className="break-words whitespace-normal text-sm font-semibold text-white leading-snug">
              {activeLesson.title || 'Lesson'}
            </h2>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggleComplete}
          className={cn(
            'gap-1.5 text-xs rounded-xl cursor-pointer',
            isCompleted
              ? 'text-emerald-400 hover:text-emerald-300'
              : 'text-zinc-400 hover:text-white'
          )}
        >
          {isCompleted ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Circle className="h-4 w-4" />
          )}
          {isCompleted ? t('player.completed') : t('player.markCompleted')}
        </Button>
      </div>

      {/* Body */}
      <div className="flex h-full w-full items-center justify-center bg-zinc-950">
        {mediaType === 'pdf' && (
          <iframe
            src={mediaUrl}
            className="h-full w-full border-0 bg-white dark:bg-zinc-900"
            title={activeLesson.title}
          />
        )}

        {mediaType === 'image' && (
          <div className="flex h-full w-full items-center justify-center p-6">
            <img
              src={mediaUrl}
              alt={activeLesson.title}
              className="max-h-full max-w-full object-contain rounded-xl shadow-2xl"
            />
          </div>
        )}

        {textContent !== null && (
          <pre className="h-full w-full overflow-auto whitespace-pre-wrap break-words p-8 text-sm text-zinc-100 font-mono leading-relaxed">
            {loadError
              ? t('player.documentLoadError')
              : textContent || t('common.loading')}
          </pre>
        )}

        {(mediaType === 'link' ||
          (mediaType === 'document' && textContent === null) ||
          mediaType === 'archive' ||
          mediaType === 'other') && (
          <div className="flex flex-col items-center justify-center gap-4 p-8 text-center max-w-md">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-md">
              {mediaType === 'link' ? (
                <Link2 className="h-8 w-8" />
              ) : (
                <FileText className="h-8 w-8" />
              )}
            </div>
            <h4 className="text-base font-bold text-white">
              {activeLesson.title}
            </h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {mediaType === 'link'
                ? t('player.linkHint')
                : t('player.documentHint')}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {mediaType === 'link' && linkUrl && (
                <Button
                  onClick={handleOpenExternal}
                  className="gap-2 shadow-lg shadow-primary/20 bg-primary text-primary-foreground font-semibold rounded-xl cursor-pointer"
                >
                  <ExternalLink className="h-4 w-4" />
                  {t('player.openLink')}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleOpenPath}
                className="gap-2 text-xs rounded-xl border-border/80 hover:bg-secondary hover:text-foreground cursor-pointer"
              >
                <FolderOpen className="h-4 w-4" />
                {t('player.openFile')}
              </Button>
            </div>
          </div>
        )}

        {textContent !== null && (
          <div className="absolute bottom-4 right-4 z-10">
            <Button
              variant="outline"
              onClick={handleOpenPath}
              className="gap-2 text-xs rounded-xl border-border/80 bg-black/60 text-zinc-200 hover:bg-black/80 hover:text-white cursor-pointer"
            >
              <FolderOpen className="h-4 w-4" />
              {t('player.openFile')}
            </Button>
          </div>
        )}
      </div>

      {/* Fallback icon watermark for load errors */}
      {loadError &&
        (mediaType === 'link' ||
          (mediaType === 'document' && textContent === null)) && (
          <div className="absolute inset-x-0 bottom-8 mx-auto w-fit rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
            {t('player.documentLoadError')}
          </div>
        )}
    </div>
  )
}
