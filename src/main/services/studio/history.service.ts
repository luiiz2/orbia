import type Database from 'better-sqlite3'
import crypto from 'node:crypto'
import type { StudioHistoryEntry } from '../../../types/studio'

export class StudioHistoryService {
  public recordOperation(
    db: Database.Database,
    actionType: string,
    description: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>
  ): string {
    const id = `hist_${crypto.randomUUID()}`
    const now = Date.now()
    const diffPayload = JSON.stringify({ before, after })

    db.prepare(`
      INSERT INTO studio_history (id, action_type, description, diff_payload, timestamp, is_undone)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(id, actionType, description, diffPayload, now)

    return id
  }

  public listHistory(db: Database.Database, limit: number = 50): StudioHistoryEntry[] {
    const stmt = db.prepare(`
      SELECT id, action_type as actionType, description, diff_payload as diffPayload,
             timestamp, is_undone as isUndone
      FROM studio_history
      ORDER BY timestamp DESC
      LIMIT ?
    `)
    const rows = stmt.all(limit) as {
      id: string
      actionType: string
      description: string
      diffPayload: string
      timestamp: number
      isUndone: number
    }[]

    return rows.map((r) => ({
      id: r.id,
      actionType: r.actionType,
      description: r.description,
      diffPayload: JSON.parse(r.diffPayload),
      timestamp: r.timestamp,
      isUndone: Boolean(r.isUndone)
    }))
  }

  public undoOperation(db: Database.Database, historyId: string): { success: boolean; error?: string } {
    const row = db.prepare(`
      SELECT id, action_type, description, diff_payload, is_undone
      FROM studio_history
      WHERE id = ?
    `).get(historyId) as { id: string; action_type: string; description: string; diff_payload: string; is_undone: number } | undefined

    if (!row) {
      return { success: false, error: 'Histórico não encontrado' }
    }
    if (row.is_undone) {
      return { success: false, error: 'Esta operação já foi desfeita' }
    }

    try {
      const payload = JSON.parse(row.diff_payload) as {
        before: {
          appearances?: Array<Record<string, unknown>>
          sections?: Array<Record<string, unknown>>
          customFieldValues?: Array<Record<string, unknown>>
          deletedAppearanceIds?: string[]
          deletedSectionIds?: string[]
        }
      }

      db.transaction(() => {
        // Rollback appearances
        if (payload.before.appearances) {
          const stmt = db.prepare(`
            INSERT INTO library_appearances (
              id, entity_type, entity_id, root_course_id, parent_appearance_id, section_id,
              custom_title, display_order, is_reference, is_hidden, tags, custom_metadata, created_at, updated_at
            ) VALUES (
              @id, @entity_type, @entity_id, @root_course_id, @parent_appearance_id, @section_id,
              @custom_title, @display_order, @is_reference, @is_hidden, @tags, @custom_metadata, @created_at, @updated_at
            )
            ON CONFLICT(id) DO UPDATE SET
              root_course_id = excluded.root_course_id,
              parent_appearance_id = excluded.parent_appearance_id,
              section_id = excluded.section_id,
              custom_title = excluded.custom_title,
              display_order = excluded.display_order,
              is_reference = excluded.is_reference,
              is_hidden = excluded.is_hidden,
              tags = excluded.tags,
              custom_metadata = excluded.custom_metadata,
              updated_at = excluded.updated_at
          `)
          for (const app of payload.before.appearances) {
            stmt.run({
              id: app.id,
              entity_type: app.entity_type || app.entityType,
              entity_id: app.entity_id || app.entityId,
              root_course_id: app.root_course_id || app.rootCourseId,
              parent_appearance_id: app.parent_appearance_id ?? app.parentAppearanceId ?? null,
              section_id: app.section_id ?? app.sectionId ?? null,
              custom_title: app.custom_title ?? app.customTitle ?? null,
              display_order: app.display_order ?? app.displayOrder ?? 0,
              is_reference: (app.is_reference ?? app.isReference) ? 1 : 0,
              is_hidden: (app.is_hidden ?? app.isHidden) ? 1 : 0,
              tags: typeof app.tags === 'string' ? app.tags : JSON.stringify(app.tags || []),
              custom_metadata: typeof app.custom_metadata === 'string' ? app.custom_metadata : JSON.stringify(app.customMetadata || {}),
              created_at: app.created_at || app.createdAt || Date.now(),
              updated_at: Date.now()
            })
          }
        }

        // Remove created appearances if any
        if (payload.before.deletedAppearanceIds) {
          const delStmt = db.prepare(`DELETE FROM library_appearances WHERE id = ?`)
          for (const delId of payload.before.deletedAppearanceIds) {
            delStmt.run(delId)
          }
        }

        // Rollback custom field values
        if (payload.before.customFieldValues) {
          const valStmt = db.prepare(`
            INSERT INTO custom_field_values (entity_id, field_id, value)
            VALUES (@entityId, @fieldId, @value)
            ON CONFLICT(entity_id, field_id) DO UPDATE SET value = excluded.value
          `)
          for (const cf of payload.before.customFieldValues) {
            valStmt.run(cf)
          }
        }

        // Mark undone
        db.prepare(`UPDATE studio_history SET is_undone = 1 WHERE id = ?`).run(historyId)
      })()

      return { success: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  }
}

export const studioHistoryService = new StudioHistoryService()
