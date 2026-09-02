import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  Play,
  Clock,
  CheckCircle2,
  Circle,
  Trash2,
  AlertTriangle,
  Layers,
  HardDrive,
  Link as LinkIcon,
  Image as ImageIcon,
  Upload,
  Video,
  Star,
  FileText,
  Loader2,
  FolderSync,
  Target,
  ListPlus,
  Calendar,
  Sparkles,
  MoreVertical,
  GripVertical,
  Check
} from 'lucide-react'
import { useLibraryStore } from '../stores/useLibraryStore'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useNavigationStore } from '../stores/useNavigationStore'
import { useReviewStore } from '../stores/useReviewStore'
import { useGroundedChatStore } from '../stores/useGroundedChatStore'
import { useSummariesStore } from '../stores/useSummariesStore'
import { useCourseProgress } from '../hooks/useCourseProgress'
import { PdfViewerModal } from '../components/documents/PdfViewerModal'
import { CodeViewerModal } from '../components/documents/CodeViewerModal'
import { ReorganizeCourseModal } from '../components/library/ReorganizeCourseModal'
import { SimilarCoursesRail } from '../components/discovery'
import type { CourseGoal } from '@shared'
import { ChevronUp, ChevronDown, Edit3 } from 'lucide-react'

interface EditableTitleProps {
  initialTitle: string
  onSave: (newTitle: string) => void
  className?: string
}

function EditableTitle({
  initialTitle,
  onSave,
  className
}: EditableTitleProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(initialTitle)

  useEffect(() => {
    setValue(initialTitle)
  }, [initialTitle])

  if (!isEditing) {
    return (
      <div className={cn('group flex min-w-0 items-start gap-2', className)}>
        <span
          onDoubleClick={() => setIsEditing(true)}
          className="min-w-0 flex-1 cursor-text break-words whitespace-normal leading-snug"
        >
          {initialTitle}
        </span>
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsEditing(true)
          }}
          className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-primary transition-opacity cursor-pointer"
        >
          <Edit3 className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <input
      autoFocus
      className={cn(
        'min-w-0 flex-1 bg-secondary text-foreground border border-primary/50 rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-primary/40',
        className
      )}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
          setIsEditing(false)
          if (value.trim() !== initialTitle) onSave(value.trim())
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          setIsEditing(false)
          setValue(initialTitle)
        }
      }}
      onBlur={() => {
        setIsEditing(false)
        if (value.trim() !== initialTitle) onSave(value.trim())
      }}
      onClick={(e) => e.stopPropagation()}
    />
  )
}

import {
  Button,
  Progress,
  Badge,
  Skeleton,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  CourseCover,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  EmptyState
} from '../components/ui'
import { formatDurationHuman, formatTime } from '../lib/formatters'
import { mediaUrl, cn } from '../lib/utils'
import type { Lesson, AttachedResource, ContentResource } from '@shared'

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

