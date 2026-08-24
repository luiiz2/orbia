import type Database from 'better-sqlite3'
import type { TimeBasedRecommendation } from '../../../types/discovery'

export class TimeMatcherService {
  public getRecommendationsForTimeWindow(
    db: Database.Database,
    targetMinutes: number,
    _profileId?: string,
    limit: number = 10
  ): TimeBasedRecommendation[] {
    const maxSeconds = targetMinutes * 60

    // Lessons with duration > 0 and (duration - COALESCE(lp.current_time, 0)) <= maxSeconds
    // AND lessons/courses not hidden
    const query = `
      SELECT
        l.id as lesson_id,
        l.course_id,
        c.title as course_title,
        l.title as lesson_title,
        COALESCE(l.cover_path, c.cover_path) as cover_path,
        l.duration as total_duration_seconds,
        COALESCE(lp.current_time, 0) as current_time_seconds,
        (l.duration - COALESCE(lp.current_time, 0)) as remaining_duration_seconds
      FROM lessons l
      JOIN courses c ON c.id = l.course_id
      LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id
      WHERE l.duration > 60
        AND l.is_hidden = 0
        AND c.is_hidden = 0
        AND COALESCE(lp.completed, 0) = 0
        AND (l.duration - COALESCE(lp.current_time, 0)) > 60
        AND (l.duration - COALESCE(lp.current_time, 0)) <= ?
      ORDER BY
        -- Prioritize in-progress lessons first, then closest fit to target time
        (CASE WHEN COALESCE(lp.current_time, 0) > 0 THEN 0 ELSE 1 END) ASC,
        ABS(? - (l.duration - COALESCE(lp.current_time, 0))) ASC
      LIMIT ?
    `

    const rows = db.prepare(query).all(maxSeconds, maxSeconds, limit) as Array<{
      lesson_id: string
      course_id: string
      course_title: string
      lesson_title: string
      cover_path: string | null
      total_duration_seconds: number
      current_time_seconds: number
      remaining_duration_seconds: number
    }>

    return rows.map((r) => ({
      lessonId: r.lesson_id,
      courseId: r.course_id,
      courseTitle: r.course_title,
      lessonTitle: r.lesson_title,
      coverPath: r.cover_path,
      totalDurationSeconds: Math.round(r.total_duration_seconds),
      remainingDurationSeconds: Math.round(r.remaining_duration_seconds),
      currentTimeSeconds: Math.round(r.current_time_seconds)
    }))
  }
}

export const timeMatcherService = new TimeMatcherService()
