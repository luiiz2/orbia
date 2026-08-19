import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  Play,
  Clock,
  BookOpen,
  CheckCircle2,
  Circle,
  Trash2,
  AlertTriangle,
  Layers,
  HardDrive,
  Link as LinkIcon,
  Image as ImageIcon,
  Upload,
  Video
} from 'lucide-react'
import { useLibraryStore } from '../stores/useLibraryStore'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useNavigationStore } from '../stores/useNavigationStore'
import { useCourseProgress } from '../hooks/useCourseProgress'
import { Button } from '../components/ui/button'
import { Progress } from '../components/ui/progress'
import { Badge } from '../components/ui/badge'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '../components/ui/accordion'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../components/ui/dialog'
import { formatDurationHuman, formatTime } from '../lib/formatters'
import type { Lesson } from '@shared'

export function CourseView(): React.JSX.Element {
  const { t } = useTranslation()
  const { selectedCourseId, navigateToHome, navigateToPlayer } = useNavigationStore()
  const { activeCourseHierarchy, fetchCourseById, deleteCourse, updateCourseCover, updateLessonCover, isLoading } = useLibraryStore()
  const { loadHierarchy } = usePlayerStore()

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false)
  const [isDeleting, setIsDeleting] = useState<boolean>(false)

  useEffect(() => {
    if (selectedCourseId) {
      fetchCourseById(selectedCourseId).catch(console.warn)
    }
  }, [selectedCourseId, fetchCourseById])

  const progressData = useCourseProgress({
    courseId: selectedCourseId || undefined,
    modules: activeCourseHierarchy?.modules
  })

  if (isLoading || !activeCourseHierarchy) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-sm text-muted-foreground animate-pulse">{t('common.loading')}</p>
      </div>
    )
  }

  const { course, modules } = activeCourseHierarchy

  const allLessons: Lesson[] = modules.flatMap((m) => m.lessons || [])
  const firstIncompleteLesson =
    allLessons.find((l) => !progressData.isLessonCompleted(l.id)) || allLessons[0]

  const handleStartOrResume = async (): Promise<void> => {
    await loadHierarchy(course, modules, firstIncompleteLesson?.id)
    navigateToPlayer(course.id)
  }

  const handlePlayLesson = async (lesson: Lesson): Promise<void> => {
    await loadHierarchy(course, modules, lesson.id)
    navigateToPlayer(course.id)
  }

  const handleChangeCourseCover = async (): Promise<void> => {
    try {
      const selectedImg = await window.api.courses.selectCoverImage()
      if (selectedImg) {
        await updateCourseCover(course.id, selectedImg)
      }
    } catch (err) {
      console.error('Failed to change course cover:', err)
    }
  }

  const handleChangeLessonCover = async (lessonId: string): Promise<void> => {
    try {
      const selectedImg = await window.api.courses.selectCoverImage()
      if (selectedImg) {
        await updateLessonCover(lessonId, selectedImg)
      }
    } catch (err) {
      console.error('Failed to change lesson cover:', err)
    }
  }

  const handleDeleteCourse = async (): Promise<void> => {
    setIsDeleting(true)
    try {
      const res = await deleteCourse(course.id, false)
      if (res.success) {
        setIsDeleteDialogOpen(false)
        navigateToHome()
      }
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 sm:px-6 space-y-6 animate-in fade-in duration-200">
      {/* Top Navigation & Actions Bar */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={navigateToHome}
          className="gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/70 rounded-xl cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>{t('nav.library')}</span>
        </Button>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleChangeCourseCover}
            className="gap-1.5 text-xs text-muted-foreground hover:text-primary hover:bg-secondary/70 rounded-xl cursor-pointer"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            <span>Trocar Capa do Curso</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsDeleteDialogOpen(true)}
            className="gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive rounded-xl cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
            <span>{t('course.deleteCourse')}</span>
          </Button>
        </div>
      </div>

      {/* Course Hero Banner */}
      <div className="rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card/95 to-primary/5 p-6 shadow-xl shadow-orange-500/5">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          {/* Thumbnail / Cover */}
          <div
            onClick={handleChangeCourseCover}
            className="relative aspect-video w-full md:w-80 shrink-0 overflow-hidden rounded-2xl bg-secondary/70 flex items-center justify-center border border-border/80 shadow-md group cursor-pointer"
            title="Clique para alterar a capa do curso"
          >
            {course.coverPath ? (
              <img
                src={`media://${encodeURI(course.coverPath.replace(/\\/g, '/'))}`}
                alt={course.title}
                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-primary p-4">
                <BookOpen className="h-12 w-12 opacity-60 mb-2" />
              </div>
            )}

            {/* Hover Change Cover Overlay */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white backdrop-blur-[2px]">
              <Upload className="w-6 h-6 mb-1 text-white" />
              <span className="text-xs font-semibold">Alterar Capa</span>
            </div>

            {/* Source Badge on Cover */}
            <div className="absolute top-2.5 right-2.5 z-10">
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
            </div>
          </div>

          {/* Details & CTA */}
          <div className="flex flex-1 flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {progressData.isCompleted ? (
                  <Badge variant="success" className="gap-1 shadow-sm">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>{t('course.completed')}</span>
                  </Badge>
                ) : progressData.coursePercentage > 0 ? (
                  <Badge variant="info" className="shadow-sm font-bold">
                    {progressData.coursePercentage}% {t('course.inProgress')}
                  </Badge>
                ) : (
                  <Badge variant="outline">{t('course.notStarted')}</Badge>
                )}
              </div>

              <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl leading-tight">
                {course.title}
              </h1>

              {course.description && (
                <p className="text-xs sm:text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                  {course.description}
                </p>
              )}
            </div>

            {/* Stats Row */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-primary/80" />
                <span>
                  {course.moduleCount} {t('course.modules')} • {course.lessonCount}{' '}
                  {t('course.lessons')}
                </span>
              </span>
              {progressData.totalDuration > 0 && (
                <span className="flex items-center gap-1.5 font-mono">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground/70" />
                  <span>{formatDurationHuman(progressData.totalDuration)}</span>
                </span>
              )}
            </div>

            {/* Progress Bar & Main Action Button */}
            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-medium text-muted-foreground">
                  <span>
                    {progressData.completedLessons} / {progressData.totalLessons} {t('course.lessons')} completed
                  </span>
                  <span className="font-bold text-primary">{progressData.coursePercentage}%</span>
                </div>
                <Progress
                  value={progressData.coursePercentage}
                  className="h-2"
                  indicatorClassName="bg-gradient-to-r from-orange-500 via-amber-500 to-purple-600"
                />
              </div>

              <Button
                size="lg"
                onClick={handleStartOrResume}
                className="w-full sm:w-auto gap-2 font-semibold shadow-lg shadow-orange-500/20 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-white rounded-xl cursor-pointer"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>
                  {progressData.coursePercentage > 0 ? t('course.resume') : t('course.start')}
                </span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Curriculum Accordion */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            {t('player.curriculum')}
          </h2>
          <span className="text-xs text-muted-foreground">
            {modules.length} {t('course.modules')}
          </span>
        </div>

        <Accordion
          type="multiple"
          defaultValue={modules.map((m) => m.id)}
          className="w-full space-y-3"
        >
          {modules.map((module, modIdx) => {
            const modInfo = progressData.moduleProgress[module.id]
            const modPercentage = modInfo?.percentage || 0

            return (
              <AccordionItem
                key={module.id}
                value={module.id}
                className="rounded-2xl border border-border/80 bg-card px-4 overflow-hidden shadow-sm"
              >
                <AccordionTrigger className="hover:no-underline py-4">
                  <div className="flex flex-1 items-center justify-between pr-4 gap-3">
                    <div className="flex items-center gap-3 text-left overflow-hidden">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-mono font-semibold text-primary">
                        {modIdx + 1}
                      </span>
                      <span className="font-bold text-foreground text-sm truncate">
                        {module.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                      {modPercentage > 0 && (
                        <span className="font-bold text-primary">{modPercentage}%</span>
                      )}
                      <span>
                        {modInfo?.completedLessons || 0} / {modInfo?.totalLessons || module.lessons.length}{' '}
                        {t('course.lessons')}
                      </span>
                      {modInfo && modInfo.duration > 0 && (
                        <span className="font-mono text-muted-foreground/80">
                          {formatDurationHuman(modInfo.duration)}
                        </span>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="pt-1 pb-3">
                  <div className="divide-y divide-border/40">
                    {module.lessons.map((lesson, idx) => {
                      const isComplete = progressData.isLessonCompleted(lesson.id)
                      const lessonProgress = progressData.getLessonProgress(lesson.id)

                      return (
                        <div
                          key={lesson.id}
                          onClick={() => handlePlayLesson(lesson)}
                          className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-secondary/60 cursor-pointer transition-colors group"
                        >
                          <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0 mr-2">
                            {/* Completion Indicator */}
                            {isComplete ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                            ) : (
                              <Circle className="h-4 w-4 text-muted-foreground/50 shrink-0 group-hover:text-primary transition-colors" />
                            )}

                            {/* Lesson Thumbnail & Cover */}
                            <div
                              onClick={(e) => {
                                e.stopPropagation()
                                handleChangeLessonCover(lesson.id)
                              }}
                              className="relative aspect-video w-14 sm:w-16 shrink-0 rounded-lg overflow-hidden bg-secondary border border-border/80 group/thumb shadow-xs"
                              title="Trocar capa da aula"
                            >
                              {lesson.coverPath ? (
                                <img
                                  src={`media://${encodeURI(lesson.coverPath.replace(/\\/g, '/'))}`}
                                  alt={lesson.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-secondary/80 text-muted-foreground/60">
                                  <Video className="w-3.5 h-3.5 text-primary/70" />
                                </div>
                              )}
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <ImageIcon className="w-3.5 h-3.5" />
                              </div>
                            </div>

                            {/* Lesson Number & Title */}
                            <span className="text-xs font-mono text-muted-foreground w-6 shrink-0">
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                            <span className="text-xs sm:text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                              {lesson.title}
                            </span>
                          </div>

                          {/* Duration & Play icon */}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 font-mono">
                            {lesson.duration > 0 ? (
                              <span>{formatTime(lesson.duration)}</span>
                            ) : lessonProgress?.duration ? (
                              <span>{formatTime(lessonProgress.duration)}</span>
                            ) : null}
                            <Play className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      </div>

      {/* Delete Course Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle>{t('course.deleteConfirmTitle')}</DialogTitle>
            </div>
            <DialogDescription className="pt-2 text-xs leading-relaxed">
              {t('course.deleteConfirmDesc')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
              className="rounded-xl text-xs cursor-pointer"
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteCourse}
              disabled={isDeleting}
              className="rounded-xl text-xs cursor-pointer"
            >
              {isDeleting ? t('common.loading') : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
