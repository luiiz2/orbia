import type Database from 'better-sqlite3'
import type { RecommendationFeedbackType } from '../../../types/discovery'

export class RecommendationFeedbackService {
  public submitFeedback(
    db: Database.Database,
    profileId: string,
    courseId: string,
    feedbackType: RecommendationFeedbackType
  ): boolean {
    const now = Date.now()
    db.prepare(
      `
      INSERT INTO recommendation_feedback (profile_id, course_id, feedback_type, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(profile_id, course_id) DO UPDATE SET
        feedback_type = excluded.feedback_type,
        updated_at = excluded.updated_at
    `
    ).run(profileId, courseId, feedbackType, now)
    return true
  }

  public getFeedbackForProfile(
    db: Database.Database,
    profileId: string
  ): Map<string, RecommendationFeedbackType> {
    const rows = db
      .prepare(
        `
      SELECT course_id, feedback_type FROM recommendation_feedback WHERE profile_id = ?
    `
      )
      .all(profileId) as Array<{ course_id: string; feedback_type: string }>

    const map = new Map<string, RecommendationFeedbackType>()
    for (const r of rows) {
      map.set(r.course_id, r.feedback_type as RecommendationFeedbackType)
    }
    return map
  }

  public recordExposures(
    db: Database.Database,
    profileId: string,
    courseIds: string[]
  ): void {
    if (courseIds.length === 0) return
    const now = Date.now()
    const stmt = db.prepare(`
      INSERT INTO recommendation_exposures (profile_id, course_id, last_exposed_at, exposure_count)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(profile_id, course_id) DO UPDATE SET
        last_exposed_at = excluded.last_exposed_at,
        exposure_count = recommendation_exposures.exposure_count + 1
    `)

    db.transaction(() => {
      for (const id of courseIds) {
        stmt.run(profileId, id, now)
      }
    })()
  }

  public getRecentExposures(
    db: Database.Database,
    profileId: string,
    sinceTimestamp: number
  ): Set<string> {
    const rows = db
      .prepare(
        `
      SELECT course_id FROM recommendation_exposures
      WHERE profile_id = ? AND last_exposed_at >= ?
    `
      )
      .all(profileId, sinceTimestamp) as Array<{ course_id: string }>

    return new Set(rows.map((r) => r.course_id))
  }
}

export const recommendationFeedbackService = new RecommendationFeedbackService()
