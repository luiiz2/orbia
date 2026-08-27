import type { AiCoreService } from '../ai/ai-core.service'
import type { AiProviderId } from '../../../types/ai'
import type { HybridRetrievalRequest, HybridRetrievalResult, RetrievedChunk } from '../../../types/retrieval'
import type { SemanticIndexRepository } from '../semantic-index/semantic-index-repository.service'
import { applyTimestampProximity, fuseRankedCandidates, type RankedCandidate } from './retrieval-ranking'

const MAX_VECTOR_CANDIDATES = 4000
const MAX_SOURCES = 8

export interface LexicalRetrievalRow extends RetrievedChunk {
  lexicalRank: number
}

export interface SemanticVectorRow {
  chunk: RetrievedChunk
  vector: Buffer
  providerId: AiProviderId
  modelId: string
  dimensions: number
}

type SemanticCandidate = RankedCandidate & { semanticScore: number }

export interface HybridRetrievalServiceDependencies {
  repository: Pick<
    SemanticIndexRepository,
    'getCurrent' | 'getGenerationCoverage' | 'resolveScope' | 'searchLexical' | 'listVectorRows'
  >
  aiCore: Pick<AiCoreService, 'embed'>
}

export class HybridRetrievalService {
  public constructor(private readonly dependencies: HybridRetrievalServiceDependencies) {}

  public async retrieve(input: HybridRetrievalRequest): Promise<HybridRetrievalResult> {
    const scope = this.dependencies.repository.resolveScope(input.scope)
    if (!scope) return noCoverageResult()

    const generation = this.dependencies.repository.getCurrent()
    if (!generation || generation.status !== 'completed') return noCoverageResult()

    const coverage = this.dependencies.repository.getGenerationCoverage(generation.id)
    const query = input.query.trim()
    if (!query) return { sources: [], coverage, semanticUsed: false }

    const lexical = applyTimestampProximity(this.searchLexical(generation.id, query, scope), input.moment)
    const semantic = await this.searchSemantic(generation, query, scope, input.cloudConsent)
    const sources = applyTimestampProximity(
      fuseRankedCandidates(
        lexical,
        applyTimestampProximity(semantic.candidates, input.moment),
        Math.min(input.limit ?? MAX_SOURCES, MAX_SOURCES)
      ),
      input.moment
    )
    return { sources, coverage, semanticUsed: semantic.used }
  }

  private searchLexical(
    generationId: string,
    query: string,
    scope: HybridRetrievalRequest['scope']
  ): RankedCandidate[] {
    try {
      return this.dependencies.repository.searchLexical(generationId, query, scope, MAX_VECTOR_CANDIDATES).map((row) => ({
        ...row,
        lexicalScore: Number.isFinite(row.lexicalRank) ? -row.lexicalRank : 0,
        relevanceScore: 0
      }))
    } catch {
      return []
    }
  }

  private async searchSemantic(
    generation: NonNullable<ReturnType<SemanticIndexRepository['getCurrent']>>,
    query: string,
    scope: HybridRetrievalRequest['scope'],
    cloudConsent: boolean | undefined
  ): Promise<{ candidates: RankedCandidate[]; used: boolean }> {
    if (!generation.providerId || !generation.modelId || !generation.dimensions) {
      return { candidates: [], used: false }
    }
    try {
      const response = await this.dependencies.aiCore.embed({
        input: query,
        dataTypes: ['user_metadata'],
        cloudConsent
      })
      const queryVector = validQueryVector(response, generation.providerId, generation.modelId, generation.dimensions)
      if (!queryVector) return { candidates: [], used: false }

      const candidates = this.dependencies.repository.listVectorRows(generation.id, scope, MAX_VECTOR_CANDIDATES)
        .filter((row) => matchesGeneration(row, generation.providerId!, generation.modelId!, generation.dimensions!))
        .map((row) => {
          const vector = decodeVector(row.vector, generation.dimensions!)
          if (!vector) return null
          const semanticScore = cosineSimilarity(queryVector, vector)
          if (semanticScore === null) return null
          return { ...row.chunk, semanticScore, relevanceScore: 0 } satisfies SemanticCandidate
        })
        .filter((candidate): candidate is SemanticCandidate => candidate !== null)
        .sort((left, right) => right.semanticScore - left.semanticScore || left.chunkId.localeCompare(right.chunkId))
      return { candidates, used: candidates.length > 0 }
    } catch {
      return { candidates: [], used: false }
    }
  }
}

function noCoverageResult(): HybridRetrievalResult {
  return {
    sources: [],
    coverage: { status: 'none', indexedChunks: 0, indexedSources: 0, failedSources: 0 },
    semanticUsed: false
  }
}

function validQueryVector(
  response: { providerId: AiProviderId; modelId: string; embeddings: number[][] },
  providerId: AiProviderId,
  modelId: string,
  dimensions: number
): number[] | null {
  if (response.providerId !== providerId || response.modelId !== modelId || response.embeddings.length !== 1) return null
  const vector = response.embeddings[0]
  return vector.length === dimensions && vector.every(Number.isFinite) ? vector : null
}

function matchesGeneration(row: SemanticVectorRow, providerId: AiProviderId, modelId: string, dimensions: number): boolean {
  return row.providerId === providerId && row.modelId === modelId && row.dimensions === dimensions
}

function decodeVector(vector: Buffer, dimensions: number): number[] | null {
  if (!Buffer.isBuffer(vector) || vector.byteLength !== dimensions * Float32Array.BYTES_PER_ELEMENT) return null
  const values = Array.from(new Float32Array(vector.buffer, vector.byteOffset, dimensions))
  return values.every(Number.isFinite) ? values : null
}

function cosineSimilarity(left: number[], right: number[]): number | null {
  let dot = 0
  let leftLength = 0
  let rightLength = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftLength += left[index] * left[index]
    rightLength += right[index] * right[index]
  }
  if (leftLength === 0 || rightLength === 0) return null
  return dot / Math.sqrt(leftLength * rightLength)
}
