import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import { isMediaFile } from '../utils/file-utils'

export interface MediaValidationResult {
  valid: boolean
  failedFiles: string[]
  warnings: string[]
}

export interface MediaValidationDependencies {
  decodeFile?: (filePath: string) => Promise<void>
}

/**
 * Fully decodes each playable media file one at a time. Sequential validation is
 * deliberately conservative: it avoids saturating disk and memory while an import
 * is staging a large course.
 */
export async function validateMediaFiles(
  filePaths: string[],
  dependencies: MediaValidationDependencies = {}
): Promise<MediaValidationResult> {
  const decodeFile = dependencies.decodeFile ?? decodeWithBundledFfmpeg
  const failedFiles: string[] = []
  const warnings: string[] = []

  for (const filePath of filePaths) {
    if (!shouldFullyDecode(filePath)) continue

    try {
      await decodeFile(filePath)
    } catch (error) {
      failedFiles.push(filePath)
      warnings.push(
        `Could not fully decode ${filePath}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  return {
    valid: failedFiles.length === 0,
    failedFiles,
    warnings
  }
}

function shouldFullyDecode(filePath: string): boolean {
  if (!isMediaFile(filePath)) return false

  // `.ts` is ambiguous: it can be MPEG transport stream video or TypeScript
  // source code. Only send it to FFmpeg when its transport-stream sync bytes
  // are present, otherwise preserve it as a regular attachment.
  if (path.extname(filePath).toLowerCase() === '.ts') {
    return isLikelyMpegTransportStream(filePath)
  }

  return true
}

function isLikelyMpegTransportStream(filePath: string): boolean {
  const packetSize = 188
  const sample = Buffer.alloc(packetSize * 2)

  try {
    const descriptor = fs.openSync(filePath, 'r')
    try {
      const bytesRead = fs.readSync(descriptor, sample, 0, sample.length, 0)
      return (
        bytesRead >= packetSize &&
        sample[0] === 0x47 &&
        (bytesRead < packetSize * 2 || sample[packetSize] === 0x47)
      )
    } finally {
      fs.closeSync(descriptor)
    }
  } catch {
    return false
  }
}

export function decodeWithBundledFfmpeg(filePath: string): Promise<void> {
  const executablePath = ffmpegStatic
  if (!executablePath) {
    return Promise.reject(new Error('Bundled FFmpeg binary is unavailable.'))
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      executablePath,
      [
        '-v',
        'error',
        '-i',
        filePath,
        '-map',
        '0:v?',
        '-map',
        '0:a?',
        '-f',
        'null',
        '-'
      ],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }
    ) as ChildProcess
    let stderr = ''

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4000)
    })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(
        new Error(
          stderr.trim() || `FFmpeg exited with code ${code ?? 'unknown'}`
        )
      )
    })
  })
}
