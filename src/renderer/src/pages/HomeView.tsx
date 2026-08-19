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
  Sparkles
} from 'lucide-react'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useVaultStore } from '../stores/useVaultStore'
import { useNavigationStore } from '../stores/useNavigationStore'
import { Button, Skeleton } from '../components/ui'
import { CourseCard, ContinueWatchingRail, MergeCoursesModal } from '../components/library'
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
    isLoading
  } = useLibraryStore()
  const { currentVault } = useVaultStore()
  const { setImportModalOpen, setVaultModalOpen } = useNavigationStore()
  const [isMergeModalOpen, setIsMergeModalOpen] = useState<boolean>(false)

  useEffect(() => {
    if (currentVault) {
      fetchCourses().catch(console.warn)
    }
  }, [currentVault, fetchCourses])

  // Compute counts for filter pills
  const counts = useMemo(() => {
    let inProgress = 0
    let completed = 0
    let favorites = 0

    for (const course of courses) {
      if (course.isFavorite) {
        favorites++
      }
      const summary = progressSummaries[course.id]
      if (summary) {
        if (summary.percentage >= 100) {
          completed++
        } else if (summary.percentage > 0) {
          inProgress++
        }
      }
    }

    return {
      all: courses.length,
      in_progress: inProgress,
      completed,
      favorites
    }
  }, [courses, progressSummaries])

  // Filter courses according to searchQuery AND filterStatus
  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      // 1. Text Search Filter (Diacritic & Case Insensitive)
      if (searchQuery.trim()) {
        const matches = matchesAnyField([course.title, course.description], searchQuery)
        if (!matches) return false
      }

      // 2. Status Filter
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

  // If no vault is opened
  if (!currentVault) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl p-3 bg-gradient-to-br from-orange-500/20 via-purple-600/15 to-blue-600/10 border border-border shadow-xl shadow-orange-500/10 mb-6 animate-float">
          <img src={appLogo} alt="Orbia" className="h-full w-full object-contain drop-shadow" />
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
            className="gap-2 shadow-lg shadow-orange-500/20 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-white font-semibold rounded-xl hover:opacity-95 active:scale-[0.98] transition-all min-h-[40px]"
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
    <div className="container mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-8 animate-in fade-in duration-200">
      {/* Continue Watching Horizontal Rail (when not searching) */}
      {!searchQuery && (
        <ContinueWatchingRail isLoading={isLoading} />
      )}

      {/* Search Query Feedback Banner */}
      {searchQuery && (
        <div className="flex items-center justify-between p-3.5 rounded-2xl border border-primary/40 bg-primary/10 text-xs text-foreground shadow-sm animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <Search className="h-3.5 w-3.5" />
            </div>
            <span>
              Showing results for &ldquo;<strong className="text-primary">{searchQuery}</strong>&rdquo; (
              {filteredCourses.length} {filteredCourses.length === 1 ? 'course' : 'courses'} found)
            </span>
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setSearchQuery('')}
            className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-primary/20 rounded-lg cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            <span>Clear search</span>
          </Button>
        </div>
      )}

      {/* Courses Section Header & Actions */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                {t('home.allCourses')}
              </h2>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-muted-foreground border border-border/60">
                {isLoading ? '...' : filteredCourses.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {courses.length} {courses.length === 1 ? 'course' : 'courses'} in study library
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsMergeModalOpen(true)}
              className="gap-1.5 text-xs rounded-xl border-border/80 bg-card hover:border-primary/40 hover:bg-secondary/70 shadow-sm cursor-pointer focus-visible:ring-2 focus-visible:ring-primary min-h-[36px]"
              title="Organizar e unir cursos com partes separadas"
            >
              <Sparkles className="h-4 w-4 text-amber-400" />
              <span>{t('home.organizeAndMerge', 'Organizar & Unir')}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportModalOpen(true)}
              className="gap-1.5 text-xs rounded-xl border-border/80 bg-card hover:border-primary/40 hover:bg-secondary/70 shadow-sm cursor-pointer focus-visible:ring-2 focus-visible:ring-primary min-h-[36px]"
            >
              <FolderPlus className="h-4 w-4 text-primary" />
              <span>{t('nav.importCourse')}</span>
            </Button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1" role="tablist" aria-label="Course status filters">
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
                className={`group flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer border select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[36px] active:scale-95 ${
                  isActive
                    ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-orange-500/25'
                    : 'bg-card/90 text-muted-foreground hover:text-foreground hover:bg-secondary/80 border-border/80 hover:border-border'
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-110 ${
                    isActive
                      ? tab.id === 'favorites'
                        ? 'fill-amber-300 text-amber-300'
                        : 'text-primary-foreground'
                      : tab.id === 'favorites' && tab.count > 0
                        ? 'text-amber-400'
                        : 'text-muted-foreground'
                  }`}
                />
                <span>{tab.label}</span>
                <span
                  className={`ml-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isActive
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-secondary text-muted-foreground group-hover:text-foreground'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Course List / Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5" aria-label="Loading courses">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div
              key={n}
              className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-0 shadow-sm"
            >
              <Skeleton className="aspect-video w-full rounded-none" />
              <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-5/6 rounded-md" />
                  <Skeleton className="h-3 w-3/5 rounded-md" />
                </div>
                <div className="pt-2 border-t border-border/40 flex items-center justify-between">
                  <Skeleton className="h-3 w-24 rounded-md" />
                  <Skeleton className="h-3 w-12 rounded-md" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredCourses.length === 0 ? (
        /* Animated Empty State with Ambient Aura */
        <div className="relative overflow-hidden flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/80 p-12 text-center bg-card/30 space-y-5">
          {/* Subtle Ambient Cosmic Aura */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-orange-500/10 via-purple-600/5 to-transparent pointer-events-none" />

          <div className="relative flex h-18 w-18 items-center justify-center rounded-2xl bg-gradient-to-br from-secondary via-secondary/80 to-card border border-border shadow-xl shadow-orange-500/5 text-muted-foreground animate-float">
            {searchQuery ? (
              <Search className="h-8 w-8 text-primary" />
            ) : filterStatus === 'favorites' ? (
              <Star className="h-8 w-8 text-amber-400 fill-amber-400/40" />
            ) : filterStatus === 'in_progress' ? (
              <Clock className="h-8 w-8 text-orange-400" />
            ) : filterStatus === 'completed' ? (
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            ) : (
              <BookOpen className="h-8 w-8 text-primary" />
            )}
          </div>

          <div className="relative space-y-1.5 max-w-md">
            <h3 className="text-lg font-bold text-foreground">
              {searchQuery
                ? 'No matching courses found'
                : filterStatus === 'favorites'
                  ? 'No favorite courses yet'
                  : filterStatus === 'in_progress'
                    ? 'No courses in progress'
                    : filterStatus === 'completed'
                      ? 'No completed courses yet'
                      : t('home.emptyTitle')}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {searchQuery
                ? `No courses matched your query "${searchQuery}". Try a different keyword.`
                : filterStatus === 'favorites'
                  ? 'Click the star icon on any course card to add it to your favorites list.'
                  : filterStatus === 'in_progress'
                    ? 'Start watching lessons to track your in-progress courses here.'
                    : filterStatus === 'completed'
                      ? 'Finish 100% of the lessons in a course to see it here.'
                      : t('home.emptySubtitle')}
            </p>
          </div>

          <div className="relative pt-1">
            {searchQuery ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchQuery('')}
                className="rounded-xl text-xs gap-1.5 cursor-pointer shadow-sm min-h-[36px]"
              >
                <X className="h-3.5 w-3.5" />
                <span>Clear search</span>
              </Button>
            ) : filterStatus !== 'all' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilterStatus('all')}
                className="rounded-xl text-xs gap-1.5 cursor-pointer shadow-sm hover:border-primary/50 min-h-[36px]"
              >
                <Layers className="h-3.5 w-3.5 text-primary" />
                <span>Show all courses</span>
              </Button>
            ) : (
              <Button
                onClick={() => setImportModalOpen(true)}
                className="gap-2 shadow-lg shadow-orange-500/20 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-white font-semibold rounded-xl cursor-pointer hover:opacity-95 active:scale-[0.98] transition-all min-h-[40px]"
              >
                <FolderPlus className="h-4 w-4" />
                <span>{t('home.importFirstCourse')}</span>
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredCourses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}

      {/* Merge & Organize Duplicate Courses Modal */}
      <MergeCoursesModal
        open={isMergeModalOpen}
        onOpenChange={setIsMergeModalOpen}
      />
    </div>
  )
}
