import type Database from 'better-sqlite3'
import type { AiCoreService } from '../ai/ai-core.service'
import { aiCoreService } from '../ai/ai-core.service'
import type { DatabaseService } from '../database.service'
import { databaseService } from '../database.service'
import type { SemanticIndexRepository } from '../semantic-index/semantic-index-repository.service'
import { semanticIndexRepository } from '../semantic-index/semantic-index-repository.service'
import type { AiEmbeddingResponse } from '../../../types/ai'
import type {
  GroundedScope,
  IndexCoverage,
  RetrievedChunk
} from '../../../types/retrieval'
import type {
  SemanticChunkLocator,
  SemanticIndexChunk,
  SemanticIndexGeneration
} from '../../../types/semantic-index'
import type {
  LibrarySearchFilters,
  LibrarySearchGroup,
  LibrarySearchGroupType,
  LibrarySearchMode,
  LibrarySearchNavigation,
  LibrarySearchNavigationResult,
  LibrarySearchRequest,
  LibrarySearchResponse,
  LibrarySearchResult,
  LibrarySearchResultType,
  RelatedContentGroup,
  RelatedContentGroupType,
  RelatedContentRequest,
  RelatedContentResponse
} from '../../../types/library-search'

const MAX_INDEX_CANDIDATES = 4000
const DEFAULT_RESULT_LIMIT = 20
const MAX_RESULT_LIMIT = 50
const DEFAULT_RELATED_LIMIT = 5
const MAX_RELATED_LIMIT = 20
const RRF_OFFSET = 60
const MIN_SEMANTIC_SCORE = 0.000001

const GROUP_ORDER: LibrarySearchGroupType[] = [
  'courses',
  'modules',
  'lessons',
  'transcripts',
  'materials',
  'pdfs',
  'code',
  'notes'
]

const RELATED_GROUP_ORDER: RelatedContentGroupType[] = [
  'lessons',
  'materials',
  'courses'
]

const SEARCH_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'was',
  'what',
  'where',
  'when',
  'which',
  'why',
  'with',
  'about',
  'part',
  'teacher',
  'um',
  'uma',
  'e',
  'em',
  'como',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'na',
  'nas',
  'no',
  'nos',
  'o',
  'ou',
  'para',
  'por',
  'que',
  'se',
  'sobre'
])

type SearchRepository = Pick<
  SemanticIndexRepository,
  | 'getCurrent'
  | 'getGenerationCoverage'
  | 'resolveScope'
  | 'searchLexical'
  | 'listVectorRows'
  | 'listChunkIdentities'
  | 'findChunkForNavigation'
  | 'getSettings'
>

type SearchDatabaseService = Pick<
  DatabaseService,
  'getDatabase' | 'searchGlobal'
>

export interface LibrarySearchServiceDependencies {
  databaseService?: SearchDatabaseService
  repository?: SearchRepository
  aiCore?: Pick<AiCoreService, 'embed'>
}

interface LexicalCandidate {
  chunk: RetrievedChunk
  lexicalRank: number
}

interface FusedCandidate {
  chunk: RetrievedChunk
  lexicalScore?: number
  semanticScore?: number
  relevanceScore: number
}

interface CourseRow {
  id: string
  title: string
}

interface ModuleRow {
  id: string
  course_id: string
  title: string
}

interface LessonRow {
  id: string
  module_id: string
  course_id: string
  title: string
  duration: number
}

interface ResourceRow {
  id: string
  course_id: string
  module_id: string
  lesson_id: string | null
  role: string
  name: string
  resource_type: string
}

interface TranscriptRow {
  id: string
  lesson_id: string
}

interface NoteRow {
  id: string
  lesson_id: string
  course_id: string
  timestamp_seconds: number
}

interface SearchContext {
  course: CourseRow
  module?: ModuleRow
  lesson?: LessonRow
  resource?: ResourceRow
  transcript?: TranscriptRow
  note?: NoteRow
}

interface IndexState {
  generation: SemanticIndexGeneration | null
  coverage: IndexCoverage
}

interface SemanticSearchState {
  candidates: RetrievedChunk[]
  used: boolean
  unavailable: boolean
}

interface RelatedCandidate {
  candidate: FusedCandidate
  context: SearchContext
  result: LibrarySearchResult
}

export class LibrarySearchService {
  private readonly databaseService: SearchDatabaseService
  private readonly repository: SearchRepository
  private readonly aiCore: Pick<AiCoreService, 'embed'>
  private readonly resultChunkIds = new Map<
    string,
    { generationId: string; chunkId: string }
  >()

  public constructor(
    dependencies: LibrarySearchServiceDependencies | DatabaseService = {}
  ) {
    if (isDatabaseService(dependencies)) {
      this.databaseService = dependencies
      this.repository = semanticIndexRepository
      this.aiCore = aiCoreService
      return
    }

    this.databaseService = dependencies.databaseService ?? databaseService
    this.repository = dependencies.repository ?? semanticIndexRepository
    this.aiCore = dependencies.aiCore ?? aiCoreService
  }

  /**
   * Normal mode delegates to the existing deterministic database search.
   * Semantic and hybrid modes are explicit actions and never run from this
   * method unless the caller selected them.
   */
  public async search(
    input: LibrarySearchRequest
  ): Promise<LibrarySearchResponse> {
    const query = typeof input?.query === 'string' ? input.query.trim() : ''
    const mode = normalizeMode(input?.mode)
    if (mode === 'normal') return this.searchNormal(query, input?.filters)

    const state = this.getIndexState()
    if (
      !query ||
      !state.generation ||
      state.generation.status !== 'completed'
    ) {
      return emptySearchResponse(query, mode, state.coverage)
    }

    const scope = this.resolveScope(input.filters)
    if (!scope) return emptySearchResponse(query, mode, state.coverage)

    const notesEnabled = this.notesEnabled(input.filters)
    const lexical = this.searchLexical(
      state.generation.id,
      query,
      scope
    ).filter((candidate) =>
      this.matchesFilters(candidate.chunk, input.filters, notesEnabled)
    )
    const semantic = await this.searchSemantic(
      state.generation,
      query,
      scope,
      input.cloudConsent,
      input.filters,
      notesEnabled
    )
    const fused = this.fuse(
      lexical,
      semantic.candidates,
      clampLimit(input.limit, DEFAULT_RESULT_LIMIT)
    )
    const results = this.mapResults(fused, state.generation.id)

    return {
      query,
      mode,
      results,
      groups: groupResults(results),
      coverage: state.coverage,
      semanticUsed: semantic.used,
      semanticUnavailable: semantic.unavailable
    }
  }

