import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { isInsideBackupFolder } from './auxiliary-classifier'

export interface MediaIdentityDescriptor {
  id?: string
  courseId?: string
  moduleId?: string
  filePath: string
  fileName: string
  sizeBytes: number
  duration?: number
  fingerprint?: string
  contentHash?: string
  mtimeMs?: number
}

export type DuplicateScope = 'SAME_MODULE' | 'CROSS_MODULE' | 'CROSS_COURSE' | 'BACKUP_FOLDER'

export interface ConfirmedDuplicateMatch {
  source: MediaIdentityDescriptor
  target: MediaIdentityDescriptor
  scope: DuplicateScope
  confidence: 'CONFIRMED_HASH' | 'HIGH_SIZE_DURATION'
  reason: string
}

const HASH_CACHE = new Map<string, { hash: string; signature: string }>()
const SAMPLE_SIZE = 64 * 1024

/**
 * Computes or retrieves cached staged fingerprint hash for a file.
 * Cache key: filePath + size + mtimeMs
 */
export async function getStagedFileHash(filePath: string, sizeBytes?: number, mtimeMs?: number): Promise<string> {
  try {
    let stat: fs.Stats | undefined
    if (sizeBytes === undefined || mtimeMs === undefined) {
      stat = await fs.promises.stat(filePath)
      sizeBytes = stat.size
      mtimeMs = stat.mtimeMs
    }

    const cacheKey = path.resolve(filePath).toLowerCase()
    const signature = `${sizeBytes}:${mtimeMs}`
    const cached = HASH_CACHE.get(cacheKey)
    if (cached && cached.signature === signature) {
      return cached.hash
    }

    // Compute staged fingerprint: whole file if <= 128KB, else head + tail 64KB
    const hash = crypto.createHash('sha1')
    const fd = await fs.promises.open(filePath, 'r')
    try {
      if (sizeBytes <= SAMPLE_SIZE * 2) {
        hash.update(await fd.readFile())
      } else {
        const head = Buffer.alloc(SAMPLE_SIZE)
        await fd.read(head, 0, SAMPLE_SIZE, 0)
        hash.update(head)
        const tail = Buffer.alloc(SAMPLE_SIZE)
        await fd.read(tail, 0, SAMPLE_SIZE, sizeBytes - SAMPLE_SIZE)
        hash.update(tail)
      }
    } finally {
      await fd.close()
    }

    const digest = hash.digest('hex')
    HASH_CACHE.set(cacheKey, { hash: digest, signature })
    return digest
  } catch {
    return ''
  }
}

/**
 * Compares two media descriptors using 3-stage staged duplicate verification.
 * Stage 1: Fast identity / exact path.
 * Stage 2: Exact file size + duration.
 * Stage 3: Hash only when suspected.
 */
export async function verifyMediaEquality(
  a: MediaIdentityDescriptor,
  b: MediaIdentityDescriptor
): Promise<{ isDuplicate: boolean; confidence?: ConfirmedDuplicateMatch['confidence']; reason?: string }> {
  // Different sizes -> definitely not duplicates
  if (a.sizeBytes > 0 && b.sizeBytes > 0 && a.sizeBytes !== b.sizeBytes) {
    return { isDuplicate: false }
  }

  // Exact same path -> duplicate
  if (a.filePath && b.filePath && path.resolve(a.filePath).toLowerCase() === path.resolve(b.filePath).toLowerCase()) {
    return {
      isDuplicate: true,
      confidence: 'CONFIRMED_HASH',
      reason: 'Identical file path'
    }
  }

  // If both have durations and durations differ by more than 1 second -> not duplicates
  if (a.duration && b.duration && Math.abs(a.duration - b.duration) > 1.0) {
    return { isDuplicate: false }
  }

  // If content hashes or fingerprints are already known and match
  const hashKnownA = a.contentHash || a.fingerprint
  const hashKnownB = b.contentHash || b.fingerprint
  if (hashKnownA && hashKnownB && hashKnownA === hashKnownB) {
    return {
      isDuplicate: true,
      confidence: 'CONFIRMED_HASH',
      reason: 'Matching content hash'
    }
  }

  // If size is identical and both exist on disk, compute staged hashes
  if (a.sizeBytes > 0 && a.sizeBytes === b.sizeBytes) {
    const hashA = hashKnownA || (await getStagedFileHash(a.filePath, a.sizeBytes, a.mtimeMs))
    const hashB = hashKnownB || (await getStagedFileHash(b.filePath, b.sizeBytes, b.mtimeMs))

    // If content hash was known for A (or B) and other file is computed on disk
    if (hashA && hashB && hashA === hashB) {
      return {
        isDuplicate: true,
        confidence: 'CONFIRMED_HASH',
        reason: 'Confirmed identical hash, size and duration'
      }
    }

    // If one file does not exist on disk (e.g. renamed/moved) and hashes cannot both be computed:
    // Match if durations match (or if durations are unprobed / <= 0)
    if (!hashA || !hashB) {
      const durationsMatch =
        (a.duration && b.duration && Math.abs(a.duration - b.duration) <= 1.0) ||
        !a.duration ||
        !b.duration ||
        a.duration === 0 ||
        b.duration === 0

      if (durationsMatch) {
        return {
          isDuplicate: true,
          confidence: 'HIGH_SIZE_DURATION',
          reason: 'Matching size and duration signature'
        }
      }
    }
  }

  return { isDuplicate: false }
}

/**
 * Classifies duplicate scope based on course, module, and folder locations.
 */
export function classifyDuplicateScope(
  source: MediaIdentityDescriptor,
  target: MediaIdentityDescriptor,
  courseRootPath: string
): DuplicateScope {
  // Check if either file is inside a backup folder
  if (isInsideBackupFolder(source.filePath, courseRootPath) || isInsideBackupFolder(target.filePath, courseRootPath)) {
    return 'BACKUP_FOLDER'
  }

  // Check if they belong to different courses
  if (source.courseId && target.courseId && source.courseId !== target.courseId) {
    return 'CROSS_COURSE'
  }

  // Check if they belong to the same module
  if (source.moduleId && target.moduleId && source.moduleId === target.moduleId) {
    return 'SAME_MODULE'
  }

  return 'CROSS_MODULE'
}
