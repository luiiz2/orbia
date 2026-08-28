import type Database from 'better-sqlite3'
import type { LibraryInsights } from '../../../types/discovery'

export class LibraryInsightsService {
  public getInsights(db: Database.Database): LibraryInsights {
    // 1. Total Courses & Lessons
    const totalsRow = db
      .prepare(
        `
      SELECT
        COUNT(DISTINCT c.id) as total_courses,
        COUNT(DISTINCT l.id) as total_lessons,
        COALESCE(SUM(l.duration), 0) as total_duration_seconds
      FROM courses c
      LEFT JOIN lessons l ON l.course_id = c.id AND l.is_hidden = 0
      WHERE c.is_hidden = 0
    `
      )
      .get() as {
      total_courses: number
      total_lessons: number
      total_duration_seconds: number
    }

    // 2. Watched Hours this month
    const now = new Date()
    const startOfMonthTimestamp = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    ).getTime()

    const watchMonthRow = db
      .prepare(
        `
      SELECT COALESCE(SUM(wh.current_time), 0) as month_seconds
      FROM watch_history wh
      WHERE wh.watched_at >= ?
    `
      )
      .get(startOfMonthTimestamp) as { month_seconds: number }

    // 3. Courses started and completed
    const progressRow = db
      .prepare(
        `
      SELECT
        COUNT(DISTINCT CASE WHEN lp.current_time > 0 OR lp.completed = 1 THEN lp.course_id END) as started_courses,
        COUNT(DISTINCT c.id) as all_courses
      FROM courses c
      LEFT JOIN lesson_progress lp ON lp.course_id = c.id
      WHERE c.is_hidden = 0
    `
      )
      .get() as { started_courses: number; all_courses: number }

    // Completed courses count (where all lessons in course are completed)
    const completedCoursesRow = db
      .prepare(
        `
      SELECT COUNT(*) as completed_count FROM (
        SELECT c.id
        FROM courses c
        JOIN lessons l ON l.course_id = c.id AND l.is_hidden = 0
        LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id
        WHERE c.is_hidden = 0
        GROUP BY c.id
        HAVING COUNT(l.id) > 0 AND COUNT(CASE WHEN COALESCE(lp.completed, 0) = 1 THEN 1 END) = COUNT(l.id)
      )
    `
      )
      .get() as { completed_count: number }

    // 4. Most watched course
    const mostWatchedCourseRow = db
      .prepare(
        `
      SELECT c.title, SUM(wh.current_time) as total_watched
      FROM watch_history wh
      JOIN courses c ON c.id = wh.course_id
      GROUP BY wh.course_id
      ORDER BY total_watched DESC
      LIMIT 1
    `
      )
      .get() as { title: string } | undefined

    // 5. Top tags
    const appearanceTagsRows = db
      .prepare(
        `
      SELECT tags FROM library_appearances WHERE is_hidden = 0 AND tags <> '[]'
    `
      )
      .all() as Array<{ tags: string }>

    const tagCounts: Record<string, number> = {}
    for (const r of appearanceTagsRows) {
      try {
        const tags = JSON.parse(r.tags) as string[]
        for (const t of tags) {
          if (t && t.trim()) {
            tagCounts[t] = (tagCounts[t] || 0) + 1
          }
        }
      } catch {
        // Ignored
      }
    }

    const topTags = Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)

    return {
      totalCourses: totalsRow.total_courses || 0,
      totalLessons: totalsRow.total_lessons || 0,
      totalDurationHours:
        Math.round(((totalsRow.total_duration_seconds || 0) / 3600) * 10) / 10,
      watchedHoursThisMonth:
        Math.round(((watchMonthRow.month_seconds || 0) / 3600) * 10) / 10,
      coursesStartedCount: progressRow.started_courses || 0,
      coursesCompletedCount: completedCoursesRow.completed_count || 0,
      mostWatchedCourseTitle: mostWatchedCourseRow?.title || undefined,
      topTags
    }
  }
}

export const libraryInsightsService = new LibraryInsightsService()