  /**
   * Finds local vector neighbours for an indexed chunk. This supplements
   * Discovery; it does not read or mutate Discovery relationships.
   */
  public async related(
    input: RelatedContentRequest
  ): Promise<RelatedContentResponse> {
    const state = this.getIndexState()
    if (!state.generation || state.generation.status !== 'completed') {
      return emptyRelatedResponse(state.coverage)
    }

    const scope = this.resolveScope(input.filters)
    if (!scope) return emptyRelatedResponse(state.coverage)

    const notesEnabled = this.notesEnabled(input.filters)
    let rows: ReturnType<SearchRepository['listVectorRows']>
    try {
      rows = this.repository.listVectorRows(
        state.generation.id,
        scope,
        MAX_INDEX_CANDIDATES
      )
    } catch {
      return emptyRelatedResponse(state.coverage)
    }

    const anchor = findAnchorRow(rows, input.anchor)
    if (!anchor) return emptyRelatedResponse(state.coverage)
    const anchorVector = decodeVector(anchor.vector)
    if (!anchorVector) return emptyRelatedResponse(state.coverage)

    const candidates = rows
      .filter((row) => row.chunk.chunkId !== anchor.chunk.chunkId)
      .map((row) => {
        const vector = decodeVector(row.vector)
        const semanticScore = vector
          ? cosineSimilarity(anchorVector, vector)
          : null
        if (semanticScore === null || semanticScore <= MIN_SEMANTIC_SCORE)
          return null
        const candidate: FusedCandidate = {
          chunk: { ...row.chunk, semanticScore, relevanceScore: semanticScore },
          semanticScore,
          relevanceScore: semanticScore
        }
        return {
          candidate,
          row
        }
      })
      .filter(
        (
          value
        ): value is { candidate: FusedCandidate; row: (typeof rows)[number] } =>
          value !== null
      )
      .sort(
        (left, right) =>
          right.candidate.relevanceScore - left.candidate.relevanceScore ||
          left.row.chunk.chunkId.localeCompare(right.row.chunk.chunkId)
      )

    const contexts = this.loadContexts(
      candidates.map((value) => value.candidate.chunk)
    )
    const relatedCandidates: RelatedCandidate[] = []
    const publicIds = this.publicChunkIds(
      candidates.map((value) => value.candidate.chunk),
      state.generation.id
    )
    for (const value of candidates) {
      const context = contexts.get(value.candidate.chunk.chunkId)
      if (
        !context ||
        !this.matchesFilters(value.candidate.chunk, input.filters, notesEnabled)
      )
        continue
      const result = this.toResult(
        value.candidate,
        context,
        publicIds.get(value.candidate.chunk.chunkId) ??
          value.candidate.chunk.chunkId,
        false
      )
      if (!result) continue
      relatedCandidates.push({ candidate: value.candidate, context, result })
    }

    const limit = clampLimit(
      input.limit,
      DEFAULT_RELATED_LIMIT,
      MAX_RELATED_LIMIT
    )
    const groups: RelatedContentGroup[] = []
    const lessons = relatedLessonResults(relatedCandidates, input.anchor, limit)
    const materials = relatedMaterialResults(
      relatedCandidates,
      input.anchor,
      limit
    )
    const courses = relatedCourseResults(relatedCandidates, input.anchor, limit)
    for (const groupType of RELATED_GROUP_ORDER) {
      const results =
        groupType === 'lessons'
          ? lessons
          : groupType === 'materials'
            ? materials
            : courses
      if (results.length > 0) groups.push({ type: groupType, results })
    }

    return {
      groups,
      coverage: state.coverage,
      semanticUsed: true,
      semanticUnavailable: false
    }
  }

  /**
   * Resolves a result against the live database. Only canonical IDs and safe
   * locators cross this boundary; physical paths remain Main-owned.
   */
  public resolveResult(input: {
    chunkId: string
  }): LibrarySearchNavigationResult {
    const requestedId =
      typeof input?.chunkId === 'string' ? input.chunkId.trim() : ''
    if (!requestedId)
      return unavailableNavigation('Search result ID is invalid')

    try {
      const generation = this.repository.getCurrent()
      if (!generation)
        return unavailableNavigation('Search result is unavailable')
      const remembered = this.resultChunkIds.get(requestedId)
      const chunk = this.repository.findChunkForNavigation(
        generation.id,
        requestedId,
        remembered?.generationId === generation.id
          ? remembered.chunkId
          : undefined
      )
      if (!chunk) return unavailableNavigation('Search result is unavailable')

      const context = this.loadContexts([chunk]).get(chunk.id)
      if (!context)
        return unavailableNavigation('Search result ownership is invalid')
      const navigation = this.navigationForChunk(chunk, context, true)
      return navigation
        ? { status: 'ok', target: navigation }
        : unavailableNavigation('Search result locator is invalid')
    } catch {
      return unavailableNavigation('Search result is unavailable')
    }
  }

  private searchNormal(
    query: string,
    filters?: LibrarySearchFilters
  ): LibrarySearchResponse {
    if (!query) return emptySearchResponse(query, 'normal', emptyCoverage())
    const items = this.databaseService.searchGlobal(query)
    const results = items
      .filter((item) => normalItemMatchesFilters(item, filters))
      .map((item, index) => normalItemToResult(item, index))
    return {
      query,
      mode: 'normal',
      results,
      groups: groupResults(results),
      coverage: emptyCoverage(),
      semanticUsed: false,
      semanticUnavailable: false
    }
  }

