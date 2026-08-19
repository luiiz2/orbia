import React, { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BookOpen,
  FolderPlus,
  Search,
  X,
  Layers,
  Clock,
  CheckCircle2,
  Star
} from 'lucide-react'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useVaultStore } from '../stores/useVaultStore'
import { useNavigationStore } from '../stores/useNavigationStore'
import { Button } from '../components/ui/button'
import { CourseCard } from '../components/library/CourseCard'
import { ContinueWatchingRail } from '../components/library/ContinueWatchingRail'
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
      // 1. Text Search Filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matches =
          course.title.toLowerCase().includes(query) ||
          (course.description && course.description.toLowerCase().includes(query))
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
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl p-3 bg-gradient-to-br from-orange-500/20 via-purple-600/15 to-blue-600/10 border border-border shadow-xl shadow-orange-500/10 mb-6">
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
            className="gap-2 shadow-lg shadow-orange-500/20 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-white font-semibold rounded-xl"
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
      {!searchQuery && <ContinueWatchingRail />}

      {/* Search Query Feedback Banner */}
      {searchQuery && (
        <div className="flex items-center justify-between p-3 rounded-xl border border-primary/30 bg-primary/10 text-xs text-foreground">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            <span>
              Showing results for &ldquo;<strong>{searchQuery}</strong>&rdquo; (
              {filteredCourses.length} {filteredCourses.length === 1 ? 'course' : 'courses'} found)
            </span>
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setSearchQuery('')}
            className="h-6 gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
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
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-muted-foreground border border-border/60">
                {filteredCourses.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {courses.length} {courses.length === 1 ? 'course' : 'courses'} in study library
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportModalOpen(true)}
            className="gap-1.5 text-xs rounded-xl border-border/80 bg-card hover:border-primary/40 hover:bg-secondary/70 shadow-sm self-start sm:self-auto cursor-pointer"
          >
            <FolderPlus className="h-3.5 w-3.5 text-primary" />
            <span>{t('nav.importCourse')}</span>
          </Button>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {filterTabs.map((tab) => {
            const Icon = tab.icon
            const isActive = filterStatus === tab.id

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterStatus(tab.id)}
                className={`group flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer border ${
                  isActive
                    ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20'
                    : 'bg-card/90 text-muted-foreground hover:text-foreground hover:bg-secondary/80 border-border/80'
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 transition-transform group-hover:scale-110 ${
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
                  className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="h-64 rounded-2xl border border-border/40 bg-card/40 animate-pulse"
            />
          ))}
        </div>
      ) : filteredCourses.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 p-12 text-center bg-card/30 space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/80 text-muted-foreground shadow-inner">
            {searchQuery ? (
              <Search className="h-7 w-7 text-primary" />
            ) : filterStatus === 'favorites' ? (
              <Star className="h-7 w-7 text-amber-400 fill-amber-400/30" />
            ) : (
              <BookOpen className="h-7 w-7 text-primary" />
            )}
          </div>
          <div className="space-y-1 max-w-md">
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
          {searchQuery ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSearchQuery('')}
              className="rounded-xl text-xs gap-1.5 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              <span>Clear search</span>
            </Button>
          ) : filterStatus !== 'all' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilterStatus('all')}
              className="rounded-xl text-xs gap-1.5 cursor-pointer"
            >
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span>Show all courses</span>
            </Button>
          ) : (
            <Button
              onClick={() => setImportModalOpen(true)}
              className="gap-2 shadow-lg shadow-orange-500/20 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-white font-semibold rounded-xl cursor-pointer"
            >
              <FolderPlus className="h-4 w-4" />
              <span>{t('home.importFirstCourse')}</span>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredCourses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </div>
  )
}
