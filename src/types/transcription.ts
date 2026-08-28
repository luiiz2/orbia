export type TranscriptStatus =
  | 'queued'
  | 'extracting'
  | 'transcribing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'partial'

export interface TranscriptSegment {
  sequence: number
  start: number
  end: number
  text: string
}

export interface Transcript {
  id: string
  lessonId: string
  version: number
  language: string
  provider: string
  model?: string
  createdAt: number
  sourceRevision: string
  settings: Record<string, unknown>
  status: TranscriptStatus
  isCurrent: boolean
  errorMessage?: string
  segments: TranscriptSegment[]
}

export interface TranscriptSummary extends Omit<Transcript, 'segments'> {
  segmentCount: number
}

export type TranscriptionJobStatus =
  | 'queued'
  | 'extracting'
  | 'transcribing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'partial'

export interface TranscriptionOptions {
  language?: string
  autoDetect?: boolean
  reuseExistingSubtitle?: boolean
  retranscribe?: boolean
  cloudConsent?: boolean
}

export interface TranscriptionSettings {
  autoTranscribeNewLessons: boolean
}

export interface TranscriptionEnqueueResult {
  jobId?: string
  lessonId: string
  skipped: boolean
  reason?:
    'already_current' | 'active_job' | 'unsupported_media' | 'missing_lesson'
}

export interface TranscriptionBatchResult {
  requestedCount: number
  enqueuedCount: number
  skippedCount: number
  jobs: TranscriptionEnqueueResult[]
}

export interface TranscriptProgressEvent {
  jobId: string
  lessonId: string
  status: TranscriptionJobStatus
  progressPercent: number
  errorMessage?: string
}