  private getIndexState(): IndexState {
    try {
      const generation = this.repository.getCurrent()
      const coverage = this.repository.getGenerationCoverage(generation?.id)
      if (generation && coverage.generationId) return { generation, coverage }
      if (generation) {
        return {
          generation,
          coverage: {
            generationId: generation.id,
            status: generation.status,
            indexedChunks: generation.indexedChunks,
            indexedSources: generation.discoveredSources,
            failedSources: generation.failedSources
          }
        }
      }
      return { generation: null, coverage }
    } catch {
      return { generation: null, coverage: emptyCoverage() }
    }
  }

  private resolveScope(filters?: LibrarySearchFilters): GroundedScope | null {
    if (filters?.vaultId !== undefined && filters.vaultId !== 'current')
      return null
    const courseId = optionalIdentifier(filters?.courseId)
    const moduleId = optionalIdentifier(filters?.moduleId)
    if (filters?.courseId !== undefined && !courseId) return null
    if (filters?.moduleId !== undefined && !moduleId) return null

    try {
      if (moduleId) {
        const scope = this.repository.resolveScope({ type: 'module', moduleId })
        if (!scope) return null
        if (!courseId) return scope
        const db = this.databaseService.getDatabase()
        if (!db) return null
        const row = db
          .prepare(`SELECT course_id FROM modules WHERE id = ?`)
          .get(moduleId) as { course_id: string } | undefined
        return row?.course_id === courseId ? scope : null
      }
      if (courseId)
        return this.repository.resolveScope({ type: 'course', courseId })
      return this.repository.resolveScope({ type: 'vault' })
    } catch {
      return null
    }
  }

  private notesEnabled(filters?: LibrarySearchFilters): boolean {
    if (filters?.includeNotes !== true) return false
    try {
      return this.repository.getSettings().includeNotes
    } catch {
      return false
    }
  }

  private searchLexical(
    generationId: string,
    query: string,
    scope: GroundedScope
  ): LexicalCandidate[] {
    const rows = new Map<string, LexicalCandidate>()
    const collect = (searchQuery: string): void => {
      try {
        for (const row of this.repository.searchLexical(
          generationId,
          searchQuery,
          scope,
          MAX_INDEX_CANDIDATES
        )) {
          const candidate: LexicalCandidate = {
            chunk: {
              ...row,
              lexicalScore: Number.isFinite(row.lexicalRank)
                ? -row.lexicalRank
                : 0,
              relevanceScore: 0
            },
            lexicalRank: row.lexicalRank
          }
          const previous = rows.get(row.chunkId)
          if (!previous || lexicalRank(candidate) < lexicalRank(previous))
            rows.set(row.chunkId, candidate)
        }
      } catch {
        // FTS syntax errors or an unavailable semantic FTS table do not break
        // normal search or the semantic path.
      }
    }

    collect(query)
    const relaxedQuery = buildRelaxedLexicalQuery(query)
    if (relaxedQuery && relaxedQuery !== query) collect(relaxedQuery)
    return [...rows.values()].sort(
      (left, right) =>
        lexicalRank(left) - lexicalRank(right) ||
        left.chunk.chunkId.localeCompare(right.chunk.chunkId)
    )
  }

  private async searchSemantic(
    generation: SemanticIndexGeneration,
    query: string,
    scope: GroundedScope,
    cloudConsent: boolean | undefined,
    filters: LibrarySearchFilters | undefined,
    notesEnabled: boolean
  ): Promise<SemanticSearchState> {
    if (
      !generation.providerId ||
      !generation.modelId ||
      !generation.dimensions
    ) {
      return { candidates: [], used: false, unavailable: true }
    }

    try {
      const response = await this.aiCore.embed({
        input: query,
        dataTypes: ['user_metadata'],
        cloudConsent
      })
      const queryVector = validQueryVector(response, generation)
      if (!queryVector)
        return { candidates: [], used: false, unavailable: true }

      const candidates = this.repository
        .listVectorRows(generation.id, scope, MAX_INDEX_CANDIDATES)
        .filter(
          (row) =>
            row.providerId === generation.providerId &&
            row.modelId === generation.modelId &&
            row.dimensions === generation.dimensions
        )
        .map((row) => {
          const vector = decodeVector(row.vector)
          const semanticScore = vector
            ? cosineSimilarity(queryVector, vector)
            : null
          if (semanticScore === null || semanticScore <= MIN_SEMANTIC_SCORE)
            return null
          if (!this.matchesFilters(row.chunk, filters, notesEnabled))
            return null
          const chunk: RetrievedChunk = {
            ...row.chunk,
            semanticScore,
            relevanceScore: 0
          }
          return chunk
        })
        .filter((candidate): candidate is RetrievedChunk => candidate !== null)
        .sort(
          (left, right) =>
            (right.semanticScore ?? 0) - (left.semanticScore ?? 0) ||
            left.chunkId.localeCompare(right.chunkId)
        )

      return { candidates, used: candidates.length > 0, unavailable: false }
    } catch {
      return { candidates: [], used: false, unavailable: true }
    }
  }

  private fuse(
    lexical: LexicalCandidate[],
    semantic: RetrievedChunk[],
    limit: number
  ): RetrievedChunk[] {
    const fused = new Map<string, FusedCandidate>()
    const add = (
      chunk: RetrievedChunk,
      rank: number,
      kind: 'lexical' | 'semantic'
    ): void => {
      const score = 1 / (RRF_OFFSET + rank + 1)
      const previous = fused.get(chunk.chunkId)
      if (!previous) {
        fused.set(chunk.chunkId, {
          chunk,
          ...(kind === 'lexical' && chunk.lexicalScore !== undefined
            ? { lexicalScore: chunk.lexicalScore }
            : {}),
          ...(kind === 'semantic' && chunk.semanticScore !== undefined
            ? { semanticScore: chunk.semanticScore }
            : {}),
          relevanceScore: score
        })
        return
      }
      fused.set(chunk.chunkId, {
        chunk: {
          ...previous.chunk,
          ...chunk,
          lexicalScore: previous.lexicalScore ?? chunk.lexicalScore,
          semanticScore: previous.semanticScore ?? chunk.semanticScore,
          relevanceScore: previous.relevanceScore + score
        },
        lexicalScore: previous.lexicalScore ?? chunk.lexicalScore,
        semanticScore: previous.semanticScore ?? chunk.semanticScore,
        relevanceScore: previous.relevanceScore + score
      })
    }

    lexical.forEach((candidate, rank) => add(candidate.chunk, rank, 'lexical'))
    semantic.forEach((candidate, rank) => add(candidate, rank, 'semantic'))
    return [...fused.values()]
      .sort((left, right) => compareFusedCandidates(left, right))
      .slice(0, limit)
      .map((candidate) => ({
        ...candidate.chunk,
        ...(candidate.lexicalScore === undefined
          ? {}
          : { lexicalScore: candidate.lexicalScore }),
        ...(candidate.semanticScore === undefined
          ? {}
          : { semanticScore: candidate.semanticScore }),
        relevanceScore: candidate.relevanceScore
      }))
  }

