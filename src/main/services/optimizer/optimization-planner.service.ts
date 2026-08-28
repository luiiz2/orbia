import type {
  MediaMetadata,
  OptimizationPlan,
  OptimizationProfile
} from '../../../types/optimizer'

export interface PlanOptions {
  lessonId: string
  courseId: string
  courseTitle: string
  lessonTitle: string
  profile?: OptimizationProfile
  isSharedFile?: boolean
  sharedVaultNames?: string[]
  minSavingsPercentThreshold?: number
}

export class OptimizationPlannerService {
  /**
   * Generates a deterministic optimization plan for a single media file.
   */
  public createPlan(
    metadata: MediaMetadata,
    options: PlanOptions
  ): OptimizationPlan {
    const profile = options.profile || 'balanced'
    const minThreshold = options.minSavingsPercentThreshold ?? 15

    const video = metadata.videoStream
    if (!video || video.width === 0 || video.height === 0) {
      // Audio-only or non-video media
      return {
        lessonId: options.lessonId,
        courseId: options.courseId,
        courseTitle: options.courseTitle,
        lessonTitle: options.lessonTitle,
        sourcePath: metadata.filePath,
        sourceSize: metadata.fileSizeBytes,
        sourceCodec: 'audio_only',
        sourceResolution: 'N/A',
        sourceBitrate: metadata.overallBitrate,
        targetCodec: 'hevc',
        targetResolution: 'N/A',
        targetWidth: 0,
        targetHeight: 0,
        targetCrf: 23,
        targetContainer: 'mp4',
        estimatedTargetSize: metadata.fileSizeBytes,
        estimatedSavingsBytes: 0,
        estimatedSavingsPercent: 0,
        isAlreadyEfficient: true,
        isResolutionReduced: false,
        isSharedFile: Boolean(options.isSharedFile),
        sharedVaultNames: options.sharedVaultNames,
        reason: 'Arquivo sem faixa de vídeo principal (áudio ou documento).',
        warnings: []
      }
    }

    const sourceCodec = (video.codecName || '').toLowerCase()
    const sourceWidth = video.width
    const sourceHeight = video.height
    const sourceResolution = `${sourceWidth}x${sourceHeight}`
    const sourceBitrate =
      video.bitRate > 0 ? video.bitRate : metadata.overallBitrate

    // 1. Determine target resolution
    let targetWidth = sourceWidth
    let targetHeight = sourceHeight
    let isResolutionReduced = false
    const warnings: string[] = []

    const is4KorHigher = sourceWidth >= 2560 || sourceHeight >= 1440
    if (
      is4KorHigher &&
      (profile === 'balanced' || profile === 'space_saving')
    ) {
      // Propose downscale to 1080p
      const aspectRatio = sourceWidth / sourceHeight
      targetHeight = 1080
      targetWidth = Math.round((1080 * aspectRatio) / 2) * 2 // even width
      isResolutionReduced = true
      warnings.push(
        `Resolução reduzida de ${sourceResolution} para ${targetWidth}x${targetHeight} para economia expressiva.`
      )
    }

    const targetResolution = `${targetWidth}x${targetHeight}`

    // 2. Determine target codec, CRF and container
    const targetCodec: 'hevc' | 'h264' | 'av1' = 'hevc'
    let targetCrf = 23

    switch (profile) {
      case 'max_quality':
        targetCrf = 19
        break
      case 'space_saving':
        targetCrf = 26
        break
      case 'balanced':
      default:
        targetCrf = 23
        break
    }

    // 3. Estimate target bitrate and size
    const estimatedVideoBitrate = this.estimateTargetBitrate(
      targetWidth,
      targetHeight,
      targetCrf,
      targetCodec
    )
    const audioBitrateTotal = metadata.audioStreams.reduce(
      (acc, a) => acc + (a.bitRate || 128000),
      0
    )
    const totalTargetBitrate =
      estimatedVideoBitrate + Math.max(audioBitrateTotal, 128000)

    const estimatedTargetSize = Math.max(
      1024 * 1024,
      Math.round((totalTargetBitrate * metadata.durationSeconds) / 8)
    )

    const savingsBytes = Math.max(
      0,
      metadata.fileSizeBytes - estimatedTargetSize
    )
    const savingsPercent =
      metadata.fileSizeBytes > 0
        ? Math.round((savingsBytes / metadata.fileSizeBytes) * 100)
        : 0

    // 4. Determine if media is already efficient
    let isAlreadyEfficient = false
    let reason = ''

    if (sourceCodec === 'av1' && sourceBitrate <= estimatedVideoBitrate * 1.2) {
      isAlreadyEfficient = true
      reason =
        'Vídeo já codificado em AV1 moderno com excelente taxa de compressão.'
    } else if (
      (sourceCodec === 'hevc' || sourceCodec === 'h265') &&
      !isResolutionReduced &&
      sourceBitrate <= estimatedVideoBitrate * 1.15
    ) {
      isAlreadyEfficient = true
      reason = 'Vídeo já codificado em HEVC com taxa de bits equilibrada.'
    } else if (savingsPercent < minThreshold) {
      isAlreadyEfficient = true
      reason = `Ganho de espaço estimado (${savingsPercent}%) abaixo do limiar de ${minThreshold}%.`
    } else if (
      metadata.fileSizeBytes < 15 * 1024 * 1024 &&
      metadata.durationSeconds > 180
    ) {
      isAlreadyEfficient = true
      reason =
        'Arquivo pequeno com bitrate já baixo. Re-codificar não trará ganho perceptível.'
    } else {
      reason = `Otimização ${profile.toUpperCase()}: ${sourceCodec.toUpperCase()} (${sourceResolution}) ➔ HEVC (${targetResolution}) com ~${savingsPercent}% de redução de espaço.`
    }

    // 5. Container selection
    const hasComplexSubtitles = metadata.subtitleStreams.some(
      (s) => s.codecName.includes('ass') || s.codecName.includes('pgs')
    )
    const targetContainer: 'mp4' | 'mkv' = hasComplexSubtitles ? 'mkv' : 'mp4'

    if (options.isSharedFile) {
      warnings.push(
        `Este arquivo está associado a múltiplos Vaults (${options.sharedVaultNames?.join(', ') || 'Vários'}). A otimização atualizará todas as bibliotecas.`
      )
    }

    return {
      lessonId: options.lessonId,
      courseId: options.courseId,
      courseTitle: options.courseTitle,
      lessonTitle: options.lessonTitle,
      sourcePath: metadata.filePath,
      sourceSize: metadata.fileSizeBytes,
      sourceCodec,
      sourceResolution,
      sourceBitrate,
      targetCodec,
      targetResolution,
      targetWidth,
      targetHeight,
      targetBitrate: totalTargetBitrate,
      targetCrf,
      targetContainer,
      estimatedTargetSize,
      estimatedSavingsBytes: isAlreadyEfficient ? 0 : savingsBytes,
      estimatedSavingsPercent: isAlreadyEfficient ? 0 : savingsPercent,
      isAlreadyEfficient,
      isResolutionReduced,
      isSharedFile: Boolean(options.isSharedFile),
      sharedVaultNames: options.sharedVaultNames,
      reason,
      warnings
    }
  }

