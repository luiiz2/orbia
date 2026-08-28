import type {
  ExtractedSemanticDocument,
  SemanticChunkDraft,
  SemanticIndexScope
} from '../../../types/semantic-index'

const TARGET_CHUNK_CHARS = 1600
const MAX_CHUNK_CHARS = 2400

function sentenceEnds(text: string): boolean {
  return /[.!?。！？…]["'”’»)]*$/.test(text.trim())
}

function normalizeLineText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function splitSentences(paragraph: string): string[] {
  const matches = paragraph.match(/[^.!?。！？]+(?:[.!?。！？]+|$)/g)
  return matches?.map((value) => value.trim()).filter(Boolean) ?? []
}

function splitWords(text: string): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const parts: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (current && next.length > MAX_CHUNK_CHARS) {
      parts.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) parts.push(current)
  return parts
}

function baseChunk(
  document: ExtractedSemanticDocument,
  text: string,
  locator = document.locator
): SemanticChunkDraft {
  return {
    sourceKind: document.sourceKind,
    sourceId: document.sourceId,
    courseId: document.courseId,
    ...(document.moduleId ? { moduleId: document.moduleId } : {}),
    ...(document.lessonId ? { lessonId: document.lessonId } : {}),
    ...(document.resourceId ? { resourceId: document.resourceId } : {}),
    ...(document.transcriptId ? { transcriptId: document.transcriptId } : {}),
    ...(document.noteId ? { noteId: document.noteId } : {}),
    sourceRevision: document.sourceRevision,
    contentRevision: document.contentRevision,
    dataType: document.dataType,
    text,
    locator
  }
}

function chunkTranscript(
  document: ExtractedSemanticDocument
): SemanticChunkDraft[] {
  const segments = document.segments ?? []
  const chunks: SemanticChunkDraft[] = []
  let current = [] as typeof segments
  let currentLength = 0

  const flush = (): void => {
    if (current.length === 0) return
    const first = current[0]
    const last = current[current.length - 1]
    const text = current
      .map((segment) => segment.text.trim())
      .join(' ')
      .trim()
    if (text) {
      chunks.push({
        ...baseChunk(document, text, {
          ...document.locator,
          startTime: first.start,
          endTime: last.end
        }),
        startTime: first.start,
        endTime: last.end
      })
    }
    current = []
    currentLength = 0
  }

  for (const segment of segments) {
    if (!segment.text.trim() || segment.end <= segment.start) continue
    current.push(segment)
    currentLength += segment.text.trim().length + (current.length > 1 ? 1 : 0)
    if (
      (currentLength >= TARGET_CHUNK_CHARS && sentenceEnds(segment.text)) ||
      currentLength >= MAX_CHUNK_CHARS
    ) {
      flush()
    }
  }
  flush()
  return chunks
}

function chunkCode(document: ExtractedSemanticDocument): SemanticChunkDraft[] {
  const lines = document.text.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Array<{ startLine: number; endLine: number; lines: string[] }> =
    []
  let current: string[] = []
  let startLine = 0

  const flushBlock = (endLine: number): void => {
    if (current.length === 0) return
    blocks.push({ startLine, endLine, lines: current })
    current = []
  }

  lines.forEach((line, index) => {
    if (!line.trim()) {
      flushBlock(index)
      return
    }
    if (current.length === 0) startLine = index + 1
    current.push(line)
  })
  flushBlock(lines.length)

  const chunks: SemanticChunkDraft[] = []
  let currentBlocks: typeof blocks = []
  let currentLength = 0

  const flush = (): void => {
    if (currentBlocks.length === 0) return
    const first = currentBlocks[0]
    const last = currentBlocks[currentBlocks.length - 1]
    const text = currentBlocks
      .flatMap((block) => block.lines)
      .join('\n')
      .trim()
    if (text) {
      chunks.push(
        baseChunk(document, text, {
          ...document.locator,
          startLine: first.startLine,
          endLine: last.endLine
        })
      )
    }
    currentBlocks = []
    currentLength = 0
  }

  for (const block of blocks) {
    const blockText = block.lines.join('\n')
    if (blockText.length > MAX_CHUNK_CHARS) {
      flush()
      let linesForChunk: string[] = []
      let chunkStart = block.startLine
      block.lines.forEach((line, index) => {
        const next =
          linesForChunk.length > 0
            ? `${linesForChunk.join('\n')}\n${line}`
            : line
        if (linesForChunk.length > 0 && next.length > MAX_CHUNK_CHARS) {
          chunks.push(
            baseChunk(document, linesForChunk.join('\n').trim(), {
              ...document.locator,
              startLine: chunkStart,
              endLine: block.startLine + index - 1
            })
          )
          linesForChunk = [line]
          chunkStart = block.startLine + index
        } else {
          linesForChunk.push(line)
        }
      })
      if (linesForChunk.length > 0) {
        chunks.push(
          baseChunk(document, linesForChunk.join('\n').trim(), {
            ...document.locator,
            startLine: chunkStart,
            endLine: block.endLine
          })
        )
      }
      continue
    }

    if (
      currentBlocks.length > 0 &&
      currentLength + blockText.length + 2 > MAX_CHUNK_CHARS
    )
      flush()
    currentBlocks.push(block)
    currentLength += blockText.length + 2
    if (currentLength >= TARGET_CHUNK_CHARS) flush()
  }
  flush()
  return chunks
}

