import type Database from 'better-sqlite3'
import crypto from 'node:crypto'
import type { Course } from '../../../types/course'
import type { SpreadsheetDraftChange } from '../../../types/studio'
import { studioHistoryService } from './history.service'

export class StructuralOperationsService {
  /**
   * Converts a Course into a Module of a target Course.
   * Preserves all lessons, notes, bookmarks, flashcards, history, and resources.
   */
  public courseToModule(
    db: Database.Database,
    sourceCourseId: string,
    targetCourseId: string
  ): { success: boolean; newModuleId?: string; error?: string } {
    if (sourceCourseId === targetCourseId) {
      return {
        success: false,
        error: 'O curso de origem não pode ser igual ao de destino'
      }
    }

    const sourceCourse = db
      .prepare(`SELECT * FROM courses WHERE id = ?`)
      .get(sourceCourseId) as Course | undefined
    if (!sourceCourse) {
      return { success: false, error: 'Curso de origem não encontrado' }
    }

    const targetCourse = db
      .prepare(`SELECT * FROM courses WHERE id = ?`)
      .get(targetCourseId) as Course | undefined
    if (!targetCourse) {
      return { success: false, error: 'Curso de destino não encontrado' }
    }

    return db.transaction(() => {
      const now = Date.now()
      const newModuleId = `mod_${crypto.randomUUID()}`

      // Get next display order in target course
      const maxOrderRow = db
        .prepare(
          `
        SELECT COALESCE(MAX(display_order), 0) + 1 as nextOrder
        FROM modules
        WHERE course_id = ?
      `
        )
        .get(targetCourseId) as { nextOrder: number }
      const displayOrder = maxOrderRow?.nextOrder || 1

      // 1. Create the new module in target course with source course title
      db.prepare(
        `
        INSERT INTO modules (
          id, course_id, title, order_index, folder_path, duration, lesson_count, is_hidden, created_at
        ) VALUES (
          @id, @courseId, @title, @orderIndex, @folderPath, @duration, @lessonCount, 0, @createdAt
        )
      `
      ).run({
        id: newModuleId,
        courseId: targetCourseId,
        title: sourceCourse.title,
        orderIndex: displayOrder,
        folderPath:
          ((sourceCourse as unknown as Record<string, unknown>)
            .root_path as string) ||
          sourceCourse.rootPath ||
          '',
        duration: Number(
          (sourceCourse as unknown as Record<string, unknown>).total_duration ??
            sourceCourse.totalDuration ??
            0
        ),
        lessonCount: Number(
          (sourceCourse as unknown as Record<string, unknown>).lesson_count ??
            sourceCourse.lessonCount ??
            0
        ),
        createdAt: now
      })

      // 2. Re-point all lessons from source course to the new module and target course
      db.prepare(
        `
        UPDATE lessons
        SET course_id = ?, module_id = ?
        WHERE course_id = ?
      `
      ).run(targetCourseId, newModuleId, sourceCourseId)

      // 3. Re-point all content_resources
      db.prepare(
        `
        UPDATE content_resources
        SET course_id = ?, module_id = ?
        WHERE course_id = ?
      `
      ).run(targetCourseId, newModuleId, sourceCourseId)

      // 4. Update appearances: parent to target course
      const targetCourseApp = db
        .prepare(
          `
        SELECT id FROM library_appearances WHERE entity_id = ? AND entity_type = 'course' LIMIT 1
      `
        )
        .get(targetCourseId) as { id: string } | undefined

      const newModAppId = `app_mod_${newModuleId}`
      db.prepare(
        `
        INSERT INTO library_appearances (
          id, entity_type, entity_id, root_course_id, parent_appearance_id, section_id,
          custom_title, display_order, is_reference, is_hidden, tags, custom_metadata, created_at, updated_at
        ) VALUES (?, 'module', ?, ?, ?, NULL, ?, ?, 0, 0, '[]', '{}', ?, ?)
      `
      ).run(
        newModAppId,
        newModuleId,
        targetCourseId,
        targetCourseApp?.id || null,
        sourceCourse.customTitle || null,
        displayOrder,
        now,
        now
      )

      // Update lesson appearances
      db.prepare(
        `
        UPDATE library_appearances
        SET root_course_id = ?, parent_appearance_id = ?
        WHERE entity_id IN (SELECT id FROM lessons WHERE module_id = ?)
      `
      ).run(targetCourseId, newModAppId, newModuleId)

      // 5. Delete or hide source course
      db.prepare(`DELETE FROM courses WHERE id = ?`).run(sourceCourseId)
      db.prepare(
        `DELETE FROM library_appearances WHERE entity_id = ? AND entity_type = 'course'`
      ).run(sourceCourseId)

      // 6. Recalculate target course counts
      const counts = db
        .prepare(
          `
        SELECT COUNT(DISTINCT id) as lessonCount, COALESCE(SUM(duration), 0) as totalDuration
        FROM lessons WHERE course_id = ?
      `
        )
        .get(targetCourseId) as { lessonCount: number; totalDuration: number }

      const modCount = db
        .prepare(
          `SELECT COUNT(id) as modCount FROM modules WHERE course_id = ?`
        )
        .get(targetCourseId) as { modCount: number }

      db.prepare(
        `
        UPDATE courses
        SET lesson_count = ?, total_duration = ?, module_count = ?, updated_at = ?
        WHERE id = ?
      `
      ).run(
        counts.lessonCount,
        counts.totalDuration,
        modCount.modCount,
        now,
        targetCourseId
      )

      studioHistoryService.recordOperation(
        db,
        'course_to_module',
        `Converteu o curso "${sourceCourse.title}" em módulo de "${targetCourse.title}"`,
        { sourceCourse, sourceCourseId, targetCourseId },
        { newModuleId, targetCourseId }
      )

      return { success: true, newModuleId }
    })()
  }