  private matchesFilters(
    chunk: RetrievedChunk,
    filters: LibrarySearchFilters | undefined,
    notesEnabled: boolean
  ): boolean {
    if (filters?.courseId && chunk.courseId !== filters.courseId) return false
    if (filters?.moduleId && chunk.moduleId !== filters.moduleId) return false
    if (
      filters?.contentTypes &&
      !filters.contentTypes.includes(resultTypeForChunk(chunk))
    )
      return false
    if (resultTypeForChunk(chunk) === 'note' && !notesEnabled) return false
    return filters?.vaultId === undefined || filters.vaultId === 'current'
  }

  private mapResults(
    candidates: RetrievedChunk[],
    generationId: string
  ): LibrarySearchResult[] {
    const publicIds = this.publicChunkIds(candidates, generationId)
    const contexts = this.loadContexts(candidates)
    const results: LibrarySearchResult[] = []
    for (const candidate of candidates) {
      const context = contexts.get(candidate.chunkId)
      if (!context) continue
      const result = this.toResult(
        candidate,
        context,
        publicIds.get(candidate.chunkId) ?? candidate.chunkId,
        false
      )
      if (result) results.push(result)
    }
    return results
  }

  private publicChunkIds(
    candidates: RetrievedChunk[],
    generationId: string
  ): Map<string, string> {
    const revisionIds = this.revisionPublicIds(candidates, generationId)
    const counts = new Map<string, number>()
    for (const candidate of candidates) {
      const sourceId = revisionIds.get(candidate.chunkId) ?? candidate.sourceId
      counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1)
    }
    const publicIds = new Map<string, string>()
    for (const candidate of candidates) {
      const sourceId = revisionIds.get(candidate.chunkId) ?? candidate.sourceId
      const publicId =
        (counts.get(sourceId) ?? 0) === 1 ? sourceId : candidate.chunkId
      publicIds.set(candidate.chunkId, publicId)
      this.resultChunkIds.set(publicId, {
        generationId,
        chunkId: candidate.chunkId
      })
    }
    return publicIds
  }

  private revisionPublicIds(
    candidates: RetrievedChunk[],
    generationId: string
  ): Map<string, string> {
    const ids = candidates.map((candidate) => candidate.chunkId)
    if (ids.length === 0) return new Map()
    try {
      return new Map(
        this.repository
          .listChunkIdentities(generationId, ids)
          .map((chunk) => [chunk.id, stablePublicChunkId(chunk)] as const)
          .filter(
            ([chunkId, publicId]) => publicId !== chunkId && publicId !== ''
          )
      )
    } catch {
      return new Map()
    }
  }

  private toResult(
    candidate: FusedCandidate | RetrievedChunk,
    context: SearchContext,
    publicChunkId: string,
    strictNavigation: boolean
  ): LibrarySearchResult | null {
    const chunk = isFusedCandidate(candidate) ? candidate.chunk : candidate
    const navigation = this.navigationForChunk(chunk, context, strictNavigation)
    if (!navigation) return null
    const type = resultTypeForChunk(chunk)
    const resourceId = effectiveResourceId(chunk)
    const transcriptId = effectiveTranscriptId(chunk)
    const noteId = effectiveNoteId(chunk)
    return {
      id: chunk.chunkId,
      chunkId: publicChunkId,
      type,
      title: titleForChunk(chunk, type, context),
      excerpt: excerpt(chunk.text),
      courseId: context.course.id,
      courseTitle: context.course.title,
      ...(context.module
        ? { moduleId: context.module.id, moduleTitle: context.module.title }
        : {}),
      ...(context.lesson
        ? { lessonId: context.lesson.id, lessonTitle: context.lesson.title }
        : {}),
      ...(resourceId ? { resourceId } : {}),
      ...(transcriptId ? { transcriptId } : {}),
      ...(noteId ? { noteId } : {}),
      sourceKind: chunk.sourceKind,
      sourceId: chunk.sourceId,
      locator: { ...chunk.locator },
      ...(chunk.lexicalScore === undefined
        ? {}
        : { lexicalScore: chunk.lexicalScore }),
      ...(chunk.semanticScore === undefined
        ? {}
        : { semanticScore: chunk.semanticScore }),
      relevanceScore: candidate.relevanceScore,
      navigation
    }
  }

  private navigationForChunk(
    chunk: RetrievedChunk | SemanticIndexChunk,
    context: SearchContext,
    strict: boolean
  ): LibrarySearchNavigation | null {
    const type = resultTypeForChunk(chunk)
    const metadataType =
      type === 'course' || type === 'module' || type === 'lesson'
    if (metadataType) {
      if (type === 'course')
        return { type: 'course', courseId: context.course.id }
      if (type === 'module' && context.module)
        return {
          type: 'module',
          courseId: context.course.id,
          moduleId: context.module.id
        }
      if (type === 'lesson' && context.lesson && context.module) {
        return {
          type: 'lesson',
          courseId: context.course.id,
          moduleId: context.module.id,
          lessonId: context.lesson.id
        }
      }
      return null
    }

    if (
      (type === 'transcript' || type === 'note') &&
      context.lesson &&
      context.module
    ) {
      const timestamp = timestampForChunk(chunk, context)
      if (timestamp.invalid && strict) return null
      return {
        type: 'lesson',
        courseId: context.course.id,
        moduleId: context.module.id,
        lessonId: context.lesson.id,
        ...(timestamp.value === undefined
          ? {}
          : { timestampSeconds: timestamp.value })
      }
    }
    if (type === 'transcript' || type === 'note') return null

    if (!context.module || (!context.resource && !context.lesson)) return null
    if (
      type === 'pdf' &&
      (!context.resource ||
        context.resource.resource_type.toLowerCase() !== 'pdf')
    )
      return null
    if (chunk.sourceKind === 'subtitle') return null

    const page = positivePage(chunk.locator.page)
    if (chunk.locator.page !== undefined && page === null && strict) return null
    const lines = lineRange(chunk.locator)
    if (lines.invalid && strict) return null
    if (lines.invalid && !strict) return null
    return {
      type: 'resource',
      courseId: context.course.id,
      moduleId: context.module.id,
      ...(context.lesson ? { lessonId: context.lesson.id } : {}),
      ...(context.resource ? { resourceId: context.resource.id } : {}),
      sourceKind: chunk.sourceKind,
      ...(page === null ? {} : { page }),
      ...(lines.startLine === undefined
        ? {}
        : { startLine: lines.startLine, endLine: lines.endLine })
    }
  }

  private loadContexts(
    chunks: Array<RetrievedChunk | SemanticIndexChunk>
  ): Map<string, SearchContext> {
    const contexts = new Map<string, SearchContext>()
    const db = this.databaseService.getDatabase()
    if (!db || chunks.length === 0) return contexts

    const courseIds = unique(chunks.map((chunk) => chunk.courseId))
    const resourceIds = unique(
      chunks.map((chunk) => effectiveResourceId(chunk)).filter(isString)
    )
    const courseRows = selectRows<CourseRow>(
      db,
      `
      SELECT id, COALESCE(custom_title, title) AS title
      FROM courses
      WHERE id IN (__IDS__)
    `,
      courseIds
    )
    const resourceRows = selectRows<ResourceRow>(
      db,
      `
      SELECT id, course_id, module_id, lesson_id, role, name, resource_type
      FROM content_resources
      WHERE id IN (__IDS__)
    `,
      resourceIds
    )
    const moduleIds = unique(
      [
        ...chunks.map((chunk) => chunk.moduleId),
        ...resourceRows.map((row) => row.module_id)
      ].filter(isString)
    )
    const lessonIds = unique(
      [
        ...chunks.map((chunk) => chunk.lessonId),
        ...resourceRows.map((row) => row.lesson_id ?? undefined)
      ].filter(isString)
    )
    const moduleRows = selectRows<ModuleRow>(
      db,
      `
      SELECT id, course_id, COALESCE(custom_title, title) AS title
      FROM modules
      WHERE id IN (__IDS__)
    `,
      moduleIds
    )
    const lessonRows = selectRows<LessonRow>(
      db,
      `
      SELECT id, module_id, course_id, COALESCE(custom_title, title) AS title, duration
      FROM lessons
      WHERE id IN (__IDS__)
    `,
      lessonIds
    )
    const transcriptIds = unique(
      chunks.map((chunk) => effectiveTranscriptId(chunk)).filter(isString)
    )
    const noteIds = unique(
      chunks.map((chunk) => effectiveNoteId(chunk)).filter(isString)
    )
    const transcriptRows = selectRows<TranscriptRow>(
      db,
      `
      SELECT id, lesson_id
      FROM transcripts
      WHERE id IN (__IDS__)
    `,
      transcriptIds
    )
    const noteRows = selectRows<NoteRow>(
      db,
      `
      SELECT id, lesson_id, course_id, timestamp_seconds
      FROM lesson_notes
      WHERE id IN (__IDS__)
    `,
      noteIds
    )

    const courses = new Map(courseRows.map((row) => [row.id, row]))
    const modules = new Map(moduleRows.map((row) => [row.id, row]))
    const lessons = new Map(lessonRows.map((row) => [row.id, row]))
    const resources = new Map(resourceRows.map((row) => [row.id, row]))
    const transcripts = new Map(transcriptRows.map((row) => [row.id, row]))
    const notes = new Map(noteRows.map((row) => [row.id, row]))

    for (const chunk of chunks) {
      const resource = effectiveResourceId(chunk)
        ? resources.get(effectiveResourceId(chunk)!)
        : undefined
      const module = modules.get(chunk.moduleId ?? resource?.module_id ?? '')
      const lesson = lessons.get(chunk.lessonId ?? resource?.lesson_id ?? '')
      const course = courses.get(chunk.courseId)
      if (!course) continue
      if (module && module.course_id !== course.id) continue
      if (chunk.moduleId && (!module || module.id !== chunk.moduleId)) continue
      if (
        lesson &&
        (lesson.course_id !== course.id ||
          (module && lesson.module_id !== module.id))
      )
        continue
      if (chunk.lessonId && (!lesson || lesson.id !== chunk.lessonId)) continue
      if (resource) {
        const expectedRole =
          chunk.sourceKind === 'subtitle' ? 'subtitle' : 'resource'
        if (resource.role !== expectedRole || resource.course_id !== course.id)
          continue
        if (chunk.moduleId && resource.module_id !== chunk.moduleId) continue
        if (chunk.lessonId && resource.lesson_id !== chunk.lessonId) continue
      } else if (effectiveResourceId(chunk)) {
        continue
      }

      const transcript = effectiveTranscriptId(chunk)
        ? transcripts.get(effectiveTranscriptId(chunk)!)
        : undefined
      if (transcript && (!lesson || transcript.lesson_id !== lesson.id))
        continue
      if (effectiveTranscriptId(chunk) && !transcript) continue
      const note = effectiveNoteId(chunk)
        ? notes.get(effectiveNoteId(chunk)!)
        : undefined
      if (
        note &&
        (!lesson ||
          note.lesson_id !== lesson.id ||
          note.course_id !== course.id)
      )
        continue
      if (effectiveNoteId(chunk) && !note) continue

      const context: SearchContext = {
        course,
        ...(module ? { module } : {}),
        ...(lesson ? { lesson } : {}),
        ...(resource ? { resource } : {}),
        ...(transcript ? { transcript } : {}),
        ...(note ? { note } : {})
      }
      if (!this.navigationForChunk(chunk, context, false)) continue
      contexts.set(chunkIdentifier(chunk), context)
    }
    return contexts
  }
}

