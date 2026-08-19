import path from 'node:path'

/**
 * Platform and source metadata prefixes to remove
 */
const PLATFORM_PATTERNS = [
  /^\[(?:udemy|coursera|alura|hotmart|rocketseat|frontend\s*masters|pluralsight|edx|skillshare|origamid|devmedia|balta(?:\.io)?)\]\s*/i,
  /^(?:udemy|coursera|alura|hotmart|rocketseat|frontend\s*masters|pluralsight|edx|skillshare|origamid|devmedia|balta(?:\.io)?)\s*[-–—:]\s*/i
]

/**
 * Quality, codec and release metadata patterns to strip
 */
const QUALITY_METADATA_PATTERNS = [
  /\[?\b(?:720p|1080p|1440p|2160p|4k|fhd|uhd|hd)\b\]?/gi,
  /\[?\b(?:x264|x265|h264|h265|hevc|avc|10bit|8bit|aac|mp3|webrip|web-dl|bluray|hdrip|dvdrip)\b\]?/gi,
  /\[\s*(?:complete|completo|full\s*course|curso\s*completo)\s*\]|\(\s*(?:complete|completo|full\s*course|curso\s*completo)\s*\)/gi,
  /\[?\b(?:19|20)\d{2}\b\]?|\((?:19|20)\d{2}\)/g // [2024], (2024), 2024
]

/**
 * Common lesson / section prefix patterns
 * e.g. "01 - ", "001. ", "Aula 01 - ", "Lesson 02: ", "Section 03 - "
 */
const LESSON_PREFIX_PATTERNS = [
  /^(?:aula|lesson|capitulo|capítulo|secao|seção|modulo|módulo|parte|part)\s*\d+[\s.:–—_-]+\s*/i,
  /^\d+[\s.:–—_-]+\s*/ // e.g. "01 - ", "001. ", "1. ", "01_ "
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
  if (!rawName || typeof rawName !== 'string') {
    return ''
  }

  // 1. Strip file extension safely
  let title = stripFileExtension(rawName.trim())

  // 2. Normalize underscores and hyphens to spaces with boundary padding so word boundaries work
  title = title.replace(/_+/g, ' ')

  // 3. Remove platform tags
  for (const pattern of PLATFORM_PATTERNS) {
    title = title.replace(pattern, '')
  }

  // 4. Remove quality, codec, year, and release tags
  for (const pattern of QUALITY_METADATA_PATTERNS) {
    title = title.replace(pattern, '')
  }

  // 5. Remove empty brackets leftover from stripping
  title = title.replace(/\[\s*\]|\(\s*\)/g, '')

  // 6. Check if stripping numbering prefixes leaves something meaningful
  let strippedTitle = title
  for (const pattern of LESSON_PREFIX_PATTERNS) {
    strippedTitle = strippedTitle.replace(pattern, '')
  }

  // If stripping left meaningful content, use the stripped version.
  if (strippedTitle.trim().length > 0) {
    title = strippedTitle
  }

  // 7. Clean punctuation and multiple spaces
  title = title
    .replace(/\s*[-–—]\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/^[-–—:\s]+|[-–—:\s]+$/g, '')
    .trim()

  // 8. Fallback: if everything was stripped, return the sanitized original base
  if (!title) {
    const fallbackBase = stripFileExtension(rawName.trim())
    return fallbackBase || 'Untitled'
  }

  return title
}

/**
 * Cleans a course title specifically (e.g. from folder name)
 */
export function cleanCourseTitle(rawFolderName: string): string {
  let title = cleanTitle(rawFolderName)

  // Remove leading numbers commonly found in organized folders (e.g. "01. Python Masterclass" -> "Python Masterclass")
  title = title.replace(/^\d+[\s.:–—_-]+\s*/, '').trim()

  return title || rawFolderName
}

/**
 * Cleans a module title specifically
 */
export function cleanModuleTitle(rawModuleName: string, defaultIndex: number): string {
  let title = cleanTitle(rawModuleName)

  // If module name is empty or just generic numbers, provide a clear title
  if (!title || /^\d+$/.test(title)) {
    return `Module ${String(defaultIndex).padStart(2, '0')}`
  }

  return title
}
