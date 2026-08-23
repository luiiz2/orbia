import React from 'react'
import { useTranslation } from 'react-i18next'
import { Flame, Clock, Target, GraduationCap, TrendingUp, Sparkles } from 'lucide-react'
import { formatTime } from '../../lib/formatters'
import type { StudyAnalytics } from '@shared'

interface StudyAnalyticsPanelProps {
  analytics: StudyAnalytics | null
  isLoading?: boolean
}

export function StudyAnalyticsPanel({ analytics, isLoading }: StudyAnalyticsPanelProps): React.JSX.Element {
  const { t } = useTranslation()

  if (isLoading || !analytics) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-secondary/40 border border-border/50" />
        ))}
      </div>
    )
  }

  const todayMinutes = Math.round(analytics.todaySecondsWatched / 60)
  const goalProgress = Math.min(100, Math.round((todayMinutes / Math.max(1, analytics.dailyGoalMinutes)) * 100))
  const totalHours = (analytics.totalSecondsWatched / 3600).toFixed(1)

  // Last 14 days chart data (padded or reversed)
  const chartDays = [...analytics.dailyHistory].reverse().slice(-14)
  const maxDaySeconds = Math.max(...chartDays.map((d) => d.secondsWatched), 1800)

  return (
    <div className="space-y-6">
      {/* 4 Bento Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Streak Card */}
        <div className="relative overflow-hidden rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 via-card to-card p-4 shadow-sm hover:border-orange-500/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t('analytics.streakTitle', 'Ofensiva')}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500/20 text-orange-500 shadow-inner">
              <Flame className="h-4 w-4 fill-orange-500" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black tracking-tight text-foreground">
              {analytics.currentStreakDays}
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              {analytics.currentStreakDays === 1 ? t('analytics.day', 'dia') : t('analytics.days', 'dias')}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-orange-400/90 font-medium">
            <Sparkles className="h-3 w-3" />
            <span>{t('analytics.bestStreak', 'Recorde:')} {analytics.longestStreakDays} {analytics.longestStreakDays === 1 ? t('analytics.day', 'dia') : t('analytics.days', 'dias')}</span>
          </div>
        </div>

        {/* Total Time Card */}
        <div className="relative overflow-hidden rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-card to-card p-4 shadow-sm hover:border-purple-500/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t('analytics.totalTime', 'Tempo Total')}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 shadow-inner">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black tracking-tight text-foreground">
              {totalHours}h
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              ({formatTime(analytics.totalSecondsWatched)})
            </span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {t('analytics.totalTimeDescription', 'Dedicadas aos estudos')}
          </div>
        </div>

        {/* Daily Goal Card */}
        <div className="relative overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/10 via-card to-card p-4 shadow-sm hover:border-blue-500/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t('analytics.dailyGoal', 'Meta de Hoje')}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 shadow-inner">
              <Target className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black tracking-tight text-foreground">
              {todayMinutes}
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              / {analytics.dailyGoalMinutes} min ({goalProgress}%)
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${goalProgress}%` }}
            />
          </div>
        </div>

        {/* Completed Lessons Card */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-card to-card p-4 shadow-sm hover:border-emerald-500/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t('analytics.completedLessons', 'Aulas Concluídas')}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 shadow-inner">
              <GraduationCap className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black tracking-tight text-foreground">
              {analytics.totalLessonsCompleted}
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              {analytics.totalLessonsCompleted === 1 ? t('analytics.lesson', 'aula') : t('analytics.lessons', 'aulas')}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-emerald-400/90 font-medium">
            {t('analytics.keepItUp', 'Continue evoluindo!')}
          </div>
        </div>
      </div>

      {/* Activity Chart & Top Courses Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Study Bar Chart */}
        <div className="lg:col-span-2 rounded-2xl border border-border/80 bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">
                {t('analytics.dailyActivityTitle', 'Atividade Diária de Estudo (Últimos 14 dias)')}
              </h3>
            </div>
            <span className="text-xs text-muted-foreground">
              {t('analytics.minutesPerDay', 'Minutos por dia')}
            </span>
          </div>

          {chartDays.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border/60 bg-secondary/20 text-xs text-muted-foreground">
              {t('analytics.noActivityYet', 'Nenhuma sessão de estudo registrada ainda.')}
            </div>
          ) : (
            <div className="flex h-48 items-end gap-2 pt-6 pb-2 px-1">
              {chartDays.map((day) => {
                const dayMins = Math.round(day.secondsWatched / 60)
                const heightPct = Math.max(8, Math.round((day.secondsWatched / maxDaySeconds) * 100))
                const [, m, d] = day.date.split('-')
                const label = `${d}/${m}`

                return (
                  <div key={day.date} className="group relative flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    {/* Tooltip on hover */}
                    <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-popover text-popover-foreground text-[10px] font-semibold px-2 py-0.5 rounded shadow border border-border/60 pointer-events-none whitespace-nowrap z-10">
                      {label}: {dayMins} min ({day.lessonsCount} {day.lessonsCount === 1 ? 'aula' : 'aulas'})
                    </div>

                    {/* Bar */}
                    <div
                      className="w-full rounded-t-lg bg-gradient-to-t from-orange-500/80 to-purple-600/90 group-hover:from-orange-400 group-hover:to-purple-500 transition-all"
                      style={{ height: `${heightPct}%` }}
                    />

                    {/* Label */}
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {d}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Top Courses Card */}
        <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-foreground">
            {t('analytics.topCoursesTitle', 'Cursos Mais Estudados')}
          </h3>

          {analytics.topCourses.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              {t('analytics.noTopCourses', 'Nenhum curso estudado ainda.')}
            </p>
          ) : (
            <div className="space-y-3">
              {analytics.topCourses.map((course, idx) => {
                const hours = (course.secondsWatched / 3600).toFixed(1)
                return (
                  <div key={course.courseId} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground truncate max-w-[160px]">
                        {idx + 1}. {course.courseTitle}
                      </span>
                      <span className="text-muted-foreground font-mono text-[11px]">
                        {hours}h
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-orange-500 to-purple-600"
                        style={{
                          width: `${Math.min(100, Math.round((course.secondsWatched / Math.max(1, analytics.totalSecondsWatched)) * 100))}%`
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
