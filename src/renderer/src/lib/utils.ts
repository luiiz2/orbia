import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Utility function to merge Tailwind CSS class names safely.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Build a media:// stream URL encoding each path segment separately,
 * so '#' / '?' / spaces inside file names survive URL parsing.
 */
export function mediaUrl(filePath: string): string {
  const encodedPath = filePath
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  // Keep the file path in the URL pathname instead of its host. In particular,
  // `C:` must arrive as `/C:/...` for the Main protocol validator to restore
  // the Windows drive correctly.
  return `media://local-media${encodedPath.startsWith('/') ? encodedPath : `/${encodedPath}`}`
}
