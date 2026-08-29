import { describe, it, expect } from 'vitest'
import { convertSrtToVtt } from '../src/main/utils/subtitle-utils'

describe('Subtitle Converter compatibility cases', () => {
  it('handles mixed line breaks (CRLF and classic CR)', () => {
    const srtMixed =
      '1\r\n00:00:01,000 --> 00:00:02,000\rLine 1\r\n\r2\n00:00:03,000 --> 00:00:04,000\nLine 2'
    const vtt = convertSrtToVtt(srtMixed)
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true)
    expect(vtt).not.toContain('\r')
    expect(vtt).toContain('Line 1')
    expect(vtt).toContain('Line 2')
  })

  it('handles 2-segment timestamps (MM:SS,mmm)', () => {
    const srt = '1\n01:23,456 --> 01:25,789\nTwo segment timestamp'
    const vtt = convertSrtToVtt(srt)
    expect(vtt).toContain('01:23.456 --> 01:25.789')
    expect(vtt).toContain('Two segment timestamp')
  })

  it('handles dot-separated timestamps and pads single/double digit milliseconds', () => {
    const srt =
      '1\n00:01:05.5 --> 00:01:08.50\nDot separated with partial milliseconds'
    const vtt = convertSrtToVtt(srt)
    expect(vtt).toContain('00:01:05.500 --> 00:01:08.500')
  })
})
