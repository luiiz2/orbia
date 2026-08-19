import React from 'react'
import { useTranslation } from 'react-i18next'
import { Play, Sparkles } from 'lucide-react'
import type { Course } from '@shared'
import { Button, Card } from '../ui'
import { useLibraryStore, useNavigationStore, usePlayerStore } from '../../stores'

interface ContinueStudyingProps {
  courses: Course[]
}

export function ContinueStudying({ courses }: ContinueStudyingProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const { progressSummaries } = useLibraryStore()
  const { navigateToPlayer } = useNavigationStore()
  const { loadHierarchy } = usePlayerStore()

  // Filter courses that have progress and are not 100% completed
  const inProgressCourses = courses
    .filter((c) => {
      const summary = progressSummaries[c.id]
      return summary && summary.percentage > 0 && summary.percentage < 100
    })
    .slice(0, 3)

  if (inProgressCourses.length === 0) {
    return null
  }

  const handleResume = async (courseId: string): Promise<void> => {
    const data = await window.api.courses.getById(courseId)
    if (data) {
      const summary = progressSummaries[courseId]
      const targetLessonId = summary?.lastPlayedLessonId || data.modules[0]?.lessons[0]?.id
      loadHierarchy(data.course, data.modules, targetLessonId)
      navigateToPlayer(courseId)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
        <Sparkles className="w-4 h-4 text-primary" />
        <span>{t('home.continueStudying')}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {inProgressCourses.map((course) => {
          const summary = progressSummaries[course.id]
          const percentage = summary?.percentage || 0
          const coverUrl = course.coverPath
            ? `media://${encodeURI(course.coverPath.replace(/\\/g, '/'))}`
            : null

          return (
            <Card
              key={course.id}
              className="p-3.5 bg-card border-border/80 hover:border-primary/40 hover:bg-secondary/40 transition-all flex flex-col justify-between space-y-3 group shadow-md rounded-2xl"
            >
              <div className="flex gap-3 items-start min-w-0">
                {/* Mini Thumbnail */}
                <div className="w-20 h-14 rounded-xl bg-secondary/80 overflow-hidden shrink-0 relative border border-border/60">
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt={course.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-secondary text-primary">
                      <Play className="w-5 h-5 opacity-60" />
                    </div>
                  )}
                </div>

                {/* Course Details */}
                <div className="min-w-0 flex-1 space-y-1">
                  <h4 className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                    {course.title}
                  </h4>
                  {summary?.lastPlayedLessonTitle && (
                    <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      <span className="truncate">{summary.lastPlayedLessonTitle}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Progress & Action */}
              <div className="space-y-2 pt-1 border-t border-border/40">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">
                    {summary?.completedLessons || 0}/{course.lessonCount} {t('course.lessons')}
                  </span>
                  <span className="font-semibold text-primary">{percentage}%</span>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-orange-500 via-amber-500 to-purple-600 rounded-full transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>

                <Button
                  size="sm"
                  variant="default"
                  className="w-full text-xs h-8 mt-1 font-semibold shadow-md shadow-orange-500/20 rounded-xl"
                  onClick={() => handleResume(course.id)}
                >
                  <Play className="w-3.5 h-3.5 mr-1 fill-current" />
                  {t('course.resume')}
                </Button>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

