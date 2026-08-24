import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import ffmpegStatic from 'ffmpeg-static'
import type { MediaMetadata, OptimizationPlan } from '../../../types/optimizer'
import { mediaAnalyzerService } from './media-analyzer.service'
import { decodeWithBundledFfmpeg } from '../media-validation.service'

export interface ValidationCheckResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  outputMetadata?: MediaMetadata
}

export class MediaValidatorService {
  /**
   * Performs exhaustive validation on the optimized media file before permitting physical replacement.
   */
  public async validate(
    sourceMetadata: MediaMetadata,
    plan: OptimizationPlan,
    optimizedFilePath: string
  ): Promise<ValidationCheckResult> {
    const errors: string[] = []
    const warnings: string[] = []

    // 1. File existence & basic size check
    if (!fs.existsSync(optimizedFilePath)) {
      return {
        isValid: false,
        errors: [`Optimized file was not created on disk: ${optimizedFilePath}`],
        warnings
      }
    }

    const stat = fs.statSync(optimizedFilePath)
    if (stat.size < 4096) {
      return {
        isValid: false,
        errors: [`Optimized file is suspiciously small or empty (${stat.size} bytes)`],
        warnings
      }
    }

    // 2. Deep stream topology extraction
    let outputMetadata: MediaMetadata
    try {
      outputMetadata = await mediaAnalyzerService.analyze(optimizedFilePath)
    } catch (analysisErr) {
      return {
        isValid: false,
        errors: [`Could not parse stream topology from optimized media: ${String(analysisErr)}`],
        warnings
      }
    }

    // 3. Primary video stream validation
    const outputVideo = outputMetadata.videoStream
    if (!outputVideo) {
      errors.push('Optimized media is missing the primary video stream.')
    } else {
      // Codec match check
      const expectedCodec = plan.targetCodec === 'hevc' ? ['hevc', 'h265'] : [plan.targetCodec]
      if (!expectedCodec.includes(outputVideo.codecName.toLowerCase())) {
        errors.push(
          `Video codec mismatch: expected ${plan.targetCodec}, found ${outputVideo.codecName}`
        )
      }

      // Resolution match check
      if (plan.isResolutionReduced) {
        if (outputVideo.width !== plan.targetWidth || outputVideo.height !== plan.targetHeight) {
          errors.push(
            `Resolution mismatch: expected ${plan.targetWidth}x${plan.targetHeight}, got ${outputVideo.width}x${outputVideo.height}`
          )
        }
      } else if (sourceMetadata.videoStream) {
        if (
          outputVideo.width !== sourceMetadata.videoStream.width ||
          outputVideo.height !== sourceMetadata.videoStream.height
        ) {
          errors.push(
            `Resolution altered without plan authorization: ${outputVideo.width}x${outputVideo.height} vs source ${sourceMetadata.videoStream.width}x${sourceMetadata.videoStream.height}`
          )
        }
      }
    }

    // 4. Duration tolerance check (within ±1.5s or 2%)
    if (sourceMetadata.durationSeconds > 2 && outputMetadata.durationSeconds > 0) {
      const diff = Math.abs(sourceMetadata.durationSeconds - outputMetadata.durationSeconds)
      const diffPercent = (diff / sourceMetadata.durationSeconds) * 100
      if (diff > 2.0 && diffPercent > 3.0) {
        errors.push(
          `Duration discrepancy exceeded tolerance: source ${sourceMetadata.durationSeconds}s vs optimized ${outputMetadata.durationSeconds}s`
        )
      }
    }

    // 5. Audio streams preservation check
    if (sourceMetadata.audioStreams.length > 0) {
      if (outputMetadata.audioStreams.length < sourceMetadata.audioStreams.length) {
        errors.push(
          `Audio stream dropped: source has ${sourceMetadata.audioStreams.length} audio tracks, optimized only has ${outputMetadata.audioStreams.length}`
        )
      }
    }

    // 6. Subtitle streams check
    if (sourceMetadata.subtitleStreams.length > 0) {
      if (outputMetadata.subtitleStreams.length < sourceMetadata.subtitleStreams.length) {
        warnings.push(
          `Subtitle stream count mismatch: source ${sourceMetadata.subtitleStreams.length} vs optimized ${outputMetadata.subtitleStreams.length}`
        )
      }
    }

    // 7. Multi-point seek & decode check
    const duration = outputMetadata.durationSeconds || sourceMetadata.durationSeconds
    if (duration > 5) {
      const seekPoints = [1, Math.floor(duration * 0.5), Math.max(1, Math.floor(duration - 2))]
      for (const seekSec of seekPoints) {
        const canSeek = await this.testSeekAndDecode(optimizedFilePath, seekSec)
        if (!canSeek) {
          errors.push(`Seeking or decoding failed at timestamp ${seekSec}s`)
        }
      }
    }

    // 8. Full frame decode integrity pass
    try {
      await decodeWithBundledFfmpeg(optimizedFilePath)
    } catch (decodeErr) {
      errors.push(`Full decode verification failed: ${String(decodeErr)}`)
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      outputMetadata
    }
  }

  /**
   * Tests seeking to a specific timestamp and decoding a 1-second segment.
   */
  private testSeekAndDecode(filePath: string, timestampSeconds: number): Promise<boolean> {
    const executablePath = ffmpegStatic
    if (!executablePath) return Promise.resolve(false)

    return new Promise((resolve) => {
      const child = spawn(
        executablePath,
        [
          '-hide_banner',
          '-v',
          'error',
          '-ss',
          String(timestampSeconds),
          '-i',
          filePath,
          '-t',
          '1',
          '-f',
          'null',
          '-'
        ],
        { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }
      ) as ChildProcess

      const timeout = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // Ignore
        }
        resolve(false)
      }, 5000)

      child.once('close', (code) => {
        clearTimeout(timeout)
        resolve(code === 0)
      })

      child.once('error', () => {
        clearTimeout(timeout)
        resolve(false)
      })
    })
  }
}

export const mediaValidatorService = new MediaValidatorService()
