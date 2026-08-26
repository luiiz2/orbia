import { describe, expect, it } from 'vitest'
import {
  SOURCE_MATCH_THRESHOLD_VERSION,
  SourceMatcher
} from '../../src/main/services/sources/source-matcher'
import type {
  SourceMatchInput,
  SourceMatchTarget
} from '../../src/types/source'

const matcher = new SourceMatcher()

function createInput(
  sourceOverrides: Partial<SourceMatchInput['source']> = {},
  targetOverrides: Partial<SourceMatchTarget> = {}
): SourceMatchInput {
  return {
    source: {
      sourceItemId: 'item-1',
      courseId: 'course-1',
      name: 'Aula 01.mp4',
      relativePath: 'Modulo/Aula 01.mp4',
      size: 100,
      duration: 60,
      ...sourceOverrides
    },
    target: {
      canonicalType: 'lesson',
      canonicalId: 'lesson-1',
      courseId: 'course-1',
      title: 'Aula 01',
      fileName: 'Aula 01.mp4',
      relativePath: 'Modulo/Aula 01.mp4',
      size: 100,
      duration: 60,
      ...targetOverrides
    }
  }
}

describe('SourceMatcher', () => {
  it('auto-links same-course media with matching checksum and compatible metadata', () => {
    const result = matcher.evaluate(
      createInput({ checksum: 'sha256:abc' }, { checksum: 'sha256:abc' })
    )

    expect(result).toMatchObject({
      canonicalId: 'lesson-1',
      action: 'auto-link',
      confidence: expect.any(Number),
      evidence: {
        thresholdVersion: SOURCE_MATCH_THRESHOLD_VERSION,
        courseContext: 'same'
      }
    })
    expect(JSON.stringify(result.evidence)).not.toContain('C:/')
  })

  it('normalizes accents and separators when comparing titles and structure', () => {
    const result = matcher.evaluate(
      createInput(
        {
          name: 'Introdução__01.mp4',
          relativePath: 'Módulo 1/Introdução__01.mp4'
        },
        {
          title: 'Introducao 01',
          fileName: 'Introducao 01.mp4',
          relativePath: 'Modulo-1/Introducao 01.mp4',
          size: undefined,
          duration: undefined
        }
      )
    )

    expect(result.evidence.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'title', matched: true }),
        expect.objectContaining({ kind: 'relative-structure', matched: true })
      ])
    )
  })

  it('keeps equal size and duration at review confidence', () => {
    const result = matcher.evaluate(
      createInput(
        { name: 'Different.mp4', relativePath: 'Other/Different.mp4' },
        {
          title: 'Another Lesson',
          fileName: 'Another.mp4',
          relativePath: 'Another/Another.mp4'
        }
      )
    )

    expect(result.action).toBe('review')
    expect(result.evidence.strongContentMatch).toBe(false)
  })

  it('never auto-links when source course context is unknown', () => {
    const result = matcher.evaluate(
      createInput(
        { courseId: undefined, fingerprint: 'same-fingerprint' },
        {
          fingerprint: 'same-fingerprint'
        }
      )
    )

    expect(result.action).toBe('review')
    expect(result.evidence.courseContext).toBe('unknown')
  })

  it('marks equal cross-course fingerprints as informational duplicates only', () => {
    const result = matcher.evaluate(
      createInput(
        { courseId: 'course-1', fingerprint: 'same-fingerprint' },
        { courseId: 'course-2', fingerprint: 'same-fingerprint' }
      )
    )

    expect(result).toMatchObject({
      action: 'separate',
      evidence: {
        courseContext: 'different',
        duplicateAcrossCourses: true
      }
    })
  })

  it('reduces confidence for incompatible technical metadata', () => {
    const result = matcher.evaluate(
      createInput(
        {
          checksum: 'sha256:abc',
          technicalMetadata: { width: 1920, height: 1080 }
        },
        {
          checksum: 'sha256:abc',
          technicalMetadata: { width: 1280, height: 720 }
        }
      )
    )

    expect(result.evidence.technicalMetadataCompatible).toBe(false)
    expect(result.action).toBe('review')
  })

  it('produces deterministic path-free evidence', () => {
    const input = createInput(
      { checksum: 'sha256:abc', relativePath: 'C:/private/Aula 01.mp4' },
      { checksum: 'sha256:abc', relativePath: 'C:/private/Aula 01.mp4' }
    )

    expect(matcher.evaluate(input)).toEqual(matcher.evaluate(input))
    expect(JSON.stringify(matcher.evaluate(input).evidence)).not.toContain(
      'private'
    )
  })
})