export function CourseView(): React.JSX.Element {
  const { t } = useTranslation()
  const { selectedCourseId, navigateToHome, navigateToPlayer } =
    useNavigationStore()
  const {
    activeCourseHierarchy,
    fetchCourseById,
    fetchCourseProgress,
    deleteCourse,
    deleteLesson,
    courseHealth,
    fetchCourseHealth,
    fixCourseProblems,
    updateCourseCover,
    updateLessonCover,
    toggleFavorite,
    updateCourseMetadata,
    updateModuleMetadata,
    updateLessonMetadata,
    reorderModule,
    reorderLesson,
    toggleLessonFavorite,
    toggleModuleCompletion,
    isLoading
  } = useLibraryStore()
  const loadHierarchy = usePlayerStore((state) => state.loadHierarchy)
  const addToQueue = usePlayerStore((state) => state.addToQueue)
  const playbackQueue = usePlayerStore((state) => state.playbackQueue)

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false)
  const [isDeleting, setIsDeleting] = useState<boolean>(false)
  const [lessonToDelete, setLessonToDelete] = useState<Lesson | null>(null)
  const [isDeletingLesson, setIsDeletingLesson] = useState<boolean>(false)
  const [deleteLessonFile, setDeleteLessonFile] = useState<boolean>(false)
  const [isFixingProblems, setIsFixingProblems] = useState<boolean>(false)
  const [selectedResource, setSelectedResource] =
    useState<VisibleResource | null>(null)
  const [isPdfModalOpen, setIsPdfModalOpen] = useState<boolean>(false)
  const [isCodeModalOpen, setIsCodeModalOpen] = useState<boolean>(false)
  const [isReorganizeModalOpen, setIsReorganizeModalOpen] =
    useState<boolean>(false)
  const [autoTranscribe, setAutoTranscribe] = useState<boolean>(false)
  const [isUpdatingAutoTranscribe, setIsUpdatingAutoTranscribe] =
    useState<boolean>(false)

  // Course Goal & Study Queue state (v0.3)
  const { addToStudyQueue } = useReviewStore()
  const [courseGoal, setCourseGoal] = useState<CourseGoal | null>(null)
  const [isGoalModalOpen, setIsGoalModalOpen] = useState<boolean>(false)
  const [targetDateInput, setTargetDateInput] = useState<string>('')
  const [weeklyLessonsInput, setWeeklyLessonsInput] = useState<number>(10)
  const [queueAddedNotification, setQueueAddedNotification] =
    useState<boolean>(false)
  const [isQueueingTranscription, setIsQueueingTranscription] =
    useState<boolean>(false)
  const [queueingModuleId, setQueueingModuleId] = useState<string | null>(null)
  const [draggedLessonId, setDraggedLessonId] = useState<string | null>(null)
  const [dragOverLessonId, setDragOverLessonId] = useState<string | null>(null)

  const fetchGoal = React.useCallback(async (courseId: string) => {
    try {
      const goal = await window.api.goals.get(courseId)
      setCourseGoal(goal)
      if (goal?.targetDate) {
        setTargetDateInput(
          new Date(goal.targetDate).toISOString().split('T')[0]
        )
      }
      if (goal?.weeklyLessons) {
        setWeeklyLessonsInput(goal.weeklyLessons)
      }
    } catch (err) {
      console.warn('Failed to fetch course goal:', err)
    }
  }, [])

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCourseId) return
    const targetTimestamp = targetDateInput
      ? new Date(targetDateInput).getTime()
      : undefined
    await window.api.goals.set({
      courseId: selectedCourseId,
      targetDate: targetTimestamp,
      weeklyLessons: weeklyLessonsInput
    })
    await fetchGoal(selectedCourseId)
    setIsGoalModalOpen(false)
  }

  const handleDeleteGoal = async () => {
    if (!selectedCourseId) return
    await window.api.goals.delete(selectedCourseId)
    setCourseGoal(null)
    setTargetDateInput('')
    setIsGoalModalOpen(false)
  }

  const handleAddToQueue = async () => {
    if (!selectedCourseId) return
    await addToStudyQueue('course', selectedCourseId)
    setQueueAddedNotification(true)
    setTimeout(() => setQueueAddedNotification(false), 3000)
  }

  const handleAutoTranscribeToggle = async (): Promise<void> => {
    if (!selectedCourseId || isUpdatingAutoTranscribe) return
    const nextValue = !autoTranscribe
    setAutoTranscribe(nextValue)
    setIsUpdatingAutoTranscribe(true)
    try {
      const saved = await window.api.transcription.setCourseAutoTranscribe(
        selectedCourseId,
        nextValue
      )
      if (!saved) setAutoTranscribe(!nextValue)
    } catch (error: unknown) {
      setAutoTranscribe(!nextValue)
      console.warn('Failed to update course transcription settings:', error)
    } finally {
      setIsUpdatingAutoTranscribe(false)
    }
  }

  const handleTranscribeCourse = async (): Promise<void> => {
    if (!selectedCourseId || isQueueingTranscription) return
    setIsQueueingTranscription(true)
    try {
      await window.api.transcription.enqueueCourse(selectedCourseId, {
        autoDetect: true,
        reuseExistingSubtitle: true
      })
    } catch (error: unknown) {
      console.warn('Failed to queue course transcription:', error)
    } finally {
      setIsQueueingTranscription(false)
    }
  }

  const handleTranscribeModule = async (moduleId: string): Promise<void> => {
    if (queueingModuleId) return
    setQueueingModuleId(moduleId)
    try {
      await window.api.transcription.enqueueModule(moduleId, {
        autoDetect: true,
        reuseExistingSubtitle: true
      })
    } catch (error: unknown) {
      console.warn('Failed to queue module transcription:', error)
    } finally {
      setQueueingModuleId(null)
    }
  }

  useEffect(() => {
    if (selectedCourseId) {
      fetchGoal(selectedCourseId)
    }
  }, [selectedCourseId, fetchGoal])

  useEffect(() => {
    let active = true
    if (!selectedCourseId) {
      setAutoTranscribe(false)
      return () => {
        active = false
      }
    }

    setAutoTranscribe(false)
    window.api.transcription
      .getCourseAutoTranscribe(selectedCourseId)
      .then((enabled) => {
        if (active) setAutoTranscribe(enabled)
      })
      .catch((error: unknown) =>
        console.warn('Failed to load course transcription settings:', error)
      )

    return () => {
      active = false
    }
  }, [selectedCourseId])

  useEffect(() => {
    if (selectedCourseId) {
      fetchCourseById(selectedCourseId).catch(console.warn)
      fetchCourseProgress(selectedCourseId).catch(console.warn)
      fetchCourseHealth(selectedCourseId).catch(console.warn)

      window.api.courses
        .extractThumbnails({ courseId: selectedCourseId })
        .then((res) => {
          if (
            res.success &&
            ((res.updatedLessons || 0) > 0 || (res.updatedCourses || 0) > 0)
          ) {
            fetchCourseById(selectedCourseId).catch(console.warn)
          }
        })
        .catch(console.warn)
    }
  }, [
    selectedCourseId,
    fetchCourseById,
    fetchCourseProgress,
    fetchCourseHealth
  ])

  const progressData = useCourseProgress({
    courseId: selectedCourseId || undefined,
    modules: activeCourseHierarchy?.modules
  })

  if (isLoading) {
    return (
      <div
        className="container mx-auto max-w-5xl px-4 py-6 sm:px-6 space-y-6 animate-in fade-in duration-200"
        aria-label="Loading course details"
      >
        {/* Top Nav Skeleton */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-24 rounded-xl" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24 rounded-xl" />
            <Skeleton className="h-8 w-28 rounded-xl" />
            <Skeleton className="h-8 w-28 rounded-xl" />
          </div>
        </div>

        {/* Hero Banner Skeleton */}
        <div className="rounded-2xl border border-border/60 bg-card/60 p-6">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <Skeleton className="aspect-video w-full md:w-80 rounded-2xl shrink-0" />
            <div className="flex flex-1 flex-col justify-between space-y-4 w-full">
              <div className="space-y-2">
                <Skeleton className="h-5 w-24 rounded-md" />
                <Skeleton className="h-8 w-3/4 rounded-md" />
                <Skeleton className="h-4 w-full rounded-md" />
                <Skeleton className="h-4 w-2/3 rounded-md" />
              </div>
              <div className="space-y-3 pt-2">
                <Skeleton className="h-2 w-full rounded-full" />
                <Skeleton className="h-10 w-36 rounded-xl" />
              </div>
            </div>
          </div>
        </div>

        {/* Curriculum Skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-6 w-32 rounded-md" />
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="rounded-2xl border border-border/60 bg-card/60 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-6 w-6 rounded-lg" />
                    <Skeleton className="h-5 w-48 rounded-md" />
                  </div>
                  <Skeleton className="h-4 w-24 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!activeCourseHierarchy) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={AlertTriangle}
          title={t('course.notFound', 'Curso não encontrado')}
          description={t(
            'course.notFoundDesc',
            'Este curso não está disponível na biblioteca ou foi movido.'
          )}
          actionLabel={t('nav.library', 'Voltar para a Biblioteca')}
          onAction={navigateToHome}
        />
      </div>
    )
  }

  const { course, modules } = activeCourseHierarchy

  const allLessons: Lesson[] = modules.flatMap((m) => m.lessons || [])
  const firstIncompleteLesson =
    allLessons.find((l) => !progressData.isLessonCompleted(l.id)) ||
    allLessons[0]

  const remainingLessons = Math.max(
    0,
    progressData.totalLessons - progressData.completedLessons
  )
  let daysLeft: number | null = null
  let recommendedPace: number | null = null
  if (courseGoal?.targetDate) {
    const diffMs = courseGoal.targetDate - Date.now()
    daysLeft = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
    recommendedPace =
      remainingLessons > 0
        ? Math.ceil((remainingLessons / daysLeft) * 10) / 10
        : 0
  }

  const handleStartOrResume = async (): Promise<void> => {
    await loadHierarchy(course, modules, firstIncompleteLesson?.id)
    navigateToPlayer(course.id)
  }

  const handlePlayLesson = async (lesson: Lesson): Promise<void> => {
    await loadHierarchy(course, modules, lesson.id)
    navigateToPlayer(course.id)
  }

  const handleLessonDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    lessonId: string
  ): void => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', lessonId)
    setDraggedLessonId(lessonId)
  }

  const handleLessonDragOver = (
    event: React.DragEvent<HTMLDivElement>,
    lessonId: string
  ): void => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (lessonId !== draggedLessonId) {
      setDragOverLessonId(lessonId)
    }
  }

  const handleLessonDrop = async (
    event: React.DragEvent<HTMLDivElement>,
    moduleId: string,
    targetLessonId: string
  ): Promise<void> => {
    event.preventDefault()
    const sourceLessonId =
      event.dataTransfer.getData('text/plain') || draggedLessonId
    const module = modules.find((candidate) => candidate.id === moduleId)
    const sourceIndex = module?.lessons.findIndex(
      (lesson) => lesson.id === sourceLessonId
    )
    const targetIndex = module?.lessons.findIndex(
      (lesson) => lesson.id === targetLessonId
    )

    setDraggedLessonId(null)
    setDragOverLessonId(null)

    if (
      !sourceLessonId ||
      sourceIndex === undefined ||
      targetIndex === undefined ||
      sourceIndex === -1 ||
      targetIndex === -1 ||
      sourceIndex === targetIndex
    ) {
      return
    }

    await reorderLesson(
      sourceLessonId,
      sourceIndex < targetIndex ? 'down' : 'up',
      targetIndex
    )
  }

  const handleLessonDragEnd = (): void => {
    setDraggedLessonId(null)
    setDragOverLessonId(null)
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

  const handleConfirmDeleteLesson = async (): Promise<void> => {
    if (!lessonToDelete) return
    setIsDeletingLesson(true)
    try {
      await deleteLesson(lessonToDelete.id, deleteLessonFile)
      setLessonToDelete(null)
      setDeleteLessonFile(false)
    } finally {
      setIsDeletingLesson(false)
    }
  }

  const handleFixProblems = async (): Promise<void> => {
    if (!course) return
    setIsFixingProblems(true)
    try {
      await fixCourseProblems(course.id)
    } finally {
      setIsFixingProblems(false)
    }
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 sm:px-6 space-y-6 animate-in fade-in duration-200">
      {/* Top Navigation & Actions Bar */}
      <div className="flex items-center justify-between">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={navigateToHome}
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/70 rounded-xl cursor-pointer focus-visible:ring-2 focus-visible:ring-primary min-h-[36px]"
              aria-label={t('nav.library')}
            >
              <ChevronLeft className="h-4 w-4" />
              <span>{t('nav.library')}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Voltar para a biblioteca</TooltipContent>
        </Tooltip>

        <div className="flex items-center gap-2">
          {/* Favorite Toggle Action Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={course.isFavorite ? 'default' : 'ghost'}
                size="sm"
                onClick={() => toggleFavorite(course.id).catch(console.warn)}
                className={`gap-1.5 text-xs rounded-xl cursor-pointer transition-all min-h-[36px] ${
                  course.isFavorite
                    ? 'bg-primary/25 text-primary hover:bg-primary/35 border border-primary/45 shadow-xs'
                    : 'text-muted-foreground hover:text-primary hover:bg-secondary/70'
                }`}
                aria-label={
                  course.isFavorite
                    ? t('course.favorited', 'Favoritado')
                    : t('course.favorite', 'Favoritar')
                }
              >
                <Star
                  className={`h-3.5 w-3.5 transition-transform active:scale-125 duration-150 ${
                    course.isFavorite ? 'fill-primary text-primary' : ''
                  }`}
                />
                <span>
                  {course.isFavorite
                    ? t('course.favorited', 'Favorito')
                    : t('course.favorite', 'Favoritar')}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {course.isFavorite
                ? 'Remover dos favoritos'
                : 'Adicionar aos favoritos'}
            </TooltipContent>
          </Tooltip>

          {/* Ask About Course AI Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  useGroundedChatStore.getState().open({
                    scope: { type: 'course', courseId: course.id }
                  })
                }
                className="gap-1.5 text-xs text-foreground hover:border-primary/40 hover:text-primary rounded-xl cursor-pointer min-h-[36px] border-border/80"
                aria-label={t(
                  'chat.askAboutCourse',
                  'Perguntar sobre este curso'
                )}
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span>{t('chat.ask', 'Perguntar')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t(
                'chat.askAboutCourseTooltip',
                'Conversar com a IA usando o conteúdo indexado deste curso'
              )}
            </TooltipContent>
          </Tooltip>

          {/* Summarize Course AI Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  useSummariesStore.getState().openSummary({
                    type: 'course',
                    courseId: course.id
                  })
                }
                className="gap-1.5 text-xs text-foreground hover:border-primary/40 hover:text-primary rounded-xl cursor-pointer min-h-[36px] border-border/80"
                aria-label={t('summaries.summarizeCourse', 'Resumo do Curso')}
              >
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span>{t('summaries.summarize', 'Resumo')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t(
                'summaries.summarizeCourseTooltip',
                'Gerar ou visualizar síntese estruturada deste curso'
              )}
            </TooltipContent>
          </Tooltip>

          {/* Distilled "More Options" Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/70 cursor-pointer"
                aria-label="Mais opções do curso"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56 rounded-xl p-1.5 shadow-xl"
            >
              <DropdownMenuItem
                onClick={() => setIsGoalModalOpen(true)}
                className="gap-2 text-xs font-medium cursor-pointer rounded-lg py-2"
              >
                <Target className="h-4 w-4 text-accent" />
                <span>
                  {courseGoal
                    ? 'Editar Meta de Estudo'
                    : 'Definir Meta de Estudo'}
                </span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => setIsReorganizeModalOpen(true)}
                className="gap-2 text-xs font-medium cursor-pointer rounded-lg py-2"
              >
                <FolderSync className="h-4 w-4 text-primary" />
                <span>Organizar Arquivos no Disco</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => void handleTranscribeCourse()}
                disabled={isQueueingTranscription}
                className="gap-2 text-xs font-medium cursor-pointer rounded-lg py-2"
              >
                {isQueueingTranscription ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <FileText className="h-4 w-4 text-primary" />
                )}
                <span>
                  {t('course.transcribeCourse', 'Transcrever Todo o Curso')}
                </span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => void handleAutoTranscribeToggle()}
                disabled={isUpdatingAutoTranscribe}
                className="gap-2 text-xs font-medium cursor-pointer rounded-lg py-2 justify-between"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span>
                    {t('course.autoTranscribe', 'Auto-transcrever novas aulas')}
                  </span>
                </div>
                {autoTranscribe && (
                  <Check className="h-3.5 w-3.5 text-primary" />
                )}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={handleChangeCourseCover}
                className="gap-2 text-xs font-medium cursor-pointer rounded-lg py-2"
              >
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                <span>Alterar Imagem de Capa</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator className="my-1" />

              <DropdownMenuItem
                onClick={() => setIsDeleteDialogOpen(true)}
                className="gap-2 text-xs font-medium cursor-pointer rounded-lg py-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                <span>{t('course.deleteCourse', 'Remover Curso')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Course Hero Banner */}
      <div className="rounded-3xl border border-border/80 bg-card p-6 shadow-xl shadow-primary/5">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          {/* Thumbnail / Cover */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                onClick={handleChangeCourseCover}
                className="relative aspect-video w-full md:w-80 shrink-0 overflow-hidden rounded-2xl bg-secondary/70 flex items-center justify-center border border-border/80 shadow-md group cursor-pointer"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleChangeCourseCover()
                  }
                }}
                aria-label="Alterar capa do curso"
              >
                <CourseCover
                  src={course.coverPath}
                  title={course.title}
                  className="h-full w-full"
                />

                {/* Hover Change Cover Overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center text-white backdrop-blur-[2px]">
                  <Upload className="w-6 h-6 mb-1 text-white" />
                  <span className="text-xs font-semibold">Alterar Capa</span>
                </div>

                {/* Source Badge on Cover */}
                <div className="absolute top-2.5 right-2.5 z-10 pointer-events-none">
                  {course.sourceType === 'local-ref' ? (
                    <Badge
                      variant="secondary"
                      className="text-[10px] bg-black/75 backdrop-blur-md border-white/10 text-slate-300 flex items-center gap-1 py-0.5 px-2 font-mono"
                    >
                      <LinkIcon className="w-2.5 h-2.5 text-primary" />
                      Ref
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="text-[10px] bg-black/75 backdrop-blur-md border-white/10 text-slate-300 flex items-center gap-1 py-0.5 px-2 font-mono"
                    >
                      <HardDrive className="w-2.5 h-2.5 text-accent" />
                      Vault
                    </Badge>
                  )}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              Clique para alterar a capa do curso
            </TooltipContent>
          </Tooltip>

          {/* Details & CTA */}
          <div className="flex flex-1 flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {progressData.isCompleted ? (
                  <Badge
                    variant="success"
                    className="gap-1 shadow-sm font-semibold"
                  >
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

                {course.isFavorite && (
                  <Badge
                    variant="secondary"
                    className="gap-1 bg-primary/15 text-primary border-primary/30"
                  >
                    <Star className="h-3 w-3 fill-primary text-primary" />
                    <span>{t('course.favorited', 'Favorito')}</span>
                  </Badge>
                )}
              </div>

              <div className="flex items-start justify-between gap-3">
                <EditableTitle
                  initialTitle={course.customTitle ?? course.title}
                  onSave={(newTitle) =>
                    updateCourseMetadata(course.id, newTitle)
                  }
                  className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl leading-tight"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() =>
                        toggleFavorite(course.id).catch(console.warn)
                      }
                      className={`shrink-0 p-2.5 rounded-xl border transition-all duration-200 cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        course.isFavorite
                          ? 'bg-primary/25 border-primary/40 text-primary shadow-md shadow-primary/15 hover:bg-primary/35'
                          : 'bg-secondary/50 border-border/80 text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-secondary'
                      }`}
                      aria-label="Toggle Favorite"
                    >
                      <Star
                        className={`h-5 w-5 transition-transform active:scale-125 duration-150 ${
                          course.isFavorite ? 'fill-primary text-primary' : ''
                        }`}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    {course.isFavorite
                      ? 'Remover dos favoritos'
                      : 'Adicionar aos favoritos'}
                  </TooltipContent>
                </Tooltip>
              </div>

              {course.description && (
                <p className="break-words whitespace-normal text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {course.description}
                </p>
              )}
            </div>

            {/* Stats Row */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-primary/80" />
                <span>
                  {course.moduleCount} {t('course.modules')} •{' '}
                  {course.lessonCount} {t('course.lessons')}
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
                    {progressData.completedLessons} /{' '}
                    {progressData.totalLessons} {t('course.lessons')} completed
                  </span>
                  <span className="font-bold text-primary">
                    {progressData.coursePercentage}%
                  </span>
                </div>
                <Progress
                  value={progressData.coursePercentage}
                  className="h-2"
                  indicatorClassName="bg-primary"
                />
              </div>

              {/* Action Buttons Row */}
              <div className="flex flex-wrap items-center gap-2.5">
                <Button
                  size="lg"
                  onClick={handleStartOrResume}
                  className="gap-2 font-semibold shadow-lg shadow-primary/20 bg-primary text-primary-foreground rounded-xl cursor-pointer hover:opacity-95 active:scale-[0.98] transition-all min-h-[42px] px-6"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>
                    {progressData.coursePercentage > 0
                      ? t('course.resume')
                      : t('course.start')}
                  </span>
                </Button>

                {/* Study Queue Button (v0.3) */}
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleAddToQueue}
                  className="gap-2 text-xs font-semibold rounded-xl border-border/80 hover:border-accent/60 hover:text-accent min-h-[42px]"
                >
                  <ListPlus className="h-4 w-4 text-accent" />
                  <span>
                    {queueAddedNotification
                      ? 'Adicionado à Fila!'
                      : '+ Estudar Depois'}
                  </span>
                </Button>

                {/* Course Goal Quick Access Chip */}
                {courseGoal?.targetDate ? (
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => setIsGoalModalOpen(true)}
                    className="gap-2 text-xs font-semibold rounded-xl border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 min-h-[42px]"
                  >
                    <Target className="h-4 w-4 text-accent" />
                    <span>
                      {`Meta: ${new Date(courseGoal.targetDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`}
                    </span>
                  </Button>
                ) : null}
              </div>

              {/* Course Goal Pace Hint (if active) */}
              {courseGoal?.targetDate && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                  <span className="font-mono text-accent font-semibold">
                    {remainingLessons} aulas restantes
                  </span>
                  <span>•</span>
                  <span>
                    Ritmo recomendado:{' '}
                    {daysLeft && daysLeft > 0
                      ? `${recommendedPace} aulas/dia (${daysLeft} dias restantes)`
                      : 'concluído'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Course Health / Problem Lessons Warning Banner */}
      {courseHealth &&
        !courseHealth.healthy &&
        courseHealth.problemLessons.length > 0 &&
        (() => {
          const hasNonMedia = courseHealth.problemLessons.some(
            (p) => p.problemType === 'non_media_type'
          )
          const hasMissingOrCorrupted = courseHealth.problemLessons.some(
            (p) =>
              p.problemType === 'missing_file' || p.problemType === 'zero_bytes'
          )

          let buttonText = 'Corrigir e Limpar Aulas'
          if (hasNonMedia && !hasMissingOrCorrupted) {
            buttonText = 'Mover Anexos para Materiais'
          } else if (!hasNonMedia && hasMissingOrCorrupted) {
            buttonText = 'Remover Aulas Inacessíveis'
          }

          return (
            <div className="rounded-2xl border border-primary/40 bg-primary/10 p-4.5 backdrop-blur-md space-y-3 animate-in fade-in duration-200 shadow-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary border border-primary/30 mt-0.5">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-primary">
                        {courseHealth.problemLessons.length} aula(s) com
                        problema identificadas
                      </h3>
                      <Badge
                        variant="destructive"
                        className="text-[10px] px-2 py-0.5"
                      >
                        Ação recomendada
                      </Badge>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      {hasNonMedia && hasMissingOrCorrupted
                        ? 'Foram detectados anexos/documentos e arquivos ausentes ou vazios. O Orbia moverá anexos para Materiais e removerá links inválidos.'
                        : hasNonMedia
                          ? 'Foram detectados documentos e materiais registrados indevidamente como aulas de vídeo. Eles serão movidos para a aba de Materiais.'
                          : 'Foram detectados arquivos ausentes no disco ou de 0 bytes que não podem ser reproduzidos.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleFixProblems}
                    disabled={isFixingProblems}
                    className="h-8.5 px-3.5 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:opacity-90 shadow-sm cursor-pointer"
                  >
                    {isFixingProblems ? 'Corrigindo...' : buttonText}
                  </Button>
                </div>
              </div>
            </div>
          )
        })()}

      {/* Curriculum Accordion */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            {t('player.curriculum')}
          </h2>
          <span className="text-xs text-muted-foreground font-semibold">
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
            const moduleResources = module.resources ?? []

            return (
              <AccordionItem
                key={module.id}
                value={module.id}
                className="rounded-2xl border border-border/80 bg-card px-4 overflow-hidden shadow-sm hover:border-border transition-colors duration-200"
              >
                <AccordionTrigger className="hover:no-underline py-4 cursor-pointer">
                  <div className="flex min-w-0 flex-1 flex-col gap-2 pr-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-3 text-left">
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            reorderModule(module.id, 'up')
                          }}
                          disabled={modIdx === 0}
                          className="text-muted-foreground hover:text-primary disabled:opacity-30 disabled:hover:text-muted-foreground"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            reorderModule(module.id, 'down')
                          }}
                          disabled={modIdx === modules.length - 1}
                          className="text-muted-foreground hover:text-primary disabled:opacity-30 disabled:hover:text-muted-foreground"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-mono font-bold text-primary">
                        {modIdx + 1}
                      </span>
                      <EditableTitle
                        initialTitle={module.customTitle ?? module.title}
                        onSave={(newTitle) =>
                          updateModuleMetadata(module.id, newTitle)
                        }
                        className="min-w-0 flex-1 font-bold text-foreground text-sm"
                      />
                    </div>

                    <div className="flex w-full flex-wrap items-center justify-start gap-3 text-xs text-muted-foreground font-medium sm:w-auto sm:justify-end">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              toggleModuleCompletion(module.id, course.id)
                            }}
                            className="p-1 rounded hover:bg-secondary/70 text-muted-foreground hover:text-emerald-500 transition-colors"
                          >
                            {modInfo?.completedLessons ===
                              (modInfo?.totalLessons ||
                                module.lessons.length) &&
                            modInfo?.totalLessons > 0 ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <Circle className="h-4 w-4" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {modInfo?.completedLessons ===
                            (modInfo?.totalLessons || module.lessons.length) &&
                          modInfo?.totalLessons > 0
                            ? t('course.unmarkModuleComplete')
                            : t('course.markModuleComplete')}
                        </TooltipContent>
                      </Tooltip>
                      {modPercentage > 0 && (
                        <span className="font-bold text-primary">
                          {modPercentage}%
                        </span>
                      )}
                      <span>
                        {modInfo?.completedLessons || 0} /{' '}
                        {modInfo?.totalLessons || module.lessons.length}{' '}
                        {t('course.lessons')}
                      </span>
                      <button
                        type="button"
                        aria-label={t(
                          'course.transcribeModule',
                          'Transcribe module'
                        )}
                        title={t(
                          'course.transcribeModule',
                          'Transcribe module'
                        )}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          void handleTranscribeModule(module.id)
                        }}
                        disabled={queueingModuleId !== null}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {queueingModuleId === module.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FileText className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label={t(
                          'summaries.summarizeModule',
                          'Resumir módulo'
                        )}
                        title={t(
                          'summaries.summarizeModule',
                          'Resumo do Módulo'
                        )}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          useSummariesStore.getState().openSummary({
                            type: 'module',
                            courseId: course.id,
                            moduleId: module.id
                          })
                        }}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={t(
                          'chat.askAboutModule',
                          'Perguntar sobre este módulo'
                        )}
                        title={t(
                          'chat.askAboutModule',
                          'Perguntar sobre este módulo'
                        )}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          useGroundedChatStore.getState().open({
                            scope: { type: 'module', moduleId: module.id }
                          })
                        }}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                      </button>
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
                      const isComplete = progressData.isLessonCompleted(
                        lesson.id
                      )
                      const lessonProgress = progressData.getLessonProgress(
                        lesson.id
                      )
                      const lessonResources = getLessonVisibleResources(lesson)
                      const problemInfo = courseHealth?.problemLessons.find(
                        (p) => p.id === lesson.id
                      )

                      return (
                        <div
                          key={lesson.id}
                          role="button"
                          tabIndex={0}
                          draggable
                          onDragStart={(event) =>
                            handleLessonDragStart(event, lesson.id)
                          }
                          onDragOver={(event) =>
                            handleLessonDragOver(event, lesson.id)
                          }
                          onDrop={(event) => {
                            void handleLessonDrop(event, module.id, lesson.id)
                          }}
                          onDragEnd={handleLessonDragEnd}
                          onClick={() => handlePlayLesson(lesson)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              handlePlayLesson(lesson)
                            }
                          }}
                          className={cn(
                            'flex items-start justify-between gap-2 py-2.5 px-3 rounded-xl hover:bg-secondary/70 cursor-pointer transition-colors duration-150 group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
                            problemInfo &&
                              'bg-destructive/5 hover:bg-destructive/10 border border-destructive/25',
                            draggedLessonId === lesson.id && 'opacity-60',
                            dragOverLessonId === lesson.id &&
                              draggedLessonId !== lesson.id &&
                              'bg-accent/10 ring-1 ring-accent/40'
                          )}
                        >
                          <div className="flex min-w-0 flex-1 flex-wrap items-start gap-3 mr-2">
                            {/* Completion or Problem Indicator */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="shrink-0">
                                  {problemInfo ? (
                                    <AlertTriangle className="h-4 w-4 text-destructive" />
                                  ) : isComplete ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                  ) : (
                                    <Circle className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="right">
                                {problemInfo
                                  ? problemInfo.problemDescription
                                  : isComplete
                                    ? 'Aula concluída'
                                    : 'Aula pendente'}
                              </TooltipContent>
                            </Tooltip>

                            {/* Drag Handle */}
                            <span
                              className="flex h-8 w-5 shrink-0 items-center justify-center text-muted-foreground/50 group-hover:text-primary transition-colors"
                              title="Arrastar para reordenar"
                            >
                              <GripVertical
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            </span>

                            {/* Lesson Thumbnail & Cover */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleChangeLessonCover(lesson.id)
                                  }}
                                  className="relative aspect-video w-14 sm:w-16 shrink-0 rounded-lg overflow-hidden bg-secondary border border-border/80 group/thumb shadow-xs"
                                >
                                  {lesson.coverPath ? (
                                    <img
                                      src={mediaUrl(lesson.coverPath)}
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
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                Alterar capa da aula
                              </TooltipContent>
                            </Tooltip>

                            {/* Lesson Reorder */}
                            <div className="flex flex-col gap-0.5 shrink-0">
                              <button
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  reorderLesson(lesson.id, 'up')
                                }}
                                disabled={idx === 0}
                                className="text-muted-foreground hover:text-primary disabled:opacity-30 disabled:hover:text-muted-foreground transition-opacity"
                              >
                                <ChevronUp className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  reorderLesson(lesson.id, 'down')
                                }}
                                disabled={idx === module.lessons.length - 1}
                                className="text-muted-foreground hover:text-primary disabled:opacity-30 disabled:hover:text-muted-foreground transition-opacity"
                              >
                                <ChevronDown className="h-3 w-3" />
                              </button>
                            </div>

                            {/* Lesson Number & Title */}
                            <span className="text-xs font-mono text-muted-foreground w-6 shrink-0 text-center">
                              {String(idx + 1).padStart(2, '0')}
                            </span>

                            <EditableTitle
                              initialTitle={lesson.customTitle ?? lesson.title}
                              onSave={(newTitle) =>
                                updateLessonMetadata(lesson.id, newTitle)
                              }
                              className={cn(
                                'min-w-0 flex-[1_1_12rem] break-words whitespace-normal text-xs sm:text-sm font-medium group-hover:text-primary transition-colors',
                                problemInfo
                                  ? 'text-destructive font-semibold'
                                  : 'text-foreground'
                              )}
                            />

                            {/* Lesson Favorite Toggle */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    toggleLessonFavorite(lesson.id)
                                  }}
                                  className="shrink-0 p-1 rounded hover:bg-primary/10 focus-visible:outline-none"
                                >
                                  <Star
                                    className={cn(
                                      'h-3.5 w-3.5 transition-colors',
                                      lesson.isFavorite
                                        ? 'fill-primary text-primary'
                                        : 'text-muted-foreground hover:text-primary'
                                    )}
                                  />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                {lesson.isFavorite
                                  ? t('course.lessonUnfavorite')
                                  : t('course.lessonFavorite')}
                              </TooltipContent>
                            </Tooltip>

                            {problemInfo && (
                              <Badge
                                variant="destructive"
                                className="text-[10px] px-1.5 py-0 shrink-0"
                              >
                                {problemInfo.problemType === 'missing_file'
                                  ? 'Arquivo ausente'
                                  : problemInfo.problemType === 'zero_bytes'
                                    ? '0 bytes'
                                    : 'Tipo inválido'}
                              </Badge>
                            )}

                            {/* Attached Resource Chips */}
                            {lessonResources.length > 0 && (
                              <div
                                className="flex max-w-full flex-wrap items-center gap-1.5 ml-2"
                                aria-label={t('course.lessonMaterials', {
                                  count: lessonResources.length
                                })}
                              >
                                <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-mono font-bold text-muted-foreground">
                                  {lessonResources.length}
                                </span>
                                {lessonResources.map((res) => {
                                  const isPdf = hasEmbeddedPreview(res)
                                  const isCode = isCodeResource(res)

                                  return (
                                    <Tooltip key={res.id}>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setSelectedResource(res)
                                            if (isPdf) {
                                              setIsPdfModalOpen(true)
                                            } else if (isCode) {
                                              setIsCodeModalOpen(true)
                                            } else {
                                              void window.api.system.openPath(
                                                res.filePath
                                              )
                                            }
                                          }}
                                          className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-secondary/90 hover:bg-primary/20 text-muted-foreground hover:text-primary border border-border/70 text-[10px] font-medium transition-colors cursor-pointer"
                                          aria-label={t('course.viewResource', {
                                            name: res.name
                                          })}
                                        >
                                          <FileText className="w-3 h-3 text-primary" />
                                          <span className="flex min-w-0 flex-col text-left leading-tight">
                                            <span className="max-w-[14rem] break-words whitespace-normal">
                                              {res.name}
                                            </span>
                                            <span className="font-mono text-[9px] text-muted-foreground/80">
                                              {getResourceTypeLabel(res)}
                                            </span>
                                          </span>
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">
                                        {isPdf
                                          ? t('course.viewResource', {
                                              name: res.name
                                            })
                                          : isCode
                                            ? `Visualizar código: ${res.name}`
                                            : `Abrir no computador: ${res.name}`}
                                      </TooltipContent>
                                    </Tooltip>
                                  )
                                })}
                              </div>
                            )}
                          </div>

                          {/* Duration, Single Lesson Delete & Play icon */}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0 font-mono">
                            {lesson.duration > 0 ? (
                              <span>{formatTime(lesson.duration)}</span>
                            ) : lessonProgress?.duration ? (
                              <span>{formatTime(lessonProgress.duration)}</span>
                            ) : null}

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    addToQueue(lesson)
                                  }}
                                  className={`h-7 w-7 rounded-lg transition-all cursor-pointer ${
                                    playbackQueue?.some(
                                      (l) => l.id === lesson.id
                                    )
                                      ? 'text-primary opacity-100'
                                      : 'text-muted-foreground/60 hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100'
                                  }`}
                                  aria-label="Adicionar à fila de reprodução"
                                >
                                  <ListPlus className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                {playbackQueue?.some((l) => l.id === lesson.id)
                                  ? 'Na Fila de Reprodução'
                                  : 'Tocar a Seguir'}
                              </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setLessonToDelete(lesson)
                                  }}
                                  className="h-7 w-7 rounded-lg text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                                  aria-label="Remover aula"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                Remover aula do curso
                              </TooltipContent>
                            </Tooltip>

                            <Play className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 text-primary transition-opacity duration-200" />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {moduleResources.length > 0 && (
                    <section
                      className="mt-3 rounded-xl border border-border/70 bg-secondary/30 p-3"
                      aria-label={t('course.moduleMaterials', {
                        count: moduleResources.length
                      })}
                    >
                      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
                        <FileText
                          className="h-3.5 w-3.5 text-primary"
                          aria-hidden="true"
                        />
                        <span>
                          {t('course.moduleMaterials', {
                            count: moduleResources.length
                          })}
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {moduleResources.map((resource) => {
                          const isPdf = hasEmbeddedPreview(resource)
                          const isCode = isCodeResource(resource)

                          return (
                            <li key={resource.id}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedResource(resource)
                                      if (isPdf) {
                                        setIsPdfModalOpen(true)
                                      } else if (isCode) {
                                        setIsCodeModalOpen(true)
                                      } else {
                                        void window.api.system.openPath(
                                          resource.filePath
                                        )
                                      }
                                    }}
                                    className="flex w-full items-start gap-2 rounded-lg border border-border/60 bg-card/60 px-2.5 py-2 text-left text-xs transition-colors hover:border-primary/40 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
                                    aria-label={t('course.viewResource', {
                                      name: resource.name
                                    })}
                                  >
                                    <FileText
                                      className="h-3.5 w-3.5 shrink-0 text-primary"
                                      aria-hidden="true"
                                    />
                                    <span className="min-w-0 flex-1 break-words whitespace-normal font-medium leading-snug text-foreground">
                                      {resource.name}
                                    </span>
                                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                                      {getResourceTypeLabel(resource)}
                                    </span>
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  {isPdf
                                    ? t('course.viewResource', {
                                        name: resource.name
                                      })
                                    : isCode
                                      ? `Visualizar código: ${resource.name}`
                                      : `Abrir no computador: ${resource.name}`}
                                </TooltipContent>
                              </Tooltip>
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  )}
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>

        {/* Similar Courses Rail (v0.6 Discovery) */}
        <SimilarCoursesRail courseId={course.id} />
      </div>

      {/* Delete Course Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="rounded-3xl">
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
              className="rounded-xl text-xs cursor-pointer min-h-[36px]"
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteCourse}
              disabled={isDeleting}
              className="rounded-xl text-xs cursor-pointer min-h-[36px]"
            >
              {isDeleting ? t('common.loading') : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Single Lesson Confirmation Dialog */}
      <Dialog
        open={Boolean(lessonToDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setLessonToDelete(null)
            setDeleteLessonFile(false)
          }
        }}
      >
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle>Remover Aula</DialogTitle>
            </div>
            <DialogDescription className="pt-2 text-xs leading-relaxed text-zinc-300">
              Deseja remover a aula{' '}
              <strong className="text-white font-semibold">
                "{lessonToDelete?.title}"
              </strong>{' '}
              da biblioteca deste curso?
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 pt-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              id="deleteLessonFileCheckbox"
              checked={deleteLessonFile}
              onChange={(e) => setDeleteLessonFile(e.target.checked)}
              className="rounded border-zinc-700 bg-zinc-900 text-primary cursor-pointer h-4 w-4"
            />
            <label
              htmlFor="deleteLessonFileCheckbox"
              className="cursor-pointer select-none"
            >
              Excluir também o arquivo do computador
            </label>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t border-border">
            <Button
              variant="outline"
              onClick={() => {
                setLessonToDelete(null)
                setDeleteLessonFile(false)
              }}
              disabled={isDeletingLesson}
              className="rounded-xl text-xs cursor-pointer min-h-[36px]"
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDeleteLesson}
              disabled={isDeletingLesson}
              className="rounded-xl text-xs cursor-pointer min-h-[36px]"
            >
              {isDeletingLesson ? t('common.loading') : 'Remover Aula'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF & Document Viewer Modal */}
      <PdfViewerModal
        resource={selectedResource}
        isOpen={isPdfModalOpen}
        onClose={() => {
          setIsPdfModalOpen(false)
          setSelectedResource(null)
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

      {/* Reorganize Course Files Modal */}
      <ReorganizeCourseModal
        courseId={course.id}
        courseTitle={course.title}
        isOpen={isReorganizeModalOpen}
        onClose={() => setIsReorganizeModalOpen(false)}
        onSuccess={() => {
          if (selectedCourseId) {
            void fetchCourseById(selectedCourseId)
          }
        }}
      />

      {/* Course Goal Modal (v0.3) */}
      <Dialog open={isGoalModalOpen} onOpenChange={setIsGoalModalOpen}>
        <DialogContent className="max-w-md bg-card/95 backdrop-blur-xl border border-border/80 p-6 rounded-3xl shadow-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent border border-accent/30">
                <Target className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  Meta de Estudo do Curso
                </DialogTitle>
                <DialogDescription className="max-w-[280px] break-words whitespace-normal text-xs text-muted-foreground">
                  {course.title}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleSaveGoal} className="space-y-4 my-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-accent" />
                <span>Data-alvo de Conclusão</span>
              </label>
              <input
                type="date"
                value={targetDateInput}
                onChange={(e) => setTargetDateInput(e.target.value)}
                className="w-full text-xs bg-background/80 border border-border/80 rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="text-[11px] text-muted-foreground">
                O Orbia calculará o ritmo diário recomendado em aulas/dia até
                esta data.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Ritmo Semanal Desejado (aulas por semana)
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={weeklyLessonsInput}
                onChange={(e) =>
                  setWeeklyLessonsInput(parseInt(e.target.value) || 1)
                }
                className="w-full text-xs bg-background/80 border border-border/80 rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            <DialogFooter className="gap-2 pt-2 border-t border-border/60">
              {courseGoal && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDeleteGoal}
                  className="text-xs text-destructive hover:bg-destructive/10 mr-auto"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Remover Meta
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsGoalModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-accent hover:bg-accent text-accent-foreground font-semibold"
              >
                Salvar Meta
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
