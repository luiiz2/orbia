/**
 * Media Optimization Engine Domain Types for Orbia v0.7
 */

export type OptimizationProfile = 'balanced' | 'max_quality' | 'space_saving' | 'custom'

export type OptimizationJobStatus =
  | 'queued'
  | 'analyzing'
  | 'ready'
  | 'waiting_for_resources'
  | 'encoding'
  | 'validating'
  | 'backing_up'
  | 'replacing'
  | 'completed'
  | 'paused'
  | 'failed'
  | 'requires_review'
  | 'cancelled'

export type OptimizationResourceMode = 'automatic' | 'economy' | 'balanced' | 'max_performance'

export interface VideoStreamInfo {
  index: number
  codecName: string
  profile?: string
  width: number
  height: number
  frameRate: number
  bitRate: number
  pixelFormat: string
  colorSpace?: string
  duration: number
}

export interface AudioStreamInfo {
  index: number
  codecName: string
  channels: number
  sampleRate: number
  bitRate: number
  language?: string
  title?: string
}

export interface SubtitleStreamInfo {
  index: number
  codecName: string
  language?: string
  title?: string
  isDefault?: boolean
}

export interface MediaChapterInfo {
  id: number
  startTime: number
  endTime: number
  title: string
}

export interface MediaMetadata {
  filePath: string
  container: string
  fileSizeBytes: number
  durationSeconds: number
  overallBitrate: number
  videoStream?: VideoStreamInfo
  audioStreams: AudioStreamInfo[]
  subtitleStreams: SubtitleStreamInfo[]
  chapters: MediaChapterInfo[]
}

export interface OptimizationPlan {
  lessonId: string
  courseId: string
  courseTitle: string
  lessonTitle: string
  sourcePath: string
  sourceSize: number
  sourceCodec: string
  sourceResolution: string
  sourceBitrate: number
  targetCodec: 'hevc' | 'h264' | 'av1'
  targetResolution: string
  targetWidth: number
  targetHeight: number
  targetBitrate?: number
  targetCrf: number
  targetContainer: 'mp4' | 'mkv'
  estimatedTargetSize: number
  estimatedSavingsBytes: number
  estimatedSavingsPercent: number
  isAlreadyEfficient: boolean
  isResolutionReduced: boolean
  isSharedFile: boolean
  sharedVaultNames?: string[]
  reason: string
  warnings: string[]
}

export interface VaultOptimizationAnalysis {
  vaultPath: string
  totalVideos: number
  totalSizeBytes: number
  alreadyEfficientCount: number
  alreadyEfficientSizeBytes: number
  recommendedCount: number
  recommendedCurrentSizeBytes: number
  estimatedFinalSizeBytes: number
  estimatedTotalSavingsBytes: number
  estimatedTotalSavingsPercent: number
  plans: OptimizationPlan[]
  sharedFilesCount: number
  analyzedAt: number
}

export interface OptimizationQueueItem {
  id: string
  lessonId: string
  courseId?: string
  sourcePath: string
  tempOutputPath?: string
  finalOutputPath?: string
  backupPath?: string
  profile: OptimizationProfile
  targetCodec: string
  targetResolution?: string
  estimatedSavings: number
  actualSavings?: number
  status: OptimizationJobStatus
  progressPercent: number
  currentFps?: number
  currentSpeed?: string
  etaSeconds?: number
  retryCount: number
  errorMessage?: string
  isSharedFile?: boolean
  sharedConfirmationGiven?: boolean
  createdAt: number
  updatedAt: number
}

export interface OptimizationRecord {
  id: string
  lessonId: string
  originalPath: string
  originalSize: number
  originalCodec: string
  originalResolution: string
  originalBitrate: number
  originalFingerprint: string
  optimizedPath: string
  optimizedSize: number
  optimizedCodec: string
  optimizedResolution: string
  backupPath?: string
  profileUsed: string
  actualSavingsBytes: number
  createdAt: number
}

export interface OptimizationExclusionRule {
  id: string
  scopeType: 'vault' | 'course' | 'module' | 'lesson' | 'folder' | 'codec' | 'tag'
  scopeId: string
  isExcluded: boolean
  createdAt: number
}

export interface HardwareEncoderInfo {
  name: string
  codec: 'hevc' | 'h264' | 'av1'
  type: 'nvenc' | 'qsv' | 'amf' | 'videotoolbox' | 'software'
  ffmpegEncoderName: string
  isAvailable: boolean
}

export interface HardwareCapabilities {
  hardwareAccelerationAvailable: boolean
  availableEncoders: HardwareEncoderInfo[]
  preferredHevcEncoder: string
  preferredH264Encoder: string
  preferredAv1Encoder?: string
  cpuCoreCount: number
}

export interface VisualComparisonSample {
  id: string
  timestampSeconds: number
  timestampLabel: string
  originalSampleVideoPath: string
  optimizedSampleVideoPath: string
  originalFrameImagePath?: string
  optimizedFrameImagePath?: string
  originalSizeEst: number
  optimizedSizeEst: number
}

export interface VisualComparisonResult {
  lessonId: string
  sourcePath: string
  profile: OptimizationProfile
  plan: OptimizationPlan
  samples: VisualComparisonSample[]
}

export interface StorageOptimizerMetrics {
  totalVaultSizeBytes: number
  potentialSavingsBytes: number
  alreadySavedBytes: number
  totalVideosCount: number
  optimizedVideosCount: number
  queuePendingCount: number
  queueActiveCount: number
  queueFailedCount: number
  requiresReviewCount: number
  backupsSizeBytes: number
}

export interface OptimizationSettings {
  autoOptimizeNewMedia: boolean
  autoOptimizeMinSavingsPercent: number
  defaultProfile: OptimizationProfile
  resourceMode: OptimizationResourceMode
  maxConcurrentJobs: number
  pauseWhileWatching: boolean
  pauseOnBattery: boolean
  continueWhenWindowClosed: boolean
  backupRetentionDays: number
  customBackupDirectory?: string
}