  /**
   * Converts a Module into an independent Course.
   */
  public moduleToCourse(
    db: Database.Database,
    moduleId: string,
    newCourseTitle?: string
  ): { success: boolean; newCourseId?: string; error?: string } {
    const mod = db
      .prepare(`SELECT * FROM modules WHERE id = ?`)
      .get(moduleId) as Record<string, unknown> | undefined
    if (!mod) {
      return { success: false, error: 'Módulo não encontrado' }
    }

    return db.transaction(() => {
      const now = Date.now()
      const newCourseId = `course_${crypto.randomUUID()}`
      const title = newCourseTitle || (mod.title as string)
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')

      // 1. Create new Course
      db.prepare(
        `
        INSERT INTO courses (
          id, title, slug, source_type, root_path, cover_path, description,
          total_duration, module_count, lesson_count, is_favorite, is_hidden, created_at, updated_at
        ) VALUES (
          @id, @title, @slug, 'local-vault', @rootPath, NULL, NULL,
          @totalDuration, 1, @lessonCount, 0, 0, @now, @now
        )
      `
      ).run({
        id: newCourseId,
        title,
        slug: `${slug}-${now.toString(36)}`,
        rootPath: (mod.folder_path as string) || '',
        totalDuration: (mod.duration as number) || 0,
        lessonCount: (mod.lesson_count as number) || 0,
        now
      })

      // 2. Update module's course_id to the new course
      db.prepare(`UPDATE modules SET course_id = ? WHERE id = ?`).run(
        newCourseId,
        moduleId
      )

      // 3. Update all lessons to new course_id
      db.prepare(`UPDATE lessons SET course_id = ? WHERE module_id = ?`).run(
        newCourseId,
        moduleId
      )

      // 4. Update all content_resources to new course_id
      db.prepare(
        `UPDATE content_resources SET course_id = ? WHERE module_id = ?`
      ).run(newCourseId, moduleId)

      // 5. Update appearances
      const courseAppId = `app_course_${newCourseId}`
      db.prepare(
        `
        INSERT INTO library_appearances (
          id, entity_type, entity_id, root_course_id, parent_appearance_id, section_id,
          custom_title, display_order, is_reference, is_hidden, tags, custom_metadata, created_at, updated_at
        ) VALUES (?, 'course', ?, ?, NULL, NULL, ?, 0, 0, 0, '[]', '{}', ?, ?)
      `
      ).run(
        courseAppId,
        newCourseId,
        newCourseId,
        (mod.custom_title as string) || null,
        now,
        now
      )

      db.prepare(
        `
        UPDATE library_appearances
        SET root_course_id = ?, parent_appearance_id = ?
        WHERE entity_id = ? AND entity_type = 'module'
      `
      ).run(newCourseId, courseAppId, moduleId)

      db.prepare(
        `
        UPDATE library_appearances
        SET root_course_id = ?
        WHERE entity_id IN (SELECT id FROM lessons WHERE module_id = ?)
      `
      ).run(newCourseId, moduleId)

      studioHistoryService.recordOperation(
        db,
        'module_to_course',
        `Converteu o módulo "${title}" em um novo curso independente`,
        { moduleId, previousCourseId: mod.course_id },
        { newCourseId }
      )

      return { success: true, newCourseId }
    })()
  }

