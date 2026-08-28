import React, { useEffect, useState } from 'react'
import { Dialog, DialogContent, Button, Input, Badge } from '../ui'
import {
  Folder,
  Film,
  FileText,
  FileCode,
  ArrowUp,
  ArrowDown,
  Trash2,
  Check,
  Layers,
  Image as ImageIcon,
  Save,
  Clock
} from 'lucide-react'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { CourseCover } from '../ui/CourseCover'
import { formatDurationHuman, formatTime } from '../../lib/formatters'
import type { Course, Module, Lesson } from '@shared'

interface QuickCourseOrganizerModalProps {
  courseId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function QuickCourseOrganizerModal({
  courseId,
  open,
  onOpenChange
}: QuickCourseOrganizerModalProps): React.JSX.Element {
  const {
    updateCourseMetadata,
    updateModuleMetadata,
    updateLessonMetadata,
    reorderModule,
    reorderLesson,
    deleteLesson,
    updateCourseCover,
    fetchCourses
  } = useLibraryStore()

  const [courseData, setCourseData] = useState<{
    course: Course
    modules: (Module & { lessons: Lesson[] })[]
  } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [courseTitleInput, setCourseTitleInput] = useState('')
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null)
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null)
  const [expandedModules, setExpandedModules] = useState<
    Record<string, boolean>
  >({})
  const [saveStatus, setSaveStatus] = useState<string | null>(null)

  useEffect(() => {
    if (open && courseId) {
      loadHierarchy(courseId)
    } else {
      setCourseData(null)
      setSaveStatus(null)
    }
  }, [open, courseId])

  const loadHierarchy = async (id: string): Promise<void> => {
    setIsLoading(true)
    try {
      const res = await window.api.courses.getById(id)
      if (res) {
        setCourseData(res)
        setCourseTitleInput(res.course.customTitle || res.course.title)
        const initExpanded: Record<string, boolean> = {}
        res.modules.slice(0, 3).forEach((m) => {
          initExpanded[m.id] = true
        })
        setExpandedModules(initExpanded)
      }
    } catch (err) {
      console.warn('Failed to load course for quick organizer:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveCourseTitle = async (): Promise<void> => {
    if (!courseData || !courseTitleInput.trim()) return
    await updateCourseMetadata(courseData.course.id, courseTitleInput.trim())
    setSaveStatus('Título do curso atualizado!')
    setTimeout(() => setSaveStatus(null), 2000)
    await loadHierarchy(courseData.course.id)
  }

  const handleSaveModuleTitle = async (
    moduleId: string,
    newTitle: string
  ): Promise<void> => {
    if (!newTitle.trim()) return
    await updateModuleMetadata(moduleId, newTitle.trim())
    setEditingModuleId(null)
    setSaveStatus('Módulo atualizado!')
    setTimeout(() => setSaveStatus(null), 2000)
    if (courseData) await loadHierarchy(courseData.course.id)
  }

  const handleSaveLessonTitle = async (
    lessonId: string,
    newTitle: string
  ): Promise<void> => {
    if (!newTitle.trim()) return
    await updateLessonMetadata(lessonId, newTitle.trim())
    setEditingLessonId(null)
    setSaveStatus('Aula atualizada!')
    setTimeout(() => setSaveStatus(null), 2000)
    if (courseData) await loadHierarchy(courseData.course.id)
  }

  const handleReorderModule = async (
    moduleId: string,
    direction: 'up' | 'down'
  ): Promise<void> => {
    await reorderModule(moduleId, direction)
    if (courseData) await loadHierarchy(courseData.course.id)
  }

  const handleReorderLesson = async (
    lessonId: string,
    direction: 'up' | 'down'
  ): Promise<void> => {
    await reorderLesson(lessonId, direction)
    if (courseData) await loadHierarchy(courseData.course.id)
  }

  const handleDeleteLesson = async (lessonId: string): Promise<void> => {
    if (
      !confirm(
        'Deseja realmente remover esta aula da biblioteca? O arquivo físico permanecerá seguro no disco.'
      )
    ) {
      return
    }
    const res = await deleteLesson(lessonId, false)
    if (res.success && courseData) {
      await loadHierarchy(courseData.course.id)
      await fetchCourses()
    }
  }

  const handleChangeCover = async (): Promise<void> => {
    if (!courseData) return
    const imagePath = await window.api.courses.selectCoverImage()
    if (imagePath) {
      await updateCourseCover(courseData.course.id, imagePath)
      await loadHierarchy(courseData.course.id)
      await fetchCourses()
    }
  }

  const toggleModuleExpand = (modId: string): void => {
    setExpandedModules((prev) => ({
      ...prev,
      [modId]: !prev[modId]
    }))
  }

  const getMediaIcon = (type: string): React.JSX.Element => {
    switch (type) {
      case 'video':
        return <Film className="h-3.5 w-3.5 text-primary" />
      case 'audio':
        return <Film className="h-3.5 w-3.5 text-accent" />
      case 'pdf':
      case 'document':
        return <FileText className="h-3.5 w-3.5 text-emerald-400" />
      case 'code':
        return <FileCode className="h-3.5 w-3.5 text-accent" />
      default:
        return <Film className="h-3.5 w-3.5 text-slate-400" />
    }
  }

  if (!courseData && isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden p-6 flex flex-col items-center justify-center min-h-[350px]">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">
              Carregando estrutura visual do curso...
            </p>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (!courseData) return <></>

  const { course, modules } = courseData

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0 flex flex-col bg-card border-border/80 shadow-2xl rounded-2xl">
        {/* Modal Header & Course Details */}
        <div className="p-5 border-b border-border/60 bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {/* Thumbnail Preview */}
            <div className="relative group/cover w-28 h-18 sm:w-36 sm:h-20 shrink-0 rounded-xl overflow-hidden border border-border/60 shadow-sm bg-black/40">
              <CourseCover
                src={course.coverPath}
                title={course.title}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={handleChangeCover}
                className="absolute inset-0 bg-black/70 opacity-0 group-hover/cover:opacity-100 flex flex-col items-center justify-center gap-1 text-[11px] text-white font-medium transition-opacity cursor-pointer backdrop-blur-xs"
              >
                <ImageIcon className="h-4 w-4 text-primary" />
                <span>Trocar Capa</span>
              </button>
            </div>

            {/* Editable Title and Info */}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-primary font-mono">
                  Editor Rápido do Curso
                </span>
                {course.sourceType === 'local-ref' && (
                  <Badge
                    variant="outline"
                    className="text-[10px] py-0 px-1.5 border-primary/30 text-primary"
                  >
                    Referência Externa
                  </Badge>
                )}
                {saveStatus && (
                  <span className="text-xs text-emerald-400 font-medium flex items-center gap-1 animate-in fade-in">
                    <Check className="h-3.5 w-3.5" />
                    {saveStatus}
                  </span>
                )}
              </div>

              {/* Title Input */}
              <div className="flex items-center gap-2">
                <Input
                  value={courseTitleInput}
                  onChange={(e) => setCourseTitleInput(e.target.value)}
                  onBlur={handleSaveCourseTitle}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && handleSaveCourseTitle()
                  }
                  placeholder="Nome do Curso..."
                  className="text-base font-bold text-foreground bg-background/80 border-border/80 h-9 rounded-xl focus-visible:ring-1 focus-visible:ring-primary"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSaveCourseTitle}
                  className="h-9 px-3 text-xs shrink-0 rounded-xl"
                  title="Salvar Título"
                >
                  <Save className="h-4 w-4 text-primary" />
                </Button>
              </div>

              {/* Stats badges */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 font-mono">
                  <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                  {modules.length} módulo(s)
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 font-mono">
                  <Film className="h-3.5 w-3.5 text-muted-foreground" />
                  {course.lessonCount} aula(s)
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 font-mono">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  {formatDurationHuman(course.totalDuration)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Curriculum Structure */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Estrutura de Módulos & Aulas
            </h3>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const allOpen: Record<string, boolean> = {}
                  modules.forEach((m) => (allOpen[m.id] = true))
                  setExpandedModules(allOpen)
                }}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                Expandir Tudo
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpandedModules({})}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                Recolher
              </Button>
            </div>
          </div>

          {modules.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-border/60 rounded-xl">
              <p className="text-sm text-muted-foreground">
                Nenhum módulo encontrado neste curso.
              </p>
            </div>
          ) : (
            modules.map((mod, modIdx) => {
              const isExpanded = Boolean(expandedModules[mod.id])
              const isEditingMod = editingModuleId === mod.id
              const displayModTitle = mod.customTitle || mod.title

              return (
                <div
                  key={mod.id}
                  className="rounded-xl border border-border/60 bg-muted/10 overflow-hidden transition-all shadow-xs"
                >
                  {/* Module Header */}
                  <div className="p-3 bg-muted/30 flex items-center justify-between gap-3 select-none">
                    <div
                      className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
                      onClick={() => toggleModuleExpand(mod.id)}
                    >
                      <Folder
                        className={`h-4 w-4 shrink-0 ${isExpanded ? 'text-primary' : 'text-primary'}`}
                      />
                      <span className="text-xs font-mono font-bold text-muted-foreground shrink-0">
                        #{modIdx + 1}
                      </span>

                      {isEditingMod ? (
                        <div
                          className="flex-1 min-w-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Input
                            autoFocus
                            defaultValue={displayModTitle}
                            onBlur={(e) =>
                              handleSaveModuleTitle(mod.id, e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter')
                                handleSaveModuleTitle(
                                  mod.id,
                                  e.currentTarget.value
                                )
                              if (e.key === 'Escape') setEditingModuleId(null)
                            }}
                            className="h-7 text-xs font-semibold bg-background py-1 px-2 rounded-lg"
                          />
                        </div>
                      ) : (
                        <span
                          className="text-xs font-bold text-foreground truncate hover:text-primary transition-colors cursor-text"
                          title="Clique para renomear"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingModuleId(mod.id)
                          }}
                        >
                          {displayModTitle}
                        </span>
                      )}

                      <Badge
                        variant="secondary"
                        className="text-[10px] h-5 py-0 px-1.5 font-mono shrink-0"
                      >
                        {mod.lessons.length} aulas
                      </Badge>
                    </div>

                    {/* Module Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={modIdx === 0}
                        onClick={() => handleReorderModule(mod.id, 'up')}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30 rounded-lg"
                        title="Mover para Cima"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={modIdx === modules.length - 1}
                        onClick={() => handleReorderModule(mod.id, 'down')}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30 rounded-lg"
                        title="Mover para Baixo"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Lessons List inside Module */}
                  {isExpanded && (
                    <div className="p-2 space-y-1 bg-background/50 border-t border-border/40">
                      {mod.lessons.length === 0 ? (
                        <p className="text-xs text-muted-foreground p-3 text-center italic">
                          Nenhuma aula neste módulo.
                        </p>
                      ) : (
                        mod.lessons.map((les, lesIdx) => {
                          const isEditingLes = editingLessonId === les.id
                          const displayLessonTitle =
                            les.customTitle || les.title

                          return (
                            <div
                              key={les.id}
                              className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors text-xs group"
                            >
                              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                {getMediaIcon(les.mediaType)}
                                <span className="font-mono text-[11px] text-muted-foreground w-5 text-right shrink-0">
                                  {lesIdx + 1}.
                                </span>

                                {isEditingLes ? (
                                  <Input
                                    autoFocus
                                    defaultValue={displayLessonTitle}
                                    onBlur={(e) =>
                                      handleSaveLessonTitle(
                                        les.id,
                                        e.target.value
                                      )
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter')
                                        handleSaveLessonTitle(
                                          les.id,
                                          e.currentTarget.value
                                        )
                                      if (e.key === 'Escape')
                                        setEditingLessonId(null)
                                    }}
                                    className="h-6.5 text-xs bg-background py-0.5 px-2 rounded-md flex-1"
                                  />
                                ) : (
                                  <span
                                    onClick={() => setEditingLessonId(les.id)}
                                    className="font-medium text-foreground truncate cursor-text hover:text-primary transition-colors flex-1"
                                    title="Clique para renomear aula"
                                  >
                                    {displayLessonTitle}
                                  </span>
                                )}

                                {les.duration > 0 && (
                                  <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                                    {formatTime(les.duration)}
                                  </span>
                                )}
                              </div>

                              {/* Lesson Reorder & Delete actions */}
                              <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100 transition-opacity shrink-0">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  disabled={lesIdx === 0}
                                  onClick={() =>
                                    handleReorderLesson(les.id, 'up')
                                  }
                                  className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-20 rounded"
                                  title="Subir Aula"
                                >
                                  <ArrowUp className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  disabled={lesIdx === mod.lessons.length - 1}
                                  onClick={() =>
                                    handleReorderLesson(les.id, 'down')
                                  }
                                  className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-20 rounded"
                                  title="Descer Aula"
                                >
                                  <ArrowDown className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleDeleteLesson(les.id)}
                                  className="h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded"
                                  title="Remover aula da biblioteca"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-border/60 bg-muted/20 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            As alterações são salvas automaticamente na biblioteca sem mover ou
            alterar arquivos em disco.
          </p>
          <Button
            onClick={() => onOpenChange(false)}
            className="rounded-xl px-5 text-xs font-semibold bg-primary text-primary-foreground"
          >
            Concluir Edição
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
