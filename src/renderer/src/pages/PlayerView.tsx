import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FileText,
  CheckCircle2,
  Circle,
  ChevronRight,
  ChevronLeft,
  Tv,
  Eye,
  AlertTriangle,
  Trash2,
  Sparkles,
  HelpCircle,
  BookOpen,
  Edit3
} from 'lucide-react'
import { PlaybackQueueDrawer } from '../components/player/PlaybackQueueDrawer'
import { VideoPlayer } from '../components/player/VideoPlayer'
import { NotesPanel } from '../components/player/NotesPanel'
import { ChaptersPanel } from '../components/player/ChaptersPanel'
import { BookmarksPanel } from '../components/player/BookmarksPanel'
import { FlashcardsPanel } from '../components/player/FlashcardsPanel'
import { TranscriptPanel } from '../components/player/TranscriptPanel'
import { PdfViewerModal } from '../components/documents/PdfViewerModal'
import { CodeViewerModal } from '../components/documents/CodeViewerModal'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useNavigationStore } from '../stores/useNavigationStore'
import { useGroundedChatStore } from '../stores/useGroundedChatStore'
import { useSummariesStore } from '../stores/useSummariesStore'
import { useCourseProgress } from '../hooks/useCourseProgress'
import {
  applyTranscriptProgress,
  useTranscriptStore
} from '../stores/useTranscriptStore'
import {
  Button,
  Progress,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '../components/ui'
import { formatTime, formatFileSize } from '../lib/formatters'
import { cn, mediaUrl } from '../lib/utils'
import type {
  AttachedResource,
  ContentResource,
  Lesson,
  CourseHealthReport
} from '@shared'

type VisibleResource = AttachedResource | ContentResource

function getLessonVisibleResources(lesson: Lesson): VisibleResource[] {
  return lesson.contentResources ?? lesson.resources ?? []
}

function getResourceTypeLabel(resource: VisibleResource): string {
  const extension = resource.fileExtension.replace(/^\./, '')
  return (extension || resource.type).toUpperCase()
}

function hasEmbeddedPreview(resource: VisibleResource): boolean {
  const extension = resource.fileExtension.replace(/^\./, '').toLowerCase()
  return (
    resource.type === 'pdf' ||
    extension === 'pdf' ||
    resource.name.toLowerCase().endsWith('.pdf')
  )
}

const CODE_EXTENSIONS = new Set([
  'py',
  'js',
  'ts',
  'jsx',
  'tsx',
  'json',
  'sql',
  'html',
  'css',
  'csv',
  'txt',
  'md',
  'xml',
  'yaml',
  'yml',
  'c',
  'cpp',
  'rs',
  'go',
  'java',
  'sh'
])

function isCodeResource(resource: VisibleResource): boolean {
  const ext = resource.fileExtension.replace(/^\./, '').toLowerCase()
  const nameExt = resource.name.split('.').pop()?.toLowerCase() || ''
  return (
    resource.type === 'code' ||
    CODE_EXTENSIONS.has(ext) ||
    CODE_EXTENSIONS.has(nameExt)
  )
}

export function PlayerView(): React.JSX.Element {
  const { t } = useTranslation()
  const {
    activeCourse,
    activeLesson,
    currentTime,
    modulesWithLessons,
    notes,
    chapters,
    bookmarks,
    flashcards,
    playbackQueue,
    loadLesson,
    toggleComplete,
    theaterMode,
    isFullscreen,
    brokenLessonIds,
    deleteLesson,
    seek,
    addNote
  } = usePlayerStore()

  const {
    transcript,
    subtitleCandidate,
    isLoading: isTranscriptLoading,
    errorMessage: transcriptError,
    progress: transcriptProgress,
    load: loadTranscript,
    transcribe,
    retranscribe,
    reuseSubtitle,
    clear: clearTranscript
  } = useTranscriptStore()

  const { setView } = useNavigationStore()
  const [activeMainMode, setActiveMainMode] = useState<
    'conteudo' | 'estudo' | 'ia'
  >('conteudo')
  const [contentSubTab, setContentSubTab] = useState<
    'aulas' | 'capitulos' | 'materiais' | 'fila'
  >('aulas')
  const [studySubTab, setStudySubTab] = useState<
    'anotacoes' | 'marcadores' | 'flashcards'
  >('anotacoes')
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true)
  const [selectedResource, setSelectedResource] =
    useState<VisibleResource | null>(null)
  const [isPdfModalOpen, setIsPdfModalOpen] = useState<boolean>(false)
  const [pdfInitialPage, setPdfInitialPage] = useState<number | undefined>(
    undefined
  )
  const [isCodeModalOpen, setIsCodeModalOpen] = useState<boolean>(false)
  const [courseHealth, setCourseHealth] = useState<CourseHealthReport | null>(
    null
  )
  const [lessonToDelete, setLessonToDelete] = useState<Lesson | null>(null)
  const [deleteFileFromDisk, setDeleteFileFromDisk] = useState<boolean>(false)
  const [isDeleting, setIsDeleting] = useState<boolean>(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false)

  // Handle source navigation target from Grounded Chat / Orbia
  useEffect(() => {
    const rawTarget = useNavigationStore.getState().consumeSourceTarget()
    if (!rawTarget) return

    const navTarget = rawTarget

    async function handleTarget(): Promise<void> {
      try {
        if (navTarget.courseId && navTarget.courseId !== activeCourse?.id) {
          const hierarchy = await useLibraryStore
            .getState()
            .fetchCourseById(navTarget.courseId)
          if (hierarchy) {
            await usePlayerStore
              .getState()
              .loadHierarchy(
                hierarchy.course,
                hierarchy.modules,
                navTarget.lessonId
              )
          }
        } else if (
          navTarget.lessonId &&
          navTarget.lessonId !== activeLesson?.id
        ) {
          await loadLesson(navTarget.lessonId)
        }

        if (
          navTarget.timestampSeconds !== undefined &&
          navTarget.timestampSeconds >= 0
        ) {
          seek(navTarget.timestampSeconds)
        }

        if (navTarget.resourceId) {
          const allRes = [
            ...(activeLesson ? getLessonVisibleResources(activeLesson) : []),
            ...(modulesWithLessons.find((m) =>
              m.lessons.some((l) => l.id === navTarget.lessonId)
            )?.resources || [])
          ]
          const targetResource = allRes.find(
            (r) => r.id === navTarget.resourceId
          )
          if (targetResource) {
            setSelectedResource(targetResource)
            if (hasEmbeddedPreview(targetResource)) {
              setPdfInitialPage(navTarget.pdfPage)
              setIsPdfModalOpen(true)
            } else if (isCodeResource(targetResource)) {
              setIsCodeModalOpen(true)
            }
          }
        }
      } catch (err) {
        console.warn(
          '[PlayerView] Failed to handle source navigation target:',
          err
        )
      }
    }

    void handleTarget()
  }, [activeCourse?.id, activeLesson?.id, loadLesson, modulesWithLessons, seek])

  const fetchHealth = useCallback(async () => {
    if (activeCourse?.id) {
      try {
        const health = await window.api.courses.getCourseHealth(activeCourse.id)
        setCourseHealth(health)
      } catch (err) {
        console.warn('Failed to fetch course health:', err)
      }
    }
  }, [activeCourse?.id])

  useEffect(() => {
    fetchHealth()
  }, [fetchHealth])

  useEffect(() => {
    if (activeLesson?.id) {
      void loadTranscript(activeLesson.id)
    } else {
      clearTranscript()
    }
  }, [activeLesson?.id, clearTranscript, loadTranscript])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.api?.transcription) return
    return window.api.transcription.onProgress(applyTranscriptProgress)
  }, [])

  const handleConfirmDelete = async (): Promise<void> => {
    if (!lessonToDelete) return
    setIsDeleting(true)
    try {
      await deleteLesson(lessonToDelete.id, deleteFileFromDisk)
      setIsDeleteDialogOpen(false)
      setLessonToDelete(null)
      setDeleteFileFromDisk(false)
      fetchHealth()
    } finally {
      setIsDeleting(false)
    }
  }

  const progressData = useCourseProgress({
    courseId: activeCourse?.id,
    modules: modulesWithLessons
  })

  const activeModule = modulesWithLessons.find((m) =>
    m.lessons.some((l) => l.id === activeLesson?.id)
  )
  const moduleResources: VisibleResource[] = activeModule?.resources || []
  const lessonResources: VisibleResource[] = activeLesson
    ? getLessonVisibleResources(activeLesson)
    : []
  const resources: VisibleResource[] = [...lessonResources, ...moduleResources]

  return (
    <div
      className={cn(
        'flex h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-background relative',
        isFullscreen && 'h-screen'
      )}
    >
      {/* Main Video Area */}
      <div className="flex flex-1 flex-col overflow-hidden bg-black">
        <div className="relative flex-1">
          <VideoPlayer
            onBack={() => activeCourse && setView('course', activeCourse.id)}
          />
        </div>
      </div>

      {/* Side Panel (collapsible drawer) */}
      {!isFullscreen && (
        <aside
          className={cn(
            'border-l border-border/80 bg-card/95 backdrop-blur-xl flex flex-col transition-all duration-300 ease-in-out select-none z-20',
            isSidebarOpen
              ? theaterMode
                ? 'w-96'
                : 'w-80 sm:w-96'
              : 'w-0 border-l-0 overflow-hidden'
          )}
        >
          {/* Side Panel Header */}
          <div className="flex flex-col border-b border-border/80 p-3.5 space-y-3 bg-card/80">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 overflow-hidden">
                <Tv className="h-4 w-4 text-primary shrink-0" />
                <h3
                  className="font-bold text-foreground text-sm truncate"
                  title={activeCourse?.title}
                >
                  {activeCourse?.title || 'Course'}
                </h3>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsSidebarOpen(false)}
                    className="h-7.5 w-7.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl shrink-0 cursor-pointer min-h-[30px]"
                    aria-label="Collapse sidebar"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  Recolher painel lateral
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Course Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {progressData.completedLessons} / {progressData.totalLessons}{' '}
                  {t('course.lessons')}
                </span>
                <span className="font-bold text-primary">
                  {progressData.coursePercentage}%
                </span>
              </div>
              <Progress
                value={progressData.coursePercentage}
                className="h-1.5"
                indicatorClassName="bg-primary"
              />
            </div>

            {/* Grounded AI Action Bar */}
            {activeLesson && (
              <div className="flex items-center gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    useGroundedChatStore.getState().open({
                      scope: { type: 'lesson', lessonId: activeLesson.id }
                    })
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-all cursor-pointer"
                  title={t('chat.askAboutLesson', 'Perguntar sobre esta aula')}
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {t('chat.askAboutLesson', 'Perguntar sobre a Aula')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (activeCourse && activeModule && activeLesson) {
                      useSummariesStore.getState().openSummary({
                        type: 'lesson',
                        courseId: activeCourse.id,
                        moduleId: activeModule.id,
                        lessonId: activeLesson.id
                      })
                    }
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-all cursor-pointer shrink-0"
                  title={t('summaries.summarizeLesson', 'Resumir Aula')}
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span>{t('summaries.summarize', 'Resumo')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    useGroundedChatStore.getState().open({
                      scope: { type: 'lesson', lessonId: activeLesson.id },
                      moment: {
                        lessonId: activeLesson.id,
                        timestampSeconds: currentTime
                      }
                    })
                    void useGroundedChatStore
                      .getState()
                      .ask('Explain this moment')
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/80 bg-secondary/50 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-all cursor-pointer shrink-0"
                  title={t(
                    'chat.explainThis',
                    'Explicar este momento do vídeo'
                  )}
                >
                  <HelpCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="hidden sm:inline">
                    {t('chat.explainThis', 'Explicar Este Momento')}
                  </span>
                  <span className="sm:hidden">
                    {t('chat.explain', 'Explicar')}
                  </span>
                </button>
              </div>
            )}

            {/* 3 Primary Mode Tabs (Ergonomic, no overflow, accessible) */}
            <div
              className="flex rounded-xl bg-secondary/80 p-1 text-xs gap-1 border border-border/40 select-none"
              role="tablist"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeMainMode === 'conteudo'}
                onClick={() => setActiveMainMode('conteudo')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 text-center font-semibold rounded-lg transition-all cursor-pointer relative active:scale-95 duration-150',
                  activeMainMode === 'conteudo'
                    ? 'bg-card text-foreground shadow-xs ring-1 ring-border/60'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <BookOpen className="h-3.5 w-3.5 text-primary" />
                <span>{t('player.curriculum', 'Conteúdo')}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeMainMode === 'estudo'}
                onClick={() => setActiveMainMode('estudo')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 text-center font-semibold rounded-lg transition-all cursor-pointer relative active:scale-95 duration-150',
                  activeMainMode === 'estudo'
                    ? 'bg-card text-foreground shadow-xs ring-1 ring-border/60'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Edit3 className="h-3.5 w-3.5 text-primary" />
                <span>{t('player.studyTab', 'Estudo')}</span>
                {(notes?.length || 0) +
                  (bookmarks?.length || 0) +
                  (flashcards?.length || 0) >
                  0 && (
                  <span className="ml-0.5 rounded-full bg-primary/20 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                    {(notes?.length || 0) +
                      (bookmarks?.length || 0) +
                      (flashcards?.length || 0)}
                  </span>
                )}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeMainMode === 'ia'}
                onClick={() => setActiveMainMode('ia')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 text-center font-semibold rounded-lg transition-all cursor-pointer relative active:scale-95 duration-150',
                  activeMainMode === 'ia'
                    ? 'bg-card text-foreground shadow-xs ring-1 ring-border/60'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span>{t('player.aiTab', 'IA & Texto')}</span>
                {transcript && (
                  <span className="ml-0.5 rounded-full bg-primary/20 px-1 py-0.2 text-[10px] font-bold text-primary">
                    ✓
                  </span>
                )}
              </button>
            </div>

            {/* Sub-navigation inside Conteúdo mode */}
            {activeMainMode === 'conteudo' && (
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-black/5 dark:bg-white/5 text-[11px] select-none">
                <button
                  type="button"
                  onClick={() => setContentSubTab('aulas')}
                  className={cn(
                    'flex-1 py-1 px-1.5 text-center font-medium rounded-md transition-all cursor-pointer',
                    contentSubTab === 'aulas'
                      ? 'bg-secondary text-foreground font-semibold shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t('player.lessons', 'Aulas')}
                </button>
                <button
                  type="button"
                  onClick={() => setContentSubTab('capitulos')}
                  className={cn(
                    'flex-1 py-1 px-1.5 text-center font-medium rounded-md transition-all cursor-pointer',
                    contentSubTab === 'capitulos'
                      ? 'bg-secondary text-foreground font-semibold shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t('player.chapters', 'Capítulos')}
                  {chapters?.length ? ` (${chapters.length})` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => setContentSubTab('materiais')}
                  className={cn(
                    'flex-1 py-1 px-1.5 text-center font-medium rounded-md transition-all cursor-pointer',
                    contentSubTab === 'materiais'
                      ? 'bg-secondary text-foreground font-semibold shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t('player.resources', 'Materiais')}
                  {resources?.length ? ` (${resources.length})` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => setContentSubTab('fila')}
                  className={cn(
                    'flex-1 py-1 px-1.5 text-center font-medium rounded-md transition-all cursor-pointer',
                    contentSubTab === 'fila'
                      ? 'bg-secondary text-foreground font-semibold shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Fila
                  {playbackQueue?.length ? ` (${playbackQueue.length})` : ''}
                </button>
              </div>
            )}

            {/* Sub-navigation inside Estudo mode */}
            {activeMainMode === 'estudo' && (
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-black/5 dark:bg-white/5 text-[11px] select-none">
                <button
                  type="button"
                  onClick={() => setStudySubTab('anotacoes')}
                  className={cn(
                    'flex-1 py-1 px-2 text-center font-medium rounded-md transition-all cursor-pointer',
                    studySubTab === 'anotacoes'
                      ? 'bg-secondary text-foreground font-semibold shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t('player.notes', 'Anotações')}
                  {notes?.length ? ` (${notes.length})` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => setStudySubTab('marcadores')}
                  className={cn(
                    'flex-1 py-1 px-2 text-center font-medium rounded-md transition-all cursor-pointer',
                    studySubTab === 'marcadores'
                      ? 'bg-secondary text-foreground font-semibold shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t('player.bookmarks', 'Marcadores')}
                  {bookmarks?.length ? ` (${bookmarks.length})` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => setStudySubTab('flashcards')}
                  className={cn(
                    'flex-1 py-1 px-2 text-center font-medium rounded-md transition-all cursor-pointer',
                    studySubTab === 'flashcards'
                      ? 'bg-secondary text-foreground font-semibold shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t('player.flashcards', 'Cards')}
                  {flashcards?.length ? ` (${flashcards.length})` : ''}
                </button>
              </div>
            )}
          </div>

          {/* Side Panel Content Area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* CONTEÚDO MODE */}
            {activeMainMode === 'conteudo' &&
              contentSubTab === 'aulas' &&
              (modulesWithLessons || []).map((module, modIdx) => {
                const modInfo = progressData.moduleProgress[module.id]

                return (
                  <div
                    key={module.id}
                    className="rounded-2xl border border-border/80 bg-secondary/20 overflow-hidden shadow-sm"
                  >
                    <div className="bg-secondary/50 px-3 py-2.5 border-b border-border/60 flex items-center justify-between">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-secondary text-[10px] font-mono font-bold text-primary">
                          {modIdx + 1}
                        </span>
                        <span className="text-xs font-bold text-foreground truncate">
                          {module.title}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0 font-mono ml-2">
                        {modInfo?.completedLessons || 0}/{module.lessons.length}
                      </span>
                    </div>

                    <div className="divide-y divide-border/30">
                      {module.lessons.map((lesson, lIdx) => {
                        const isCurrent = activeLesson?.id === lesson.id
                        const isComplete = progressData.isLessonCompleted(
                          lesson.id
                        )
                        const isProblem =
                          brokenLessonIds.includes(lesson.id) ||
                          courseHealth?.problemLessons.some(
                            (p) => p.id === lesson.id
                          )
                        const problemDesc =
                          courseHealth?.problemLessons.find(
                            (p) => p.id === lesson.id
                          )?.problemDescription ||
                          t(
                            'player.errorDesc',
                            'Não foi possível reproduzir este vídeo ou o arquivo não existe.'
                          )

                        return (
                          <div
                            key={lesson.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => loadLesson(lesson.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                loadLesson(lesson.id)
                              }
                            }}
                            className={cn(
                              'flex items-center justify-between p-2.5 text-xs transition-all cursor-pointer group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
                              isCurrent
                                ? 'bg-primary/10 font-bold text-primary ring-1 ring-primary/30'
                                : 'hover:bg-secondary/60 text-muted-foreground hover:text-foreground',
                              isProblem &&
                                !isCurrent &&
                                'bg-red-500/5 hover:bg-red-500/10'
                            )}
                          >
                            <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0 mr-1.5">
                              {/* Toggle completion on check click */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      toggleComplete(lesson.id)
                                    }}
                                    className="cursor-pointer shrink-0 hover:scale-110 active:scale-95 transition-transform"
                                    aria-label={
                                      isComplete
                                        ? t('player.completed')
                                        : t('player.markCompleted')
                                    }
                                  >
                                    {isComplete ? (
                                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                    ) : (
                                      <Circle className="h-4 w-4 opacity-40 group-hover:opacity-100 group-hover:text-primary transition-opacity" />
                                    )}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="right">
                                  {isComplete
                                    ? 'Desmarcar conclusão'
                                    : 'Marcar como concluída'}
                                </TooltipContent>
                              </Tooltip>

                              {/* Lesson mini thumbnail if present */}
                              {lesson.coverPath ? (
                                <div className="aspect-video w-10 shrink-0 rounded overflow-hidden bg-secondary border border-border/70">
                                  <img
                                    src={mediaUrl(lesson.coverPath)}
                                    alt={lesson.title}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ) : null}

                              <span className="text-[11px] font-mono text-muted-foreground shrink-0 w-3.5">
                                {lIdx + 1}.
                              </span>

                              <span
                                className={cn(
                                  'truncate tracking-tight',
                                  isProblem && 'text-red-400 font-medium'
                                )}
                              >
                                {lesson.title}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              {isProblem && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold">
                                      <AlertTriangle className="h-2.5 w-2.5" />
                                      {t('player.lessonError', 'Erro')}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="left"
                                    className="max-w-xs text-xs"
                                  >
                                    {problemDesc}
                                  </TooltipContent>
                                </Tooltip>
                              )}

                              <span className="font-mono text-[10px] opacity-70">
                                {lesson.duration > 0
                                  ? formatTime(lesson.duration)
                                  : ''}
                              </span>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setLessonToDelete(lesson)
                                      setIsDeleteDialogOpen(true)
                                    }}
                                    className={cn(
                                      'p-1 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/15 transition-all shrink-0 cursor-pointer',
                                      isProblem
                                        ? 'opacity-100 text-red-400'
                                        : 'opacity-0 group-hover:opacity-100'
                                    )}
                                    aria-label={t(
                                      'course.deleteLesson',
                                      'Excluir aula'
                                    )}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="left">
                                  {t('course.deleteLesson', 'Excluir aula')}
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

            {activeMainMode === 'conteudo' && contentSubTab === 'capitulos' && (
              <ChaptersPanel />
            )}

            {activeMainMode === 'conteudo' && contentSubTab === 'fila' && (
              <PlaybackQueueDrawer />
            )}

            {activeMainMode === 'conteudo' && contentSubTab === 'materiais' && (
              <div className="space-y-2">
                <h4 className="px-1 text-xs font-semibold text-foreground">
                  {t('player.lessonMaterials', { count: resources.length })}
                </h4>
                {resources.length === 0 ? (
                  <div className="text-center py-12 px-4 space-y-2">
                    <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                    <p className="text-xs text-muted-foreground">
                      {t('player.noResources')}
                    </p>
                  </div>
                ) : (
                  resources.map((res) => {
                    const isPdf = hasEmbeddedPreview(res)
                    const isCode = isCodeResource(res)

                    return (
                      <Tooltip key={res.id}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedResource(res)
                              if (isPdf) {
                                setIsPdfModalOpen(true)
                              } else if (isCode) {
                                setIsCodeModalOpen(true)
                              } else {
                                void window.api.system.openPath(res.filePath)
                              }
                            }}
                            className="flex w-full items-center justify-between rounded-2xl border border-border/80 bg-secondary/30 p-3 text-left text-xs shadow-sm transition-colors hover:border-primary/40 hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
                            aria-label={t('player.viewResource', {
                              name: res.name
                            })}
                          >
                            <div className="flex items-center gap-2.5 overflow-hidden">
                              <div
                                className={cn(
                                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                                  isPdf
                                    ? 'bg-primary/15 text-primary border border-primary/20'
                                    : isCode
                                      ? 'bg-accent/15 text-accent border border-accent/20'
                                      : 'bg-secondary text-foreground'
                                )}
                              >
                                <FileText className="h-4 w-4" />
                              </div>
                              <div className="flex flex-col overflow-hidden">
                                <span className="font-semibold text-foreground truncate">
                                  {res.name}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {getResourceTypeLabel(res)} •{' '}
                                  {formatFileSize(res.fileSize)}
                                </span>
                              </div>
                            </div>

                            <Eye
                              className="ml-2 h-4 w-4 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          {isPdf
                            ? t('player.viewResource', { name: res.name })
                            : isCode
                              ? `Visualizar código: ${res.name}`
                              : `Abrir no computador: ${res.name}`}
                        </TooltipContent>
                      </Tooltip>
                    )
                  })
                )}
              </div>
            )}

            {/* ESTUDO MODE */}
            {activeMainMode === 'estudo' && studySubTab === 'anotacoes' && (
              <NotesPanel />
            )}

            {activeMainMode === 'estudo' && studySubTab === 'marcadores' && (
              <BookmarksPanel />
            )}

            {activeMainMode === 'estudo' && studySubTab === 'flashcards' && (
              <FlashcardsPanel />
            )}

            {/* IA & TRANSCRIÇÃO MODE */}
            {activeMainMode === 'ia' && (
              <TranscriptPanel
                transcript={transcript}
                subtitleCandidate={subtitleCandidate}
                currentTime={currentTime}
                isLoading={isTranscriptLoading}
                errorMessage={transcriptError}
                progressPercent={transcriptProgress?.progressPercent}
                lessonId={activeLesson?.id}
                onSeek={seek}
                onTranscribe={transcribe}
                onReuseSubtitle={reuseSubtitle}
                onRetranscribe={retranscribe}
                onAddNote={(content) => {
                  void addNote(content)
                }}
              />
            )}
          </div>
        </aside>
      )}

      {/* Floating Toggle Button when Sidebar is Collapsed */}
      {!isFullscreen && !theaterMode && !isSidebarOpen && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsSidebarOpen(true)}
              className="absolute right-3 top-4 z-30 h-9 w-9 rounded-full bg-card/90 shadow-xl border-border hover:bg-card hover:scale-105 active:scale-95 transition-all text-primary cursor-pointer"
              aria-label="Show Curriculum"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            Mostrar currículo & anotações
          </TooltipContent>
        </Tooltip>
      )}

      {/* PDF / Document Viewer Modal */}
      <PdfViewerModal
        resource={selectedResource}
        isOpen={isPdfModalOpen}
        initialPage={pdfInitialPage}
        onClose={() => {
          setIsPdfModalOpen(false)
          setSelectedResource(null)
          setPdfInitialPage(undefined)
        }}
      />

      {/* Code & Text Viewer Modal */}
      <CodeViewerModal
        resource={selectedResource}
        isOpen={isCodeModalOpen}
        onClose={() => {
          setIsCodeModalOpen(false)
          setSelectedResource(null)
        }}
      />

      {/* Delete Lesson Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              {t('course.deleteLesson', 'Excluir Aula')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground pt-2 text-xs leading-relaxed">
              Tem certeza que deseja remover a aula{' '}
              <span className="font-semibold text-foreground">
                "{lessonToDelete?.title}"
              </span>{' '}
              do curso?
            </DialogDescription>
          </DialogHeader>

          <div className="py-3">
            <label className="flex items-center gap-2.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={deleteFileFromDisk}
                onChange={(e) => setDeleteFileFromDisk(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-destructive focus:ring-destructive/30"
              />
              <span>Excluir também o arquivo físico do computador</span>
            </label>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsDeleteDialogOpen(false)
                setLessonToDelete(null)
              }}
              disabled={isDeleting}
            >
              {t('common.cancel', 'Cancelar')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="gap-1.5"
            >
              <Trash2 className="h-4 w-4" />
              {isDeleting
                ? t('common.deleting', 'Excluindo...')
                : t('course.deleteLesson', 'Excluir Aula')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
