/**
 * Formats seconds into HH:MM:SS or MM:SS string
 */
export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00'

  const totalSecs = Math.floor(seconds)
  const hours = Math.floor(totalSecs / 3600)
  const mins = Math.floor((totalSecs % 3600) / 60)
  const secs = totalSecs % 60

  const paddedMins = mins.toString().padStart(2, '0')
  const paddedSecs = secs.toString().padStart(2, '0')

  if (hours > 0) {
    const paddedHours = hours.toString().padStart(2, '0')
    return `${paddedHours}:${paddedMins}:${paddedSecs}`
  }

  return `${paddedMins}:${paddedSecs}`
}