  /**
   * Moves arbitrary selected appearances to a new parent container / course.
   */
  public moveItems(
    db: Database.Database,
    appearanceIds: string[],
    targetParentId: string | null,
    targetCourseId: string
  ): { success: boolean; movedCount: number } {
    if (appearanceIds.length === 0) return { success: true, movedCount: 0 }

    return db.transaction(() => {
      const placeholders = appearanceIds.map(() => '?').join(',')
      const existing = db
        .prepare(
          `SELECT * FROM library_appearances WHERE id IN (${placeholders})`
        )
        .all(...appearanceIds) as Record<string, unknown>[]

      const stmt = db.prepare(`
        UPDATE library_appearances
        SET root_course_id = ?, parent_appearance_id = ?, updated_at = ?
        WHERE id = ?
      `)

      const now = Date.now()
      let movedCount = 0
      for (const appId of appearanceIds) {
        stmt.run(targetCourseId, targetParentId, now, appId)
        movedCount++
      }

      studioHistoryService.recordOperation(
        db,
        'move_items',
        `Moveu ${movedCount} item(ns) para o contêiner ${targetParentId || targetCourseId}`,
        { appearances: existing },
        { appearanceIds, targetParentId, targetCourseId }
      )

      return { success: true, movedCount }
    })()
  }

  /**
   * Creates a new Course from a mixed selection of appearances.
   */
  public createCourseFromSelection(
    db: Database.Database,
    appearanceIds: string[],
    courseTitle: string
  ): { success: boolean; newCourse?: Course; error?: string } {
    if (appearanceIds.length === 0) {
      return { success: false, error: 'Nenhum item selecionado' }
    }

    return db.transaction(() => {
      const now = Date.now()
      const newCourseId = `course_${crypto.randomUUID()}`
      const slug = `${courseTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')}-${now.toString(36)}`

      // Create new virtual Course
      db.prepare(
        `
        INSERT INTO courses (
          id, title, slug, source_type, root_path, cover_path, description,
          total_duration, module_count, lesson_count, is_favorite, is_hidden, created_at, updated_at
        ) VALUES (
          ?, ?, ?, 'local-vault', '', NULL, 'Curso criado a partir de seleção no Library Studio',
          0, 0, 0, 0, 0, ?, ?
        )
      `
      ).run(newCourseId, courseTitle, slug, now, now)

      const courseAppId = `app_course_${newCourseId}`
      db.prepare(
        `
        INSERT INTO library_appearances (
          id, entity_type, entity_id, root_course_id, parent_appearance_id, section_id,
          custom_title, display_order, is_reference, is_hidden, tags, custom_metadata, created_at, updated_at
        ) VALUES (?, 'course', ?, ?, NULL, NULL, NULL, 0, 0, 0, '[]', '{}', ?, ?)
      `
      ).run(courseAppId, newCourseId, newCourseId, now, now)

      // Create a default "Sem Módulo" module inside the new course
      const defaultModId = `mod_${crypto.randomUUID()}`
      db.prepare(
        `
        INSERT INTO modules (
          id, course_id, title, order_index, folder_path, duration, lesson_count, is_hidden, created_at
        ) VALUES (?, ?, 'Geral', 1, '', 0, 0, 0, ?)
      `
      ).run(defaultModId, newCourseId, now)

      const defaultModAppId = `app_mod_${defaultModId}`
      db.prepare(
        `
        INSERT INTO library_appearances (
          id, entity_type, entity_id, root_course_id, parent_appearance_id, section_id,
          custom_title, display_order, is_reference, is_hidden, tags, custom_metadata, created_at, updated_at
        ) VALUES (?, 'module', ?, ?, ?, NULL, NULL, 1, 0, 0, '[]', '{}', ?, ?)
      `
      ).run(defaultModAppId, defaultModId, newCourseId, courseAppId, now, now)

      // Link selected appearances to the new course
      const placeholders = appearanceIds.map(() => '?').join(',')
      const selectedApps = db
        .prepare(
          `SELECT * FROM library_appearances WHERE id IN (${placeholders})`
        )
        .all(...appearanceIds) as Array<{
        id: string
        entity_type: string
        entity_id: string
      }>

      let displayOrder = 1
      for (const app of selectedApps) {
        if (app.entity_type === 'lesson') {
          // Re-parent lesson appearance
          db.prepare(
            `
            UPDATE library_appearances
            SET root_course_id = ?, parent_appearance_id = ?, display_order = ?
            WHERE id = ?
          `
          ).run(newCourseId, defaultModAppId, displayOrder++, app.id)

          // Update lesson course_id and module_id
          db.prepare(
            `UPDATE lessons SET course_id = ?, module_id = ? WHERE id = ?`
          ).run(newCourseId, defaultModId, app.entity_id)
        } else if (app.entity_type === 'module') {
          // Re-parent module appearance
          db.prepare(
            `
            UPDATE library_appearances
            SET root_course_id = ?, parent_appearance_id = ?, display_order = ?
            WHERE id = ?
          `
          ).run(newCourseId, courseAppId, displayOrder++, app.id)

          // Update module course_id
          db.prepare(`UPDATE modules SET course_id = ? WHERE id = ?`).run(
            newCourseId,
            app.entity_id
          )
          db.prepare(
            `UPDATE lessons SET course_id = ? WHERE module_id = ?`
          ).run(newCourseId, app.entity_id)
        }
      }

      // Recalculate counts
      const counts = db
        .prepare(
          `
        SELECT COUNT(DISTINCT id) as lessonCount, COALESCE(SUM(duration), 0) as totalDuration
        FROM lessons WHERE course_id = ?
      `
        )
        .get(newCourseId) as { lessonCount: number; totalDuration: number }

      const modCount = db
        .prepare(
          `SELECT COUNT(id) as modCount FROM modules WHERE course_id = ?`
        )
        .get(newCourseId) as { modCount: number }

      db.prepare(
        `
        UPDATE courses
        SET lesson_count = ?, total_duration = ?, module_count = ?, updated_at = ?
        WHERE id = ?
      `
      ).run(
        counts.lessonCount,
        counts.totalDuration,
        modCount.modCount,
        now,
        newCourseId
      )

      const newCourse = db
        .prepare(`SELECT * FROM courses WHERE id = ?`)
        .get(newCourseId) as Course

      studioHistoryService.recordOperation(
        db,
        'create_course_selection',
        `Criou o novo curso "${courseTitle}" com ${appearanceIds.length} item(ns)`,
        {},
        { newCourseId, appearanceIds }
      )

      return { success: true, newCourse }
    })()
  }