function normalizeMode(mode: LibrarySearchMode | undefined): LibrarySearchMode {
  return mode === 'semantic' || mode === 'hybrid' ? mode : 'normal'
}

function emptyCoverage(): IndexCoverage {
  return {
    status: 'none',
    indexedChunks: 0,
    indexedSources: 0,
    failedSources: 0
  }
}

function emptySearchResponse(
  query: string,
  mode: LibrarySearchMode,
  coverage: IndexCoverage
): LibrarySearchResponse {
  return {
    query,
    mode,
    results: [],
    groups: [],
    coverage,
    semanticUsed: false,
    semanticUnavailable: false
  }
}

function emptyRelatedResponse(coverage: IndexCoverage): RelatedContentResponse {
  return {
    groups: [],
    coverage,
    semanticUsed: false,
    semanticUnavailable: false
  }
}

function normalItemMatchesFilters(
  item: {
    type: 'course' | 'module' | 'lesson'
    courseId: string
    moduleId?: string
  },
  filters?: LibrarySearchFilters
): boolean {
  if (filters?.vaultId !== undefined && filters.vaultId !== 'current')
    return false
  if (filters?.courseId && filters.courseId !== item.courseId) return false
  if (filters?.moduleId && filters.moduleId !== item.moduleId) return false
  return !filters?.contentTypes || filters.contentTypes.includes(item.type)
}

