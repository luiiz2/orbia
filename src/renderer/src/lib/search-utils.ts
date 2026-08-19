/**
 * String normalization and search utilities.
 * Provides diacritic-insensitive, case-insensitive, and multi-word token matching.
 */

/**
 * Normalizes a string for diacritic-insensitive, case-insensitive search and comparison.
 * Strips combining diacritical marks (e.g. "ç" -> "c", "ã" -> "a", "é" -> "e", "ô" -> "o").
 */
export function normalizeSearchString(str: string | null | undefined): string {
  if (!str || typeof str !== 'string') return ''
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Checks if a target string matches a search query in an accent-insensitive, case-insensitive way.
 * If query contains multiple words, ensures all search tokens are matched.
 */
export function matchesSearchQuery(
  target: string | null | undefined,
  query: string | null | undefined
): boolean {
  if (!query || !query.trim()) return true
  if (!target || !target.trim()) return false

  const normalizedTarget = normalizeSearchString(target)
  const normalizedQuery = normalizeSearchString(query)

  if (!normalizedQuery) return true

  // Fast path: substring match on normalized strings
  if (normalizedTarget.includes(normalizedQuery)) {
    return true
  }

  // Token-based match: all words in query must appear in target
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
  if (tokens.length > 1) {
    return tokens.every((token) => normalizedTarget.includes(token))
  }

  return false
}

/**
 * Checks if any of multiple candidate string fields match the search query.
 */
export function matchesAnyField(
  fields: (string | null | undefined)[],
  query: string | null | undefined
): boolean {
  if (!query || !query.trim()) return true
  const normalizedQuery = normalizeSearchString(query)
  if (!normalizedQuery) return true

  const combinedTarget = fields
    .map((f) => normalizeSearchString(f))
    .filter(Boolean)
    .join(' ')

  if (!combinedTarget) return false

  // Fast path: full phrase match
  if (combinedTarget.includes(normalizedQuery)) {
    return true
  }

  // Token-based match: all words in query must appear in the combined fields
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
  if (tokens.length > 1) {
    return tokens.every((token) => combinedTarget.includes(token))
  }

  return false
}
