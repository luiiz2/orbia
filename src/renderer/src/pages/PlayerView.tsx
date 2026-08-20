import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FileText,
  CheckCircle2,
  Circle,
  ChevronRight,
  ChevronLeft,
  Tv,
  Eye
} from 'lucide-react'
import { VideoPlayer } from '../components/player/VideoPlayer'
import { NotesPanel } from '../components/player/NotesPanel'
import { PdfViewerModal } from '../components/documents/PdfViewerModal'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useNavigationStore } from '../stores/useNavigationStore'
import { useCourseProgress } from '../hooks/useCourseProgress'
import { Button, Progress, Tooltip, TooltipTrigger, TooltipContent } from '../components/ui'
import { formatTime, formatFileSize } from '../lib/formatters'
import { cn, mediaUrl } from '../lib/utils'
import type { AttachedResource, ContentResource, Lesson } from '@shared'

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
  return resource.type === 'pdf' || extension === 'pdf' || resource.name.toLowerCase().endsWith('.pdf')
}

export function PlayerView(): React.JSX.Element {
  const { t } = useTranslation()
  const {
    activeCourse,
    activeLesson,
    modulesWithLessons,
    notes,
    loadLesson,
    toggleComplete,
    theaterMode,
    isFullscreen
  } = usePlayerStore()

  const { setView } = useNavigationStore()
  const [activeTab, setActiveTab] = useState<'curriculum' | 'notes' | 'resources'>('curriculum')
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true)
  const [selectedResource, setSelectedResource] = useState<VisibleResource | null>(null)
  const [isPdfModalOpen, setIsPdfModalOpen] = useState<boolean>(false)

  const progressData = useCourseProgress({
    courseId: activeCourse?.id,
    modules: modulesWithLessons
  })

  const resources = activeLesson ? getLessonVisibleResources(activeLesson) : []

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
          <VideoPlayer onBack={() => activeCourse && setView('course', activeCourse.id)} />
        </div>
      </div>

      {/* Side Panel (collapsible drawer) */}
      {!isFullscreen && (
        <aside
          className={cn(
            'border-l border-border/80 bg-card/95 backdrop-blur-xl flex flex-col transition-all duration-300 ease-in-out select-none z-20',
            theaterMode ? 'hidden' : isSidebarOpen ? 'w-80 sm:w-96' : 'w-0 border-l-0 overflow-hidden'
          )}
        >
          {/* Side Panel Header */}
          <div className="flex flex-col border-b border-border/80 p-3.5 space-y-3 bg-card/80">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 overflow-hidden">
                <Tv className="h-4 w-4 text-primary shrink-0" />
                <h3 className="font-bold text-foreground text-sm truncate" title={activeCourse?.title}>
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
                <TooltipContent side="left">Recolher painel lateral</TooltipContent>
              </Tooltip>
            </div>

            {/* Course Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {progressData.completedLessons} / {progressData.totalLessons} {t('course.lessons')}
                </span>
                <span className="font-bold text-primary">
                  {progressData.coursePercentage}%
                </span>
              </div>
              <Progress
                value={progressData.coursePercentage}
                className="h-1.5"
                indicatorClassName="bg-gradient-to-r from-orange-500 via-amber-500 to-purple-600"
              />
            </div>

            {/* Curriculum / Notes / Resources Tabs */}
            <div className="flex rounded-xl bg-secondary/80 p-1 text-xs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'curriculum'}
                onClick={() => setActiveTab('curriculum')}
                className={cn(
                  'flex-1 py-1.5 text-center font-semibold rounded-lg transition-all cursor-pointer active:scale-95 duration-150',
                  activeTab === 'curriculum'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t('player.curriculum')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'notes'}
                onClick={() => setActiveTab('notes')}
                className={cn(
                  'flex-1 py-1.5 text-center font-semibold rounded-lg transition-all cursor-pointer relative active:scale-95 duration-150',
                  activeTab === 'notes'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t('player.notes')}
                {notes.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary/20 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                    {notes.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'resources'}
                onClick={() => setActiveTab('resources')}
                className={cn(
                  'flex-1 py-1.5 text-center font-semibold rounded-lg transition-all cursor-pointer relative active:scale-95 duration-150',
                  activeTab === 'resources'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t('player.resources')}
                {resources.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary/20 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                    {resources.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Side Panel Content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {activeTab === 'curriculum' && (
              modulesWithLessons.map((module, modIdx) => {
                const modInfo = progressData.moduleProgress[module.id]

                return (
                  <div key={module.id} className="rounded-2xl border border-border/80 bg-secondary/20 overflow-hidden shadow-sm">
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
                        const isComplete = progressData.isLessonCompleted(lesson.id)

                        return (
                          <div
                            key={lesson.id}
                            onClick={() => loadLesson(lesson.id)}
                            className={cn(
                              'flex items-center justify-between p-2.5 text-xs transition-all cursor-pointer group',
                              isCurrent
                                ? 'bg-gradient-to-r from-orange-500/15 via-purple-600/10 to-transparent font-bold text-primary border-l-2 border-primary'
                                : 'hover:bg-secondary/60 text-muted-foreground hover:text-foreground'
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
                                    aria-label={isComplete ? t('player.completed') : t('player.markCompleted')}
                                  >
                                    {isComplete ? (
                                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                    ) : (
                                      <Circle className="h-4 w-4 opacity-40 group-hover:opacity-100 group-hover:text-primary transition-opacity" />
                                    )}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="right">
                                  {isComplete ? 'Desmarcar conclusão' : 'Marcar como concluída'}
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

                              <span className="truncate tracking-tight">{lesson.title}</span>
                            </div>

                            <span className="font-mono text-[10px] opacity-70 shrink-0 ml-2">
                              {lesson.duration > 0 ? formatTime(lesson.duration) : ''}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            )}

            {activeTab === 'notes' && (
              <NotesPanel />
            )}

            {activeTab === 'resources' && (
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
                  resources.map((res) =>
                    hasEmbeddedPreview(res) ? (
                      <Tooltip key={res.id}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedResource(res)
                              setIsPdfModalOpen(true)
                            }}
                            className="flex w-full items-center justify-between rounded-2xl border border-border/80 bg-secondary/30 p-3 text-left text-xs shadow-sm transition-colors hover:border-primary/40 hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            aria-label={t('player.viewResource', { name: res.name })}
                          >
                            <div className="flex items-center gap-2.5 overflow-hidden">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <FileText className="h-4 w-4" />
                              </div>
                              <div className="flex flex-col overflow-hidden">
                                <span className="font-semibold text-foreground truncate">
                                  {res.name}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {getResourceTypeLabel(res)} • {formatFileSize(res.fileSize)}
                                </span>
                              </div>
                            </div>

                            <Eye className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          {t('player.viewResource', { name: res.name })}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <div
                        key={res.id}
                        role="note"
                        aria-label={`${res.name}: ${t('documents.previewUnavailable')}`}
                        className="flex w-full items-center justify-between rounded-2xl border border-border/80 bg-secondary/20 p-3 text-left text-xs text-muted-foreground shadow-sm"
                      >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                            <FileText className="h-4 w-4" aria-hidden="true" />
                          </div>
                          <div className="flex flex-col overflow-hidden">
                            <span className="font-semibold text-foreground truncate">{res.name}</span>
                            <span className="text-[10px] font-mono">
                              {getResourceTypeLabel(res)} • {formatFileSize(res.fileSize)}
                            </span>
                          </div>
                        </div>
                        <span className="ml-2 shrink-0 text-[10px]">{t('documents.previewUnavailable')}</span>
                      </div>
                    )
                  )
                )}
              </div>
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
          <TooltipContent side="left">Mostrar currículo & anotações</TooltipContent>
        </Tooltip>
      )}

      {/* PDF / Document Viewer Modal */}
      <PdfViewerModal
        resource={selectedResource}
        isOpen={isPdfModalOpen}
        onClose={() => {
          setIsPdfModalOpen(false)
          setSelectedResource(null)
        }}
      />
    </div>
  )
}
