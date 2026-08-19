/**
 * Natural alphanumeric comparator and sorting utilities.
 * Ensures natural ordering (e.g. "Lesson 2" precedes "Lesson 10").
 */

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base'
})

/**
 * Compare two strings naturally (case-insensitive, natural number ordering).
 */
export function naturalCompare(a: string, b: string): number {
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
 * Useful for default orderIndex detection.
 */
export function extractLeadingNumber(str: string): number | null {
  const match = str.trim().match(/^(\d+)/)
  if (match) {
    const num = parseInt(match[1], 10)
    return isNaN(num) ? null : num
  }
  return null
}
