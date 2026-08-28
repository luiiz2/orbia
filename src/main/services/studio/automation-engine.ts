import type Database from 'better-sqlite3'
import crypto from 'node:crypto'
import type {
  AutomationRule,
  AutomationTrigger,
  AutomationCondition,
  AutomationAction
} from '../../../types/studio'
import { studioHistoryService } from './history.service'

export class AutomationEngine {
  public listRules(db: Database.Database): AutomationRule[] {
    const stmt = db.prepare(`
      SELECT id, name, priority, is_active as isActive, execution_mode as executionMode,
             trigger_event as triggerEvent, conditions_json as conditionsJson,
             actions_json as actionsJson, created_at as createdAt, updated_at as updatedAt
      FROM automation_rules
      ORDER BY priority DESC, created_at ASC
    `)
    const rows = stmt.all() as Array<{
      id: string
      name: string
      priority: number
      isActive: number
      executionMode: 'automatic' | 'manual'
      triggerEvent: AutomationTrigger
      conditionsJson: string
      actionsJson: string
      createdAt: number
      updatedAt: number
    }>

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      priority: r.priority,
      isActive: Boolean(r.isActive),
      executionMode: r.executionMode,
      triggerEvent: r.triggerEvent,
      conditions: JSON.parse(r.conditionsJson || '[]'),
      actions: JSON.parse(r.actionsJson || '[]'),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }))
  }

  public saveRule(
    db: Database.Database,
    rule: Omit<AutomationRule, 'id' | 'createdAt' | 'updatedAt'> & {
      id?: string
    }
  ): AutomationRule {
    const now = Date.now()
    const id = rule.id || `rule_${crypto.randomUUID()}`

    db.prepare(
      `
      INSERT INTO automation_rules (
        id, name, priority, is_active, execution_mode, trigger_event,
        conditions_json, actions_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        priority = excluded.priority,
        is_active = excluded.is_active,
        execution_mode = excluded.execution_mode,
        trigger_event = excluded.trigger_event,
        conditions_json = excluded.conditions_json,
        actions_json = excluded.actions_json,
        updated_at = excluded.updated_at
    `
    ).run(
      id,
      rule.name,
      rule.priority,
      rule.isActive ? 1 : 0,
      rule.executionMode,
      rule.triggerEvent,
      JSON.stringify(rule.conditions),
      JSON.stringify(rule.actions),
      now,
      now
    )

    return {
      id,
      name: rule.name,
      priority: rule.priority,
      isActive: rule.isActive,
      executionMode: rule.executionMode,
      triggerEvent: rule.triggerEvent,
      conditions: rule.conditions,
      actions: rule.actions,
      createdAt: now,
      updatedAt: now
    }
  }

  public deleteRule(db: Database.Database, id: string): boolean {
    const res = db.prepare(`DELETE FROM automation_rules WHERE id = ?`).run(id)
    return res.changes > 0
  }

  /**
   * Executes an automation rule against all matching appearances.
   */
  public executeRule(
    db: Database.Database,
    ruleId: string
  ): { success: boolean; affectedCount: number } {
    const ruleRow = db
      .prepare(`SELECT * FROM automation_rules WHERE id = ?`)
      .get(ruleId) as Record<string, unknown> | undefined
    if (!ruleRow) {
      return { success: false, affectedCount: 0 }
    }

    const conditions = JSON.parse(
      (ruleRow.conditions_json as string) || '[]'
    ) as AutomationCondition[]
    const actions = JSON.parse(
      (ruleRow.actions_json as string) || '[]'
    ) as AutomationAction[]

    return db.transaction(() => {
      const appearances = db
        .prepare(`SELECT * FROM library_appearances`)
        .all() as Record<string, unknown>[]
      let affectedCount = 0

      for (const app of appearances) {
        if (this.evaluateConditions(app, conditions)) {
          this.applyActions(db, app, actions)
          affectedCount++
        }
      }

      studioHistoryService.recordOperation(
        db,
        'execute_automation_rule',
        `Executou regra "${ruleRow.name}" afetando ${affectedCount} item(ns)`,
        {},
        { ruleId, affectedCount }
      )

      return { success: true, affectedCount }
    })()
  }

  private evaluateConditions(
    app: Record<string, unknown>,
    conditions: AutomationCondition[]
  ): boolean {
    if (conditions.length === 0) return true

    for (const cond of conditions) {
      const val = app[cond.field]
      switch (cond.operator) {
        case 'equals':
          if (val != cond.value) return false
          break
        case 'not_equals':
          if (val == cond.value) return false
          break
        case 'greater_than':
          if (Number(val) <= Number(cond.value)) return false
          break
        case 'less_than':
          if (Number(val) >= Number(cond.value)) return false
          break
        case 'contains':
          if (typeof val === 'string' && !val.includes(String(cond.value)))
            return false
          break
        case 'is_empty':
          if (val !== null && val !== undefined && val !== '') return false
          break
      }
    }
    return true
  }

  private applyActions(
    db: Database.Database,
    app: Record<string, unknown>,
    actions: AutomationAction[]
  ): void {
    const now = Date.now()
    for (const action of actions) {
      if (action.actionType === 'add_tag') {
        const tagToAdd = action.params.tag as string
        const currentTags: string[] = JSON.parse((app.tags as string) || '[]')
        if (tagToAdd && !currentTags.includes(tagToAdd)) {
          currentTags.push(tagToAdd)
          db.prepare(
            `UPDATE library_appearances SET tags = ?, updated_at = ? WHERE id = ?`
          ).run(JSON.stringify(currentTags), now, app.id)
        }
      } else if (action.actionType === 'hide') {
        db.prepare(
          `UPDATE library_appearances SET is_hidden = 1, updated_at = ? WHERE id = ?`
        ).run(now, app.id)
      } else if (action.actionType === 'unhide') {
        db.prepare(
          `UPDATE library_appearances SET is_hidden = 0, updated_at = ? WHERE id = ?`
        ).run(now, app.id)
      }
    }
  }
}

export const automationEngine = new AutomationEngine()
