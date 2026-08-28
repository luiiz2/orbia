export type StudioEntityType =
  'course' | 'module' | 'section' | 'lesson' | 'resource'

export interface LibraryAppearance {
  id: string
  entityType: StudioEntityType
  entityId: string
  rootCourseId: string
  parentAppearanceId?: string | null
  sectionId?: string | null
  customTitle?: string | null
  displayOrder: number
  isReference: boolean
  isHidden: boolean
  tags: string[]
  customMetadata: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface LibrarySection {
  id: string
  courseId: string
  moduleId?: string | null
  title: string
  displayOrder: number
  createdAt: number
}

export interface Collection {
  id: string
  name: string
  description?: string | null
  color?: string | null
  icon?: string | null
  createdAt: number
  itemCount?: number
}

export interface CollectionItem {
  collectionId: string
  appearanceId: string
  orderIndex: number
}

export type CustomFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'boolean'
  | 'select'
  | 'rating'
  | 'color'
  | 'tag'
  | 'url'

export interface CustomFieldDefinition {
  id: string
  name: string
  fieldType: CustomFieldType
  options?: string[]
  createdAt: number
}

export interface CustomFieldValue {
  entityId: string
  fieldId: string
  value: string
}

export interface StudioHistoryEntry {
  id: string
  actionType: string
  description: string
  diffPayload: {
    before: Record<string, unknown>
    after: Record<string, unknown>
  }
  timestamp: number
  isUndone: boolean
}

export type AutomationTrigger =
  'onProgressUpdate' | 'onItemAdded' | 'onManualTrigger'
export type AutomationExecutionMode = 'automatic' | 'manual'

export interface AutomationCondition {
  field: string
  operator:
    | 'equals'
    | 'not_equals'
    | 'greater_than'
    | 'less_than'
    | 'contains'
    | 'in'
    | 'is_empty'
  value: unknown
}

export interface AutomationAction {
  actionType:
    | 'add_tag'
    | 'remove_tag'
    | 'set_custom_field'
    | 'add_to_collection'
    | 'hide'
    | 'unhide'
    | 'set_highlight'
    | 'add_to_my_list'
    | 'add_to_queue'
    | 'set_priority'
    | 'structural_move'
  params: Record<string, unknown>
}

export interface AutomationRule {
  id: string
  name: string
  priority: number
  isActive: boolean
  executionMode: AutomationExecutionMode
  triggerEvent: AutomationTrigger
  conditions: AutomationCondition[]
  actions: AutomationAction[]
  createdAt: number
  updatedAt: number
}

export interface BulkRenameOptions {
  pattern?: string
  findText?: string
  replaceText?: string
  useRegex?: boolean
  removePrefix?: string
  removeSuffix?: string
  addPrefix?: string
  addSuffix?: string
  caseTransform?:
    'none' | 'lowercase' | 'uppercase' | 'titlecase' | 'sentencecase'
  cleanTags?: boolean
  cleanCodecs?: boolean
  replaceUnderscores?: boolean
  startNumber?: number
  zeroPadding?: number
}

export interface BulkRenamePreviewItem {
  id: string
  appearanceId: string
  type: StudioEntityType
  originalTitle: string
  newTitle: string
  isChanged: boolean
}

export interface SpreadsheetDraftChange {
  appearanceId: string
  entityId: string
  entityType: StudioEntityType
  field:
    | 'customTitle'
    | 'displayOrder'
    | 'sectionId'
    | 'parentAppearanceId'
    | 'tags'
    | 'customMetadata'
    | 'isHidden'
  oldValue: unknown
  newValue: unknown
}
