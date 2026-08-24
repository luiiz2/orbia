import type Database from 'better-sqlite3'
import crypto from 'node:crypto'
import type { LibrarySection } from '../../../types/studio'
import { studioHistoryService } from './history.service'

export class LibrarySectionService {
  public listSections(db: Database.Database, courseId: string): LibrarySection[] {
    const stmt = db.prepare(`
      SELECT id, course_id as courseId, module_id as moduleId, title, display_order as displayOrder, created_at as createdAt
      FROM library_sections
      WHERE course_id = ?
      ORDER BY display_order ASC
    `)
    return stmt.all(courseId) as LibrarySection[]
  }

  public createSection(db: Database.Database, courseId: string, title: string, moduleId?: string | null): LibrarySection {
    const id = `sec_${crypto.randomUUID()}`
    const now = Date.now()

    const maxOrderRow = db.prepare(`
      SELECT COALESCE(MAX(display_order), 0) + 1 as nextOrder
      FROM library_sections
      WHERE course_id = ? AND module_id IS ?
    `).get(courseId, moduleId || null) as { nextOrder: number }

    const displayOrder = maxOrderRow?.nextOrder || 1

    const section: LibrarySection = {
      id,
      courseId,
      moduleId: moduleId || null,
      title,
      displayOrder,
      createdAt: now
    }

    db.transaction(() => {
      db.prepare(`
        INSERT INTO library_sections (id, course_id, module_id, title, display_order, created_at)
        VALUES (@id, @courseId, @moduleId, @title, @displayOrder, @createdAt)
      `).run(section)

      studioHistoryService.recordOperation(
        db,
        'create_section',
        `Criou a seção "${title}" no curso ${courseId}`,
        { deletedSectionIds: [id] },
        { section }
      )
    })()

    return section
  }

  public updateSection(db: Database.Database, id: string, updates: Partial<LibrarySection>): boolean {
    const existing = db.prepare(`SELECT * FROM library_sections WHERE id = ?`).get(id) as Record<string, unknown> | undefined
    if (!existing) return false

    const fields: string[] = []
    const params: Record<string, unknown> = { id }

    if (updates.title !== undefined) {
      fields.push('title = @title')
      params.title = updates.title
    }
    if (updates.displayOrder !== undefined) {
      fields.push('display_order = @displayOrder')
      params.displayOrder = updates.displayOrder
    }
    if (updates.moduleId !== undefined) {
      fields.push('module_id = @moduleId')
      params.moduleId = updates.moduleId
    }

    if (fields.length === 0) return true

    return db.transaction(() => {
      const res = db.prepare(`UPDATE library_sections SET ${fields.join(', ')} WHERE id = @id`).run(params)
      if (res.changes > 0) {
        const after = db.prepare(`SELECT * FROM library_sections WHERE id = ?`).get(id) as Record<string, unknown>
        studioHistoryService.recordOperation(
          db,
          'update_section',
          `Atualizou a seção ${id}`,
          { sections: [existing] },
          { sections: [after] }
        )
        return true
      }
      return false
    })()
  }

  public deleteSection(db: Database.Database, id: string): boolean {
    const existing = db.prepare(`SELECT * FROM library_sections WHERE id = ?`).get(id) as Record<string, unknown> | undefined
    if (!existing) return false

    return db.transaction(() => {
      // Unlink any appearances attached to this section
      db.prepare(`UPDATE library_appearances SET section_id = NULL WHERE section_id = ?`).run(id)
      const res = db.prepare(`DELETE FROM library_sections WHERE id = ?`).run(id)

      studioHistoryService.recordOperation(
        db,
        'delete_section',
        `Removeu a seção ${id}`,
        { sections: [existing] },
        { deletedSectionIds: [id] }
      )

      return res.changes > 0
    })()
  }
}

export const librarySectionService = new LibrarySectionService()
