import path from 'node:path'
import type { MediaType } from '../../types'

export const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mkv',
  '.webm',
  '.mov',
  '.avi',
  '.m4v',
  '.wmv',
  '.flv',
  '.m2ts',
  '.mts',
  '.3gp',
  '.ogv'
])

export const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.m4a',
  '.wav',
  '.ogg',
  '.flac',
  '.aac',
  '.wma'
])

export const DOCUMENT_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.epub',
  '.mobi',
  '.txt',
  '.md',
  '.rtf',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.csv',
  '.odt',
  '.ods',
  '.odp'
])

export const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.py',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.go',
  '.rs',
  '.php',
  '.rb',
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.sql',
  '.sh',
  '.bash',
  '.bat',
  '.cmd',
  '.ps1',
  '.yml',
  '.yaml',
  '.xml',
  '.toml',
  '.ini',
  '.env',
  '.gitignore',
  '.nfo',
  '.torrent',
  '.log',
  '.vue',
  '.svelte',
  '.swift',
  '.kt',
  '.dart'
])

export const ARCHIVE_EXTENSIONS = new Set([
  '.zip',
  '.rar',
  '.7z',
  '.tar',
  '.gz'
])

export const SUBTITLE_EXTENSIONS = new Set(['.srt', '.vtt', '.sub', '.ass'])

export const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp'
])

export const LINK_EXTENSIONS = new Set([
  '.url',
  '.lnk',
  '.html',
  '.htm',
  '.webloc'
])

export const IGNORED_NAMES = new Set([
  '.git',
  '.github',
  '.vscode',
  '.idea',
  'node_modules',
  '.ds_store',
  'thumbs.db',
  'desktop.ini',
  '.orbia',
  '$recycle.bin'
])

/**
 * Checks if a path or filename should be ignored by the scanner
 */
export function isIgnoredPath(fileNameOrPath: string): boolean {
  const baseName = path.basename(fileNameOrPath).toLowerCase()
  if (IGNORED_NAMES.has(baseName)) return true
  if (baseName.startsWith('._')) return true // macOS metadata
  if (baseName.startsWith('.')) return true // hidden files
  return false
}

/**
 * Determines media type from file extension
 */
export function getMediaType(filePath: string): MediaType {
  const ext = path.extname(filePath).toLowerCase()
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (ext === '.pdf') return 'pdf'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (LINK_EXTENSIONS.has(ext)) return 'link'
  if (ARCHIVE_EXTENSIONS.has(ext)) return 'archive'
  if (DOCUMENT_EXTENSIONS.has(ext) || CODE_EXTENSIONS.has(ext))
    return 'document'
  return 'other'
}

export function toResourceType(
  filePath: string
): 'pdf' | 'document' | 'image' | 'archive' | 'code' | 'other' {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (ARCHIVE_EXTENSIONS.has(ext)) return 'archive'
  if (CODE_EXTENSIONS.has(ext)) return 'code'
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'document'
  return 'other'
}

/**
 * Checks if a file is playable media (video or audio)
 */
export function isMediaFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return VIDEO_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext)
}

/**
 * Checks if a file should be kept as a lesson during import.
 * Keeps EVERYTHING meaningful (videos, audios, PDFs, documents, images,
 * links, archives, subtitles excluded — they attach to media).
 */
export function isImportableFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return (
    VIDEO_EXTENSIONS.has(ext) ||
    AUDIO_EXTENSIONS.has(ext) ||
    DOCUMENT_EXTENSIONS.has(ext) ||
    IMAGE_EXTENSIONS.has(ext) ||
    LINK_EXTENSIONS.has(ext) ||
    ARCHIVE_EXTENSIONS.has(ext)
  )
}

/**
 * Files that may be handed to the OS shell after Main verifies ownership.
 * Link containers are deliberately excluded so opening a library item cannot
 * redirect execution or navigation through a .lnk/.url/.webloc/html file.
 */
export function isShellOpenableFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return isImportableFile(filePath) && !LINK_EXTENSIONS.has(ext)
}

/**
 * Identifies a file that belongs to a scanned course inventory.
 *
 * This is intentionally broader than `isImportableFile`: importing must
 * preserve unknown formats and sidecars, while opening a file remains limited
 * to the safe allowlist above.
 */
export function isPreservableContentFile(filePath: string): boolean {
  return !isIgnoredPath(filePath)
}

/**
 * Checks if a file is a subtitle companion (not a standalone lesson).
 */
export function isSubtitleFile(filePath: string): boolean {
  return SUBTITLE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

/**
 * Checks if a file is specifically video
 */
export function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return VIDEO_EXTENSIONS.has(ext)
}

/**
 * Checks if a file is an image
 */
export function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return IMAGE_EXTENSIONS.has(ext)
}

/**
 * Checks if a file is a PDF
 */
export function isPdfFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return ext === '.pdf'
}

/**
 * Checks if an image file matches common course cover conventions
 */
export function isCoverImage(filePath: string): boolean {
  if (!isImageFile(filePath)) return false
  const name = path.basename(filePath, path.extname(filePath)).toLowerCase()
  // Exact cover names ("cover.jpg") or companion suffixes ("01 - Intro_thumb.jpg")
  return (
    /^(?:cover|thumb|thumbnail|poster|folder|front|capa|banner)$/i.test(name) ||
    /[-_\s](?:cover|thumb|thumbnail|poster|folder|front|capa|banner)$/i.test(
      name
    )
  )
}

/**
 * Formats duration in seconds to "HH:MM:SS" or "MM:SS"
 */
export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0 || !isFinite(seconds))
    return '00:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Formats bytes to human-readable size (KB, MB, GB, TB, PB)
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes <= 0 || isNaN(bytes) || !isFinite(bytes)) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1
  )
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}
