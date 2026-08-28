export type SummaryScopeType = 'lesson' | 'module' | 'course'

export interface LessonSummaryScope {
  type: 'lesson'
  courseId: string
  moduleId: string
  lessonId: string
}

export interface ModuleSummaryScope {
  type: 'module'
  courseId: string
  moduleId: string
}

export interface CourseSummaryScope {
  type: 'course'
  courseId: string
}

export type SummaryScope =
  LessonSummaryScope | ModuleSummaryScope | CourseSummaryScope

export interface SummaryTimestamp {
  timestampSeconds: number
  label: string
}

export interface SummaryRecord {
  id: string
  scopeType: SummaryScopeType
  courseId: string
  moduleId?: string
  lessonId?: string
  title: string
  overview: string
  keyConcepts: string[]
  topicsCovered: string[]
  importantDetails: string[]
  timestamps: SummaryTimestamp[]
  fullMarkdown: string
  providerId: string
  modelId: string
  templateVersion: string
  sourceRevision: string
  isStale: boolean
  createdAt: number
  updatedAt: number
}

export interface GenerateSummaryRequest {
  scope: SummaryScope
  forceRegenerate?: boolean
  cloudConsent?: boolean
}

export interface GenerateSummaryResponse {
  summary: SummaryRecord
  isCached: boolean
  isStale: boolean
}