function normalItemToResult(
  item: {
    type: 'course' | 'module' | 'lesson'
    id: string
    title: string
    courseId: string
    courseTitle: string
    moduleId?: string
    moduleTitle?: string
  },
  index: number
): LibrarySearchResult {
  const navigation: LibrarySearchNavigation =
    item.type === 'course'
      ? { type: 'course', courseId: item.courseId }
      : item.type === 'module'
        ? { type: 'module', courseId: item.courseId, moduleId: item.moduleId! }
        : {
            type: 'lesson',
            courseId: item.courseId,
            moduleId: item.moduleId!,
            lessonId: item.id
          }
  return {
    id: `normal:${item.type}:${item.id}`,
    chunkId: `normal:${item.type}:${item.id}`,
    type: item.type,
    title: item.title,
    excerpt: item.title,
    courseId: item.courseId,
    courseTitle: item.courseTitle,
    ...(item.moduleId ? { moduleId: item.moduleId } : {}),
    ...(item.moduleTitle ? { moduleTitle: item.moduleTitle } : {}),
    sourceKind: 'metadata',
    sourceId: item.id,
    locator: {},
    lexicalScore: 1 / (index + 1),
    relevanceScore: 1 / (index + 1),
    navigation
  }
}

function groupResults(results: LibrarySearchResult[]): LibrarySearchGroup[] {
  const groups = new Map<LibrarySearchGroupType, LibrarySearchResult[]>()
  for (const result of results) {
    const type = groupTypeForResult(result.type)
    const current = groups.get(type)
    if (current) current.push(result)
    else groups.set(type, [result])
  }
  return GROUP_ORDER.filter((type) => groups.has(type)).map((type) => ({
    type,
    results: groups.get(type)!
  }))
}

function groupTypeForResult(
  type: LibrarySearchResultType
): LibrarySearchGroupType {
  if (type === 'course') return 'courses'
  if (type === 'module') return 'modules'
  if (type === 'lesson') return 'lessons'
  if (type === 'transcript') return 'transcripts'
  if (type === 'materials') return 'materials'
  if (type === 'pdf') return 'pdfs'
  if (type === 'code') return 'code'
  return 'notes'
}

function compareFusedCandidates(
  left: FusedCandidate,
  right: FusedCandidate
): number {
  return (
    right.relevanceScore - left.relevanceScore ||
    resultTypeOrder(resultTypeForChunk(left.chunk)) -
      resultTypeOrder(resultTypeForChunk(right.chunk)) ||
    left.chunk.chunkId.localeCompare(right.chunk.chunkId)
  )
}

function resultTypeOrder(type: LibrarySearchResultType): number {
  const order: LibrarySearchResultType[] = [
    'course',
    'module',
    'lesson',
    'transcript',
    'materials',
    'pdf',
    'code',
    'note'
  ]
  return order.indexOf(type)
}

function resultTypeForChunk(
  chunk: Pick<
    RetrievedChunk,
    'sourceKind' | 'sourceId' | 'lessonId' | 'moduleId'
  >
): LibrarySearchResultType {
  if (chunk.sourceKind === 'metadata') return metadataResultType(chunk)
  if (chunk.sourceKind === 'transcript' || chunk.sourceKind === 'subtitle')
    return 'transcript'
  if (chunk.sourceKind === 'pdf') return 'pdf'
  if (chunk.sourceKind === 'code') return 'code'
  if (chunk.sourceKind === 'note') return 'note'
  return 'materials'
}

function metadataResultType(
  chunk: Pick<
    RetrievedChunk,
    'sourceKind' | 'sourceId' | 'lessonId' | 'moduleId'
  >
): 'course' | 'module' | 'lesson' {
  const parts = chunk.sourceId.split(':')
  if (
    parts[0] === 'metadata' &&
    (parts[1] === 'course' || parts[1] === 'module' || parts[1] === 'lesson')
  ) {
    return parts[1]
  }
  if (chunk.lessonId) return 'lesson'
  if (chunk.moduleId) return 'module'
  return 'course'
}

