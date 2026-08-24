import { ipcMain } from 'electron'
import { databaseService } from '../services/database.service'
import { appConfigService } from '../services/app-config.service'
import { libraryAppearanceService } from '../services/studio/appearance.service'
import { librarySectionService } from '../services/studio/section.service'
import { collectionService } from '../services/studio/collection.service'
import { customFieldsService } from '../services/studio/custom-fields.service'
import { structuralOperationsService } from '../services/studio/structural-operations.service'
import { studioHistoryService } from '../services/studio/history.service'
import { generateRenamePreview } from '../services/studio/pattern-renamer'
import { automationEngine } from '../services/studio/automation-engine'
import { themePackageService } from '../services/studio/theme-package.service'
import type {
  LibraryAppearance,
  LibrarySection,
  Collection,
  CustomFieldType,
  StudioEntityType,
  BulkRenameOptions,
  SpreadsheetDraftChange,
  AutomationRule
} from '../../types/studio'
import type { ThemeScope, ThemeConfig, ThemePreset, LocalProfile } from '../../types/theme'

export function registerStudioIpc(): void {
  // --- Appearances ---
  ipcMain.handle('studio:list-appearances', async (_event, courseId?: string, includeHidden?: boolean) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return []
    return libraryAppearanceService.listAppearances(db, courseId, includeHidden)
  })

  ipcMain.handle('studio:update-appearance', async (_event, id: string, updates: Partial<LibraryAppearance>) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return false
    return libraryAppearanceService.updateAppearance(db, id, updates)
  })

  ipcMain.handle('studio:create-reference', async (_event, entityType: StudioEntityType, entityId: string, targetCourseId: string, parentAppearanceId?: string) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) throw new Error('Database not connected')
    return libraryAppearanceService.createReference(db, entityType, entityId, targetCourseId, parentAppearanceId)
  })

  ipcMain.handle('studio:delete-appearance', async (_event, appearanceId: string) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return { success: false }
    return libraryAppearanceService.deleteAppearance(db, appearanceId)
  })

  ipcMain.handle('studio:set-hidden', async (_event, appearanceIds: string[], isHidden: boolean) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return false
    return libraryAppearanceService.setHidden(db, appearanceIds, isHidden)
  })

  // --- Sections ---
  ipcMain.handle('studio:create-section', async (_event, courseId: string, title: string, moduleId?: string) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) throw new Error('Database not connected')
    return librarySectionService.createSection(db, courseId, title, moduleId)
  })

  ipcMain.handle('studio:update-section', async (_event, id: string, updates: Partial<LibrarySection>) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return false
    return librarySectionService.updateSection(db, id, updates)
  })

  ipcMain.handle('studio:delete-section', async (_event, id: string) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return false
    return librarySectionService.deleteSection(db, id)
  })

  ipcMain.handle('studio:list-sections', async (_event, courseId: string) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return []
    return librarySectionService.listSections(db, courseId)
  })

  // --- Collections ---
  ipcMain.handle('studio:create-collection', async (_event, name: string, description?: string, color?: string, icon?: string) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) throw new Error('Database not connected')
    return collectionService.createCollection(db, name, description, color, icon)
  })

  ipcMain.handle('studio:update-collection', async (_event, id: string, updates: Partial<Collection>) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return false
    return collectionService.updateCollection(db, id, updates)
  })

  ipcMain.handle('studio:delete-collection', async (_event, id: string) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return false
    return collectionService.deleteCollection(db, id)
  })

  ipcMain.handle('studio:list-collections', async () => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return []
    return collectionService.listCollections(db)
  })

  ipcMain.handle('studio:add-items-to-collection', async (_event, collectionId: string, appearanceIds: string[]) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return false
    return collectionService.addItemsToCollection(db, collectionId, appearanceIds)
  })

  ipcMain.handle('studio:remove-items-from-collection', async (_event, collectionId: string, appearanceIds: string[]) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return false
    return collectionService.removeItemsFromCollection(db, collectionId, appearanceIds)
  })

  // --- Custom Fields ---
  ipcMain.handle('studio:list-custom-field-definitions', async () => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return []
    return customFieldsService.listDefinitions(db)
  })

  ipcMain.handle('studio:create-custom-field-definition', async (_event, name: string, fieldType: CustomFieldType, options?: string[]) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) throw new Error('Database not connected')
    return customFieldsService.createDefinition(db, name, fieldType, options)
  })

  ipcMain.handle('studio:delete-custom-field-definition', async (_event, id: string) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return false
    return customFieldsService.deleteDefinition(db, id)
  })

  ipcMain.handle('studio:get-custom-field-values', async (_event, entityId: string) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return {}
    return customFieldsService.getValues(db, entityId)
  })

  ipcMain.handle('studio:set-custom-field-value', async (_event, entityId: string, fieldId: string, value: string) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return false
    return customFieldsService.setValue(db, entityId, fieldId, value)
  })

  // --- Structural Operations ---
  ipcMain.handle('studio:course-to-module', async (_event, sourceCourseId: string, targetCourseId: string) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return { success: false, error: 'Database not connected' }
    return structuralOperationsService.courseToModule(db, sourceCourseId, targetCourseId)
  })

  ipcMain.handle('studio:module-to-course', async (_event, moduleId: string, newCourseTitle?: string) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return { success: false, error: 'Database not connected' }
    return structuralOperationsService.moduleToCourse(db, moduleId, newCourseTitle)
  })

  ipcMain.handle('studio:move-items', async (_event, appearanceIds: string[], targetParentId: string | null, targetCourseId: string) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return { success: false, movedCount: 0 }
    return structuralOperationsService.moveItems(db, appearanceIds, targetParentId, targetCourseId)
  })

  ipcMain.handle('studio:create-course-from-selection', async (_event, appearanceIds: string[], courseTitle: string) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return { success: false, error: 'Database not connected' }
    return structuralOperationsService.createCourseFromSelection(db, appearanceIds, courseTitle)
  })

  // --- History & Undo ---
  ipcMain.handle('studio:list-history', async (_event, limit?: number) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return []
    return studioHistoryService.listHistory(db, limit)
  })

  ipcMain.handle('studio:undo', async (_event, historyId: string) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return { success: false, error: 'Database not connected' }
    return studioHistoryService.undoOperation(db, historyId)
  })

  // --- Bulk & Spreadsheet ---
  ipcMain.handle('studio:rename-preview', async (_event, appearanceIds: string[], options: BulkRenameOptions) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return []
    const placeholders = appearanceIds.map(() => '?').join(',')
    const apps = db.prepare(`
      SELECT id, entity_id as entityId, entity_type as type,
             COALESCE(custom_title, '') as title
      FROM library_appearances
      WHERE id IN (${placeholders})
    `).all(...appearanceIds) as Array<{ id: string; entityId: string; type: StudioEntityType; title: string }>

    return generateRenamePreview(
      apps.map((a) => ({ id: a.entityId, appearanceId: a.id, type: a.type, title: a.title })),
      options
    )
  })

  ipcMain.handle('studio:rename-apply', async (_event, items: { appearanceId: string; newTitle: string }[]) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return false
    return db.transaction(() => {
      const now = Date.now()
      const stmt = db.prepare(`UPDATE library_appearances SET custom_title = ?, updated_at = ? WHERE id = ?`)
      for (const item of items) {
        stmt.run(item.newTitle, now, item.appearanceId)
      }
      return true
    })()
  })

  ipcMain.handle('studio:apply-spreadsheet-draft', async (_event, changes: SpreadsheetDraftChange[]) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return { success: false, appliedCount: 0 }
    return structuralOperationsService.applySpreadsheetDraft(db, changes)
  })

  // --- Automation Rules ---
  ipcMain.handle('studio:list-automation-rules', async () => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return []
    return automationEngine.listRules(db)
  })

  ipcMain.handle('studio:save-automation-rule', async (_event, rule: Omit<AutomationRule, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) throw new Error('Database not connected')
    return automationEngine.saveRule(db, rule)
  })

  ipcMain.handle('studio:delete-automation-rule', async (_event, id: string) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return false
    return automationEngine.deleteRule(db, id)
  })

  ipcMain.handle('studio:execute-automation-rule', async (_event, ruleId: string) => {
    const db = (databaseService as unknown as { db: import('better-sqlite3').Database }).db
    if (!db) return { success: false, affectedCount: 0 }
    return automationEngine.executeRule(db, ruleId)
  })

  // --- Profiles ---
  ipcMain.handle('studio:list-profiles', async () => {
    return appConfigService.listProfiles()
  })

  ipcMain.handle('studio:create-profile', async (_event, name: string, avatarPath?: string) => {
    return appConfigService.createProfile(name, avatarPath)
  })

  ipcMain.handle('studio:update-profile', async (_event, id: string, updates: Partial<LocalProfile>) => {
    return appConfigService.updateProfile(id, updates)
  })

  ipcMain.handle('studio:delete-profile', async (_event, id: string) => {
    return appConfigService.deleteProfile(id)
  })

  // --- Themes & Appearance Overrides ---
  ipcMain.handle('studio:list-theme-presets', async () => {
    return appConfigService.listThemePresets()
  })

  ipcMain.handle('studio:save-theme-preset', async (_event, preset: Omit<ThemePreset, 'id' | 'createdAt'> & { id?: string }) => {
    return appConfigService.saveThemePreset(preset)
  })

  ipcMain.handle('studio:get-resolved-theme', async (_event, profileId?: string, vaultPath?: string, courseId?: string, sectionId?: string) => {
    return appConfigService.getResolvedTheme(profileId, vaultPath, courseId, sectionId)
  })

  ipcMain.handle('studio:save-appearance-override', async (_event, scopeType: ThemeScope, scopeId: string, overrides: Partial<ThemeConfig>, presetId?: string) => {
    return appConfigService.saveAppearanceOverride(scopeType, scopeId, overrides, presetId)
  })

  ipcMain.handle('studio:reset-appearance-override', async (_event, scopeType: ThemeScope, scopeId: string, category?: string) => {
    return appConfigService.resetAppearanceOverride(scopeType, scopeId, category)
  })

  ipcMain.handle('studio:export-theme-package', async (_event, presetId: string, targetPath?: string) => {
    return themePackageService.exportTheme(presetId, targetPath)
  })

  ipcMain.handle('studio:import-theme-package', async (_event, filePath: string) => {
    return themePackageService.importTheme(filePath)
  })
}
