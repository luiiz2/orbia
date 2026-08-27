import { describe, expect, it } from 'vitest'
import {
  findActiveTranscriptSegment,
  parseSubtitleSegments,
  validateTranscriptSegments
} from '../src/main/services/transcription/transcript-utils'

describe('transcription utilities', () => {
  it('parses timestamped SRT cues into ordered transcript segments', () => {
    const segments = parseSubtitleSegments(`\uFEFF1\r\n00:00:01,500 --> 00:00:03,000\r\nHello\r\nworld\r\n\r\n2\r\n00:00:04.000 --> 00:00:05.250\r\nSecond`)

    expect(segments).toEqual([
      { sequence: 0, start: 1.5, end: 3, text: 'Hello\nworld' },
      { sequence: 1, start: 4, end: 5.25, text: 'Second' }
    ])
  })

  it('parses WebVTT cues and ignores malformed or empty cues', () => {
    const segments = parseSubtitleSegments(`WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nOne\n\nnot a cue\n\n00:00:02.000 --> 00:00:01.000\ninvalid`)

    expect(segments).toEqual([{ sequence: 0, start: 0, end: 1, text: 'One' }])
  })

  it('rejects incomplete provider output instead of accepting a partial transcript', () => {
    expect(() => validateTranscriptSegments([
      { sequence: 0, start: 0, end: 1, text: 'ok' },
      { sequence: 1, start: 2, end: 1, text: 'bad' }
    ])).toThrow('invalid transcript segment')
  })

  it('finds the segment active at the player timestamp', () => {
    const segments = [
      { sequence: 0, start: 0, end: 2, text: 'first' },
      { sequence: 1, start: 2, end: 4, text: 'second' }
    ]

    expect(findActiveTranscriptSegment(2.5, segments)?.sequence).toBe(1)
    expect(findActiveTranscriptSegment(8, segments)).toBeNull()
  })
})