function titleForChunk(
  chunk: RetrievedChunk,
  type: LibrarySearchResultType,
  context: SearchContext
): string {
  if (type === 'course') return context.course.title
  if (type === 'module') return context.module?.title ?? context.course.title
  if (type === 'lesson' || type === 'transcript' || type === 'note')
    return (
      context.lesson?.title ?? context.module?.title ?? context.course.title
    )
  return (
    context.resource?.name ??
    chunk.locator.fileName ??
    context.lesson?.title ??
    context.module?.title ??
    chunk.sourceId
  )
}

function excerpt(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (compact.length <= 240) return compact
  return `${compact.slice(0, 237).trimEnd()}...`
}

function lexicalRank(candidate: LexicalCandidate): number {
  return Number.isFinite(candidate.lexicalRank)
    ? candidate.lexicalRank
    : Number.MAX_SAFE_INTEGER
}

function buildRelaxedLexicalQuery(query: string): string | null {
  const tokens =
    query
      .normalize('NFKC')
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token)) ??
    []
  const uniqueTokens = [...new Set(tokens)]
  if (uniqueTokens.length === 0) return null
  return uniqueTokens
    .map((token) => `"${token.replaceAll('"', '""')}"`)
    .join(' OR ')
}

function validQueryVector(
  response: AiEmbeddingResponse,
  generation: SemanticIndexGeneration
): number[] | null {
  if (
    response.providerId !== generation.providerId ||
    response.modelId !== generation.modelId ||
    response.embeddings.length !== 1
  )
    return null
  const vector = response.embeddings[0]
  if (
    !generation.dimensions ||
    vector.length !== generation.dimensions ||
    !vector.every(Number.isFinite)
  )
    return null
  return vector
}

function decodeVector(encoded: Buffer): number[] | null {
  if (encoded.byteLength === 0 || encoded.byteLength % 4 !== 0) return null
  const vector: number[] = []
  for (let offset = 0; offset < encoded.byteLength; offset += 4) {
    const value = encoded.readFloatLE(offset)
    if (!Number.isFinite(value)) return null
    vector.push(value)
  }
  return vector
}

function cosineSimilarity(left: number[], right: number[]): number | null {
  if (left.length === 0 || left.length !== right.length) return null
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftNorm += left[index] * left[index]
    rightNorm += right[index] * right[index]
  }
  if (leftNorm <= 0 || rightNorm <= 0) return null
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

function timestampForChunk(
  chunk: Pick<RetrievedChunk, 'locator'> &
    Partial<Pick<RetrievedChunk, 'sourceKind'>> &
    Partial<Pick<SemanticIndexChunk, 'startTime' | 'endTime'>>,
  context: SearchContext
): { value?: number; invalid: boolean } {
  const locator = chunk.locator
  const hasLocatorTime =
    locator.startTime !== undefined ||
    locator.endTime !== undefined ||
    chunk.startTime !== undefined ||
    chunk.endTime !== undefined
  const start = locator.startTime ?? chunk.startTime
  const end = locator.endTime ?? chunk.endTime
  const fallback =
    chunk.sourceKind === 'note' ? context.note?.timestamp_seconds : undefined
  if (!hasLocatorTime && fallback === undefined) return { invalid: false }
  if (!hasLocatorTime && fallback !== undefined)
    return boundedTimestamp(fallback, fallback, context.lesson?.duration)
  if (start === undefined || !Number.isFinite(start) || start < 0)
    return { invalid: true }
  if (end !== undefined && (!Number.isFinite(end) || end < start))
    return { invalid: true }
  return boundedTimestamp(start, end ?? start, context.lesson?.duration)
}

function boundedTimestamp(
  start: number,
  end: number,
  duration: number | undefined
): { value?: number; invalid: boolean } {
  if (
    duration === undefined ||
    !Number.isFinite(duration) ||
    duration < 0 ||
    start > duration
  )
    return { invalid: true }
  return {
    value: Math.min(start, duration),
    invalid: end < 0 || end < start ? true : false
  }
}

function positivePage(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null
}

