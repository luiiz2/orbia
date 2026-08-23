import path from 'node:path'

/**
 * Platform and source metadata prefixes to remove
 */
const PLATFORM_PATTERNS = [
  /^\s*\[+(?:udemy|coursera|alura|hotmart|rocketseat|frontend\s*masters|pluralsight|edx|skillshare|origamid|devmedia|balta(?:\.io)?|udacity|domestika|ebac|nlw|ignite|bootcamp|maratona|jornada|workshop)\]+\s*/i,
  /^\s*(?:udemy|coursera|alura|hotmart|rocketseat|frontend\s*masters|pluralsight|edx|skillshare|origamid|devmedia|balta(?:\.io)?|udacity|domestika|ebac|nlw|ignite|bootcamp|maratona|jornada|workshop)\s*[-–—:]\s*/i
]

/**
 * Quality, codec and release metadata patterns to strip
 */
const QUALITY_METADATA_PATTERNS = [
  /\[?\b(?:720p|1080p|1440p|2160p|4k|fhd|uhd|hd)\b\]?/gi,
  /\[?\b(?:x264|x265|h264|h265|hevc|avc|10bit|8bit|aac|mp3|webrip|web-dl|bluray|hdrip|dvdrip)\b\]?/gi,
  /\[\s*(?:complete|completo|full\s*course|curso\s*completo)\s*\]|\(\s*(?:complete|completo|full\s*course|curso\s*completo)\s*\)|\{\s*(?:complete|completo|full\s*course|curso\s*completo)\s*\}/gi,
  // [2024], (2024), 2024 — but NOT years inside dates like (07-07-2025)
  /\((?:19|20)\d{2}\)|\{(?:19|20)\d{2}\}|(?<![\d-])\[?\b(?:19|20)\d{2}\b\]?(?![\d-])/g
]

const KEYWORD_PREFIXES = 'aula|lesson|capitulo|capítulo|secao|seção|modulo|módulo|parte|part|licao|lição|section'

/**
 * Platform junk: Telegram handles and @handles only.
 * "Catálogo" is kept — it describes the video content.
 */
const JUNK_PATTERNS = [
  /[\s\-–—]+(?:telegram|tg)\s*(?:@[A-Za-z0-9_.]+)?/gi,
  /[\s\-–—]+@[A-Za-z0-9_.]+/g
]

/**
 * Lesson / section prefix patterns.
 * Removes the keyword ("Aula", "Lesson", "Módulo"...) but PRESERVES the
 * sequence number so lessons stay identifiable ("Aula 05 - X" -> "05 - X").
 * Bare leading numbers ("001 - X") are intentionally kept for ordering.
 */
const LESSON_PREFIX_PATTERNS = [
  new RegExp(`^([^\\w\\s]*\\s*)(?:${KEYWORD_PREFIXES})\\s*(?=\\d)`, 'i')
]

/**
 * Safely strips known file extension from name without stripping dots in titles like "01. Introduction"
 */
function stripFileExtension(fileName: string): string {
  const ext = path.extname(fileName)
  // Only consider it a file extension if it's 2-6 chars long (e.g. .mp4, .mkv, .jpeg) and has no spaces
  if (ext && ext.length >= 2 && ext.length <= 6 && !ext.includes(' ')) {
    return fileName.slice(0, -ext.length)
  }
  return fileName
}

/**
 * Cleans a filename or directory name into a human-readable title.
 * Preserves essential context while stripping junk metadata.
 */
export function cleanTitle(rawName: string): string {
  if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
    return ''
  }

  // 1. Strip file extension safely
  let title = stripFileExtension(rawName.trim())

  // 2. Normalize underscores to spaces
  title = title.replace(/_+/g, ' ')

  // 3. Iteratively remove platform tags and quality/release metadata
  let previous = ''
  while (previous !== title) {
    previous = title

    for (const pattern of PLATFORM_PATTERNS) {
      pattern.lastIndex = 0
      title = title.replace(pattern, '')
    }

    for (const pattern of QUALITY_METADATA_PATTERNS) {
      pattern.lastIndex = 0
      title = title.replace(pattern, '')
    }

    for (const pattern of JUNK_PATTERNS) {
      pattern.lastIndex = 0
      title = title.replace(pattern, '')
    }

    title = title.replace(/\[\s*\]|\(\s*\)|\{\s*\}/g, '')
    title = title.replace(/^[-–—:\s]+/, '').trim()
  }

  // 7. Check if stripping numbering prefixes leaves something meaningful
  let strippedTitle = title
  for (const pattern of LESSON_PREFIX_PATTERNS) {
    strippedTitle = strippedTitle.replace(pattern, '$1')
  }

  // If stripping left meaningful content (numbers or words), use it
  if (strippedTitle.replace(/[^\w\p{L}\p{N}]/gu, '').trim().length > 0) {
    title = strippedTitle
  }

  // 8. Clean punctuation and whitespace (preserving hyphenated compound words like front-end)
  // Insert dash after bare leading numbers ("2.9 Conectando" -> "2.9 - Conectando")
  title = title
    .replace(/^(\d+(?:\.\d+)?[a-zA-Z]?)\s+(?=[^\d\s\-–—])/, '$1 - ')
    .replace(/\s+[-–—]+\s*|\s*[-–—]+\s+/g, ' - ')
    .replace(/[-–—]{2,}/g, ' - ')
    .replace(/:\s+/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/^[-–—:.\s]+|[-–—:.\s]+$/g, '')
    .trim()

  // 9. Fallback: if everything was stripped, return the sanitized original base
  if (!title) {
    const fallbackBase = stripFileExtension(rawName.trim())
    return fallbackBase || 'Untitled'
  }

  return title
}

