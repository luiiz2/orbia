import path from 'node:path'
import { cleanTitle } from '../../utils/title-cleaner'
import { naturalCompare } from '../../utils/natural-sort'

export interface RawMediaItem {
  id: string
  fileName: string
  filePath: string
  fileExtension: string
  duration?: number
  fileSize: number
  fingerprint?: string
}

export interface MultipartLessonGroup<T extends RawMediaItem> {
  id: string
  compositeTitle: string
  isMultipart: boolean
  totalDuration: number
  totalFileSize: number
  parts: Array<T & { partNumber: number; partLabel: string }>
}

const PART_SUFFIX_PATTERNS = [
  // " - Parte 1", " - Part 2", " - Pt 3", " - Parte 01", " _part_2"
  /[-_\s]+(?:parte|part|pt|disc|disco|cd)\s*(\d+)\b/i,
  // "(Parte 1)", "[Part 2]", "{Pt 3}"
  /[(\[{]\s*(?:parte|part|pt|disc|disco|cd)\s*(\d+)\s*[)\]}]/i,
  // " - 1 de 3", " - 1 of 3", "(1 of 3)"
  /[-_\s(\[{]\s*(\d+)\s*(?:de|of)\s*\d+\s*[)\]}]?/i
]

/**
 * Extracts part number and cleans the base title for multipart detection.
 */
export function extractPartInfo(fileName: string): { baseStem: string; partNumber: number; partLabel: string } | null {
  const stem = path.basename(fileName, path.extname(fileName))

  for (const pattern of PART_SUFFIX_PATTERNS) {
    const match = stem.match(pattern)
    if (match) {
      const partNumber = parseInt(match[1], 10)
      if (!isNaN(partNumber) && partNumber > 0) {
        const baseStem = stem.replace(pattern, '').replace(/[-_\s]+$/, '').trim()
        const partLabel = match[0].replace(/^[-_\s(\[{]+/, '').replace(/[)\]}]+$/, '').trim()
        return {
          baseStem: baseStem || stem,
          partNumber,
          partLabel
        }
      }
    }
  }

  return null
}

/**
 * Groups a collection of media files in a module into single or multipart lessons.
 */
export function groupMultipartLessons<T extends RawMediaItem>(items: T[]): MultipartLessonGroup<T>[] {
  if (items.length === 0) return []

  const groups = new Map<string, Array<{ item: T; partNumber: number; partLabel: string }>>()
  const singleItems: T[] = []

  for (const item of items) {
    const partInfo = extractPartInfo(item.fileName)
    if (partInfo) {
      const key = partInfo.baseStem.toLowerCase().trim()
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push({
        item,
        partNumber: partInfo.partNumber,
        partLabel: partInfo.partLabel
      })
    } else {
      singleItems.push(item)
    }
  }

  const result: MultipartLessonGroup<T>[] = []

  // Add multipart groups that have at least 2 parts (or a single part explicitly numbered "Part 1")
  for (const [, partEntries] of groups.entries()) {
    if (partEntries.length >= 2) {
      partEntries.sort((a, b) => a.partNumber - b.partNumber || naturalCompare(a.item.fileName, b.item.fileName))
      const first = partEntries[0]
      const baseStem = extractPartInfo(first.item.fileName)?.baseStem || first.item.fileName
      const compositeTitle = cleanTitle(baseStem) || baseStem
      const totalDuration = partEntries.reduce((sum, p) => sum + (p.item.duration || 0), 0)
      const totalFileSize = partEntries.reduce((sum, p) => sum + p.item.fileSize, 0)

      result.push({
        id: first.item.id,
        compositeTitle,
        isMultipart: true,
        totalDuration,
        totalFileSize,
        parts: partEntries.map((p) => ({
          ...p.item,
          partNumber: p.partNumber,
          partLabel: p.partLabel
        }))
      })
    } else {
      // Only 1 part found matching regex, treat as single item
      singleItems.push(partEntries[0].item)
    }
  }

  // Add remaining standalone single items
  for (const item of singleItems) {
    result.push({
      id: item.id,
      compositeTitle: cleanTitle(item.fileName) || item.fileName,
      isMultipart: false,
      totalDuration: item.duration || 0,
      totalFileSize: item.fileSize,
      parts: [{
        ...item,
        partNumber: 1,
        partLabel: ''
      }]
    })
  }

  // Sort groups naturally by composite title
  return result.sort((a, b) => naturalCompare(a.compositeTitle, b.compositeTitle))
}
