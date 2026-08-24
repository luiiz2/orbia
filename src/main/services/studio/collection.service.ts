import type Database from 'better-sqlite3'
import crypto from 'node:crypto'
import type { Collection } from '../../../types/studio'
import { studioHistoryService } from './history.service'

export class CollectionService {
  public listCollections(db: Database.Database): Collection[] {
    const stmt = db.prepare(`
      SELECT c.id, c.name, c.description, c.color, c.icon, c.created_at as createdAt,
             COUNT(ci.appearance_id) as itemCount
      FROM collections c
      LEFT JOIN collection_items ci ON ci.collection_id = c.id
      GROUP BY c.id
      ORDER BY c.name ASC
    `)
    return stmt.all() as Collection[]
  }

  public createCollection(
    db: Database.Database,
    name: string,
    description?: string | null,
    color?: string | null,
    icon?: string | null
  ): Collection {
    const id = `col_${crypto.randomUUID()}`
    const now = Date.now()

    const collection: Collection = {
      id,
      name,
      description: description || null,
      color: color || null,
      icon: icon || null,
      createdAt: now,
      itemCount: 0
    }

    db.transaction(() => {
      db.prepare(`
        INSERT INTO collections (id, name, description, color, icon, created_at)
        VALUES (@id, @name, @description, @color, @icon, @createdAt)
      `).run(collection)

      studioHistoryService.recordOperation(
        db,
        'create_collection',
        `Criou a coleção "${name}"`,
        {},
        { collection }
      )
    })()

    return collection
  }

  public updateCollection(db: Database.Database, id: string, updates: Partial<Collection>): boolean {
    const fields: string[] = []
    const params: Record<string, unknown> = { id }

    if (updates.name !== undefined) {
      fields.push('name = @name')
      params.name = updates.name
    }
    if (updates.description !== undefined) {
      fields.push('description = @description')
      params.description = updates.description
    }
    if (updates.color !== undefined) {
      fields.push('color = @color')
      params.color = updates.color
    }
    if (updates.icon !== undefined) {
      fields.push('icon = @icon')
      params.icon = updates.icon
    }

    if (fields.length === 0) return true

    const res = db.prepare(`UPDATE collections SET ${fields.join(', ')} WHERE id = @id`).run(params)
    return res.changes > 0
  }

  public deleteCollection(db: Database.Database, id: string): boolean {
    const res = db.prepare(`DELETE FROM collections WHERE id = ?`).run(id)
    return res.changes > 0
  }

  public addItemsToCollection(db: Database.Database, collectionId: string, appearanceIds: string[]): boolean {
    if (appearanceIds.length === 0) return true

    return db.transaction(() => {
      const maxOrderRow = db.prepare(`
        SELECT COALESCE(MAX(order_index), 0) as maxOrder
        FROM collection_items
        WHERE collection_id = ?
      `).get(collectionId) as { maxOrder: number }

      let nextOrder = (maxOrderRow?.maxOrder || 0) + 1

      const stmt = db.prepare(`
        INSERT OR IGNORE INTO collection_items (collection_id, appearance_id, order_index)
        VALUES (?, ?, ?)
      `)

      for (const appId of appearanceIds) {
        stmt.run(collectionId, appId, nextOrder++)
      }

      studioHistoryService.recordOperation(
        db,
        'add_to_collection',
        `Adicionou ${appearanceIds.length} item(ns) à coleção ${collectionId}`,
        {},
        { collectionId, appearanceIds }
      )

      return true
    })()
  }

  public removeItemsFromCollection(db: Database.Database, collectionId: string, appearanceIds: string[]): boolean {
    if (appearanceIds.length === 0) return true

    const placeholders = appearanceIds.map(() => '?').join(',')
    const res = db.prepare(`
      DELETE FROM collection_items
      WHERE collection_id = ? AND appearance_id IN (${placeholders})
    `).run(collectionId, ...appearanceIds)

    return res.changes > 0
  }
}

export const collectionService = new CollectionService()
