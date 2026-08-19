/**
 * Natural alphanumeric comparator and sorting utilities.
 * Ensures natural ordering (e.g. "Lesson 2" precedes "Lesson 10", "Aula 1.5" precedes "Aula 2").
 */

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base'
})

/**
 * Helper to separate base filename and extension for accurate natural comparison
 */
function getBaseAndExt(str: string): { base: string; ext: string } {
  const dotIndex = str.lastIndexOf('.')
  if (dotIndex > 0 && dotIndex < str.length - 1 && !str.slice(dotIndex).includes(' ')) {
    const ext = str.slice(dotIndex)
    if (ext.length <= 6) {
      return { base: str.slice(0, dotIndex), ext }
    }
  }
  return { base: str, ext: '' }
}

/**
 * Compare two strings naturally (case-insensitive, natural number ordering).
 */
export function naturalCompare(a: string, b: string): number {
  if (a === b) return 0
  if (!a) return -1
  if (!b) return 1

  const fileA = getBaseAndExt(a)
  const fileB = getBaseAndExt(b)

  if (fileA.ext && fileB.ext) {
    const baseCompare = collator.compare(fileA.base, fileB.base)
    if (baseCompare !== 0) {
      return baseCompare
    }
    return collator.compare(fileA.ext, fileB.ext)
  }

  return collator.compare(a, b)
}

/**
 * Sort an array of strings in natural alphanumeric order.
 */
export function naturalSort(items: string[]): string[] {
  return [...items].sort(naturalCompare)
}

/**
 * Sort an array of objects by a specific string key in natural alphanumeric order.
 */
export function naturalSortBy<T>(items: T[], keySelector: (item: T) => string): T[] {
  return [...items].sort((a, b) => naturalCompare(keySelector(a), keySelector(b)))
}

/**
 * Extract leading index/number from a name if present.
 * Supports prefixes like "Aula 05", "Lesson 12", "01.5", "10a".
 * Useful for default orderIndex detection.
 */
export function extractLeadingNumber(str: string): number | null {
  if (!str || typeof str !== 'string') return null
  const match = str
    .trim()
    .match(
      /^(?:(?:aula|lesson|modulo|módulo|secao|seção|capitulo|capítulo|parte|part|section|licao|lição)\s*)?(\d+(?:\.\d+)?)/i
    )
  if (match) {
    const num = parseFloat(match[1])
    return isNaN(num) ? null : num
  }
  return null
}
