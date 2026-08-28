import type Database from 'better-sqlite3'
import crypto from 'node:crypto'
import type {
  CustomFieldDefinition,
  CustomFieldType
} from '../../../types/studio'

export class CustomFieldsService {
  public listDefinitions(db: Database.Database): CustomFieldDefinition[] {
    const stmt = db.prepare(`
      SELECT id, name, field_type as fieldType, options, created_at as createdAt
      FROM custom_field_definitions
      ORDER BY name ASC
    `)
    const rows = stmt.all() as {
      id: string
      name: string
      fieldType: CustomFieldType
      options?: string
      createdAt: number
    }[]
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      fieldType: r.fieldType,
      options: r.options ? JSON.parse(r.options) : undefined,
      createdAt: r.createdAt
    }))
  }

  public createDefinition(
    db: Database.Database,
    name: string,
    fieldType: CustomFieldType,
    options?: string[]
  ): CustomFieldDefinition {
    const id = `field_${crypto.randomUUID()}`
    const now = Date.now()
    const optionsJson = options ? JSON.stringify(options) : null

    db.prepare(
      `
      INSERT INTO custom_field_definitions (id, name, field_type, options, created_at)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(id, name, fieldType, optionsJson, now)

    return {
      id,
      name,
      fieldType,
      options,
      createdAt: now
    }
  }

  public deleteDefinition(db: Database.Database, id: string): boolean {
    const res = db
      .prepare(`DELETE FROM custom_field_definitions WHERE id = ?`)
      .run(id)
    return res.changes > 0
  }

  public getValues(
    db: Database.Database,
    entityId: string
  ): Record<string, string> {
    const stmt = db.prepare(`
      SELECT cf.name, cfv.value
      FROM custom_field_values cfv
      JOIN custom_field_definitions cf ON cf.id = cfv.field_id
      WHERE cfv.entity_id = ?
    `)
    const rows = stmt.all(entityId) as { name: string; value: string }[]
    const map: Record<string, string> = {}
    for (const r of rows) {
      map[r.name] = r.value
    }
    return map
  }

  public setValue(
    db: Database.Database,
    entityId: string,
    fieldId: string,
    value: string
  ): boolean {
    const stmt = db.prepare(`
      INSERT INTO custom_field_values (entity_id, field_id, value)
      VALUES (?, ?, ?)
      ON CONFLICT(entity_id, field_id) DO UPDATE SET value = excluded.value
    `)
    const res = stmt.run(entityId, fieldId, value)
    return res.changes > 0
  }
}

export const customFieldsService = new CustomFieldsService()
