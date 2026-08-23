import fs from 'node:fs'
import { probeMediaDurationsBatch } from '../../utils/media-probe'

export interface MediaHealthAssessment {
  filePath: string
  exists: boolean
  sizeBytes: number
  isPlayable: boolean
  duration: number
  isCorrupted: boolean
  qualityScore: number // Higher is better (computed based on health > size > resolution heuristics)
  errorReason?: string
}

/**
 * Assesses the health and quality of a media file.
 * PRIORITY INVARIANT:
 * 1. Healthy / playable file
 * 2. File exists on disk
 * 3. File size > 0
 * 4. Duration / media metadata can be read
 * 5. File is not corrupted
 * 6. Video quality / resolution
 * 7. Cleanest filename
 *
 * A broken 1080p copy must NEVER replace a healthy 720p copy!
 */
export async function assessMediaHealth(filePath: string): Promise<MediaHealthAssessment> {
  let exists = false
  let sizeBytes = 0

  try {
    const stat = await fs.promises.stat(filePath)
    exists = true
    sizeBytes = stat.size
  } catch (err: any) {
    return {
      filePath,
      exists: false,
      sizeBytes: 0,
      isPlayable: false,
      duration: 0,
      isCorrupted: true,
      qualityScore: 0,
      errorReason: 'File does not exist or cannot be accessed on disk'
    }
  }

  if (sizeBytes === 0) {
    return {
      filePath,
      exists: true,
      sizeBytes: 0,
      isPlayable: false,
      duration: 0,
      isCorrupted: true,
      qualityScore: 10,
      errorReason: 'File has 0 bytes'
    }
  }

  let duration = 0
  let isPlayable = false
  let isCorrupted = false
  let errorReason: string | undefined

  try {
    const durationMap = await probeMediaDurationsBatch([filePath])
    duration = durationMap.get(filePath) || 0
    if (duration > 0) {
      isPlayable = true
    } else {
      // Missing or zero duration
      isPlayable = true // may still be valid format
    }
  } catch (err: any) {
    isCorrupted = true
    isPlayable = false
    errorReason = 'Media stream or metadata could not be decoded'
  }

  // Calculate quality score
  // Playable + Non-corrupted gives base 100,000 points
  // Size adds log points (1MB ~ 20 points)
  let qualityScore = 100
  if (exists) qualityScore += 1000
  if (sizeBytes > 0) qualityScore += 2000
  if (isPlayable && !isCorrupted) qualityScore += 100000
  if (duration > 0) qualityScore += 10000

  // Add modest score for higher resolution/size (so healthy 720p ~112000 beats broken 1080p ~3100)
  qualityScore += Math.min(Math.floor(sizeBytes / (1024 * 1024)), 5000)

  return {
    filePath,
    exists,
    sizeBytes,
    isPlayable,
    duration,
    isCorrupted,
    qualityScore,
    errorReason
  }
}

/**
 * Compares two media files and picks the canonical winner based strictly on health before quality.
 */
export function pickCanonicalMediaCopy(
  copyA: MediaHealthAssessment,
  copyB: MediaHealthAssessment
): MediaHealthAssessment {
  return copyA.qualityScore >= copyB.qualityScore ? copyA : copyB
}
