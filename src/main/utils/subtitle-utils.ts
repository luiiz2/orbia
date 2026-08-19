/**
 * Subtitle format conversion utilities
 */

/**
 * Converts SubRip (.srt) subtitle content to WebVTT (.vtt) format.
 *
 * WebVTT format requirements:
 * 1. Begins with "WEBVTT" header followed by a blank line.
 * 2. Uses periods (.) instead of commas (,) for millisecond separators (e.g. 00:01:23.456 --> 00:01:25.789).
 * 3. Normalizes single digit hours (e.g. 1:02:03,456 -> 01:02:03.456) and pads milliseconds.
 * 4. Strips UTF-8 BOM, legacy font tags, and normalizes CRLF/CR line endings.
 */
export function convertSrtToVtt(srtContent: string): string {
  if (!srtContent || typeof srtContent !== 'string' || !srtContent.trim()) {
    return 'WEBVTT\n\n'
  }

  // 1. Strip UTF-8 BOM if present
  let content = srtContent.replace(/^\uFEFF/, '')

  // 2. Normalize line breaks (\r\n, \r -> \n)
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()

  if (!content) {
    return 'WEBVTT\n\n'
  }

  // 3. Replace SRT timestamps (with comma or dot separator, 1-3 ms digits, 1-2 hour digits)
  // Example matches: "00:01:23,456 --> 00:01:25,789", "1:02:03.4 --> 1:02:05.60", "01:23,456 --> 01:25,789"
  const timestampRegex =
    /((?:\d{1,2}:)?\d{1,2}:\d{2})[,.](\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2})[,.](\d{1,3})([^\r\n]*)/g

  const converted = content.replace(
    timestampRegex,
    (_match, start, startMs, end, endMs, cueSettings) => {
      // Normalize start and end time to HH:MM:SS or keep MM:SS if exactly 2 parts
      const formatTime = (timeStr: string): string => {
        const parts = timeStr.split(':')
        if (parts.length === 2) {
          return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`
        }
        if (parts.length === 3) {
          return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${parts[2].padStart(2, '0')}`
        }
        return timeStr
      }

      const normalizedStart = formatTime(start)
      const normalizedEnd = formatTime(end)
      const paddedStartMs = startMs.padEnd(3, '0')
      const paddedEndMs = endMs.padEnd(3, '0')
      const settings = cueSettings && cueSettings.trim() ? ` ${cueSettings.trim()}` : ''

      return `${normalizedStart}.${paddedStartMs} --> ${normalizedEnd}.${paddedEndMs}${settings}`
    }
  )

  // 4. Strip legacy font tags unsupported in standard WebVTT (e.g. <font color="#fff"> ... </font>)
  const cleaned = converted.replace(/<\/?font[^>]*>/gi, '')

  return `WEBVTT\n\n${cleaned}\n`
}
