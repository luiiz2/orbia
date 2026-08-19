import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Play,
  BookOpen,
  Clock,
  CheckCircle2,
  FolderPlus,
  Sparkles,
  Search,
  X,
  Layers,
  HardDrive,
  Link as LinkIcon
} from 'lucide-react'
import { useLibraryStore } from '../stores/useLibraryStore'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useVaultStore } from '../stores/useVaultStore'
import { useNavigationStore } from '../stores/useNavigationStore'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Progress } from '../components/ui/progress'
import { Badge } from '../components/ui/badge'
import { formatDurationHuman } from '../lib/formatters'
import type { Course } from '@shared'
import appLogo from '../assets/icon.png'

export function HomeView(): React.JSX.Element {
  const { t } = useTranslation()
  const { courses, progressSummaries, searchQuery, setSearchQuery, fetchCourses, isLoading } =
    useLibraryStore()
  const { loadHierarchy } = usePlayerStore()
  const { currentVault } = useVaultStore()
  const { navigateToCourse, navigateToPlayer, setImportModalOpen, setVaultModalOpen } =
    useNavigationStore()

  useEffect(() => {
    if (currentVault) {
      fetchCourses().catch(console.warn)
    }
  }, [currentVault, fetchCourses])

  const filteredCourses = courses.filter((course) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    return (
      course.title.toLowerCase().includes(query) ||
      (course.description && course.description.toLowerCase().includes(query))
    )
  })

  // Find most recent in-progress course
  const inProgressCourses = courses
    .map((c) => ({
      course: c,
      summary: progressSummaries[c.id]
    }))
    .filter(
      (item) =>
        item.summary &&
        item.summary.percentage > 0 &&
        item.summary.percentage < 100 &&
        item.summary.lastPlayedLessonId
    )
    .sort((a, b) => (b.summary?.lastPlayedAt || 0) - (a.summary?.lastPlayedAt || 0))

  const resumeItem = inProgressCourses[0]

  const handleResume = async (course: Course, lessonId?: string): Promise<void> => {
    try {
      const hierarchy = await window.api.courses.getById(course.id)
      if (hierarchy) {
        await loadHierarchy(hierarchy.course, hierarchy.modules, lessonId)
        navigateToPlayer(course.id)
      }
    } catch (err) {
      console.error('Failed to resume course:', err)
    }
  }

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

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-8 animate-in fade-in duration-200">
      {/* Resume Banner (Continue Studying Hero) */}
      {resumeItem && !searchQuery && (
        <section className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-r from-card via-card/90 to-primary/10 p-6 shadow-xl shadow-orange-500/5 transition-all">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex gap-4 items-start max-w-2xl">
              {/* Mini Thumbnail */}
              <div className="relative aspect-video w-28 sm:w-36 shrink-0 overflow-hidden rounded-xl bg-secondary/80 border border-border/80 shadow-md">
                {resumeItem.course.coverPath ? (
                  <img
                    src={`media://${encodeURI(resumeItem.course.coverPath.replace(/\\/g, '/'))}`}
                    alt={resumeItem.course.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-secondary to-card text-primary">
                    <BookOpen className="h-6 w-6 opacity-60" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <div className="h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center shadow-md">
                    <Play className="h-4 w-4 fill-current ml-0.5" />
                  </div>
                </div>
              </div>

              {/* Title & Info */}
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                    {t('home.continueStudying')}
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate">
                  {resumeItem.course.title}
                </h2>
                {resumeItem.summary?.lastPlayedLessonTitle && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    <span className="font-medium text-foreground truncate">
                      {resumeItem.summary.lastPlayedLessonTitle}
                    </span>
                  </p>
                )}

                {/* Progress bar */}
                <div className="pt-2 w-full max-w-xs space-y-1">
                  <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
                    <span>{t('course.inProgress')}</span>
                    <span className="font-semibold text-primary">
                      {resumeItem.summary?.percentage || 0}%
                    </span>
                  </div>
                  <Progress
                    value={resumeItem.summary?.percentage || 0}
                    className="h-2"
                    indicatorClassName="bg-gradient-to-r from-orange-500 via-amber-500 to-purple-600"
                  />
                </div>
              </div>
            </div>

            <Button
              size="lg"
              onClick={() => handleResume(resumeItem.course, resumeItem.summary?.lastPlayedLessonId)}
              className="gap-2 font-semibold shadow-lg shadow-orange-500/20 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-white rounded-xl shrink-0 cursor-pointer"
            >
              <Play className="h-4 w-4 fill-current" />
              <span>{t('course.resume')}</span>
            </Button>
          </div>
        </section>
      )}

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

      {/* Courses Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {t('home.allCourses')}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {courses.length} {courses.length === 1 ? 'course' : 'courses'} in study library
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setImportModalOpen(true)}
          className="gap-1.5 text-xs rounded-xl border-border/80 bg-card hover:border-primary/40 hover:bg-secondary/70 shadow-sm"
        >
          <FolderPlus className="h-3.5 w-3.5 text-primary" />
          <span>{t('nav.importCourse')}</span>
        </Button>
      </div>

      {/* Course List / Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-64 rounded-2xl border border-border/40 bg-card/40 animate-pulse"
            />
          ))}
        </div>
      ) : filteredCourses.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-12 text-center bg-card/30 space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/80 text-muted-foreground shadow-inner">
            {searchQuery ? (
              <Search className="h-7 w-7 text-primary" />
            ) : (
              <BookOpen className="h-7 w-7 text-primary" />
            )}
          </div>
          <div className="space-y-1 max-w-md">
            <h3 className="text-lg font-bold text-foreground">
              {searchQuery ? 'No matching courses found' : t('home.emptyTitle')}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {searchQuery
                ? `No courses matched your query "${searchQuery}". Try a different keyword.`
                : t('home.emptySubtitle')}
            </p>
          </div>
          {searchQuery ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSearchQuery('')}
              className="rounded-xl text-xs gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              <span>Clear search</span>
            </Button>
          ) : (
            <Button
              onClick={() => setImportModalOpen(true)}
              className="gap-2 shadow-lg shadow-orange-500/20 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-white font-semibold rounded-xl"
            >
              <FolderPlus className="h-4 w-4" />
              <span>{t('home.importFirstCourse')}</span>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredCourses.map((course) => {
            const summary = progressSummaries[course.id]
            const percentage = summary?.percentage || 0
            const isCompleted = percentage >= 100

            return (
              <Card
                key={course.id}
                onClick={() => navigateToCourse(course.id)}
                className="group relative flex flex-col overflow-hidden border-border/80 bg-card hover:border-primary/50 hover:shadow-xl hover:shadow-orange-500/10 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer rounded-2xl"
              >
                {/* Course Banner Thumbnail */}
                <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-secondary via-secondary/70 to-card flex items-center justify-center border-b border-border/50">
                  {course.coverPath ? (
                    <img
                      src={`media://${encodeURI(course.coverPath.replace(/\\/g, '/'))}`}
                      alt={course.title}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-muted-foreground p-4 text-center">
                      <BookOpen className="h-10 w-10 mb-2 opacity-50 group-hover:text-primary transition-colors duration-300 group-hover:scale-110" />
                    </div>
                  )}

                  {/* Overlay Play Button on Hover */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-orange-500 to-amber-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/40 transform scale-75 group-hover:scale-100 transition-transform duration-200">
                      <Play className="w-5 h-5 ml-0.5 fill-current" />
                    </div>
                  </div>

                  {/* Top Status & Source Badges */}
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
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

                    {isCompleted ? (
                      <Badge variant="success" className="gap-1 shadow-sm">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>{t('course.completed')}</span>
                      </Badge>
                    ) : percentage > 0 ? (
                      <Badge variant="info" className="shadow-sm font-bold">
                        {percentage}%
                      </Badge>
                    ) : null}
                  </div>

                  {/* Bottom Progress Bar Overlay */}
                  {percentage > 0 && (
                    <div className="absolute bottom-0 inset-x-0 h-1 bg-black/60 z-10">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isCompleted
                            ? 'bg-emerald-400'
                            : 'bg-gradient-to-r from-orange-500 to-amber-400'
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Course Info */}
                <CardContent className="flex flex-1 flex-col justify-between p-4 space-y-3">
                  <div>
                    <h3 className="font-bold text-foreground text-sm line-clamp-2 group-hover:text-primary transition-colors leading-snug">
                      {course.title}
                    </h3>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border/40 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-[11px]">
                        <Layers className="h-3.5 w-3.5 text-muted-foreground/70" />
                        <span>
                          {course.moduleCount} {t('course.modules')} • {course.lessonCount}{' '}
                          {t('course.lessons')}
                        </span>
                      </span>
                      {course.totalDuration > 0 && (
                        <span className="flex items-center gap-1 font-mono text-[11px]">
                          <Clock className="h-3 w-3" />
                          <span>{formatDurationHuman(course.totalDuration)}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

