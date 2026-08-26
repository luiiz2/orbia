import type {
  SourceMatchCourseContext,
  SourceMatchEvaluation,
  SourceMatchInput,
  SourceMatchSignal,
  SourceTechnicalMetadata
} from '../../../types/source'
import { SOURCE_MATCH_THRESHOLD_VERSION } from '../../../types/source'

export { SOURCE_MATCH_THRESHOLD_VERSION } from '../../../types/source'

export const SOURCE_MATCH_AUTO_LINK_THRESHOLD = 0.85
export const SOURCE_MATCH_REVIEW_THRESHOLD = 0.55

const STRONG_CONTENT_SCORE = 0.65
const SIGNAL_SCORES = {
  title: 0.15,
  relativeStructure: 0.1,
  duration: 0.25,
  size: 0.3,
  technicalMetadata: 0.1
} as const

export class SourceMatcher {
  public evaluate(input: SourceMatchInput): SourceMatchEvaluation {
    const courseContext = getCourseContext(
      input.source.courseId,
      input.target.courseId
    )
    const checksumMatched = matchesOptional(
      input.source.checksum,
      input.target.checksum
    )
    const fingerprintMatched = matchesOptional(
      input.source.fingerprint,
      input.target.fingerprint
    )
    const titleMatched =
      normalizeMatchText(removeExtension(input.source.name)) ===
      normalizeMatchText(input.target.title)
    const relativeStructureMatched =
      normalizeMatchText(input.source.relativePath) ===
      normalizeMatchText(input.target.relativePath)
    const durationMatched = matchesDuration(
      input.source.duration,
      input.target.duration
    )
    const sizeMatched = matchesOptionalNumber(
      input.source.size,
      input.target.size
    )
    const technicalMetadataCompatible = areTechnicalMetadataCompatible(
      input.source.technicalMetadata,
      input.target.technicalMetadata
    )
    const technicalMetadataMatched =
      hasComparableTechnicalMetadata(
        input.source.technicalMetadata,
        input.target.technicalMetadata
      ) && technicalMetadataCompatible

    const signals: SourceMatchSignal[] = [
      {
        kind: 'checksum',
        matched: checksumMatched,
        score: checksumMatched ? STRONG_CONTENT_SCORE : 0
      },
      {
        kind: 'fingerprint',
        matched: fingerprintMatched,
        score: fingerprintMatched ? STRONG_CONTENT_SCORE : 0
      },
      {
        kind: 'title',
        matched: titleMatched,
        score: titleMatched ? SIGNAL_SCORES.title : 0
      },
      {
        kind: 'relative-structure',
        matched: relativeStructureMatched,
        score: relativeStructureMatched ? SIGNAL_SCORES.relativeStructure : 0
      },
      {
        kind: 'duration',
        matched: durationMatched,
        score: durationMatched ? SIGNAL_SCORES.duration : 0
      },
      {
        kind: 'size',
        matched: sizeMatched,
        score: sizeMatched ? SIGNAL_SCORES.size : 0
      },
      {
        kind: 'technical-metadata',
        matched: technicalMetadataMatched,
        score: technicalMetadataMatched ? SIGNAL_SCORES.technicalMetadata : 0
      }
    ]

    const strongContentMatch = checksumMatched || fingerprintMatched
    const duplicateAcrossCourses =
      courseContext === 'different' && strongContentMatch
    const rawConfidence = Math.min(
      1,
      signals.reduce((total, signal) => total + signal.score, 0)
    )
    const confidence = technicalMetadataCompatible
      ? rawConfidence
      : roundConfidence(rawConfidence * 0.65)
    const action = getAction({
      confidence,
      courseContext,
      duplicateAcrossCourses,
      strongContentMatch,
      technicalMetadataCompatible
    })

    return {
      sourceItemId: input.source.sourceItemId,
      canonicalType: input.target.canonicalType,
      canonicalId: input.target.canonicalId,
      confidence,
      action,
      evidence: {
        thresholdVersion: SOURCE_MATCH_THRESHOLD_VERSION,
        courseContext,
        signals,
        strongContentMatch,
        technicalMetadataCompatible,
        duplicateAcrossCourses
      }
    }
  }
}

function getCourseContext(
  sourceCourseId: string | undefined,
  targetCourseId: string
): SourceMatchCourseContext {
  if (!sourceCourseId) return 'unknown'
  return sourceCourseId === targetCourseId ? 'same' : 'different'
}

function matchesOptional(
  left: string | undefined,
  right: string | undefined
): boolean {
  return Boolean(left && right && left === right)
}

function matchesOptionalNumber(
  left: number | undefined,
  right: number | undefined
): boolean {
  return left !== undefined && right !== undefined && left === right
}

function matchesDuration(
  left: number | undefined,
  right: number | undefined
): boolean {
  return (
    left !== undefined && right !== undefined && Math.abs(left - right) <= 1
  )
}

function areTechnicalMetadataCompatible(
  left: SourceTechnicalMetadata | undefined,
  right: SourceTechnicalMetadata | undefined
): boolean {
  const comparableFields = [
    'width',
    'height',
    'codec',
    'audioCodec',
    'bitrate'
  ] as const

  return comparableFields.every((field) => {
    const leftValue = left?.[field]
    const rightValue = right?.[field]
    return (
      leftValue === undefined ||
      rightValue === undefined ||
      leftValue === rightValue
    )
  })
}

function hasComparableTechnicalMetadata(
  left: SourceTechnicalMetadata | undefined,
  right: SourceTechnicalMetadata | undefined
): boolean {
  return (
    left !== undefined &&
    right !== undefined &&
    ['width', 'height', 'codec', 'audioCodec', 'bitrate'].some((field) => {
      const key = field as keyof SourceTechnicalMetadata
      return left[key] !== undefined && right[key] !== undefined
    })
  )
}

function getAction(input: {
  confidence: number
  courseContext: SourceMatchCourseContext
  duplicateAcrossCourses: boolean
  strongContentMatch: boolean
  technicalMetadataCompatible: boolean
}): 'auto-link' | 'review' | 'separate' {
  if (input.duplicateAcrossCourses) return 'separate'
  if (
    input.courseContext === 'same' &&
    input.strongContentMatch &&
    input.technicalMetadataCompatible &&
    input.confidence >= SOURCE_MATCH_AUTO_LINK_THRESHOLD
  ) {
    return 'auto-link'
  }
  if (input.confidence >= SOURCE_MATCH_REVIEW_THRESHOLD) return 'review'
  return 'separate'
}

function removeExtension(value: string): string {
  return value.replace(/\.[^./\\]+$/, '')
}

function normalizeMatchText(value: string): string {
  return value
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function roundConfidence(value: number): number {
  return Math.round(value * 1000) / 1000
}