function chunkPlainText(
  document: ExtractedSemanticDocument
): SemanticChunkDraft[] {
  const paragraphs = document.text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map(normalizeLineText)
    .filter(Boolean)
  const units = paragraphs.flatMap(splitSentences)
  const chunks: SemanticChunkDraft[] = []
  let current: string[] = []
  let currentLength = 0

  const flush = (): void => {
    const text = current.join(' ').trim()
    if (text) chunks.push(baseChunk(document, text))
    current = []
    currentLength = 0
  }

  for (const unit of units) {
    for (const safeUnit of unit.length > MAX_CHUNK_CHARS
      ? splitWords(unit)
      : [unit]) {
      if (
        current.length > 0 &&
        currentLength + safeUnit.length + 1 > MAX_CHUNK_CHARS
      )
        flush()
      current.push(safeUnit)
      currentLength += safeUnit.length + (current.length > 1 ? 1 : 0)
      if (currentLength >= TARGET_CHUNK_CHARS && sentenceEnds(safeUnit)) flush()
    }
  }
  flush()
  return chunks
}

export function chunkSemanticDocument(
  document: ExtractedSemanticDocument
): SemanticChunkDraft[] {
  if (!document.text.trim()) return []
  if (document.segments && document.segments.length > 0)
    return chunkTranscript(document)
  if (document.sourceKind === 'code') return chunkCode(document)
  return chunkPlainText(document)
}

function uniqueSorted(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return [
    ...new Set(
      values
        .filter(
          (value): value is string =>
            typeof value === 'string' && Boolean(value.trim())
        )
        .map((value) => value.trim())
    )
  ].sort()
}

export function normalizeSemanticScope(
  scope: SemanticIndexScope
): SemanticIndexScope {
  if (!scope || typeof scope !== 'object' || !('type' in scope))
    throw new Error('Invalid semantic index scope')
  if (scope.type === 'vault') return { type: 'vault' }
  if (
    scope.type === 'lesson' &&
    typeof scope.lessonId === 'string' &&
    scope.lessonId.trim()
  ) {
    return { type: 'lesson', lessonId: scope.lessonId.trim() }
  }
  if (
    scope.type === 'course' &&
    typeof scope.courseId === 'string' &&
    scope.courseId.trim()
  ) {
    return { type: 'course', courseId: scope.courseId.trim() }
  }
  if (scope.type === 'selected') {
    const lessonIds = uniqueSorted(scope.lessonIds)
    const resourceIds = uniqueSorted(scope.resourceIds)
    const noteIds = uniqueSorted(scope.noteIds)
    if (
      lessonIds.length === 0 &&
      resourceIds.length === 0 &&
      noteIds.length === 0
    ) {
      throw new Error(
        'Invalid selected scope: selected scope must contain at least one ID'
      )
    }
    return {
      type: 'selected',
      ...(lessonIds.length > 0 ? { lessonIds } : {}),
      ...(resourceIds.length > 0 ? { resourceIds } : {}),
      ...(noteIds.length > 0 ? { noteIds } : {})
    }
  }
  throw new Error('Invalid semantic index scope')
}
