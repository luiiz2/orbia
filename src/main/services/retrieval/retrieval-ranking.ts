import type { RetrievalMoment, RetrievedChunk } from '../../../types/retrieval'

const RECIPROCAL_RANK_OFFSET = 60
const MAX_SOURCES = 8

export interface RankedCandidate extends RetrievedChunk {
  relevanceScore: number
}

export function fuseRankedCandidates(
  lexical: RankedCandidate[],
  semantic: RankedCandidate[],
  limit: number
): RankedCandidate[] {
  const scores = new Map<string, RankedCandidate>()
  lexical.forEach((candidate, rank) => addRank(scores, candidate, 1 / (RECIPROCAL_RANK_OFFSET + rank + 1)))
  semantic.forEach((candidate, rank) => addRank(scores, candidate, 1 / (RECIPROCAL_RANK_OFFSET + rank + 1)))
  return [...scores.values()]
    .sort(compareCandidates)
    .slice(0, Math.max(1, Math.min(limit, MAX_SOURCES)))
}

export function applyTimestampProximity(candidates: RankedCandidate[], moment?: RetrievalMoment): RankedCandidate[] {
  if (!moment || !Number.isFinite(moment.timestampSeconds)) return candidates
  return candidates
    .map((candidate) => ({
      ...candidate,
      relevanceScore: candidate.relevanceScore + proximityBoost(candidate, moment)
    }))
    .sort(compareCandidates)
}

function addRank(scores: Map<string, RankedCandidate>, candidate: RankedCandidate, score: number): void {
  const existing = scores.get(candidate.chunkId)
  if (!existing) {
    scores.set(candidate.chunkId, { ...candidate, relevanceScore: score })
    return
  }
  scores.set(candidate.chunkId, {
    ...existing,
    ...candidate,
    lexicalScore: existing.lexicalScore ?? candidate.lexicalScore,
    semanticScore: existing.semanticScore ?? candidate.semanticScore,
    relevanceScore: existing.relevanceScore + score
  })
}

function proximityBoost(candidate: RankedCandidate, moment: RetrievalMoment): number {
  if (candidate.lessonId !== moment.lessonId) return 0
  const start = candidate.locator.startTime
  const end = candidate.locator.endTime
  if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end)) return 0
  const lower = Math.min(start, end)
  const upper = Math.max(start, end)
  const distance = moment.timestampSeconds < lower
    ? lower - moment.timestampSeconds
    : moment.timestampSeconds > upper
      ? moment.timestampSeconds - upper
      : 0
  return 0.05 / (distance + 1)
}

function compareCandidates(left: RankedCandidate, right: RankedCandidate): number {
  return right.relevanceScore - left.relevanceScore || left.chunkId.localeCompare(right.chunkId)
}
