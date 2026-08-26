import type {
  SourceMatchEvaluation,
  SourceMatchSummary
} from '../../../types/source'
import { SOURCE_MATCH_REVIEW_THRESHOLD, SourceMatcher } from './source-matcher'
import { SourceRepositoryService } from './source-repository.service'

const AUTO_LINK_MARGIN = 0.1

export class SourceMatchingService {
  public constructor(
    private readonly repository: SourceRepositoryService,
    private readonly matcher: SourceMatcher = new SourceMatcher(),
    private readonly now: () => number = Date.now
  ) {}

  public async matchRoot(rootId: string): Promise<SourceMatchSummary> {
    const sourceItems = this.repository.listUnlinkedMatchItems(rootId)
    const targets = this.repository.listMatchTargets()
    const sourceCourseId = this.repository.getRootMatchCourseId(rootId)
    const rejectedCandidates = new Set(
      this.repository
        .listMatchCandidates('rejected')
        .map((candidate) =>
          this.candidateKey(candidate.sourceItemId, candidate.canonicalId)
        )
    )
    const summary: SourceMatchSummary = {
      evaluated: sourceItems.length,
      autoLinked: 0,
      pending: 0,
      duplicates: 0
    }

    for (const sourceItem of sourceItems) {
      const evaluations = targets
        .map((target) =>
          this.matcher.evaluate({
            source: {
              sourceItemId: sourceItem.id,
              courseId: sourceCourseId,
              name: sourceItem.name,
              relativePath: sourceItem.relativePath,
              size: sourceItem.size,
              duration: sourceItem.technicalMetadata?.duration,
              fingerprint: sourceItem.fingerprint,
              checksum: sourceItem.checksum,
              technicalMetadata: sourceItem.technicalMetadata
            },
            target
          })
        )
        .sort(compareEvaluations)

      const duplicateEvaluations = evaluations.filter(
        (evaluation) => evaluation.evidence.duplicateAcrossCourses
      )
      for (const evaluation of duplicateEvaluations) {
        if (this.isRejected(rejectedCandidates, evaluation)) continue
        this.repository.upsertMatchCandidate(evaluation, this.now())
        summary.duplicates += 1
      }

      const sameCourseEvaluations = evaluations.filter(
        (evaluation) => evaluation.evidence.courseContext === 'same'
      )
      const comparableEvaluations =
        sameCourseEvaluations.length > 0
          ? sameCourseEvaluations
          : evaluations.filter(
              (evaluation) => evaluation.evidence.courseContext === 'unknown'
            )
      const eligibleEvaluations = comparableEvaluations.filter(
        (evaluation) => evaluation.confidence >= SOURCE_MATCH_REVIEW_THRESHOLD
      )
      const bestEvaluation = eligibleEvaluations[0]
      if (!bestEvaluation) continue

      const nextEvaluation = eligibleEvaluations[1]
      const isUnambiguous =
        !nextEvaluation ||
        bestEvaluation.confidence - nextEvaluation.confidence >=
          AUTO_LINK_MARGIN

      if (
        bestEvaluation.action === 'auto-link' &&
        isUnambiguous &&
        !this.isRejected(rejectedCandidates, bestEvaluation)
      ) {
        this.repository.upsertMatchCandidate(bestEvaluation, this.now())
        summary.autoLinked += 1
        continue
      }

      const reviewEvaluations = eligibleEvaluations.filter(
        (evaluation) =>
          bestEvaluation.confidence - evaluation.confidence <= AUTO_LINK_MARGIN
      )
      for (const evaluation of reviewEvaluations) {
        if (this.isRejected(rejectedCandidates, evaluation)) continue
        this.repository.upsertMatchCandidate(
          { ...evaluation, action: 'review' },
          this.now()
        )
        summary.pending += 1
      }
    }

    return summary
  }

  private isRejected(
    rejectedCandidates: Set<string>,
    evaluation: SourceMatchEvaluation
  ): boolean {
    return rejectedCandidates.has(
      this.candidateKey(evaluation.sourceItemId, evaluation.canonicalId)
    )
  }

  private candidateKey(sourceItemId: string, canonicalId: string): string {
    return `${sourceItemId}:${canonicalId}`
  }
}

function compareEvaluations(
  left: SourceMatchEvaluation,
  right: SourceMatchEvaluation
): number {
  return (
    right.confidence - left.confidence ||
    left.canonicalType.localeCompare(right.canonicalType) ||
    left.canonicalId.localeCompare(right.canonicalId)
  )
}
