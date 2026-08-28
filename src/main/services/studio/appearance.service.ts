import type Database from 'better-sqlite3'
import crypto from 'node:crypto'
import type { LibraryAppearance, StudioEntityType } from '../../../types/studio'
import { studioHistoryService } from './history.service'

export class LibraryAppearanceService {
  public listAppearances(
    db: Database.Database,
    courseId?: string,
    includeHidden: boolean = false
  ): LibraryAppearance[] {
    let sql = `
      SELECT id, entity_type as entityType, entity_id as entityId, root_course_id as rootCourseId,
             parent_appearance_id as parentAppearanceId, section_id as sectionId,
             custom_title as customTitle, display_order as displayOrder,
             is_reference as isReference, is_hidden as isHidden,
             tags, custom_metadata as customMetadata, created_at as createdAt, updated_at as updatedAt
      FROM library_appearances
    `
    const conditions: string[] = []
    const params: unknown[] = []

    if (courseId) {
      conditions.push('root_course_id = ?')
      params.push(courseId)
    }
    if (!includeHidden) {
      conditions.push('is_hidden = 0')
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`
    }
    sql += ` ORDER BY display_order ASC`

    const rows = db.prepare(sql).all(...params) as Array<{
      id: string
      entityType: StudioEntityType
      entityId: string
      rootCourseId: string
      parentAppearanceId: string | null
      sectionId: string | null
      customTitle: string | null
      displayOrder: number
      isReference: number
      isHidden: number
      tags: string
      customMetadata: string
      createdAt: number
      updatedAt: number
    }>

    return rows.map((r) => ({
      id: r.id,
      entityType: r.entityType,
      entityId: r.entityId,
      rootCourseId: r.rootCourseId,
      parentAppearanceId: r.parentAppearanceId,
      sectionId: r.sectionId,
      customTitle: r.customTitle,
      displayOrder: r.displayOrder,
      isReference: Boolean(r.isReference),
      isHidden: Boolean(r.isHidden),
      tags: JSON.parse(r.tags || '[]'),
      customMetadata: JSON.parse(r.customMetadata || '{}'),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }))
  }

  public updateAppearance(
    db: Database.Database,
    id: string,
    updates: Partial<LibraryAppearance>
  ): boolean {
    const existing = db
      .prepare(`SELECT * FROM library_appearances WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined
    if (!existing) return false

    const fields: string[] = []
    const params: Record<string, unknown> = { id, updatedAt: Date.now() }

    if (updates.customTitle !== undefined) {
      fields.push('custom_title = @customTitle')
      params.customTitle = updates.customTitle
    }
    if (updates.displayOrder !== undefined) {
      fields.push('display_order = @displayOrder')
      params.displayOrder = updates.displayOrder
    }
    if (updates.parentAppearanceId !== undefined) {
      fields.push('parent_appearance_id = @parentAppearanceId')
      params.parentAppearanceId = updates.parentAppearanceId
    }
    if (updates.sectionId !== undefined) {
      fields.push('section_id = @sectionId')
      params.sectionId = updates.sectionId
    }
    if (updates.isHidden !== undefined) {
      fields.push('is_hidden = @isHidden')
      params.isHidden = updates.isHidden ? 1 : 0
    }
    if (updates.tags !== undefined) {
      fields.push('tags = @tags')
      params.tags = JSON.stringify(updates.tags)
    }
    if (updates.customMetadata !== undefined) {
      fields.push('custom_metadata = @customMetadata')
      params.customMetadata = JSON.stringify(updates.customMetadata)
    }

    if (fields.length === 0) return true
    fields.push('updated_at = @updatedAt')

    return db.transaction(() => {
      const res = db
        .prepare(
          `UPDATE library_appearances SET ${fields.join(', ')} WHERE id = @id`
        )
        .run(params)
      if (res.changes > 0) {
        const after = db
          .prepare(`SELECT * FROM library_appearances WHERE id = ?`)
          .get(id) as Record<string, unknown>
        studioHistoryService.recordOperation(
          db,
          'update_appearance',
          `Atualização da aparência ${id}`,
          { appearances: [existing] },
          { appearances: [after] }
        )
        return true
      }
      return false
    })()
  }

  public createReference(
    db: Database.Database,
    entityType: StudioEntityType,
    entityId: string,
    targetCourseId: string,
    parentAppearanceId?: string | null
  ): LibraryAppearance {
    const id = `app_ref_${crypto.randomUUID()}`
    const now = Date.now()

    // Get max display order in target container
    const maxOrderRow = db
      .prepare(
        `
      SELECT COALESCE(MAX(display_order), 0) + 1 as nextOrder
      FROM library_appearances
      WHERE root_course_id = ? AND parent_appearance_id IS ?
    `
      )
      .get(targetCourseId, parentAppearanceId || null) as { nextOrder: number }

    const nextOrder = maxOrderRow?.nextOrder || 1

    const app: LibraryAppearance = {
      id,
      entityType,
      entityId,
      rootCourseId: targetCourseId,
      parentAppearanceId: parentAppearanceId || null,
      sectionId: null,
      customTitle: null,
      displayOrder: nextOrder,
      isReference: true,
      isHidden: false,
      tags: [],
      customMetadata: {},
      createdAt: now,
      updatedAt: now
    }

    db.transaction(() => {
      db.prepare(
        `
        INSERT INTO library_appearances (
          id, entity_type, entity_id, root_course_id, parent_appearance_id, section_id,
          custom_title, display_order, is_reference, is_hidden, tags, custom_metadata, created_at, updated_at
        ) VALUES (
          @id, @entityType, @entityId, @rootCourseId, @parentAppearanceId, @sectionId,
          @customTitle, @displayOrder, 1, 0, '[]', '{}', @createdAt, @updatedAt
        )
      `
      ).run({
        ...app,
        tags: '[]',
        customMetadata: '{}'
      })

      studioHistoryService.recordOperation(
        db,
        'create_reference',
        `Criou atalho de ${entityType} no curso ${targetCourseId}`,
        { deletedAppearanceIds: [id] },
        { appearances: [app] }
      )
    })()

    return app
  }

  public deleteAppearance(
    db: Database.Database,
    appearanceId: string
  ): { success: boolean; promotedAppearanceId?: string } {
    const existing = db
      .prepare(`SELECT * FROM library_appearances WHERE id = ?`)
      .get(appearanceId) as Record<string, unknown> | undefined
    if (!existing) return { success: false }

    const isReference = Boolean(existing.is_reference)
    const entityId = existing.entity_id as string
    const entityType = existing.entity_type as string

    return db.transaction(() => {
      let promotedId: string | undefined

      // If we are deleting a primary appearance, check if any other appearance (reference) exists for this entity
      if (!isReference) {
        const otherApp = db
          .prepare(
            `
          SELECT id FROM library_appearances
          WHERE entity_id = ? AND id <> ?
          ORDER BY created_at ASC
          LIMIT 1
        `
          )
          .get(entityId, appearanceId) as { id: string } | undefined

        if (otherApp) {
          // Promote the reference to primary appearance
          db.prepare(
            `UPDATE library_appearances SET is_reference = 0 WHERE id = ?`
          ).run(otherApp.id)
          promotedId = otherApp.id
        }
      }

      // Delete the appearance and child appearances cascade
      db.prepare(`DELETE FROM library_appearances WHERE id = ?`).run(
        appearanceId
      )

      studioHistoryService.recordOperation(
        db,
        'delete_appearance',
        `Remoção lógica de aparência ${entityType} (${appearanceId})`,
        { appearances: [existing] },
        { deletedAppearanceIds: [appearanceId] }
      )

      return { success: true, promotedAppearanceId: promotedId }
    })()
  }

  public setHidden(
    db: Database.Database,
    appearanceIds: string[],
    isHidden: boolean
  ): boolean {
    if (appearanceIds.length === 0) return true

    return db.transaction(() => {
      const placeholders = appearanceIds.map(() => '?').join(',')
      const existing = db
        .prepare(
          `SELECT * FROM library_appearances WHERE id IN (${placeholders})`
        )
        .all(...appearanceIds) as Record<string, unknown>[]

      db.prepare(
        `UPDATE library_appearances SET is_hidden = ?, updated_at = ? WHERE id IN (${placeholders})`
      ).run(isHidden ? 1 : 0, Date.now(), ...appearanceIds)

      studioHistoryService.recordOperation(
        db,
        isHidden ? 'hide_appearances' : 'unhide_appearances',
        `${isHidden ? 'Ocultou' : 'Restaurou'} ${appearanceIds.length} item(ns)`,
        { appearances: existing },
        { appearanceIds, isHidden }
      )

      return true
    })()
  }
}

export const libraryAppearanceService = new LibraryAppearanceService()
