export type ChapterSource = 'manual' | 'ai' | 'media'

export interface LessonChapter {
  id: string
  lessonId: string
  courseId: string
  title: string
  timestampSeconds: number
  source: ChapterSource
  isManual: boolean
  orderIndex: number
  createdAt: number
  updatedAt: number
}

export interface GenerateChaptersRequest {
  lessonId: string
  courseId: string
  cloudConsent?: boolean
}

export interface GenerateChaptersResponse {
  chapters: LessonChapter[]
  generatedCount: number
  preservedManualCount: number
}

export interface ChapterDraft {
  title: string
  timestampSeconds: number
  isManual?: boolean
}

export interface SaveChaptersRequest {
  lessonId: string
  courseId: string
  chapters: Array<ChapterDraft & { id?: string }>
}

export interface UpdateChapterRequest {
  id: string
  lessonId: string
  courseId: string
  title?: string
  timestampSeconds?: number
}

export interface DeleteChapterRequest {
  id: string
  lessonId: string
  courseId: string
}