  /**
   * Deterministic bitrate heuristic based on resolution and CRF for tutorial/educational content.
   */
  private estimateTargetBitrate(
    width: number,
    height: number,
    crf: number,
    codec: 'hevc' | 'h264' | 'av1'
  ): number {
    const pixels = width * height
    let baseBitrate = 1400000 // 1080p base (1.4 Mbps)

    if (pixels >= 3840 * 2160) {
      baseBitrate = 4500000 // 4.5 Mbps
    } else if (pixels >= 2560 * 1440) {
      baseBitrate = 2800000 // 2.8 Mbps
    } else if (pixels >= 1920 * 1080) {
      baseBitrate = 1400000 // 1.4 Mbps
    } else if (pixels >= 1280 * 720) {
      baseBitrate = 800000 // 800 kbps
    } else {
      baseBitrate = 450000 // 450 kbps
    }

    // Adjust for CRF (lower CRF = higher quality/bitrate)
    const crfFactor = Math.pow(0.92, crf - 23)
    let finalBitrate = Math.round(baseBitrate * crfFactor)

    if (codec === 'av1') {
      finalBitrate = Math.round(finalBitrate * 0.82)
    } else if (codec === 'h264') {
      finalBitrate = Math.round(finalBitrate * 1.5)
    }

    return Math.max(300000, finalBitrate)
  }
}

export const optimizationPlannerService = new OptimizationPlannerService()
