import {
  cleanTitle,
  cleanLessonTitle,
  isGenericMediaTitle
} from '../../utils/title-cleaner'
import { naturalCompare } from '../../utils/natural-sort'

export interface SequenceItem {
  id: string
  rawFileName: string
  cleanTitle: string
  filePath: string
  explicitNumber: number | null
  orderIndex: number
  displayOrder?: number
  isManual?: boolean
}

export interface SequenceResolutionResult<T extends SequenceItem> {
  items: T[]
  detectedGaps: Array<{ afterIndex: number; expectedNumber: number }>
  hasDuplicateNumbers: boolean
}

/**
 * Extracts explicit numeric prefix from titles or filenames.
 * Supports:
 * - "01 - Intro" -> 1
 * - "Aula 05" -> 5
 * - "1.5 - Bonus" -> 1.5
 * - "01.02 - Subpart" -> 1.02
 * - "10a - Suffix" -> 10
 */
export function extractExplicitNumber(name: string): number | null {
  if (!name || typeof name !== 'string') return null
  const trimmed = name.trim()

  // Match keyword prefixes like "Aula 01", "Lesson 2.5", "01 - Title", "01. Title", "01.5"
  const match = trimmed.match(
    /^(?:(?:aula|lesson|modulo|módulo|secao|seção|capitulo|capítulo|parte|part|section|licao|lição)\s*)?(\d+(?:\.\d+)?)/i
  )

  if (match) {
    const num = parseFloat(match[1])
    return isNaN(num) ? null : num
  }

  return null
}

/**
 * Resolves title for generic filenames like "video.mp4", "aula.mp4", "001.mp4".
 * If parent folder is descriptive (e.g. "02 - Setup Environment"), uses parent folder name.
 * Fallback to "Lesson XX" based on order index.
 */
export function resolveGenericTitle(
  fileName: string,
  parentFolderName?: string,
  fallbackIndex?: number
): string {
  const cleaned = cleanLessonTitle(fileName, parentFolderName)
  if (cleaned && !isGenericMediaTitle(cleaned)) {
    return cleaned
  }

  if (parentFolderName) {
    const cleanedParent = cleanTitle(parentFolderName)
    if (cleanedParent && !isGenericMediaTitle(cleanedParent)) {
      return cleanedParent
    }
  }

  if (fallbackIndex !== undefined && fallbackIndex > 0) {
    const pad = String(fallbackIndex).padStart(2, '0')
    return `Lesson ${pad}`
  }

  return cleaned || fileName
}

/**
 * Resolves natural ordering, visual numbering for duplicate numbers, and detects sequence gaps.
 * INVARIANT: Does not mutate physical filenames. Respects manual order if flagged.
 */
export function resolveSequenceOrdering<T extends SequenceItem>(
  items: T[],
  options: { preserveManualOrder?: boolean } = {}
): SequenceResolutionResult<T> {
  if (items.length === 0) {
    return { items: [], detectedGaps: [], hasDuplicateNumbers: false }
  }

  // 1. If all or some items have manual order overrides and we should preserve it
  const hasManualOrdering =
    options.preserveManualOrder &&
    items.some(
      (i) => i.isManual || (i.displayOrder !== undefined && i.displayOrder > 0)
    )

  let sortedItems: T[]
  if (hasManualOrdering) {
    sortedItems = [...items].sort((a, b) => {
      const orderA = a.displayOrder ?? a.orderIndex
      const orderB = b.displayOrder ?? b.orderIndex
      return orderA - orderB || naturalCompare(a.cleanTitle, b.cleanTitle)
    })
  } else {
    // Sort naturally: by explicit number first if both have numbers, else natural string compare
    sortedItems = [...items].sort((a, b) => {
      const numA =
        a.explicitNumber ??
        extractExplicitNumber(a.rawFileName) ??
        extractExplicitNumber(a.cleanTitle)
      const numB =
        b.explicitNumber ??
        extractExplicitNumber(b.rawFileName) ??
        extractExplicitNumber(b.cleanTitle)

      if (numA !== null && numB !== null && numA !== numB) {
        return numA - numB
      }

      return naturalCompare(
        a.cleanTitle || a.rawFileName,
        b.cleanTitle || b.rawFileName
      )
    })
  }

  // 2. Check for duplicate explicit numbers with different content
  const numberOccurrences = new Map<number, number>()
  for (const item of sortedItems) {
    const num =
      item.explicitNumber ??
      extractExplicitNumber(item.rawFileName) ??
      extractExplicitNumber(item.cleanTitle)
    if (num !== null) {
      numberOccurrences.set(num, (numberOccurrences.get(num) || 0) + 1)
    }
  }

  const hasDuplicateNumbers = Array.from(numberOccurrences.values()).some(
    (cnt) => cnt > 1
  )

  // 3. Detect sequence gaps in strictly increasing integer sequences (e.g. 1, 2, 4, 5 -> missing 3)
  const detectedGaps: Array<{ afterIndex: number; expectedNumber: number }> = []
  const integerNumbers: Array<{ num: number; index: number }> = []

  sortedItems.forEach((item, idx) => {
    const num =
      item.explicitNumber ??
      extractExplicitNumber(item.rawFileName) ??
      extractExplicitNumber(item.cleanTitle)
    if (num !== null && Number.isInteger(num)) {
      integerNumbers.push({ num, index: idx })
    }
  })

  for (let i = 0; i < integerNumbers.length - 1; i++) {
    const current = integerNumbers[i]
    const next = integerNumbers[i + 1]
    if (next.num > current.num + 1 && next.num <= current.num + 10) {
      // Gap detected (limit to max 10 to avoid false positives on arbitrary large jump)
      for (let missing = current.num + 1; missing < next.num; missing++) {
        detectedGaps.push({
          afterIndex: current.index,
          expectedNumber: missing
        })
      }
    }
  }

  // 4. Assign visual displayOrder and orderIndex
  const resultItems = sortedItems.map((item, idx) => {
    return {
      ...item,
      orderIndex: idx + 1,
      displayOrder:
        item.isManual && item.displayOrder ? item.displayOrder : idx + 1
    }
  })

  return {
    items: resultItems,
    detectedGaps,
    hasDuplicateNumbers
  }
}
