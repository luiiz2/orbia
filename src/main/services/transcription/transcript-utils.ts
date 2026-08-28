import type { TranscriptSegment } from '../../../types/transcription'

function parseTimestamp(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  const parts = normalized.split(':')
  if (parts.length !== 2 && parts.length !== 3) return null

  const secondsPart = Number(parts[parts.length - 1])
  const minutes = Number(parts[parts.length - 2])
  const hours = parts.length === 3 ? Number(parts[0]) : 0
  if (
    ![hours, minutes, secondsPart].every(Number.isFinite) ||
    minutes < 0 ||
    secondsPart < 0 ||
    secondsPart >= 60
  ) {
    return null
  }

  const seconds = hours * 3600 + minutes * 60 + secondsPart
  return seconds >= 0 ? seconds : null
}

const TIMESTAMP_LINE =
  /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})(?:\s+.*)?$/

export function parseSubtitleSegments(content: string): TranscriptSegment[] {
  if (typeof content !== 'string' || !content.trim()) return []

  const normalized = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim()
  const blocks = normalized.split(/\n\s*\n/)
  const segments: TranscriptSegment[] = []

  for (const block of blocks) {
    const lines = block.split('\n')
    const timestampIndex = lines.findIndex((line) => TIMESTAMP_LINE.test(line))
    if (timestampIndex < 0) continue

    const match = lines[timestampIndex].match(TIMESTAMP_LINE)
    if (!match) continue
    const start = parseTimestamp(match[1])
    const end = parseTimestamp(match[2])
    const text = lines
      .slice(timestampIndex + 1)
      .join('\n')
      .trim()
    if (start === null || end === null || end <= start || !text) continue

    segments.push({ sequence: segments.length, start, end, text })
  }

  return segments
}

export function validateTranscriptSegments(
  segments: TranscriptSegment[]
): void {
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error('invalid transcript segment list')
  }

  let previousStart = -1
  segments.forEach((segment, index) => {
    if (
      !segment ||
      segment.sequence !== index ||
      !Number.isFinite(segment.start) ||
      !Number.isFinite(segment.end) ||
      segment.start < 0 ||
      segment.end <= segment.start ||
      segment.start < previousStart ||
      typeof segment.text !== 'string' ||
      !segment.text.trim()
    ) {
      throw new Error('invalid transcript segment')
    }
    previousStart = segment.start
  })
}

export function findActiveTranscriptSegment(
  currentTime: number,
  segments: TranscriptSegment[]
): TranscriptSegment | null {
  if (!Number.isFinite(currentTime) || currentTime < 0) return null
  return (
    segments.find(
      (segment) => currentTime >= segment.start && currentTime < segment.end
    ) ?? null
  )
}
