import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BookOpen,
  FolderPlus,
  Search,
  X,
  Layers,
  Clock,
  CheckCircle2,
  Star,
  Sparkles,
  Zap,
  GitMerge,
  SlidersHorizontal,
  History
} from 'lucide-react'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useVaultStore } from '../stores/useVaultStore'
import { useNavigationStore } from '../stores/useNavigationStore'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useReviewStore } from '../stores/useReviewStore'
import { useStudioStore } from '../stores/useStudioStore'
import { Button, Skeleton } from '../components/ui'
import {
  ContinueWatchingRail,
  LibraryCourseSelectionBar,
  LibraryCourseSelectionPanel,
  MergeCoursesModal,
  QuickCourseOrganizerModal
} from '../components/library'
import { StreamingHero, MediaRail, MediaCard } from '../components/streaming'
import { matchesAnyField } from '../lib/search-utils'
import appLogo from '../assets/icon.png'

export function HomeView(): React.JSX.Element {
  const { t } = useTranslation()
  const {
    courses,
    progressSummaries,
    searchQuery,
    setSearchQuery,
    filterStatus,
    setFilterStatus,
    fetchCourses,
    toggleFavorite,
    isLoading
  } = useLibraryStore()
  const { currentVault } = useVaultStore()
  const {
    setImportModalOpen,
    setVaultModalOpen,
    navigateToPlayer,
    navigateToCourse,
    navigateToReview
  } = useNavigationStore()
  const { loadHierarchy } = usePlayerStore()
  const { setHistoryModalOpen } = useStudioStore()
  const {
    dueFlashcards,
    recentBookmarks,
    fetchDueFlashcards,
    fetchRecentBookmarks,
    fetchStudyQueue
  } = useReviewStore()
  const [isMergeModalOpen, setIsMergeModalOpen] = useState<boolean>(false)
  const [mergeModalStartScreen, setMergeModalStartScreen] = useState<
    'options' | 'manual'
  >('options')
  const [organizeCourseId, setOrganizeCourseId] = useState<string | null>(null)
  const [isLibrarySelectionMode, setIsLibrarySelectionMode] =
    useState<boolean>(false)
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(
    () => new Set()
  )

  useEffect(() => {
    if (currentVault) {
      fetchCourses().catch(console.warn)
      fetchDueFlashcards().catch(console.warn)
      fetchRecentBookmarks().catch(console.warn)
      fetchStudyQueue().catch(console.warn)
    }
  }, [
    currentVault,
    fetchCourses,
    fetchDueFlashcards,
    fetchRecentBookmarks,
    fetchStudyQueue
  ])

  useEffect(() => {
    const availableIds = new Set(courses.map((course) => course.id))
    setSelectedCourseIds((current) => {
      const next = new Set(
        [...current].filter((courseId) => availableIds.has(courseId))
      )
      return next.size === current.size ? current : next
    })
  }, [courses])

  const selectedCourses = useMemo(() => {
    const selectedIds = selectedCourseIds
    return courses.filter((course) => selectedIds.has(course.id))
  }, [courses, selectedCourseIds])

  const handleToggleSelectionMode = (): void => {
    if (isLibrarySelectionMode) {
      setSelectedCourseIds(new Set())
    }
    setIsLibrarySelectionMode((current) => !current)
  }

  const handleToggleCourseSelection = (courseId: string): void => {
    setSelectedCourseIds((current) => {
      const next = new Set(current)
      if (next.has(courseId)) {
        next.delete(courseId)
      } else {
        next.add(courseId)
      }
      return next
    })
  }

  const handleLibraryCourseClick = (courseId: string): void => {
    if (isLibrarySelectionMode) {
      handleToggleCourseSelection(courseId)
      return
    }
    navigateToCourse(courseId)
  }

  const clearCourseSelection = (): void => {
    setSelectedCourseIds(new Set())
  }

  const openMergeModal = (): void => {
    setMergeModalStartScreen(selectedCourseIds.size >= 2 ? 'manual' : 'options')
    setIsMergeModalOpen(true)
  }

  const handleMergeModalOpenChange = (open: boolean): void => {
    setIsMergeModalOpen(open)
    if (!open) {
      clearCourseSelection()
      setIsLibrarySelectionMode(false)
    }
  }

  // Hero: top most recently played in-progress course, or top favorite, or first course
  const heroCourse = useMemo(() => {
    if (searchQuery || courses.length === 0) return null

    // 1. In-progress courses sorted by last played
    const inProgress = courses
      .map((course) => ({ course, summary: progressSummaries[course.id] }))
      .filter(
        (item) =>
          item.summary &&
          item.summary.percentage > 0 &&
          item.summary.percentage < 100
      )
      .sort(
        (a, b) =>
          (b.summary?.lastPlayedAt || 0) - (a.summary?.lastPlayedAt || 0)
      )

    if (inProgress.length > 0) {
      return inProgress[0]
    }

    // 2. Favorite courses
    const favorites = courses.filter((c) => c.isFavorite)
    if (favorites.length > 0) {
      return {
        course: favorites[0],
        summary: progressSummaries[favorites[0].id] || null
      }
    }

    // 3. First course
    return {
      course: courses[0],
      summary: progressSummaries[courses[0].id] || null
    }
  }, [courses, progressSummaries, searchQuery])

  const handleHeroResume = async (): Promise<void> => {
    if (!heroCourse) return
    const course = heroCourse.course
    const summary = heroCourse.summary
    try {
      const data = await window.api.courses.getById(course.id)
      if (data) {
        const targetLessonId =
          summary?.lastPlayedLessonId || data.modules[0]?.lessons[0]?.id
        await loadHierarchy(data.course, data.modules, targetLessonId)
        navigateToPlayer(course.id)
      }
    } catch (err) {
      console.error('Failed to resume hero course:', err)
    }
  }

  // Quick Play handler for any course
  const handleQuickPlayCourse = async (courseId: string): Promise<void> => {
    try {
      const data = await window.api.courses.getById(courseId)
      if (data) {
        const summary = progressSummaries[courseId]
        const targetLessonId =
          summary?.lastPlayedLessonId || data.modules[0]?.lessons[0]?.id
        await loadHierarchy(data.course, data.modules, targetLessonId)
        navigateToPlayer(courseId)
      }
    } catch (err) {
      console.error('Failed to play course:', err)
    }
  }

  // Thematic Rails Data
  // 1. My List / Favorites & Study Queue
  const myListCourses = useMemo(() => {
    return courses.filter((c) => c.isFavorite)
  }, [courses])

  // 2. Quick Courses (< 3 hours total)
  const quickCourses = useMemo(() => {
    return courses
      .filter((c) => c.totalDuration > 0 && c.totalDuration <= 3 * 3600)
      .sort((a, b) => a.totalDuration - b.totalDuration)
  }, [courses])

  // 3. Recently Added Courses
  const recentCourses = useMemo(() => {
    return [...courses]
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 10)
  }, [courses])

  // Filter courses according to searchQuery AND filterStatus
  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      if (searchQuery.trim()) {
        const matches = matchesAnyField(
          [course.title, course.description],
          searchQuery
        )
        if (!matches) return false
      }

      const summary = progressSummaries[course.id]
      const percentage = summary?.percentage || 0

      if (filterStatus === 'in_progress') {
        return percentage > 0 && percentage < 100
      }
      if (filterStatus === 'completed') {
        return percentage >= 100
      }
      if (filterStatus === 'favorites') {
        return Boolean(course.isFavorite)
      }

      return true
    })
  }, [courses, progressSummaries, searchQuery, filterStatus])

  // Filter counts
  const counts = useMemo(() => {
    let inProgress = 0
    let completed = 0
    let favorites = 0

    for (const course of courses) {
      if (course.isFavorite) favorites++
      const summary = progressSummaries[course.id]
      if (summary) {
        if (summary.percentage >= 100) completed++
        else if (summary.percentage > 0) inProgress++
      }
    }

    return {
      all: courses.length,
      in_progress: inProgress,
      completed,
      favorites
    }
  }, [courses, progressSummaries])

  // If no vault is opened
  if (!currentVault) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl p-3 bg-primary/10 border border-primary/30 shadow-xl shadow-primary/10 mb-6">
          <img
            src={appLogo}
            alt="Orbia"
            className="h-full w-full object-contain drop-shadow"
          />
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl mb-2">
          {t('vault.title')}
        </h2>
        <p className="max-w-md text-sm text-muted-foreground mb-6 leading-relaxed">
          {t('vault.subtitle')}
        </p>
        <div className="flex gap-3">
          <Button
            onClick={() => setVaultModalOpen(true)}
            size="lg"
            className="gap-2 shadow-lg shadow-primary/20 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-95 active:scale-[0.98] transition-all min-h-[40px] cursor-pointer"
          >
            <BookOpen className="h-4 w-4" />
            <span>{t('vault.createNew')}</span>
          </Button>
        </div>
      </div>
    )
  }

  const filterTabs = [
    {
      id: 'all' as const,
      label: t('home.filters.all', 'Todos'),
      count: counts.all,
      icon: Layers
    },
    {
      id: 'in_progress' as const,
      label: t('home.filters.inProgress', 'Em Andamento'),
      count: counts.in_progress,
      icon: Clock
    },
    {
      id: 'completed' as const,
      label: t('home.filters.completed', 'Concluídos'),
      count: counts.completed,
      icon: CheckCircle2
    },
    {
      id: 'favorites' as const,
      label: t('home.filters.favorites', 'Favoritos'),
      count: counts.favorites,
      icon: Star
    }
  ]

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-9 animate-in fade-in duration-200">
      {/* 🎬 1. Streaming Hero Spotlight (when not searching) */}
      {!searchQuery && heroCourse && !isLoading && (
        <StreamingHero
          course={heroCourse.course}
          summary={heroCourse.summary}
          onPlay={handleHeroResume}
          onViewDetails={() => navigateToCourse(heroCourse.course.id)}
          onToggleFavorite={() =>
            toggleFavorite(heroCourse.course.id).catch(console.warn)
          }
        />
      )}

      {/* 🎞️ 2. Continue Watching Rail (when not searching) */}
      {!searchQuery && <ContinueWatchingRail isLoading={isLoading} />}

      {/* ⭐ 3. Rail: Minha Lista / Favoritos (when not searching and has favorites) */}
      {!searchQuery && myListCourses.length > 0 && !isLoading && (
        <MediaRail
          title="Minha Lista"
          subtitle="Cursos que você marcou como favoritos"
          icon={<Star className="h-4 w-4 text-primary fill-primary" />}
          count={myListCourses.length}
        >
          {myListCourses.map((course) => {
            const summary = progressSummaries[course.id]
            return (
              <div
                key={course.id}
                className="w-[260px] sm:w-[290px] shrink-0 snap-start"
              >
                <MediaCard
                  id={course.id}
                  title={course.title}
                  subtitle={`${course.moduleCount} Módulos • ${course.lessonCount} Aulas`}
                  coverPath={course.coverPath}
                  duration={course.totalDuration}
                  progressPercentage={summary?.percentage || 0}
                  isCompleted={summary ? summary.percentage >= 100 : false}
                  isFavorite={course.isFavorite}
                  badge={course.sourceType === 'local-ref' ? 'Ref' : undefined}
                  onPlay={() => handleQuickPlayCourse(course.id)}
                  onClick={() => navigateToCourse(course.id)}
                  onToggleFavorite={() =>
                    toggleFavorite(course.id).catch(console.warn)
                  }
                  onMoreInfo={() => navigateToCourse(course.id)}
                  onOrganize={() => setOrganizeCourseId(course.id)}
                />
              </div>
            )
          })}
        </MediaRail>
      )}

      {/* ⚡ 4. Rail: Cursos Rápidos (< 3h) (when not searching and available) */}
      {!searchQuery && quickCourses.length > 0 && !isLoading && (
        <MediaRail
          title="Cursos Rápidos"
          subtitle="Conteúdos compactos com menos de 3 horas de duração"
          icon={<Zap className="h-4 w-4 text-primary" />}
          count={quickCourses.length}
        >
          {quickCourses.map((course) => {
            const summary = progressSummaries[course.id]
            return (
              <div
                key={course.id}
                className="w-[260px] sm:w-[290px] shrink-0 snap-start"
              >
                <MediaCard
                  id={course.id}
                  title={course.title}
                  subtitle={`${course.lessonCount} Aulas`}
                  coverPath={course.coverPath}
                  duration={course.totalDuration}
                  progressPercentage={summary?.percentage || 0}
                  isCompleted={summary ? summary.percentage >= 100 : false}
                  isFavorite={course.isFavorite}
                  onPlay={() => handleQuickPlayCourse(course.id)}
                  onClick={() => navigateToCourse(course.id)}
                  onToggleFavorite={() =>
                    toggleFavorite(course.id).catch(console.warn)
                  }
                  onMoreInfo={() => navigateToCourse(course.id)}
                  onOrganize={() => setOrganizeCourseId(course.id)}
                />
              </div>
            )
          })}
        </MediaRail>
      )}

      {/* 🆕 5. Rail: Adicionados Recentemente (when not searching) */}
      {!searchQuery && recentCourses.length > 3 && !isLoading && (
        <MediaRail
          title="Adicionados Recentemente"
          subtitle="Últimos cursos catalogados no seu Vault"
          icon={<Sparkles className="h-4 w-4 text-accent" />}
          count={recentCourses.length}
        >
          {recentCourses.map((course) => {
            const summary = progressSummaries[course.id]
            return (
              <div
                key={course.id}
                className="w-[260px] sm:w-[290px] shrink-0 snap-start"
              >
                <MediaCard
                  id={course.id}
                  title={course.title}
                  subtitle={`${course.moduleCount} Módulos • ${course.lessonCount} Aulas`}
                  coverPath={course.coverPath}
                  duration={course.totalDuration}
                  progressPercentage={summary?.percentage || 0}
                  isCompleted={summary ? summary.percentage >= 100 : false}
                  isFavorite={course.isFavorite}
                  onPlay={() => handleQuickPlayCourse(course.id)}
                  onClick={() => navigateToCourse(course.id)}
                  onToggleFavorite={() =>
                    toggleFavorite(course.id).catch(console.warn)
                  }
                  onMoreInfo={() => navigateToCourse(course.id)}
                  onOrganize={() => setOrganizeCourseId(course.id)}
                />
              </div>
            )
          })}
        </MediaRail>
      )}

      {/* Revisar Hoje Banner (v0.3 - Subtle & Compact) */}
      {!searchQuery &&
        (dueFlashcards.length > 0 || recentBookmarks.length > 0) && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-accent/25 bg-accent/10 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/20 text-accent border border-accent/30 shrink-0">
                <Sparkles className="h-4.5 w-4.5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-foreground flex items-center gap-2">
                  <span>{t('review.todaySectionTitle', 'Revisar Hoje')}</span>
                  {dueFlashcards.length > 0 && (
                    <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-accent/20 text-accent font-bold">
                      {dueFlashcards.length}{' '}
                      {dueFlashcards.length === 1
                        ? 'card pendente'
                        : 'cards pendentes'}
                    </span>
                  )}
                  {recentBookmarks.length > 0 && (
                    <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-primary/20 text-primary font-bold">
                      {recentBookmarks.length}{' '}
                      {recentBookmarks.length === 1 ? 'marcador' : 'marcadores'}
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {t(
                    'review.todaySectionSubtitle',
                    'Revise seus flashcards espaçados ou continue a partir de um trecho salvo.'
                  )}
                </p>
              </div>
            </div>

            <Button
              size="sm"
              onClick={navigateToReview}
              className="gap-1.5 bg-accent hover:bg-accent text-accent-foreground text-xs font-semibold rounded-xl self-end sm:self-center shrink-0 cursor-pointer"
            >
              <span>{t('review.openReviewCenter', 'Começar Revisão')}</span>
            </Button>
          </div>
        )}

      {/* Search Query Feedback Banner */}
      {searchQuery && (
        <div className="flex items-center justify-between p-3.5 rounded-2xl border border-primary/40 bg-primary/10 text-xs text-foreground shadow-sm animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <Search className="h-3.5 w-3.5" />
            </div>
            <span>
              {t('home.searchResults', {
                count: filteredCourses.length,
                query: searchQuery
              })}
            </span>
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setSearchQuery('')}
            className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-primary/20 rounded-lg cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            <span>{t('home.clearSearch', 'Limpar busca')}</span>
          </Button>
        </div>
      )}

      {/* 📚 6. All Courses Library Grid */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                {t('home.allCourses', 'Biblioteca de Cursos')}
              </h2>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-muted-foreground border border-border/60">
                {isLoading ? '...' : filteredCourses.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('home.coursesInLibrary', { count: courses.length })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <Button
              size="sm"
              onClick={openMergeModal}
              className="gap-1.5 rounded-xl bg-primary text-xs font-bold text-primary-foreground shadow-md shadow-primary/15 transition-all hover:opacity-95 cursor-pointer min-h-[36px]"
              title="Unir cursos"
            >
              <GitMerge className="h-4 w-4" />
              <span>{t('home.mergeCourses', 'Unir cursos')}</span>
            </Button>

            <Button
              variant={isLibrarySelectionMode ? 'secondary' : 'outline'}
              size="sm"
              onClick={handleToggleSelectionMode}
              className="gap-1.5 rounded-xl border-primary/30 text-xs font-semibold text-primary hover:bg-primary/10 hover:text-primary cursor-pointer min-h-[36px]"
              title="Selecionar cursos para organizar"
              aria-pressed={isLibrarySelectionMode}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>
                {isLibrarySelectionMode
                  ? t('home.finishOrganization', 'Concluir seleção')
                  : t('home.organizeLibrary', 'Organizar biblioteca')}
              </span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHistoryModalOpen(true)}
              className="gap-1.5 rounded-xl text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground cursor-pointer min-h-[36px]"
              title="Histórico de organização"
            >
              <History className="h-4 w-4" />
              <span>{t('home.organizationHistory', 'Histórico')}</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setImportModalOpen(true)}
              className="gap-1.5 text-xs rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 cursor-pointer min-h-[36px]"
            >
              <FolderPlus className="h-4 w-4 text-primary" />
              <span>{t('nav.importCourse', 'Importar Curso')}</span>
            </Button>
          </div>
        </div>

        {/* Filter Pills */}
        <div
          className="flex flex-wrap items-center gap-2 pt-1"
          role="tablist"
          aria-label="Course status filters"
        >
          {filterTabs.map((tab) => {
            const Icon = tab.icon
            const isActive = filterStatus === tab.id

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setFilterStatus(tab.id)}
                className={`group flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer border select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[32px] active:scale-95 ${
                  isActive
                    ? 'bg-primary/15 text-primary border-primary/60 shadow-xs'
                    : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-white/5 border-transparent'
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-110 ${
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  }`}
                />
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] font-mono rounded-full px-1.5 py-0.2 ${
                    isActive
                      ? 'bg-primary/25 text-primary font-bold'
                      : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>

        {isLibrarySelectionMode && (
          <div
            role="status"
            className="flex flex-col gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-2 text-foreground">
              <SlidersHorizontal className="h-4 w-4 shrink-0 text-primary" />
              <span>
                {t(
                  'home.organizationModeHint',
                  'Modo de organização ativo: clique nos cursos para selecioná-los e revise a lista ao lado.'
                )}
              </span>
            </div>
            <span className="shrink-0 font-semibold text-primary">
              {selectedCourses.length}{' '}
              {selectedCourses.length === 1
                ? t('home.selectedCourse', 'selecionado')
                : t('home.selectedCourses', 'selecionados')}
            </span>
          </div>
        )}

        {/* Course Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <div key={n} className="space-y-2">
                <Skeleton className="aspect-video w-full rounded-xl" />
                <Skeleton className="h-4 w-3/4 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
            ))}
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 p-12 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <h3 className="text-base font-bold text-foreground">
              {searchQuery
                ? 'Nenhum curso encontrado'
                : t('home.emptyTitle', 'Nenhum curso catalogado')}
            </h3>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground leading-relaxed">
              {searchQuery
                ? `Nenhum curso corresponde à busca "${searchQuery}". Tente outros termos.`
                : t(
                    'home.emptySubtitle',
                    'Comece importando pastas ou arquivos .zip de cursos para o seu Vault.'
                  )}
            </p>
            {!searchQuery && (
              <Button
                onClick={() => setImportModalOpen(true)}
                className="mt-5 gap-2 bg-primary text-primary-foreground font-bold rounded-xl shadow-md cursor-pointer"
              >
                <FolderPlus className="h-4 w-4" />
                <span>{t('nav.importCourse', 'Importar Curso')}</span>
              </Button>
            )}
          </div>
        ) : (
          <div
            className={`grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] ${
              isLibrarySelectionMode && selectedCourses.length > 0
                ? 'pb-24'
                : ''
            }`}
          >
            <div className="min-w-0">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredCourses.map((course) => {
                  const summary = progressSummaries[course.id]
                  return (
                    <MediaCard
                      key={course.id}
                      id={course.id}
                      title={course.title}
                      subtitle={`${course.moduleCount} Módulos • ${course.lessonCount} Aulas`}
                      coverPath={course.coverPath}
                      duration={course.totalDuration}
                      progressPercentage={summary?.percentage || 0}
                      isCompleted={summary ? summary.percentage >= 100 : false}
                      isFavorite={course.isFavorite}
                      badge={
                        course.sourceType === 'local-ref' ? 'Ref' : undefined
                      }
                      selectionMode={isLibrarySelectionMode}
                      isSelected={selectedCourseIds.has(course.id)}
                      onToggleSelection={() =>
                        handleToggleCourseSelection(course.id)
                      }
                      onPlay={() => handleQuickPlayCourse(course.id)}
                      onClick={() => handleLibraryCourseClick(course.id)}
                      onToggleFavorite={() =>
                        toggleFavorite(course.id).catch(console.warn)
                      }
                      onMoreInfo={() => navigateToCourse(course.id)}
                      onOrganize={() => setOrganizeCourseId(course.id)}
                    />
                  )
                })}
              </div>
            </div>

            {isLibrarySelectionMode && (
              <LibraryCourseSelectionPanel
                courses={selectedCourses}
                onRemove={handleToggleCourseSelection}
                onClear={clearCourseSelection}
                onOpenMerge={openMergeModal}
              />
            )}
          </div>
        )}
      </div>

      {isLibrarySelectionMode && selectedCourses.length > 0 && (
        <LibraryCourseSelectionBar
          selectedCount={selectedCourses.length}
          onClear={clearCourseSelection}
          onOpenMerge={openMergeModal}
        />
      )}

      {/* Merge Courses Modal */}
      {isMergeModalOpen && (
        <MergeCoursesModal
          open={isMergeModalOpen}
          onOpenChange={handleMergeModalOpenChange}
          initialScreen={mergeModalStartScreen}
          initialSelectedCourseIds={[...selectedCourseIds]}
        />
      )}

      {/* Quick Course Organizer Modal directly on Library */}
      <QuickCourseOrganizerModal
        courseId={organizeCourseId}
        open={Boolean(organizeCourseId)}
        onOpenChange={(open) => !open && setOrganizeCourseId(null)}
      />
    </div>
  )
}
