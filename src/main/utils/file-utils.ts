import path from 'node:path'
import type { MediaType } from '../../types'

export const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mkv',
  '.webm',
  '.mov',
  '.avi',
  '.m4v',
  '.ts',
  '.wmv',
  '.flv'
])

export const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac', '.wma'])

export const DOCUMENT_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.epub',
  '.txt',
  '.md',
  '.rtf'
])

export const ARCHIVE_EXTENSIONS = new Set(['.zip', '.rar', '.7z', '.tar', '.gz'])

export const SUBTITLE_EXTENSIONS = new Set(['.srt', '.vtt', '.sub', '.ass'])

export const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'])

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
  return 'document'
}

/**
 * Checks if a file is playable media (video or audio)
 */
export function isMediaFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return VIDEO_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext)
}

/**
 * Checks if a file is specifically video
 */
export function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return VIDEO_EXTENSIONS.has(ext)
}

/**
 * Checks if a file is specifically audio
 */
export function isAudioFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return AUDIO_EXTENSIONS.has(ext)
}

/**
 * Checks if a file is a subtitle track
 */
export function isSubtitleFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return SUBTITLE_EXTENSIONS.has(ext)
}

/**
 * Checks if a file is an image
 */
export function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return IMAGE_EXTENSIONS.has(ext)
}

/**
 * Checks if an image file matches common course cover conventions
 */
export function isCoverImage(filePath: string): boolean {
  if (!isImageFile(filePath)) return false
  const name = path.basename(filePath, path.extname(filePath)).toLowerCase()
  return /^(?:cover|thumb|thumbnail|poster|folder|front|capa|banner)$/i.test(name)
}

/**
 * Formats duration in seconds to "HH:MM:SS" or "MM:SS"
 */
export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Formats bytes to human-readable size (KB, MB, GB)
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}
