import type { IndexCoverage } from './retrieval'
import type { SemanticChunkLocator, SemanticSourceKind } from './semantic-index'

export const LIBRARY_SEARCH_MODES = ['normal', 'semantic', 'hybrid'] as const
export type LibrarySearchMode = (typeof LIBRARY_SEARCH_MODES)[number]

export const LIBRARY_SEARCH_RESULT_TYPES = [
  'course',
  'module',
  'lesson',
  'transcript',
  'materials',
  'pdf',
  'code',
  'note'
] as const
export type LibrarySearchResultType = (typeof LIBRARY_SEARCH_RESULT_TYPES)[number]

export type LibrarySearchGroupType =
  | 'courses'
  | 'modules'
  | 'lessons'
  | 'transcripts'
  | 'materials'
  | 'pdfs'
  | 'code'
  | 'notes'

export interface LibrarySearchFilters {
  courseId?: string
  moduleId?: string
  /** The current vault is the only searchable vault in this process. */
  vaultId?: 'current'
  contentTypes?: LibrarySearchResultType[]
  includeNotes?: boolean
}

export interface LibrarySearchRequest {
  query: string
  mode?: LibrarySearchMode
  filters?: LibrarySearchFilters
  limit?: number
  cloudConsent?: boolean
}

export type LibrarySearchNavigation =
  | {
      type: 'course'
      courseId: string
    }
  | {
      type: 'module'
      courseId: string
      moduleId: string
    }
  | {
      type: 'lesson'
      courseId: string
      moduleId: string
      lessonId: string
      timestampSeconds?: number
    }
  | {
      type: 'resource'
      courseId: string
      moduleId: string
      lessonId?: string
      resourceId?: string
      sourceKind: SemanticSourceKind
      page?: number
      startLine?: number
      endLine?: number
    }

export type LibrarySearchNavigationResult =
  | { status: 'ok'; target: LibrarySearchNavigation }
  | { status: 'unavailable'; reason: string }

export interface LibrarySearchResult {
  id: string
  chunkId: string
  type: LibrarySearchResultType
  title: string
  excerpt: string
  courseId: string
  courseTitle: string
  moduleId?: string
  moduleTitle?: string
  lessonId?: string
  lessonTitle?: string
  resourceId?: string
  transcriptId?: string
  noteId?: string
  sourceKind: SemanticSourceKind
  sourceId: string
  locator: SemanticChunkLocator
  lexicalScore?: number
  semanticScore?: number
  relevanceScore: number
  navigation: LibrarySearchNavigation
}

export interface LibrarySearchGroup {
  type: LibrarySearchGroupType
  results: LibrarySearchResult[]
}

export interface LibrarySearchResponse {
  query: string
  mode: LibrarySearchMode
  results: LibrarySearchResult[]
  groups: LibrarySearchGroup[]
  coverage: IndexCoverage
  semanticUsed: boolean
  semanticUnavailable: boolean
}

export interface RelatedContentAnchor {
  chunkId?: string
  courseId: string
  moduleId?: string
  lessonId?: string
  resourceId?: string
}

export interface RelatedContentRequest {
  anchor: RelatedContentAnchor
  filters?: LibrarySearchFilters
  limit?: number
  cloudConsent?: boolean
}

export type RelatedContentGroupType = 'lessons' | 'materials' | 'courses'

export interface RelatedContentGroup {
  type: RelatedContentGroupType
  results: LibrarySearchResult[]
}

export interface RelatedContentResponse {
  groups: RelatedContentGroup[]
  coverage: IndexCoverage
  semanticUsed: boolean
  semanticUnavailable: boolean
}

/** Aliases used by callers that name the explicit action rather than search. */
export type FindInLibraryRequest = LibrarySearchRequest
export type FindInLibraryResponse = LibrarySearchResponse
