import type {
  DeleteChapterRequest,
  GenerateChaptersRequest,
  GenerateChaptersResponse,
  LessonChapter,
  SaveChaptersRequest,
  UpdateChapterRequest
} from '../../../types/chapters'
import type { DatabaseService } from '../database.service'
import { databaseService } from '../database.service'
import type { AiCoreService } from '../ai/ai-core.service'
import { aiCoreService } from '../ai'
import { TranscriptRepository } from '../transcription/transcript-repository.service'
import { logger } from '../logger.service'
import { UNTRUSTED_CONTENT_RULES, wrapUntrustedContent } from '../ai/ai-prompts'

const MAX_CHAPTER_CONTEXT_CHARACTERS = 80_000

export interface ChaptersServiceDependencies {
  db?: DatabaseService
  ai?: AiCoreService
  transcripts?: TranscriptRepository
}

interface RawChapterItem {
  title?: string
  timestampSeconds?: number
  timestamp?: number
  time?: number
}

export class ChaptersService {
  private readonly db: DatabaseService
  private readonly ai: AiCoreService
  private readonly transcripts: TranscriptRepository

  public constructor(dependencies: ChaptersServiceDependencies = {}) {
    this.db = dependencies.db ?? databaseService
    this.ai = dependencies.ai ?? aiCoreService
    this.transcripts =
      dependencies.transcripts ?? new TranscriptRepository(this.db)
  }

  public getChapters(lessonId: string): LessonChapter[] {
    return this.db.getLessonChapters(lessonId)
  }

  public async generateChapters(
    request: GenerateChaptersRequest
  ): Promise<GenerateChaptersResponse> {
    const { lessonId, courseId, cloudConsent = false } = request

    const rawDb = this.db.getDatabase()
    if (!rawDb) throw new Error('Database is not connected')

    const lesson = rawDb
      .prepare(
        `
      SELECT id, title, duration FROM lessons WHERE id = ? AND course_id = ?
    `
      )
      .get(lessonId, courseId) as
      { id: string; title: string; duration?: number } | undefined

    if (!lesson) throw new Error('Lesson not found')

    const transcript = this.transcripts.getCurrent(lessonId)
    if (!transcript || transcript.segments.length === 0) {
      throw new Error(
        'No transcript available to generate chapters for this lesson.'
      )
    }

    const duration =
      typeof lesson.duration === 'number' && lesson.duration > 0
        ? lesson.duration
        : transcript.segments[transcript.segments.length - 1].end || 3600

    const transcriptSnippet = transcript.segments
      .map((s) => `[${this.formatTimestamp(s.start)}]: ${s.text}`)
      .join('\n')

    const promptMessages: Array<{ role: 'system' | 'user'; content: string }> =
      [
        {
          role: 'system',
          content: `You are an expert video editor and study assistant.
Generate concise, meaningful video chapters for the provided lesson transcript.
${UNTRUSTED_CONTENT_RULES}
Follow these strict rules:
1. First chapter MUST begin at 00:00 (timestampSeconds: 0).
2. Timestamps must be strictly ascending (monotonic) and NOT exceed ${Math.ceil(duration)} seconds.
3. Chapter titles must be concise (2 to 6 words) and descriptive of the topic.
4. Generate between 3 and 12 chapters depending on duration and content depth.
Return ONLY valid JSON matching this schema:
{
  "chapters": [
    { "timestampSeconds": 0, "title": "Introduction" },
    { "timestampSeconds": 262, "title": "Setup & Architecture" }
  ]
}`
        },
        {
          role: 'user',
          content: [
            'Generate chapters from the untrusted lesson transcript below.',
            wrapUntrustedContent(
              'lesson_transcript',
              `Lesson Title: ${lesson.title}\nTotal Duration: ${Math.round(duration)} seconds\n\n${transcriptSnippet}`,
              MAX_CHAPTER_CONTEXT_CHARACTERS
            )
          ].join('\n\n')
        }
      ]

    const response = await this.ai.generateChapters({
      messages: promptMessages,
      cloudConsent,
      dataTypes: ['transcript']
    })

    const parsedChapters = this.parseAiChapters(response.content, duration)
    const validAiChapters = this.validateChapters(parsedChapters, duration)

    // Manual edits win: retrieve existing manual chapters and merge
    const existingChapters = this.db.getLessonChapters(lessonId)
    const manualChapters = existingChapters.filter((c) => c.isManual)

    // Build merged list: preserve all manual chapters
    const combined: Array<
      Omit<LessonChapter, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
    > = []

    for (const man of manualChapters) {
      combined.push({
        id: man.id,
        lessonId,
        courseId,
        title: man.title,
        timestampSeconds: man.timestampSeconds,
        source: 'manual',
        isManual: true,
        orderIndex: man.orderIndex
      })
    }

    // Add generated AI chapters if there is no manual chapter within 15 seconds
    for (const aiCh of validAiChapters) {
      const collidesWithManual = manualChapters.some(
        (m) => Math.abs(m.timestampSeconds - aiCh.timestampSeconds) < 15
      )
      if (!collidesWithManual) {
        combined.push({
          lessonId,
          courseId,
          title: aiCh.title,
          timestampSeconds: aiCh.timestampSeconds,
          source: 'ai',
          isManual: false,
          orderIndex: 0
        })
      }
    }

    // Sort by timestamp
    combined.sort((a, b) => a.timestampSeconds - b.timestampSeconds)
    combined.forEach((ch, idx) => {
      ch.orderIndex = idx
    })

    const saved = this.db.saveLessonChapters(lessonId, courseId, combined)

    return {
      chapters: saved,
      generatedCount: validAiChapters.length,
      preservedManualCount: manualChapters.length
    }
  }

