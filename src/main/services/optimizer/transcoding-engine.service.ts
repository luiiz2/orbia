import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import type { OptimizationPlan } from '../../../types/optimizer'
import type { MediaSourceInput } from './media-source-input'
import { hardwareCapabilityService } from './hardware-capability.service'
import { logger } from '../logger.service'

export interface TranscodeProgress {
  percent: number
  fps?: number
  speed?: string
  etaSeconds?: number
  currentDurationSeconds?: number
}

export class TranscodingEngineService {
  /**
   * Transcodes media input according to the optimization plan into an isolated temporary output file.
   */
  public async transcode(
    input: MediaSourceInput,
    plan: OptimizationPlan,
    tempOutputPath: string,
    onProgress?: (progress: TranscodeProgress) => void,
    abortSignal?: AbortSignal
  ): Promise<{ success: boolean; outputSize: number; error?: string }> {
    const metadata = await input.getMetadata()
    const targetCodec = plan.targetCodec || 'hevc'

    // Try with best encoder (hardware first)
    const { encoder, isHardware } = await hardwareCapabilityService.getBestEncoder(targetCodec, true)

    try {
      return await this.runFfmpegTranscode(
        input,
        metadata.durationSeconds,
        plan,
        encoder,
        isHardware,
        tempOutputPath,
        onProgress,
        abortSignal
      )
    } catch (hwError) {
      if (isHardware) {
        logger.warn(
          `[TranscodingEngine] Hardware encoder ${encoder} failed. Retrying with software encoder libx265... Error:`,
          hwError
        )
        // Fallback to software
        return await this.runFfmpegTranscode(
          input,
          metadata.durationSeconds,
          plan,
          'libx265',
          false,
          tempOutputPath,
          onProgress,
          abortSignal
        )
      }
      throw hwError
    }
  }

