import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import type {
  MediaMetadata,
  VideoStreamInfo,
  AudioStreamInfo,
  SubtitleStreamInfo,
  MediaChapterInfo
} from '../../../types/optimizer'

interface RawFfprobeStream {
  index: number
  codec_type?: string
  codec_name?: string
  profile?: string
  width?: number
  height?: number
  r_frame_rate?: string
  avg_frame_rate?: string
  bit_rate?: string
  pix_fmt?: string
  color_space?: string
  duration?: string
  channels?: number
  sample_rate?: string
  disposition?: { default?: number }
  tags?: Record<string, string>
}

interface RawFfprobeChapter {
  id: number
  start_time: string
  end_time: string
  tags?: Record<string, string>
}

interface RawFfprobeOutput {
  streams?: RawFfprobeStream[]
  chapters?: RawFfprobeChapter[]
  format?: {
    format_name?: string
    duration?: string
    size?: string
    bit_rate?: string
  }
}

export class MediaAnalyzerService {
  private static metadataCache = new Map<
    string,
    { mtimeMs: number; metadata: MediaMetadata }
  >()

  /**
   * Deeply analyzes a media file extracting full stream topology:
   * video streams, audio streams, subtitles, chapters, container and bitrates.
   */
  public async analyze(filePath: string): Promise<MediaMetadata> {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`)
    }

    const stat = fs.statSync(filePath)
    if (stat.size === 0) {
      throw new Error(`Zero-byte media file: ${filePath}`)
    }

    // Check cache
    const cached = MediaAnalyzerService.metadataCache.get(filePath)
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.metadata
    }

    const raw = await this.probeRawMetadata(filePath)
    const metadata = this.parseRawMetadata(filePath, stat.size, raw)

    MediaAnalyzerService.metadataCache.set(filePath, {
      mtimeMs: stat.mtimeMs,
      metadata
    })

    return metadata
  }

  /**
   * Clears the in-memory metadata cache.
   */
  public clearCache(): void {
    MediaAnalyzerService.metadataCache.clear()
  }

  /**
   * Executes bundled FFmpeg/FFprobe to probe media stream topology in JSON format.
   */
  private probeRawMetadata(filePath: string): Promise<RawFfprobeOutput> {
    const executablePath = ffmpegStatic
    if (!executablePath) {
      return Promise.reject(new Error('Bundled FFmpeg binary is unavailable.'))
    }

    return new Promise((resolve, reject) => {
      // Use FFmpeg with json output flags
      const child = spawn(
        executablePath,
        [
          '-hide_banner',
          '-v',
          'error',
          '-show_format',
          '-show_streams',
          '-show_chapters',
          '-print_format',
          'json',
          '-i',
          filePath
        ],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
      ) as ChildProcess

      let stdout = ''
      let stderr = ''
      let finished = false

      const timeout = setTimeout(() => {
        if (!finished) {
          finished = true
          try {
            child.kill('SIGKILL')
          } catch {
            // Ignore
          }
          reject(new Error(`Media probe timed out for file: ${filePath}`))
        }
      }, 15000)

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })

      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      child.once('error', (err) => {
        if (!finished) {
          finished = true
          clearTimeout(timeout)
          reject(err)
        }
      })

      child.once('close', (code) => {
        if (!finished) {
          finished = true
          clearTimeout(timeout)
          if (code !== 0 && !stdout.trim()) {
            reject(
              new Error(
                stderr.trim() || `FFmpeg probe failed with exit code ${code}`
              )
            )
            return
          }
          try {
            const parsed = JSON.parse(stdout) as RawFfprobeOutput
            resolve(parsed)
          } catch (parseError) {
            // Fallback parsing from stderr if stdout was not JSON
            const fallback = this.fallbackParseFromStderr(stderr, filePath)
            if (fallback) {
              resolve(fallback)
            } else {
              reject(
                new Error(
                  `Failed to parse media probe output: ${String(parseError)}`
                )
              )
            }
          }
        }
      })
    })
  }

  private parseRawMetadata(
    filePath: string,
    fileSizeBytes: number,
    raw: RawFfprobeOutput
  ): MediaMetadata {
    const format = raw.format || {}
    const durationSeconds = format.duration ? parseFloat(format.duration) : 0
    const overallBitrate = format.bit_rate
      ? parseInt(format.bit_rate, 10)
      : durationSeconds > 0
        ? Math.round((fileSizeBytes * 8) / durationSeconds)
        : 0

    let videoStream: VideoStreamInfo | undefined
    const audioStreams: AudioStreamInfo[] = []
    const subtitleStreams: SubtitleStreamInfo[] = []
    const chapters: MediaChapterInfo[] = []

    const streams = raw.streams || []
    for (const stream of streams) {
      const type = (stream.codec_type || '').toLowerCase()
      if (type === 'video' && !videoStream) {
        // Take the primary video stream
        const fpsStr = stream.avg_frame_rate || stream.r_frame_rate || '0/1'
        const [num, den] = fpsStr.split('/').map(Number)
        const frameRate =
          den && den > 0 ? Math.round((num / den) * 100) / 100 : 0
        const streamBitrate = stream.bit_rate
          ? parseInt(stream.bit_rate, 10)
          : Math.max(0, overallBitrate - 128000)

        videoStream = {
          index: stream.index ?? 0,
          codecName: (stream.codec_name || 'unknown').toLowerCase(),
          profile: stream.profile,
          width: stream.width || 0,
          height: stream.height || 0,
          frameRate: frameRate || 30,
          bitRate: streamBitrate,
          pixelFormat: stream.pix_fmt || 'yuv420p',
          colorSpace: stream.color_space,
          duration: stream.duration
            ? parseFloat(stream.duration)
            : durationSeconds
        }
      } else if (type === 'audio') {
        audioStreams.push({
          index: stream.index ?? audioStreams.length,
          codecName: (stream.codec_name || 'unknown').toLowerCase(),
          channels: stream.channels || 2,
          sampleRate: stream.sample_rate
            ? parseInt(stream.sample_rate, 10)
            : 44100,
          bitRate: stream.bit_rate ? parseInt(stream.bit_rate, 10) : 128000,
          language: stream.tags?.language || stream.tags?.LANGUAGE,
          title: stream.tags?.title || stream.tags?.TITLE
        })
      } else if (type === 'subtitle') {
        subtitleStreams.push({
          index: stream.index ?? subtitleStreams.length,
          codecName: (stream.codec_name || 'unknown').toLowerCase(),
          language: stream.tags?.language || stream.tags?.LANGUAGE,
          title: stream.tags?.title || stream.tags?.TITLE,
          isDefault: Boolean(stream.disposition?.default)
        })
      }
    }

    if (raw.chapters && Array.isArray(raw.chapters)) {
      for (const ch of raw.chapters) {
        chapters.push({
          id: ch.id ?? chapters.length,
          startTime: parseFloat(ch.start_time || '0'),
          endTime: parseFloat(ch.end_time || '0'),
          title: ch.tags?.title || `Capítulo ${chapters.length + 1}`
        })
      }
    }

    return {
      filePath,
      container: (
        format.format_name || path.extname(filePath).replace('.', '')
      ).toLowerCase(),
      fileSizeBytes,
      durationSeconds,
      overallBitrate,
      videoStream,
      audioStreams,
      subtitleStreams,
      chapters
    }
  }

  private fallbackParseFromStderr(
    stderr: string,
    filePath: string
  ): RawFfprobeOutput | null {
    if (!stderr) return null

    // Look for Duration: 00:01:23.45, bitrate: 1234 kb/s
    const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
    const brMatch = stderr.match(/bitrate:\s*(\d+)\s*kb\/s/i)

    let durationSeconds = 0
    if (durMatch) {
      durationSeconds =
        parseInt(durMatch[1], 10) * 3600 +
        parseInt(durMatch[2], 10) * 60 +
        parseFloat(durMatch[3])
    }

    const bitrate = brMatch ? parseInt(brMatch[1], 10) * 1000 : 0

    // Video stream match: Stream #0:0: Video: h264 (...), 1920x1080
    const videoMatch = stderr.match(
      /Video:\s*([a-zA-Z0-9_-]+)[^,]*,\s*([a-zA-Z0-9]+)?[^,]*,\s*(\d{2,5})x(\d{2,5})/i
    )
    const streams: RawFfprobeStream[] = []

    if (videoMatch) {
      streams.push({
        index: 0,
        codec_type: 'video',
        codec_name: videoMatch[1].toLowerCase(),
        width: parseInt(videoMatch[3], 10),
        height: parseInt(videoMatch[4], 10),
        duration: String(durationSeconds),
        bit_rate: String(bitrate)
      })
    }

    if (streams.length > 0 || durationSeconds > 0) {
      return {
        format: {
          format_name: path.extname(filePath).replace('.', '').toLowerCase(),
          duration: String(durationSeconds),
          bit_rate: String(bitrate)
        },
        streams
      }
    }

    return null
  }
}

export const mediaAnalyzerService = new MediaAnalyzerService()
