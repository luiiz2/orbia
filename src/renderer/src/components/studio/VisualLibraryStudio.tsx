import React, { useState, useEffect, useMemo } from 'react'
import {
  Search,
  Eye,
  EyeOff,
  History,
  Layers,
  Film,
  Folder,
  ArrowUp,
  ArrowDown,
  Trash2,
  Image as ImageIcon,
  Save,
  Check,
  Star,
  SlidersHorizontal,
  Clock,
  FileText,
  FileCode
} from 'lucide-react'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { useStudioStore } from '../../stores/useStudioStore'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { CourseCover } from '../ui/CourseCover'
import { formatDurationHuman, formatTime } from '../../lib/formatters'
import type { Course, Module, Lesson } from '@shared'

export function VisualLibraryStudio(): React.JSX.Element {
  const {
    courses,
    fetchCourses,
    updateCourseMetadata,
    updateModuleMetadata,
    updateLessonMetadata,
    reorderModule,
    reorderLesson,
    deleteLesson,
    deleteCourse,
    updateCourseCover,
    toggleFavorite
  } = useLibraryStore()

  const { setHistoryModalOpen, includeHidden, toggleIncludeHidden } =
    useStudioStore()

  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)
  const [courseHierarchy, setCourseHierarchy] = useState<{
    course: Course
    modules: (Module & { lessons: Lesson[] })[]
  } | null>(null)
  const [isLoadingHierarchy, setIsLoadingHierarchy] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [filterType, setFilterType] = useState<'all' | 'favorites' | 'refs'>(
    'all'
  )

  const [editingCourseTitle, setEditingCourseTitle] = useState<string>('')
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null)
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null)
  const [expandedModules, setExpandedModules] = useState<
    Record<string, boolean>
  >({})
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  // Initial load: fetch courses and pick first one if none selected
  useEffect(() => {
    fetchCourses().catch(console.warn)
  }, [fetchCourses])

  useEffect(() => {
    if (courses.length > 0 && !selectedCourseId) {
      setSelectedCourseId(courses[0].id)
    }
  }, [courses, selectedCourseId])

  // Load hierarchy whenever selectedCourseId changes
  useEffect(() => {
    if (selectedCourseId) {
      loadHierarchy(selectedCourseId)
    } else {
      setCourseHierarchy(null)
    }
  }, [selectedCourseId])

  const loadHierarchy = async (courseId: string): Promise<void> => {
    setIsLoadingHierarchy(true)
    try {
      const res = await window.api.courses.getById(courseId)
      if (res) {
        setCourseHierarchy(res)
        setEditingCourseTitle(res.course.customTitle || res.course.title)
        // Expand all modules by default in Studio for easy organizing
        const initExpanded: Record<string, boolean> = {}
        res.modules.forEach((m) => {
          initExpanded[m.id] = true
        })
        setExpandedModules(initExpanded)
      }
    } catch (err) {
      console.warn('Failed to load course hierarchy in Studio:', err)
    } finally {
      setIsLoadingHierarchy(false)
    }
  }

  const showNotification = (msg: string): void => {
    setStatusMessage(msg)
    setTimeout(() => setStatusMessage(null), 2500)
  }

  const filteredCourses = useMemo(() => {
    return courses.filter((c) => {
      if (filterType === 'favorites' && !c.isFavorite) return false
      if (filterType === 'refs' && c.sourceType !== 'local-ref') return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = (c.customTitle || c.title).toLowerCase().includes(q)
        if (!matchTitle) return false
      }
      return true
    })
  }, [courses, filterType, searchQuery])

  const handleSaveCourseTitle = async (): Promise<void> => {
    if (!courseHierarchy || !editingCourseTitle.trim()) return
    await updateCourseMetadata(
      courseHierarchy.course.id,
      editingCourseTitle.trim()
    )
    showNotification('Título do curso salvo!')
    await loadHierarchy(courseHierarchy.course.id)
    await fetchCourses()
  }

  const handleSaveModuleTitle = async (
    moduleId: string,
    newTitle: string
  ): Promise<void> => {
    if (!newTitle.trim()) return
    await updateModuleMetadata(moduleId, newTitle.trim())
    setEditingModuleId(null)
    showNotification('Módulo atualizado!')
    if (courseHierarchy) await loadHierarchy(courseHierarchy.course.id)
  }

  const handleSaveLessonTitle = async (
    lessonId: string,
    newTitle: string
  ): Promise<void> => {
    if (!newTitle.trim()) return
    await updateLessonMetadata(lessonId, newTitle.trim())
    setEditingLessonId(null)
    showNotification('Aula atualizada!')
    if (courseHierarchy) await loadHierarchy(courseHierarchy.course.id)
  }

  const handleReorderModule = async (
    moduleId: string,
    direction: 'up' | 'down'
  ): Promise<void> => {
    await reorderModule(moduleId, direction)
    if (courseHierarchy) await loadHierarchy(courseHierarchy.course.id)
  }

  const handleReorderLesson = async (
    lessonId: string,
    direction: 'up' | 'down'
  ): Promise<void> => {
    await reorderLesson(lessonId, direction)
    if (courseHierarchy) await loadHierarchy(courseHierarchy.course.id)
  }

  const handleDeleteLesson = async (lessonId: string): Promise<void> => {
    if (
      !confirm(
        'Deseja remover esta aula da biblioteca? O arquivo físico não será apagado.'
      )
    )
      return
    const res = await deleteLesson(lessonId, false)
    if (res.success && courseHierarchy) {
      showNotification('Aula removida da biblioteca.')
      await loadHierarchy(courseHierarchy.course.id)
      await fetchCourses()
    }
  }

  const handleDeleteCourse = async (): Promise<void> => {
    if (!courseHierarchy) return
    if (
      !confirm(
        `Deseja remover o curso "${courseHierarchy.course.title}" da biblioteca? Seus arquivos em disco continuarão seguros.`
      )
    ) {
      return
    }
    const res = await deleteCourse(courseHierarchy.course.id, false)
    if (res.success) {
      showNotification('Curso removido da biblioteca.')
      setSelectedCourseId(null)
      await fetchCourses()
    }
  }

  const handleChangeCover = async (): Promise<void> => {
    if (!courseHierarchy) return
    const imagePath = await window.api.courses.selectCoverImage()
    if (imagePath) {
      await updateCourseCover(courseHierarchy.course.id, imagePath)
      showNotification('Capa do curso atualizada!')
      await loadHierarchy(courseHierarchy.course.id)
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

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full bg-background select-none overflow-hidden">
      {/* Top Header Bar */}
      <div className="p-4 border-b border-border/60 bg-card/50 backdrop-blur-md flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/25">
            <SlidersHorizontal className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <span>Library Studio — Organizador Visual de Cursos</span>
              <Badge
                variant="outline"
                className="text-[10px] font-mono border-primary/30 text-primary"
              >
                {courses.length} Cursos
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground">
              Edite nomes de cursos e aulas, reordene módulos e organize sua
              biblioteca visualmente sem alterar arquivos no disco.
            </p>
          </div>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-2">
          {statusMessage && (
            <div className="px-3 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-1.5 animate-in fade-in">
              <Check className="h-3.5 w-3.5" />
              <span>{statusMessage}</span>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={toggleIncludeHidden}
            className={`h-8 text-xs rounded-xl flex items-center gap-1.5 cursor-pointer ${
              includeHidden ? 'border-accent/50 bg-accent/10 text-accent' : ''
            }`}
          >
            {includeHidden ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
            <span>
              {includeHidden ? 'Exibindo Ocultos' : 'Mostrar Ocultos'}
            </span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setHistoryModalOpen(true)}
            className="h-8 text-xs rounded-xl flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <History className="h-3.5 w-3.5" />
            <span>Histórico</span>
          </Button>
        </div>
      </div>

      {/* Main Split Layout: Left Course Selector | Right Visual Studio */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT PANEL: Course Cards List */}
        <div className="w-80 sm:w-96 border-r border-border/60 bg-muted/10 flex flex-col shrink-0 overflow-hidden">
          {/* Search & Filters */}
          <div className="p-3 border-b border-border/40 space-y-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar cursos..."
                className="pl-8 h-8 text-xs bg-background/70 border-border/60 rounded-xl"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-muted/40'
                }`}
              >
                Todos ({courses.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('favorites')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                  filterType === 'favorites'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-muted/40'
                }`}
              >
                <Star className="h-3 w-3 fill-current" />
                <span>Favoritos</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterType('refs')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  filterType === 'refs'
                    ? 'bg-accent text-accent-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-muted/40'
                }`}
              >
                Referências
              </button>
            </div>
          </div>

          {/* Courses List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredCourses.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                Nenhum curso encontrado.
              </div>
            ) : (
              filteredCourses.map((c) => {
                const isSelected = selectedCourseId === c.id
                const displayTitle = c.customTitle || c.title

                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCourseId(c.id)}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-sm'
                        : 'border-border/40 bg-card/40 hover:bg-muted/30 hover:border-border/80'
                    }`}
                  >
                    {/* Course Thumbnail */}
                    <div className="w-16 h-10 shrink-0 rounded-lg overflow-hidden border border-border/40 bg-black/40 relative">
                      <CourseCover
                        src={c.coverPath}
                        title={displayTitle}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Course Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-foreground truncate flex-1">
                          {displayTitle}
                        </span>
                        {c.isFavorite && (
                          <Star className="h-3 w-3 fill-primary text-primary shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono mt-0.5">
                        <span>{c.moduleCount} mód.</span>
                        <span>•</span>
                        <span>{c.lessonCount} aulas</span>
                        <span>•</span>
                        <span>{formatDurationHuman(c.totalDuration)}</span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Visual Course Studio Canvas */}
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
          {!selectedCourseId || !courseHierarchy ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground space-y-3">
              <SlidersHorizontal className="h-12 w-12 text-muted-foreground/40 stroke-1" />
              <p className="text-sm font-medium">
                Selecione um curso ao lado para visualizar e organizar sua
                estrutura.
              </p>
            </div>
          ) : isLoadingHierarchy ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mb-3" />
              <p className="text-xs text-muted-foreground">
                Carregando estrutura visual do curso...
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Selected Course Header Banner */}
              <div className="p-5 border-b border-border/60 bg-muted/20 shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                  {/* Cover Artwork with Change Button */}
                  <div className="relative group/cover w-36 h-22 shrink-0 rounded-xl overflow-hidden border border-border/80 shadow-md bg-black/40">
                    <CourseCover
                      src={courseHierarchy.course.coverPath}
                      title={courseHierarchy.course.title}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={handleChangeCover}
                      className="absolute inset-0 bg-black/75 opacity-0 group-hover/cover:opacity-100 flex flex-col items-center justify-center gap-1 text-[11px] text-white font-medium transition-opacity cursor-pointer backdrop-blur-xs"
                    >
                      <ImageIcon className="h-4 w-4 text-primary" />
                      <span>Trocar Capa</span>
                    </button>
                  </div>

                  {/* Course Details & Title Edit */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-primary font-mono">
                          Curso Selecionado
                        </span>
                        {courseHierarchy.course.sourceType === 'local-ref' && (
                          <Badge
                            variant="outline"
                            className="text-[10px] py-0 px-1.5 border-primary/30 text-primary"
                          >
                            Referência Externa
                          </Badge>
                        )}
                      </div>

                      {/* Course Options */}
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            toggleFavorite(courseHierarchy.course.id)
                          }
                          className={`h-7 px-2 text-xs rounded-lg ${
                            courseHierarchy.course.isFavorite
                              ? 'text-primary'
                              : 'text-muted-foreground'
                          }`}
                        >
                          <Star
                            className={`h-3.5 w-3.5 mr-1 ${courseHierarchy.course.isFavorite ? 'fill-current' : ''}`}
                          />
                          <span>
                            {courseHierarchy.course.isFavorite
                              ? 'Favoritado'
                              : 'Favoritar'}
                          </span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleDeleteCourse}
                          className="h-7 px-2 text-xs rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          <span>Excluir Curso</span>
                        </Button>
                      </div>
                    </div>

                    {/* Inline Title Input */}
                    <div className="flex items-center gap-2">
                      <Input
                        value={editingCourseTitle}
                        onChange={(e) => setEditingCourseTitle(e.target.value)}
                        onBlur={handleSaveCourseTitle}
                        onKeyDown={(e) =>
                          e.key === 'Enter' && handleSaveCourseTitle()
                        }
                        placeholder="Nome do Curso..."
                        className="text-base font-bold text-foreground bg-background/90 border-border/80 h-9 rounded-xl focus-visible:ring-1 focus-visible:ring-primary"
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

                    {/* Stats */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 font-mono">
                        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                        {courseHierarchy.modules.length} módulo(s)
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-mono">
                        <Film className="h-3.5 w-3.5 text-muted-foreground" />
                        {courseHierarchy.course.lessonCount} aula(s)
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        {formatDurationHuman(
                          courseHierarchy.course.totalDuration
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modules & Lessons Interactive Canvas */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Módulos e Aulas do Curso (Clique em qualquer título para
                    editar)
                  </h3>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const allOpen: Record<string, boolean> = {}
                        courseHierarchy.modules.forEach(
                          (m) => (allOpen[m.id] = true)
                        )
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

                {courseHierarchy.modules.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-border/60 rounded-xl">
                    <p className="text-sm text-muted-foreground">
                      Nenhum módulo encontrado neste curso.
                    </p>
                  </div>
                ) : (
                  courseHierarchy.modules.map((mod, modIdx) => {
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
                                    handleSaveModuleTitle(
                                      mod.id,
                                      e.target.value
                                    )
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter')
                                      handleSaveModuleTitle(
                                        mod.id,
                                        e.currentTarget.value
                                      )
                                    if (e.key === 'Escape')
                                      setEditingModuleId(null)
                                  }}
                                  className="h-7 text-xs font-semibold bg-background py-1 px-2 rounded-lg"
                                />
                              </div>
                            ) : (
                              <span
                                className="text-xs font-bold text-foreground truncate hover:text-primary transition-colors cursor-text"
                                title="Clique para renomear módulo"
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
                              title="Mover Módulo para Cima"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              disabled={
                                modIdx === courseHierarchy.modules.length - 1
                              }
                              onClick={() =>
                                handleReorderModule(mod.id, 'down')
                              }
                              className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30 rounded-lg"
                              title="Mover Módulo para Baixo"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Lessons in Module */}
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
                                          onClick={() =>
                                            setEditingLessonId(les.id)
                                          }
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

                                    {/* Actions: Reorder & Delete */}
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
                                        disabled={
                                          lesIdx === mod.lessons.length - 1
                                        }
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
                                        onClick={() =>
                                          handleDeleteLesson(les.id)
                                        }
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
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