  public saveChapters(request: SaveChaptersRequest): LessonChapter[] {
    const { lessonId, courseId, chapters } = request
    const sorted = [...chapters].sort(
      (a, b) => a.timestampSeconds - b.timestampSeconds
    )

    const inputs = sorted.map((ch, idx) => ({
      id: ch.id,
      lessonId,
      courseId,
      title: ch.title.trim(),
      timestampSeconds: Math.max(0, ch.timestampSeconds),
      source: (ch.isManual
        ? 'manual'
        : 'ai') as import('../../../types/chapters').ChapterSource,
      isManual: Boolean(ch.isManual),
      orderIndex: idx
    }))

    return this.db.saveLessonChapters(lessonId, courseId, inputs)
  }

  public updateChapter(request: UpdateChapterRequest): LessonChapter {
    const { id, lessonId, title, timestampSeconds } = request
    const updated = this.db.updateLessonChapter(id, lessonId, {
      title,
      timestampSeconds
    })
    if (!updated) {
      throw new Error(`Chapter not found: ${id}`)
    }
    return updated
  }

  public deleteChapter(request: DeleteChapterRequest): boolean {
    const { id, lessonId } = request
    return this.db.deleteLessonChapter(id, lessonId)
  }

  private parseAiChapters(
    rawText: string,
    maxDuration: number
  ): Array<{ timestampSeconds: number; title: string }> {
    try {
      let cleaned = rawText.trim()
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned
          .replace(/^```json\s*/i, '')
          .replace(/\s*```$/, '')
          .trim()
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned
          .replace(/^```\s*/, '')
          .replace(/\s*```$/, '')
          .trim()
      }

      const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
      if (jsonMatch) {
        cleaned = jsonMatch[0]
      }

      const parsed = JSON.parse(cleaned)
      const list: RawChapterItem[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.chapters)
          ? parsed.chapters
          : []

      const result: Array<{ timestampSeconds: number; title: string }> = []
      for (const item of list) {
        if (!item || typeof item !== 'object') continue
        const sec =
          typeof item.timestampSeconds === 'number'
            ? item.timestampSeconds
            : typeof item.timestamp === 'number'
              ? item.timestamp
              : typeof item.time === 'number'
                ? item.time
                : null
        const title = typeof item.title === 'string' ? item.title.trim() : ''
        if (sec !== null && sec >= 0 && title) {
          result.push({ timestampSeconds: sec, title })
        }
      }

      if (result.length > 0) {
        return result
      }
    } catch (err) {
      logger.warn(
        '[ChaptersService] Failed to parse JSON chapters, attempting regex line parsing',
        err
      )
    }

    // Fallback: line regex parsing e.g. "04:22 Setup" or "00:00 - Intro"
    const lines = rawText.split('\n')
    const fallbackList: Array<{ timestampSeconds: number; title: string }> = []
    const lineRegex = /(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[-–—:]?\s*(.+)$/

    for (const line of lines) {
      const match = line.trim().match(lineRegex)
      if (match) {
        let sec = 0
        if (match[3]) {
          sec =
            parseInt(match[1], 10) * 3600 +
            parseInt(match[2], 10) * 60 +
            parseInt(match[3], 10)
        } else {
          sec = parseInt(match[1], 10) * 60 + parseInt(match[2], 10)
        }
        const title = match[4].replace(/^[-–—:]\s*/, '').trim()
        if (title && sec >= 0 && sec <= maxDuration) {
          fallbackList.push({ timestampSeconds: sec, title })
        }
      }
    }

    return fallbackList
  }

  private validateChapters(
    chapters: Array<{ timestampSeconds: number; title: string }>,
    maxDuration: number
  ): Array<{ timestampSeconds: number; title: string }> {
    if (chapters.length === 0) return []

    // Filter within duration
    const valid = chapters.filter(
      (c) =>
        typeof c.timestampSeconds === 'number' &&
        c.timestampSeconds >= 0 &&
        c.timestampSeconds <= maxDuration &&
        c.title.trim()
    )

    // Sort ascending
    valid.sort((a, b) => a.timestampSeconds - b.timestampSeconds)

    // Ensure strictly monotonic (no identical timestamps)
    const monotonic: Array<{ timestampSeconds: number; title: string }> = []
    for (const ch of valid) {
      if (
        monotonic.length === 0 ||
        ch.timestampSeconds >
          monotonic[monotonic.length - 1].timestampSeconds + 2
      ) {
        monotonic.push(ch)
      }
    }

    // Ensure starts at 0 if first is within first 30 seconds
    if (
      monotonic.length > 0 &&
      monotonic[0].timestampSeconds > 0 &&
      monotonic[0].timestampSeconds <= 30
    ) {
      monotonic[0].timestampSeconds = 0
    } else if (monotonic.length > 0 && monotonic[0].timestampSeconds > 30) {
      monotonic.unshift({ timestampSeconds: 0, title: 'Introdução' })
    }

    return monotonic
  }

  private formatTimestamp(seconds: number): string {
    const s = Math.floor(seconds)
    const m = Math.floor(s / 60)
    const rem = s % 60
    return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`
  }
}

export const chaptersService = new ChaptersService()
