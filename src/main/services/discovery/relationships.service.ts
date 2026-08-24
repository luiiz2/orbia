import type Database from 'better-sqlite3'
import type { CourseRelationship, CourseRelationshipType } from '../../../types/discovery'

export class CourseRelationshipsService {
  public listRelationships(db: Database.Database, courseId?: string): CourseRelationship[] {
    let query = `
      SELECT id, source_course_id, target_course_id, relationship_type, display_order, created_at
      FROM course_relationships
    `
    const params: unknown[] = []

    if (courseId) {
      query += ` WHERE source_course_id = ? OR target_course_id = ?`
      params.push(courseId, courseId)
    }

    query += ` ORDER BY display_order ASC, created_at ASC`

    const rows = db.prepare(query).all(...params) as Array<{
      id: string
      source_course_id: string
      target_course_id: string
      relationship_type: string
      display_order: number
      created_at: number
    }>

    return rows.map((r) => ({
      id: r.id,
      sourceCourseId: r.source_course_id,
      targetCourseId: r.target_course_id,
      relationshipType: r.relationship_type as CourseRelationshipType,
      displayOrder: r.display_order,
      createdAt: r.created_at
    }))
  }

  public addRelationship(
    db: Database.Database,
    sourceCourseId: string,
    targetCourseId: string,
    relationshipType: CourseRelationshipType
  ): CourseRelationship {
    const id = `rel_${crypto.randomUUID()}`
    const now = Date.now()

    const maxOrderRow = db.prepare(`
      SELECT COALESCE(MAX(display_order), 0) + 1 as nextOrder
      FROM course_relationships
      WHERE source_course_id = ?
    `).get(sourceCourseId) as { nextOrder: number }
    const displayOrder = maxOrderRow?.nextOrder || 1

    db.prepare(`
      INSERT INTO course_relationships (
        id, source_course_id, target_course_id, relationship_type, display_order, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, sourceCourseId, targetCourseId, relationshipType, displayOrder, now)

    return {
      id,
      sourceCourseId,
      targetCourseId,
      relationshipType,
      displayOrder,
      createdAt: now
    }
  }

  public deleteRelationship(db: Database.Database, id: string): boolean {
    const res = db.prepare(`DELETE FROM course_relationships WHERE id = ?`).run(id)
    return res.changes > 0
  }
}

export const courseRelationshipsService = new CourseRelationshipsService()
