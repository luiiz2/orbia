import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import ffmpegStatic from 'ffmpeg-static'
import { isMediaFile } from './file-utils'

/**
 * Parses duration string (HH:MM:SS.ms) into total seconds.
 */
export function parseDurationToSeconds(durationStr: string): number {
  if (!durationStr || typeof durationStr !== 'string') return 0
  const match = durationStr.trim().match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/)
  if (!match) return 0
  const hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const seconds = parseFloat(match[3])
  return hours * 3600 + minutes * 60 + seconds
}

/**
 * Quickly probes the duration (in seconds) of a media file by inspecting its header via FFmpeg.
 * Returns 0 if probing fails or duration is unavailable.
 */
export function probeMediaDuration(filePath: string): Promise<number> {
  if (!filePath || !isMediaFile(filePath)) {
    return Promise.resolve(0)
  }

  if (!fs.existsSync(filePath)) {
    return Promise.resolve(0)
  }

  const executablePath = ffmpegStatic
  if (!executablePath) {
    return Promise.resolve(0)
  }

  return new Promise((resolve) => {
    // -i without output outputs file metadata to stderr immediately without decoding full video
    const child = spawn(
      executablePath,
      ['-i', filePath],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }
    ) as ChildProcess

    let stderr = ''
    let resolved = false

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        try {
          child.kill('SIGKILL')
        } catch {
          // Ignore kill error
        }
        resolve(0)
      }
    }, 4000)

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      // Check early if Duration line was received
      const match = stderr.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/i)
      if (match && !resolved) {
        resolved = true
        clearTimeout(timeout)
        try {
          child.kill('SIGKILL')
        } catch {
          // Ignore kill error
        }
        resolve(parseDurationToSeconds(match[1]))
      }
    })

    child.once('error', () => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        resolve(0)
      }
    })

    child.once('close', () => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        const match = stderr.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/i)
        if (match) {
          resolve(parseDurationToSeconds(match[1]))
        } else {
          resolve(0)
        }
      }
    })
  })
}

/**
 * Probes durations for a batch of media files with concurrency limit.
 */
export async function probeMediaDurationsBatch(
  filePaths: string[],
  concurrency = 4
): Promise<Map<string, number>> {
  const results = new Map<string, number>()
  const queue = [...filePaths]

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const filePath = queue.shift()
      if (!filePath) break
      try {
        const duration = await probeMediaDuration(filePath)
        results.set(filePath, duration)
      } catch {
        results.set(filePath, 0)
      }
    }
  })

  await Promise.all(workers)
  return results
}
