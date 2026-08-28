import { ipcMain } from 'electron'
import {
  LIBRARY_SEARCH_MODES,
  LIBRARY_SEARCH_RESULT_TYPES,
  type LibrarySearchFilters,
  type LibrarySearchResultType,
  type LibrarySearchRequest,
  type RelatedContentAnchor,
  type RelatedContentRequest
} from '../../types/library-search'
import { librarySearchService } from '../services/search/library-search.service'

const MAX_QUERY_LENGTH = 20_000
const MAX_ID_LENGTH = 512
const MAX_CONTENT_TYPES = LIBRARY_SEARCH_RESULT_TYPES.length
const MAX_LIMIT = 100

export function registerSearchIpc(): void {
  ipcMain.handle('search:find-in-library', (_event, payload: unknown) =>
    librarySearchService.search(parseLibrarySearchRequest(payload))
  )

  ipcMain.handle('search:related', (_event, payload: unknown) =>
    librarySearchService.related(parseRelatedContentRequest(payload))
  )

  ipcMain.handle('search:resolve-result', (_event, payload: unknown) =>
    librarySearchService.resolveResult(parseResolveResultRequest(payload))
  )
}

function parseLibrarySearchRequest(payload: unknown): LibrarySearchRequest {
  const value = readRecord(payload, 'Invalid library search request')
  const filters =
    value.filters === undefined
      ? undefined
      : parseFilters(value.filters, 'Invalid library search request')

  return {
    query: readText(
      value.query,
      MAX_QUERY_LENGTH,
      'Invalid library search request'
    ),
    ...(value.mode === undefined
      ? {}
      : { mode: readMode(value.mode, 'Invalid library search request') }),
    ...(filters === undefined ? {} : { filters }),
    ...(value.limit === undefined
      ? {}
      : { limit: readLimit(value.limit, 'Invalid library search request') }),
    ...(value.cloudConsent === undefined
      ? {}
      : {
          cloudConsent: readBoolean(
            value.cloudConsent,
            'Invalid library search request'
          )
        })
  }
}

function parseRelatedContentRequest(payload: unknown): RelatedContentRequest {
  const value = readRecord(payload, 'Invalid related content request')
  const filters =
    value.filters === undefined
      ? undefined
      : parseFilters(value.filters, 'Invalid related content request')

  return {
    anchor: parseAnchor(value.anchor),
    ...(filters === undefined ? {} : { filters }),
    ...(value.limit === undefined
      ? {}
      : { limit: readLimit(value.limit, 'Invalid related content request') }),
    ...(value.cloudConsent === undefined
      ? {}
      : {
          cloudConsent: readBoolean(
            value.cloudConsent,
            'Invalid related content request'
          )
        })
  }
}

function parseResolveResultRequest(payload: unknown): { chunkId: string } {
  const value = readRecord(payload, 'Invalid search result request')
  return {
    chunkId: readId(value.chunkId, 'Invalid search result request')
  }
}

function parseAnchor(payload: unknown): RelatedContentAnchor {
  const value = readRecord(payload, 'Invalid related content request')
  return {
    courseId: readId(value.courseId, 'Invalid related content request'),
    ...(value.chunkId === undefined
      ? {}
      : { chunkId: readId(value.chunkId, 'Invalid related content request') }),
    ...(value.moduleId === undefined
      ? {}
      : {
          moduleId: readId(value.moduleId, 'Invalid related content request')
        }),
    ...(value.lessonId === undefined
      ? {}
      : {
          lessonId: readId(value.lessonId, 'Invalid related content request')
        }),
    ...(value.resourceId === undefined
      ? {}
      : {
          resourceId: readId(
            value.resourceId,
            'Invalid related content request'
          )
        })
  }
}

function parseFilters(payload: unknown, message: string): LibrarySearchFilters {
  const value = readRecord(payload, message)
  const contentTypes =
    value.contentTypes === undefined
      ? undefined
      : readContentTypes(value.contentTypes, message)

  return {
    ...(value.courseId === undefined
      ? {}
      : { courseId: readId(value.courseId, message) }),
    ...(value.moduleId === undefined
      ? {}
      : { moduleId: readId(value.moduleId, message) }),
    ...(value.vaultId === undefined
      ? {}
      : { vaultId: readVaultId(value.vaultId, message) }),
    ...(contentTypes === undefined ? {} : { contentTypes }),
    ...(value.includeNotes === undefined
      ? {}
      : { includeNotes: readBoolean(value.includeNotes, message) })
  }
}

function readMode(
  value: unknown,
  message: string
): LibrarySearchRequest['mode'] {
  if (
    typeof value !== 'string' ||
    !LIBRARY_SEARCH_MODES.includes(
      value as (typeof LIBRARY_SEARCH_MODES)[number]
    )
  ) {
    throw new Error(message)
  }
  return value as LibrarySearchRequest['mode']
}

function readContentTypes(
  value: unknown,
  message: string
): LibrarySearchFilters['contentTypes'] {
  if (!Array.isArray(value) || value.length > MAX_CONTENT_TYPES)
    throw new Error(message)
  const contentTypes = value.map((item) => {
    if (
      typeof item !== 'string' ||
      !LIBRARY_SEARCH_RESULT_TYPES.includes(
        item as (typeof LIBRARY_SEARCH_RESULT_TYPES)[number]
      )
    ) {
      throw new Error(message)
    }
    return item as LibrarySearchResultType
  })
  return [...new Set(contentTypes)]
}

function readVaultId(value: unknown, message: string): 'current' {
  if (value !== 'current') throw new Error(message)
  return value
}

function readLimit(value: unknown, message: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_LIMIT
  ) {
    throw new Error(message)
  }
  return value
}

function readRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(message)
  return value as Record<string, unknown>
}

function readText(value: unknown, maxLength: number, message: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > maxLength ||
    hasControlCharacters(value)
  ) {
    throw new Error(message)
  }
  return value.trim()
}

function readId(value: unknown, message: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > MAX_ID_LENGTH ||
    hasControlCharacters(value) ||
    value.includes('/') ||
    value.includes('\\') ||
    /^[A-Za-z]:/.test(value.trim())
  ) {
    throw new Error(message)
  }
  return value.trim()
}

function readBoolean(value: unknown, message: string): boolean {
  if (typeof value !== 'boolean') throw new Error(message)
  return value
}

function hasControlCharacters(value: string): boolean {
  return value.split('').some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}
