/**
 * Formats seconds to MM:SS or HH:MM:SS
 */
export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00'

  const totalSeconds = Math.floor(seconds)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60

  const paddedMinutes = String(minutes).padStart(2, '0')
  const paddedSeconds = String(secs).padStart(2, '0')

  if (hours > 0) {
    return `${hours}:${paddedMinutes}:${paddedSeconds}`
  }

  return `${paddedMinutes}:${paddedSeconds}`
}

export const formatDuration = formatTime

/**
 * Formats duration in seconds to a human-readable string (e.g. "1h 45m" or "25m")
 */
export function formatDurationHuman(seconds: number): string {
  if (isNaN(seconds) || seconds <= 0) return '0m'

  const totalMinutes = Math.round(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }

  return `${minutes}m`
}

/**
 * Formats file size in bytes to human-readable string
 */
export function formatFileSize(bytes: number): string {
  if (isNaN(bytes) || bytes <= 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const size = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)

  return `${size} ${units[i]}`
}
