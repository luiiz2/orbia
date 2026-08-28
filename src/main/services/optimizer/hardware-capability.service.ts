import { spawn, type ChildProcess } from 'node:child_process'
import os from 'node:os'
import ffmpegStatic from 'ffmpeg-static'
import type {
  HardwareCapabilities,
  HardwareEncoderInfo
} from '../../../types/optimizer'
import { logger } from '../logger.service'

export class HardwareCapabilityService {
  private cachedCapabilities: HardwareCapabilities | null = null

  /**
   * Discovers and verifies active hardware and software encoders available in FFmpeg.
   */
  public async getCapabilities(): Promise<HardwareCapabilities> {
    if (this.cachedCapabilities) {
      return this.cachedCapabilities
    }

    const availableEncoderNames = await this.listFfmpegEncoders()
    const cpuCores = os.cpus().length || 4

    const candidateEncoders: HardwareEncoderInfo[] = [
      // NVIDIA NVENC
      {
        name: 'NVIDIA NVENC (HEVC/H.265)',
        codec: 'hevc',
        type: 'nvenc',
        ffmpegEncoderName: 'hevc_nvenc',
        isAvailable: availableEncoderNames.has('hevc_nvenc')
      },
      {
        name: 'NVIDIA NVENC (H.264)',
        codec: 'h264',
        type: 'nvenc',
        ffmpegEncoderName: 'h264_nvenc',
        isAvailable: availableEncoderNames.has('h264_nvenc')
      },
      {
        name: 'NVIDIA NVENC (AV1)',
        codec: 'av1',
        type: 'nvenc',
        ffmpegEncoderName: 'av1_nvenc',
        isAvailable: availableEncoderNames.has('av1_nvenc')
      },
      // Intel Quick Sync
      {
        name: 'Intel Quick Sync (HEVC/H.265)',
        codec: 'hevc',
        type: 'qsv',
        ffmpegEncoderName: 'hevc_qsv',
        isAvailable: availableEncoderNames.has('hevc_qsv')
      },
      {
        name: 'Intel Quick Sync (H.264)',
        codec: 'h264',
        type: 'qsv',
        ffmpegEncoderName: 'h264_qsv',
        isAvailable: availableEncoderNames.has('h264_qsv')
      },
      {
        name: 'Intel Quick Sync (AV1)',
        codec: 'av1',
        type: 'qsv',
        ffmpegEncoderName: 'av1_qsv',
        isAvailable: availableEncoderNames.has('av1_qsv')
      },
      // AMD AMF
      {
        name: 'AMD AMF (HEVC/H.265)',
        codec: 'hevc',
        type: 'amf',
        ffmpegEncoderName: 'hevc_amf',
        isAvailable: availableEncoderNames.has('hevc_amf')
      },
      {
        name: 'AMD AMF (H.264)',
        codec: 'h264',
        type: 'amf',
        ffmpegEncoderName: 'h264_amf',
        isAvailable: availableEncoderNames.has('h264_amf')
      },
      // Apple VideoToolbox
      {
        name: 'Apple VideoToolbox (HEVC/H.265)',
        codec: 'hevc',
        type: 'videotoolbox',
        ffmpegEncoderName: 'hevc_videotoolbox',
        isAvailable: availableEncoderNames.has('hevc_videotoolbox')
      },
      {
        name: 'Apple VideoToolbox (H.264)',
        codec: 'h264',
        type: 'videotoolbox',
        ffmpegEncoderName: 'h264_videotoolbox',
        isAvailable: availableEncoderNames.has('h264_videotoolbox')
      },
      // CPU Software Fallbacks
      {
        name: 'Software x265 (HEVC)',
        codec: 'hevc',
        type: 'software',
        ffmpegEncoderName: 'libx265',
        isAvailable: availableEncoderNames.has('libx265')
      },
      {
        name: 'Software x264 (H.264)',
        codec: 'h264',
        type: 'software',
        ffmpegEncoderName: 'libx264',
        isAvailable: availableEncoderNames.has('libx264')
      },
      {
        name: 'Software SVT-AV1 (AV1)',
        codec: 'av1',
        type: 'software',
        ffmpegEncoderName: 'libsvtav1',
        isAvailable: availableEncoderNames.has('libsvtav1')
      }
    ]

    // Verify each available hardware encoder with a 1-frame test
    const verifiedEncoders: HardwareEncoderInfo[] = []
    for (const enc of candidateEncoders) {
      if (!enc.isAvailable) continue

      if (enc.type === 'software') {
        verifiedEncoders.push(enc)
      } else {
        const works = await this.testEncoder(enc.ffmpegEncoderName)
        if (works) {
          verifiedEncoders.push(enc)
        } else {
          logger.info(
            `[HardwareCapability] Hardware encoder ${enc.ffmpegEncoderName} failed live probe. Skipping.`
          )
        }
      }
    }

    // Determine preferred encoder for each codec
    const preferredHevc =
      verifiedEncoders.find((e) => e.codec === 'hevc' && e.type !== 'software')
        ?.ffmpegEncoderName ||
      (verifiedEncoders.some((e) => e.ffmpegEncoderName === 'libx265')
        ? 'libx265'
        : 'hevc')

    const preferredH264 =
      verifiedEncoders.find((e) => e.codec === 'h264' && e.type !== 'software')
        ?.ffmpegEncoderName ||
      (verifiedEncoders.some((e) => e.ffmpegEncoderName === 'libx264')
        ? 'libx264'
        : 'h264')

    const preferredAv1 =
      verifiedEncoders.find((e) => e.codec === 'av1' && e.type !== 'software')
        ?.ffmpegEncoderName ||
      verifiedEncoders.find((e) => e.ffmpegEncoderName === 'libsvtav1')
        ?.ffmpegEncoderName

    const hasHw = verifiedEncoders.some((e) => e.type !== 'software')

    this.cachedCapabilities = {
      hardwareAccelerationAvailable: hasHw,
      availableEncoders: verifiedEncoders,
      preferredHevcEncoder: preferredHevc,
      preferredH264Encoder: preferredH264,
      preferredAv1Encoder: preferredAv1,
      cpuCoreCount: cpuCores
    }

    return this.cachedCapabilities
  }