const GENERIC_MEDIA_NAMES = new Set([
  'video',
  'vídeo',
  'videos',
  'vídeos',
  'aula',
  'aulas',
  'lesson',
  'lessons',
  'index',
  'main',
  'master',
  'stream',
  'play',
  'output',
  'media',
  'download',
  'track',
  'clip',
  'file',
  'untitled',
  'movie',
  'movie_1',
  'part',
  'parte'
])

/**
 * Checks whether a filename or title is generic without descriptive context.
 */
export function isGenericMediaTitle(name: string): boolean {
  if (!name || typeof name !== 'string') return true
  const base = stripFileExtension(name).toLowerCase().trim()
  const clean = cleanTitle(base).toLowerCase().trim()
  if (!clean || /^\d+$/.test(clean)) return true
  if (GENERIC_MEDIA_NAMES.has(base) || GENERIC_MEDIA_NAMES.has(clean)) return true
  return /^(?:video|vídeo|aula|lesson|track|clip|part|parte)[\s_\-–—]*\d*$/i.test(clean)
}

/**
 * Cleans a lesson title specifically. If the filename is generic (e.g. "video.mp4" or "aula.mp4")
 * and parent folder name is descriptive, the parent folder name is used.
 */
export function cleanLessonTitle(fileName: string, parentFolderName?: string): string {
  const cleanedFile = cleanTitle(fileName)
  if (parentFolderName && isGenericMediaTitle(fileName)) {
    const cleanedParent = cleanTitle(parentFolderName)
    if (cleanedParent && !isGenericMediaTitle(cleanedParent)) {
      return cleanedParent
    }
  }
  return cleanedFile || fileName
}

/**
 * Cleans a course title specifically (e.g. from folder name)
 */
export function cleanCourseTitle(rawFolderName: string): string {
  if (!rawFolderName || typeof rawFolderName !== 'string' || !rawFolderName.trim()) {
    return 'Untitled Course'
  }

  let title = cleanTitle(rawFolderName)

  // Remove leading numbers commonly found in organized folders (e.g. "01. Python Masterclass" -> "Python Masterclass")
  title = title.replace(/^([^\w\s]*\s*)\d+(?:\.\d+)?[a-zA-Z]?(?:\s*[-–—:_]\s*|\s*\.\s+|\s+)/, '$1').trim()

  return title || rawFolderName.trim() || 'Untitled Course'
}

/**
 * Cleans a module title specifically
 */
export function cleanModuleTitle(rawModuleName: string, defaultIndex: number): string {
  if (!rawModuleName || typeof rawModuleName !== 'string' || !rawModuleName.trim()) {
    return `Module ${String(defaultIndex).padStart(2, '0')}`
  }

  const sourceName = rawModuleName.trim()
  const title = cleanTitle(sourceName)

  // A source folder is the user's actual organization. Preserve it when cleaning
  // would reduce it to a number instead of inventing a generic module name.
  if (!title || /^[\d.a-zA-Z\s_-]+$/.test(title) && /^\d+(?:\.\d+)?[a-zA-Z]?$/.test(title.trim())) {
    return sourceName
  }

  return title
}

/**
 * Normalizes a module title for semantic comparison and deduplication.
 * Strips formatting variations (e.g. '01 - Modulo 1' vs 'Modulo 01' vs '01. Introdução').
 */
export function normalizeModuleKey(rawTitle: string): string {
  if (!rawTitle || typeof rawTitle !== 'string' || !rawTitle.trim()) {
    return ''
  }

  let key = rawTitle.toLowerCase().trim()

  // Remove keywords like "modulo", "module", "secao", "capitulo"
  key = key.replace(/\b(?:modulo|módulo|module|secao|seção|section|parte|part|capitulo|capítulo)\b/gi, ' ')

  // Strip punctuation
  key = key.replace(/[-–—:_.]+/g, ' ')

  // Normalize numbers with leading zeroes (e.g. "01" -> "1")
  key = key.replace(/\b0+(\d+)\b/g, '$1')

  // Remove duplicate duplicate digits (e.g. "1 1" -> "1")
  key = key.replace(/\b(\d+)\s+\1\b/g, '$1')

  // Collapse whitespace
  key = key.replace(/\s+/g, ' ').trim()

  return key
}

export function areModuleTitlesEquivalent(titleA: string, titleB: string): boolean {
  if (titleA === titleB) return true
  if (titleA.trim().toLowerCase() === titleB.trim().toLowerCase()) return true
  const keyA = normalizeModuleKey(titleA)
  const keyB = normalizeModuleKey(titleB)
  return Boolean(keyA && keyB && keyA === keyB)
}