  /**
   * Commits all buffered spreadsheet / bulk edits in a single atomic SQLite transaction.
   */
  public applySpreadsheetDraft(
    db: Database.Database,
    changes: SpreadsheetDraftChange[]
  ): { success: boolean; appliedCount: number } {
    if (changes.length === 0) return { success: true, appliedCount: 0 }

    return db.transaction(() => {
      const now = Date.now()
      let appliedCount = 0

      for (const change of changes) {
        if (change.field === 'customTitle') {
          db.prepare(
            `UPDATE library_appearances SET custom_title = ?, updated_at = ? WHERE id = ?`
          ).run(change.newValue, now, change.appearanceId)
          appliedCount++
        } else if (change.field === 'displayOrder') {
          db.prepare(
            `UPDATE library_appearances SET display_order = ?, updated_at = ? WHERE id = ?`
          ).run(change.newValue, now, change.appearanceId)
          appliedCount++
        } else if (change.field === 'sectionId') {
          db.prepare(
            `UPDATE library_appearances SET section_id = ?, updated_at = ? WHERE id = ?`
          ).run(change.newValue, now, change.appearanceId)
          appliedCount++
        } else if (change.field === 'parentAppearanceId') {
          db.prepare(
            `UPDATE library_appearances SET parent_appearance_id = ?, updated_at = ? WHERE id = ?`
          ).run(change.newValue, now, change.appearanceId)
          appliedCount++
        } else if (change.field === 'tags') {
          db.prepare(
            `UPDATE library_appearances SET tags = ?, updated_at = ? WHERE id = ?`
          ).run(JSON.stringify(change.newValue), now, change.appearanceId)
          appliedCount++
        } else if (change.field === 'customMetadata') {
          db.prepare(
            `UPDATE library_appearances SET custom_metadata = ?, updated_at = ? WHERE id = ?`
          ).run(JSON.stringify(change.newValue), now, change.appearanceId)
          appliedCount++
        } else if (change.field === 'isHidden') {
          db.prepare(
            `UPDATE library_appearances SET is_hidden = ?, updated_at = ? WHERE id = ?`
          ).run(change.newValue ? 1 : 0, now, change.appearanceId)
          appliedCount++
        }
      }

      studioHistoryService.recordOperation(
        db,
        'spreadsheet_draft_commit',
        `Aplicou ${appliedCount} alteração(ões) em lote via Library Studio`,
        { changesCount: changes.length },
        { appliedCount }
      )

      return { success: true, appliedCount }
    })()
  }
}

export const structuralOperationsService = new StructuralOperationsService()