  private runFfmpegTranscode(
    input: MediaSourceInput,
    totalDurationSeconds: number,
    plan: OptimizationPlan,
    encoder: string,
    isHardware: boolean,
    tempOutputPath: string,
    onProgress?: (progress: TranscodeProgress) => void,
    abortSignal?: AbortSignal
  ): Promise<{ success: boolean; outputSize: number; error?: string }> {
    const executablePath = ffmpegStatic
    if (!executablePath) {
      return Promise.reject(new Error('Bundled FFmpeg binary is unavailable.'))
    }

    // Ensure temp output directory exists
    const dir = path.dirname(tempOutputPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // If temp output already exists from interrupted attempt, delete it
    if (fs.existsSync(tempOutputPath)) {
      try {
        fs.unlinkSync(tempOutputPath)
      } catch {
        // Ignore
      }
    }

    const isDirectFile = input.isDirectFile() && input.getLocalFilePath()
    const inputArgs: string[] = isDirectFile
      ? ['-i', input.getLocalFilePath()!]
      : ['-i', 'pipe:0']

    const args: string[] = [
      '-hide_banner',
      '-y',
      ...inputArgs,
      '-map',
      '0:v:0', // Primary video stream
      '-map',
      '0:a?', // All audio streams if present
      '-map',
      '0:s?', // All subtitle streams if present
      '-map_chapters',
      '0' // Preserve chapters
    ]

    // Video encoder settings
    args.push('-c:v', encoder)

    // CRF / Quality settings
    if (isHardware) {
      if (encoder.includes('nvenc')) {
        args.push('-preset', 'p5', '-cq', String(plan.targetCrf + 2))
      } else if (encoder.includes('qsv')) {
        args.push('-global_quality', String(plan.targetCrf + 2))
      } else if (encoder.includes('amf')) {
        args.push('-quality', 'quality', '-rc', 'cqp', '-qp_p', String(plan.targetCrf))
      } else if (encoder.includes('videotoolbox')) {
        args.push('-q:v', String(Math.max(45, 80 - plan.targetCrf)))
      }
    } else {
      // Software encoder (libx265 / libx264)
      args.push('-preset', 'medium', '-crf', String(plan.targetCrf))
      if (encoder === 'libx265') {
        args.push('-tag:v', 'hvc1') // QuickTime / Apple compatibility
      }
    }

    // Resolution downscaling if needed
    if (plan.isResolutionReduced && plan.targetWidth > 0 && plan.targetHeight > 0) {
      args.push('-vf', `scale=${plan.targetWidth}:${plan.targetHeight}`)
    }

    // Audio stream copying / compatibility
    args.push('-c:a', 'copy')

    // Subtitle stream copying / conversion
    if (plan.targetContainer === 'mp4') {
      args.push('-c:s', 'mov_text')
    } else {
      args.push('-c:s', 'copy')
    }

    // Faststart for MP4 streaming
    if (plan.targetContainer === 'mp4') {
      args.push('-movflags', '+faststart')
    }

    args.push(tempOutputPath)

    return new Promise((resolve, reject) => {
      const child = spawn(executablePath, args, {
        windowsHide: true,
        stdio: [isDirectFile ? 'ignore' : 'pipe', 'ignore', 'pipe']
      }) as ChildProcess

      let stderr = ''
      let finished = false

      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          if (!finished) {
            finished = true
            try {
              child.kill('SIGKILL')
            } catch {
              // Ignore
            }
            if (fs.existsSync(tempOutputPath)) {
              try {
                fs.unlinkSync(tempOutputPath)
              } catch {
                // Ignore
              }
            }
            reject(new Error('Transcoding was cancelled by user.'))
          }
        })
      }

      // Pipe stream if using stream input
      if (!isDirectFile) {
        input.getInputStream().then((readable) => {
          if (child.stdin) {
            readable.pipe(child.stdin)
            readable.on('error', (err) => {
              logger.error('[TranscodingEngine] Stream input error:', err)
              try {
                child.kill('SIGKILL')
              } catch {
                // Ignore
              }
            })
          }
        }).catch((err) => {
          try {
            child.kill('SIGKILL')
          } catch {
            // Ignore
          }
          reject(err)
        })
      }

      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        stderr = (stderr + text).slice(-8000)

        // Parse time=HH:MM:SS.ms, fps=XX, speed=XXx
        const timeMatch = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/)
        const fpsMatch = text.match(/fps=\s*(\d+(?:\.\d+)?)/)
        const speedMatch = text.match(/speed=\s*(\d+(?:\.\d+)?x)/)

        if (timeMatch && totalDurationSeconds > 0) {
          const hours = parseInt(timeMatch[1], 10)
          const minutes = parseInt(timeMatch[2], 10)
          const seconds = parseFloat(timeMatch[3])
          const currentDuration = hours * 3600 + minutes * 60 + seconds
          const rawPercent = (currentDuration / totalDurationSeconds) * 100
          const percent = Math.min(99.5, Math.max(0, Math.round(rawPercent * 10) / 10))

          const fps = fpsMatch ? parseFloat(fpsMatch[1]) : undefined
          const speed = speedMatch ? speedMatch[1] : undefined

          let etaSeconds: number | undefined
          if (speed && currentDuration < totalDurationSeconds) {
            const speedVal = parseFloat(speed.replace('x', ''))
            if (speedVal > 0) {
              etaSeconds = Math.round((totalDurationSeconds - currentDuration) / speedVal)
            }
          }

          if (onProgress) {
            onProgress({
              percent,
              fps,
              speed,
              etaSeconds,
              currentDurationSeconds: currentDuration
            })
          }
        }
      })

      child.once('error', (err) => {
        if (!finished) {
          finished = true
          reject(err)
        }
      })

      child.once('close', (code) => {
        if (!finished) {
          finished = true
          if (code === 0 && fs.existsSync(tempOutputPath)) {
            const stat = fs.statSync(tempOutputPath)
            if (stat.size > 1024) {
              if (onProgress) onProgress({ percent: 100 })
              resolve({ success: true, outputSize: stat.size })
              return
            }
          }
          const errMsg = stderr.trim() || `FFmpeg process exited with code ${code}`
          reject(new Error(errMsg))
        }
      })
    })
  }
}

export const transcodingEngineService = new TranscodingEngineService()
