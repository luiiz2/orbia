import { spawn } from 'node:child_process'
import fs from 'node:fs'
import ffmpegPath from 'ffmpeg-static'
import type {
  AiTranscriptionRequest,
  AiTranscriptionResponse
} from '../../../types/ai'
import type { TranscriptSegment } from '../../../types/transcription'
import { aiCoreService } from '../ai/ai-core.service'
import { LocalFileSourceInput } from '../optimizer/media-source-input'
import { validateTranscriptSegments } from './transcript-utils'

export interface TranscriptionEngineOptions {
  language?: string
  autoDetect?: boolean
  cloudConsent?: boolean
}

export interface TranscriptionEngineResult {
  providerId: AiTranscriptionResponse['providerId']
  modelId: string
  language: string
  text: string
  segments: TranscriptSegment[]
}

export interface TranscriptionEngine {
  transcribe(
    sourcePath: string,
    fileName: string,
    options: TranscriptionEngineOptions,
    signal: AbortSignal,
    onProgress?: (progressPercent: number) => void
  ): Promise<TranscriptionEngineResult>
}

interface TranscriptionEngineDependencies {
  ai?: Pick<typeof aiCoreService, 'transcribe'>
  extractAudio?: (
    sourcePath: string,
    signal: AbortSignal,
    onProgress?: (progressPercent: number) => void
  ) => Promise<Uint8Array>
}

export class TranscriptionEngineService implements TranscriptionEngine {
  private readonly ai: Pick<typeof aiCoreService, 'transcribe'>
  private readonly extractAudioImpl: (
    sourcePath: string,
    signal: AbortSignal,
    onProgress?: (progressPercent: number) => void
  ) => Promise<Uint8Array>

  public constructor(dependencies: TranscriptionEngineDependencies = {}) {
    this.ai = dependencies.ai ?? aiCoreService
    this.extractAudioImpl = dependencies.extractAudio ?? extractAudio
  }

  public async transcribe(
    sourcePath: string,
    fileName: string,
    options: TranscriptionEngineOptions,
    signal: AbortSignal,
    onProgress?: (progressPercent: number) => void
  ): Promise<TranscriptionEngineResult> {
    if (!fs.existsSync(sourcePath)) throw new Error('Source unavailable')
    const input = new LocalFileSourceInput(sourcePath)
    if (!input.isDirectFile() || !input.getLocalFilePath())
      throw new Error('Source unavailable')
    if (signal.aborted) throw new Error('Transcription cancelled')

    const audio = await this.extractAudioImpl(sourcePath, signal, onProgress)
    if (audio.byteLength === 0)
      throw new Error('Audio extraction returned no data')
    if (signal.aborted) throw new Error('Transcription cancelled')

    onProgress?.(35)
    const request: AiTranscriptionRequest = {
      audio,
      fileName: `${fileName.replace(/\.[^.]+$/, '') || 'audio'}.wav`,
      mimeType: 'audio/wav',
      ...(options.language && !options.autoDetect
        ? { language: options.language }
        : {}),
      ...(options.autoDetect ? { autoDetect: true } : {}),
      ...(options.cloudConsent ? { cloudConsent: true } : {}),
      signal
    }
    const response = await this.ai.transcribe(request)
    const segments = response.segments.map((segment, sequence) => ({
      sequence,
      start: segment.start,
      end: segment.end,
      text: segment.text.trim()
    }))
    validateTranscriptSegments(segments)
    onProgress?.(95)

    return {
      providerId: response.providerId,
      modelId: response.modelId,
      language: response.language || options.language || 'und',
      text: response.text,
      segments
    }
  }
}

async function extractAudio(
  sourcePath: string,
  signal: AbortSignal,
  onProgress?: (progressPercent: number) => void
): Promise<Uint8Array> {
  const executable = ffmpegPath || 'ffmpeg'
  const child = spawn(
    executable,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      sourcePath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-f',
      'wav',
      'pipe:1'
    ],
    { windowsHide: true }
  )
  const chunks: Buffer[] = []
  const stderr: Buffer[] = []
  let settled = false

  return await new Promise<Uint8Array>((resolve, reject) => {
    const abort = (): void => {
      if (settled) return
      settled = true
      child.kill()
      signal.removeEventListener('abort', abort)
      reject(new Error('Transcription cancelled'))
    }
    if (signal.aborted) {
      abort()
      return
    }
    signal.addEventListener('abort', abort, { once: true })
    child.stdout?.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
      onProgress?.(Math.min(30, 5 + chunks.length))
    })
    child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.once('error', (error) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', abort)
      reject(error)
    })
    child.once('close', (code) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', abort)
      if (signal.aborted) {
        reject(new Error('Transcription cancelled'))
      } else if (code !== 0) {
        const details = Buffer.concat(stderr).toString('utf8').trim()
        reject(new Error(details || 'Unable to extract audio from media'))
      } else {
        resolve(new Uint8Array(Buffer.concat(chunks)))
      }
    })
  })
}

export const transcriptionEngineService = new TranscriptionEngineService()
