/**
 * Subtitle format conversion utilities
 */

/**
 * Converts SubRip (.srt) subtitle content to WebVTT (.vtt) format.
 *
 * WebVTT format requirements:
 * 1. Begins with "WEBVTT" header followed by a blank line.
 * 2. Uses periods (.) instead of commas (,) for millisecond separators (e.g. 00:01:23.456 --> 00:01:25.789).
 */
export function convertSrtToVtt(srtContent: string): string {
  if (!srtContent || !srtContent.trim()) {
    return 'WEBVTT\n\n'
  }

  // Normalize newlines to \n
  const content = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()

  // Replace SRT timestamp commas with periods (e.g., "00:01:23,456 --> 00:01:25,789")
  const converted = content.replace(
    /((?:\d{2}:)?\d{2}:\d{2}),(\d{1,3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}),(\d{1,3})/g,
    (_match, start, startMs, end, endMs) => {
      const paddedStartMs = startMs.padEnd(3, '0')
      const paddedEndMs = endMs.padEnd(3, '0')
      return `${start}.${paddedStartMs} --> ${end}.${paddedEndMs}`
    }
  )

  return `WEBVTT\n\n${converted}\n`
}