function lineRange(locator: SemanticChunkLocator): {
  startLine?: number
  endLine?: number
  invalid: boolean
} {
  if (locator.startLine === undefined && locator.endLine === undefined)
    return { invalid: false }
  if (
    !positiveInteger(locator.startLine) ||
    (locator.endLine !== undefined && !positiveInteger(locator.endLine))
  )
    return { invalid: true }
  const endLine = locator.endLine ?? locator.startLine
  if (endLine! < locator.startLine!) return { invalid: true }
  return { startLine: locator.startLine, endLine, invalid: false }
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function effectiveResourceId(
  chunk: Pick<RetrievedChunk, 'resourceId' | 'sourceId'>
): string | undefined {
  return (
    chunk.resourceId ??
    (chunk.sourceId.startsWith('resource:')
      ? chunk.sourceId.slice('resource:'.length)
      : undefined)
  )
}

function effectiveTranscriptId(
  chunk: Pick<RetrievedChunk, 'transcriptId' | 'locator'>
): string | undefined {
  return chunk.transcriptId ?? chunk.locator.transcriptId
}

function effectiveNoteId(
  chunk: Pick<RetrievedChunk, 'noteId' | 'locator' | 'sourceId'>
): string | undefined {
  return (
    chunk.noteId ??
    chunk.locator.noteId ??
    (chunk.sourceId.startsWith('note:')
      ? chunk.sourceId.slice('note:'.length)
      : undefined)
  )
}

function stablePublicChunkId(
  chunk: Pick<SemanticIndexChunk, 'id' | 'sourceId' | 'contentRevision'>
): string {
  const suffix = ':revision-1'
  if (chunk.contentRevision.endsWith(suffix)) {
    const candidate = chunk.contentRevision.slice(0, -suffix.length)
    if (candidate && !candidate.includes('/') && !candidate.includes('\\'))
      return candidate
  }
  return chunk.sourceId || chunk.id
}

function isFusedCandidate(
  candidate: FusedCandidate | RetrievedChunk
): candidate is FusedCandidate {
  return 'chunk' in candidate
}

function chunkIdentifier(chunk: RetrievedChunk | SemanticIndexChunk): string {
  return 'id' in chunk ? chunk.id : chunk.chunkId
}

function findAnchorRow(
  rows: ReturnType<SearchRepository['listVectorRows']>,
  anchor: RelatedContentRequest['anchor']
): (typeof rows)[number] | null {
  const sorted = [...rows].sort((left, right) =>
    left.chunk.chunkId.localeCompare(right.chunk.chunkId)
  )
  return (
    sorted.find((row) => {
      const chunk = row.chunk
      if (
        anchor.chunkId &&
        chunk.chunkId !== anchor.chunkId &&
        chunk.sourceId !== anchor.chunkId
      )
        return false
      if (anchor.courseId !== chunk.courseId) return false
      if (anchor.moduleId && anchor.moduleId !== chunk.moduleId) return false
      if (anchor.lessonId && anchor.lessonId !== chunk.lessonId) return false
      if (anchor.resourceId && anchor.resourceId !== effectiveResourceId(chunk))
        return false
      return true
    }) ?? null
  )
}

function relatedLessonResults(
  candidates: RelatedCandidate[],
  anchor: RelatedContentRequest['anchor'],
  limit: number
): LibrarySearchResult[] {
  const byLesson = new Map<string, RelatedCandidate>()
  for (const candidate of candidates) {
    const lessonId = candidate.result.lessonId
    if (!lessonId || lessonId === anchor.lessonId) continue
    const current = byLesson.get(lessonId)
    if (
      !current ||
      candidate.result.relevanceScore > current.result.relevanceScore ||
      (candidate.result.relevanceScore === current.result.relevanceScore &&
        candidate.result.chunkId.localeCompare(current.result.chunkId) < 0)
    ) {
      byLesson.set(lessonId, candidate)
    }
  }
  return [...byLesson.values()]
    .sort(compareRelated)
    .slice(0, limit)
    .map((candidate) => ({
      ...candidate.result,
      type: 'lesson',
      title: candidate.context.lesson?.title ?? candidate.result.title,
      navigation:
        candidate.context.lesson && candidate.context.module
          ? {
              type: 'lesson' as const,
              courseId: candidate.context.course.id,
              moduleId: candidate.context.module.id,
              lessonId: candidate.context.lesson.id,
              ...(timestampForChunk(
                candidate.candidate.chunk,
                candidate.context
              ).value === undefined
                ? {}
                : {
                    timestampSeconds: timestampForChunk(
                      candidate.candidate.chunk,
                      candidate.context
                    ).value
                  })
            }
          : candidate.result.navigation
    }))
}

function relatedMaterialResults(
  candidates: RelatedCandidate[],
  anchor: RelatedContentRequest['anchor'],
  limit: number
): LibrarySearchResult[] {
  const byMaterial = new Map<string, RelatedCandidate>()
  for (const candidate of candidates) {
    if (!['materials', 'pdf', 'code', 'note'].includes(candidate.result.type))
      continue
    const materialId =
      candidate.result.resourceId ??
      candidate.result.noteId ??
      candidate.result.sourceId
    if (anchor.resourceId && materialId === anchor.resourceId) continue
    if (
      anchor.chunkId &&
      (candidate.result.chunkId === anchor.chunkId ||
        candidate.result.sourceId === anchor.chunkId)
    )
      continue
    const current = byMaterial.get(materialId)
    if (
      !current ||
      candidate.result.relevanceScore > current.result.relevanceScore ||
      (candidate.result.relevanceScore === current.result.relevanceScore &&
        candidate.result.chunkId.localeCompare(current.result.chunkId) < 0)
    ) {
      byMaterial.set(materialId, candidate)
    }
  }
  return [...byMaterial.values()]
    .sort(compareRelated)
    .slice(0, limit)
    .map((candidate) => candidate.result)
}

function relatedCourseResults(
  candidates: RelatedCandidate[],
  anchor: RelatedContentRequest['anchor'],
  limit: number
): LibrarySearchResult[] {
  const byCourse = new Map<string, RelatedCandidate>()
  for (const candidate of candidates) {
    if (candidate.result.courseId === anchor.courseId) continue
    const current = byCourse.get(candidate.result.courseId)
    if (
      !current ||
      candidate.result.relevanceScore > current.result.relevanceScore ||
      (candidate.result.relevanceScore === current.result.relevanceScore &&
        candidate.result.chunkId.localeCompare(current.result.chunkId) < 0)
    ) {
      byCourse.set(candidate.result.courseId, candidate)
    }
  }
  return [...byCourse.values()]
    .sort(compareRelated)
    .slice(0, limit)
    .map((candidate) => ({
      ...candidate.result,
      type: 'course',
      title: candidate.context.course.title,
      navigation: {
        type: 'course' as const,
        courseId: candidate.context.course.id
      }
    }))
}

function compareRelated(
  left: RelatedCandidate,
  right: RelatedCandidate
): number {
  return (
    right.result.relevanceScore - left.result.relevanceScore ||
    left.result.chunkId.localeCompare(right.result.chunkId)
  )
}

function selectRows<T>(db: Database.Database, sql: string, ids: string[]): T[] {
  if (ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(', ')
  return db.prepare(sql.replace('__IDS__', placeholders)).all(...ids) as T[]
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter(isString))]
}

function isString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0
}

function optionalIdentifier(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function clampLimit(
  value: number | undefined,
  fallback: number,
  maximum = MAX_RESULT_LIMIT
): number {
  if (!Number.isFinite(value) || value === undefined || value <= 0)
    return fallback
  return Math.max(1, Math.min(Math.floor(value), maximum))
}

function unavailableNavigation(reason: string): LibrarySearchNavigationResult {
  return { status: 'unavailable', reason }
}

function isDatabaseService(
  value: LibrarySearchServiceDependencies | DatabaseService
): value is DatabaseService {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as { getDatabase?: unknown }).getDatabase === 'function' &&
    typeof (value as { searchGlobal?: unknown }).searchGlobal === 'function'
  )
}

export const librarySearchService = new LibrarySearchService({
  databaseService,
  repository: semanticIndexRepository,
  aiCore: aiCoreService
})