  /**
   * Returns the best encoder name for the chosen codec given current hardware capabilities.
   */
  public async getBestEncoder(
    codec: 'hevc' | 'h264' | 'av1',
    preferHardware = true
  ): Promise<{ encoder: string; isHardware: boolean }> {
    const caps = await this.getCapabilities()

    if (preferHardware && caps.hardwareAccelerationAvailable) {
      const hw = caps.availableEncoders.find(
        (e) => e.codec === codec && e.type !== 'software'
      )
      if (hw) {
        return { encoder: hw.ffmpegEncoderName, isHardware: true }
      }
    }

    if (codec === 'hevc') {
      return {
        encoder: caps.availableEncoders.some(
          (e) => e.ffmpegEncoderName === 'libx265'
        )
          ? 'libx265'
          : caps.preferredHevcEncoder,
        isHardware: false
      }
    }
    if (codec === 'av1') {
      return {
        encoder: caps.preferredAv1Encoder || 'libsvtav1',
        isHardware: false
      }
    }
    return {
      encoder: caps.availableEncoders.some(
        (e) => e.ffmpegEncoderName === 'libx264'
      )
        ? 'libx264'
        : caps.preferredH264Encoder,
      isHardware: false
    }
  }

  /**
   * Queries FFmpeg to list all compiled encoders.
   */
  private listFfmpegEncoders(): Promise<Set<string>> {
    const executablePath = ffmpegStatic
    if (!executablePath) {
      return Promise.resolve(new Set(['libx264', 'libx265', 'h264', 'hevc']))
    }

    return new Promise((resolve) => {
      const child = spawn(executablePath, ['-hide_banner', '-encoders'], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore']
      }) as ChildProcess

      let stdout = ''
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })

      child.once('close', () => {
        const encoders = new Set<string>()
        const lines = stdout.split('\n')
        for (const line of lines) {
          const match = line.match(/^\s*[VAFS.]{6}\s+([a-zA-Z0-9_-]+)/)
          if (match) {
            encoders.add(match[1])
          }
        }
        resolve(encoders)
      })

      child.once('error', () => {
        resolve(new Set(['libx264', 'libx265']))
      })
    })
  }

  /**
   * Performs a 1-frame dummy encoding test to verify whether the GPU hardware encoder actually works.
   */
  private testEncoder(encoderName: string): Promise<boolean> {
    const executablePath = ffmpegStatic
    if (!executablePath) return Promise.resolve(false)

    return new Promise((resolve) => {
      // Encode a 1-frame 64x64 dummy test video to null format
      const child = spawn(
        executablePath,
        [
          '-hide_banner',
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'testsrc=duration=0.1:size=64x64:rate=10',
          '-c:v',
          encoderName,
          '-frames:v',
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
      }, 4000)

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

export const hardwareCapabilityService = new HardwareCapabilityService()
