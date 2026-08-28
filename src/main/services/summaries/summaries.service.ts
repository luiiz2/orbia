import crypto from 'node:crypto'
import type {
  GenerateSummaryRequest,
  GenerateSummaryResponse,
  SummaryRecord,
  SummaryScope,
  SummaryTimestamp
} from '../../../types/summaries'
import type { DatabaseService } from '../database.service'
import { databaseService } from '../database.service'
import type { AiCoreService } from '../ai/ai-core.service'
import { aiCoreService } from '../ai'
import { TranscriptRepository } from '../transcription/transcript-repository.service'
import { logger } from '../logger.service'
import { UNTRUSTED_CONTENT_RULES, wrapUntrustedContent } from '../ai/ai-prompts'

const SUMMARY_TEMPLATE_VERSION = 'v1.0'
const MAX_SUMMARY_CONTEXT_CHARACTERS = 80_000

export interface SummariesServiceDependencies {
  db?: DatabaseService
  ai?: AiCoreService
  transcripts?: TranscriptRepository
}

interface ParsedSummaryPayload {
  title?: string
  overview: string
  keyConcepts?: string[]
  topicsCovered?: string[]
  importantDetails?: string[]
  timestamps?: Array<{
    timestampSeconds?: number
    timestamp?: number
    time?: number
    label: string
  }>
  fullMarkdown?: string
}

export class SummariesService {
  private readonly db: DatabaseService
  private readonly ai: AiCoreService
  private readonly transcripts: TranscriptRepository

  public constructor(dependencies: SummariesServiceDependencies = {}) {
    this.db = dependencies.db ?? databaseService
    this.ai = dependencies.ai ?? aiCoreService
    this.transcripts =
      dependencies.transcripts ?? new TranscriptRepository(this.db)
  }

  public async getSummary(scope: SummaryScope): Promise<SummaryRecord | null> {
    const existing = this.db.getAiSummary(scope)
    if (!existing) return null

    // Check if source revision changed to determine staleness
    const currentRevision = this.computeSourceRevision(scope)
    if (
      currentRevision &&
      currentRevision !== existing.sourceRevision &&
      !existing.isStale
    ) {
      existing.isStale = true
      this.db.markAiSummariesStale(
        scope.courseId,
        'moduleId' in scope ? scope.moduleId : undefined,
        'lessonId' in scope ? scope.lessonId : undefined
      )
    }

    return existing
  }

  public async generateSummary(
    request: GenerateSummaryRequest
  ): Promise<GenerateSummaryResponse> {
    const { scope, forceRegenerate = false, cloudConsent = false } = request

    if (!forceRegenerate) {
      const existing = await this.getSummary(scope)
      if (existing && !existing.isStale) {
        return { summary: existing, isCached: true, isStale: false }
      }
    }

    const { contextText, titleHint, sourceRevision } =
      this.extractScopeContext(scope)

    if (!contextText.trim()) {
      throw new Error(
        'No content or transcript available to generate summary for this scope.'
      )
    }

    const promptMessages = this.buildPrompt(scope, titleHint, contextText)

    const response = await this.ai.summarize({
      messages: promptMessages,
      cloudConsent,
      dataTypes: ['transcript', 'notes']
    })

    const parsed = this.parseAiResponse(response.content, titleHint)
    const markdown =
      parsed.fullMarkdown || this.buildMarkdown(parsed, titleHint)

    const summaryRecord = this.db.upsertAiSummary({
      scopeType: scope.type,
      courseId: scope.courseId,
      moduleId: 'moduleId' in scope ? scope.moduleId : undefined,
      lessonId: 'lessonId' in scope ? scope.lessonId : undefined,
      title: parsed.title || titleHint,
      overview: parsed.overview,
      keyConcepts: parsed.keyConcepts || [],
      topicsCovered: parsed.topicsCovered || [],
      importantDetails: parsed.importantDetails || [],
      timestamps: this.normalizeTimestamps(parsed.timestamps),
      fullMarkdown: markdown,
      providerId:
        (response as { providerId?: string; provider?: string }).providerId ||
        (response as { providerId?: string; provider?: string }).provider ||
        'unknown',
      modelId:
        (response as { modelId?: string; model?: string }).modelId ||
        (response as { modelId?: string; model?: string }).model ||
        'unknown',
      templateVersion: SUMMARY_TEMPLATE_VERSION,
      sourceRevision,
      isStale: false
    })

    return {
      summary: summaryRecord,
      isCached: false,
      isStale: false
    }
  }

  public invalidateSummary(scope: SummaryScope): boolean {
    this.db.markAiSummariesStale(
      scope.courseId,
      'moduleId' in scope ? scope.moduleId : undefined,
      'lessonId' in scope ? scope.lessonId : undefined
    )
    return true
  }

  private computeSourceRevision(scope: SummaryScope): string {
    const { sourceRevision } = this.extractScopeContext(scope)
    return sourceRevision
  }

  private extractScopeContext(scope: SummaryScope): {
    contextText: string
    titleHint: string
    sourceRevision: string
  } {
    const rawDb = this.db.getDatabase()
    if (!rawDb) throw new Error('Database is not connected')

    if (scope.type === 'lesson') {
      type LessonRow = {
        id: string
        title: string
        file_name: string
        duration?: number
        module_title: string
        course_title: string
      }
      const lesson = rawDb
        .prepare(
          `
        SELECT l.id, l.title, l.file_name, l.duration, m.title as module_title, c.title as course_title
        FROM lessons l
        JOIN modules m ON l.module_id = m.id
        JOIN courses c ON l.course_id = c.id
        WHERE l.id = ? AND l.course_id = ? AND l.module_id = ?
      `
        )
        .get(scope.lessonId, scope.courseId, scope.moduleId) as
        LessonRow | undefined

      if (!lesson) throw new Error('Lesson not found')

      const transcript = this.transcripts.getCurrent(scope.lessonId)
      let transcriptText = ''
      let transcriptRevision = ''

      if (transcript && transcript.segments.length > 0) {
        transcriptText = transcript.segments
          .map((s) => `[${Math.floor(s.start)}s] ${s.text}`)
          .join('\n')
        transcriptRevision = transcript.sourceRevision || ''
      }

      const notes = this.db.getLessonNotes(scope.lessonId)
      const notesText = notes.map((n) => `Note: ${n.content}`).join('\n')

      const contextParts = [
        `Course: ${lesson.course_title}`,
        `Module: ${lesson.module_title}`,
        `Lesson: ${lesson.title}`,
        transcriptText
          ? `Transcript:\n${transcriptText}`
          : `(No transcript available)`,
        notesText ? `User Notes:\n${notesText}` : ''
      ].filter(Boolean)

      const hash = crypto
        .createHash('sha256')
        .update(
          `${lesson.title}|${transcriptRevision}|${notes
            .map((note) => `${note.id}:${note.updatedAt}:${note.content}`)
            .join('|')}`
        )
        .digest('hex')
        .slice(0, 16)

      return {
        contextText: contextParts.join('\n\n'),
        titleHint: lesson.title,
        sourceRevision: hash
      }
    }

    if (scope.type === 'module') {
      type ModuleRow = {
        id: string
        title: string
        course_title: string
      }
      const mod = rawDb
        .prepare(
          `
        SELECT m.id, m.title, c.title as course_title
        FROM modules m
        JOIN courses c ON m.course_id = c.id
        WHERE m.id = ? AND m.course_id = ?
      `
        )
        .get(scope.moduleId, scope.courseId) as ModuleRow | undefined

      if (!mod) throw new Error('Module not found')

      type LessonItemRow = {
        id: string
        title: string
        duration?: number
        order_index: number
      }
      const lessons = rawDb
        .prepare(
          `
        SELECT id, title, duration, order_index
        FROM lessons
        WHERE module_id = ? AND course_id = ?
        ORDER BY order_index ASC
      `
        )
        .all(scope.moduleId, scope.courseId) as LessonItemRow[]

      const contentSections: string[] = []
      const revisionInputs: string[] = [mod.title]

      for (const l of lessons) {
        const transcript = this.transcripts.getCurrent(l.id)
        let sample = ''
        if (transcript && transcript.segments.length > 0) {
          sample = transcript.segments
            .slice(0, 15)
            .map((s) => s.text)
            .join(' ')
          revisionInputs.push(transcript.sourceRevision || l.id)
        } else {
          revisionInputs.push(l.id)
        }
        contentSections.push(
          `Lesson "${l.title}": ${sample || '(No transcript)'}`
        )
      }

      const contextText = `Course: ${mod.course_title}\nModule: ${mod.title}\n\nLessons in this Module:\n${contentSections.join('\n\n')}`
      const hash = crypto
        .createHash('sha256')
        .update(revisionInputs.join('|'))
        .digest('hex')
        .slice(0, 16)

      return {
        contextText,
        titleHint: mod.title,
        sourceRevision: hash
      }
    }

    // scope.type === 'course'
    type CourseRow = { id: string; title: string; description?: string }
    const course = rawDb
      .prepare(
        `
      SELECT id, title, description
      FROM courses
      WHERE id = ?
    `
      )
      .get(scope.courseId) as CourseRow | undefined

    if (!course) throw new Error('Course not found')

    type ModuleItemRow = { id: string; title: string; order_index: number }
    const modules = rawDb
      .prepare(
        `
      SELECT id, title, order_index
      FROM modules
      WHERE course_id = ?
      ORDER BY order_index ASC
    `
      )
      .all(scope.courseId) as ModuleItemRow[]

    const modOverviews: string[] = []
    const revisionInputs: string[] = [course.title]

    for (const m of modules) {
      const lessons = rawDb
        .prepare(
          `
        SELECT title FROM lessons WHERE module_id = ? ORDER BY order_index ASC
      `
        )
        .all(m.id) as Array<{ title: string }>
      const lessonTitles = lessons.map((l) => l.title).join(', ')
      modOverviews.push(
        `Module "${m.title}": Lessons: [${lessonTitles || 'None'}]`
      )
      revisionInputs.push(`${m.id}:${lessons.length}`)
    }

    const contextText = `Course Title: ${course.title}\nDescription: ${course.description || ''}\n\nCourse Structure:\n${modOverviews.join('\n')}`
    const hash = crypto
      .createHash('sha256')
      .update(revisionInputs.join('|'))
      .digest('hex')
      .slice(0, 16)

    return {
      contextText,
      titleHint: course.title,
      sourceRevision: hash
    }
  }

  private buildPrompt(
    scope: SummaryScope,
    titleHint: string,
    context: string
  ): Array<{ role: 'system' | 'user'; content: string }> {
    let systemInstruction = ''
    if (scope.type === 'lesson') {
      systemInstruction = `You are a concise, structured study assistant.
Generate a high-quality, practical summary of the provided lesson.
Do NOT make it exam-oriented or include quizzes/practice questions.
Return ONLY valid JSON matching this schema:
{
  "title": "Concise lesson title",
  "overview": "Clear 2-3 sentence overview of what is taught",
  "keyConcepts": ["Concept 1 with brief explanation", "Concept 2 with brief explanation"],
  "topicsCovered": ["Topic 1", "Topic 2", "Topic 3"],
  "importantDetails": ["Key nuance, detail, or practical caveat 1", "Key nuance 2"],
  "timestamps": [
    { "timestampSeconds": 0, "label": "Introduction" },
    { "timestampSeconds": 240, "label": "Setup & Configuration" }
  ]
}`
    } else if (scope.type === 'module') {
      systemInstruction = `You are a synthesis-focused study assistant.
Synthesize the provided module content across its lessons into a cohesive topic guide.
Do NOT simply concatenate lesson summaries. Do NOT include quizzes or test questions.
Return ONLY valid JSON matching this schema:
{
  "title": "Module title",
  "overview": "Synthesized 2-4 sentence overview of the module's core topic and objectives",
  "keyConcepts": ["Major Concept 1", "Major Concept 2"],
  "topicsCovered": ["Sub-topic 1", "Sub-topic 2"],
  "importantDetails": ["Important architectural or practical insight 1", "Important insight 2"],
  "timestamps": []
}`
    } else {
      systemInstruction = `You are a curriculum synthesis assistant.
Provide a high-level course overview and progression guide covering the main subjects, learning trajectory, and key concepts.
Avoid huge walls of text; keep it clear, structured, and digestible.
Do NOT include quizzes, practice questions, or exam material.
Return ONLY valid JSON matching this schema:
{
  "title": "Course title",
  "overview": "Comprehensive overview of the course scope and learning outcomes",
  "keyConcepts": ["Foundational Concept 1", "Foundational Concept 2", "Advanced Concept 3"],
  "topicsCovered": ["Major Section 1", "Major Section 2", "Major Section 3"],
  "importantDetails": ["Core takeaway 1", "Core takeaway 2"],
  "timestamps": []
}`
    }

    return [
      {
        role: 'system',
        content: `${systemInstruction}\n\n${UNTRUSTED_CONTENT_RULES}`
      },
      {
        role: 'user',
        content: [
          'Summarize the untrusted study material below according to the system schema.',
          wrapUntrustedContent(
            'summary_material',
            `Title: ${titleHint}\n\n${context}`,
            MAX_SUMMARY_CONTEXT_CHARACTERS
          )
        ].join('\n\n')
      }
    ]
  }

  private parseAiResponse(
    rawText: string,
    fallbackTitle: string
  ): ParsedSummaryPayload {
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

      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        cleaned = jsonMatch[0]
      }

      const obj = JSON.parse(cleaned) as ParsedSummaryPayload
      return {
        title:
          typeof obj.title === 'string' && obj.title.trim()
            ? obj.title.trim()
            : fallbackTitle,
        overview:
          typeof obj.overview === 'string'
            ? obj.overview.trim()
            : rawText.slice(0, 300),
        keyConcepts: Array.isArray(obj.keyConcepts)
          ? obj.keyConcepts.filter((k) => typeof k === 'string')
          : [],
        topicsCovered: Array.isArray(obj.topicsCovered)
          ? obj.topicsCovered.filter((t) => typeof t === 'string')
          : [],
        importantDetails: Array.isArray(obj.importantDetails)
          ? obj.importantDetails.filter((d) => typeof d === 'string')
          : [],
        timestamps: Array.isArray(obj.timestamps) ? obj.timestamps : []
      }
    } catch (err) {
      logger.warn(
        '[SummariesService] Failed to parse JSON structured summary, falling back to unstructured extraction',
        err
      )
      return {
        title: fallbackTitle,
        overview: rawText.slice(0, 500).trim(),
        keyConcepts: [],
        topicsCovered: [],
        importantDetails: [],
        timestamps: [],
        fullMarkdown: rawText
      }
    }
  }

  private normalizeTimestamps(
    rawTimestamps?: Array<Record<string, unknown>>
  ): SummaryTimestamp[] {
    if (!Array.isArray(rawTimestamps)) return []
    const result: SummaryTimestamp[] = []
    for (const item of rawTimestamps) {
      if (!item || typeof item !== 'object') continue
      const sec =
        typeof item.timestampSeconds === 'number'
          ? item.timestampSeconds
          : typeof item.timestamp === 'number'
            ? item.timestamp
            : typeof item.time === 'number'
              ? item.time
              : null
      const label = typeof item.label === 'string' ? item.label.trim() : ''
      if (sec !== null && sec >= 0 && label) {
        result.push({ timestampSeconds: sec, label })
      }
    }
    return result.sort((a, b) => a.timestampSeconds - b.timestampSeconds)
  }

  private buildMarkdown(parsed: ParsedSummaryPayload, title: string): string {
    const lines: string[] = []
    lines.push(`# ${parsed.title || title}\n`)
    lines.push(`## Overview\n${parsed.overview}\n`)

    if (parsed.keyConcepts && parsed.keyConcepts.length > 0) {
      lines.push(
        `## Key Concepts\n` +
          parsed.keyConcepts.map((c) => `- ${c}`).join('\n') +
          '\n'
      )
    }

    if (parsed.topicsCovered && parsed.topicsCovered.length > 0) {
      lines.push(
        `## Topics Covered\n` +
          parsed.topicsCovered.map((t) => `- ${t}`).join('\n') +
          '\n'
      )
    }

    if (parsed.importantDetails && parsed.importantDetails.length > 0) {
      lines.push(
        `## Important Details\n` +
          parsed.importantDetails.map((d) => `- ${d}`).join('\n') +
          '\n'
      )
    }

    if (parsed.timestamps && parsed.timestamps.length > 0) {
      lines.push(
        `## Relevant Moments\n` +
          parsed.timestamps
            .map((ts) => {
              const sec = ts.timestampSeconds ?? ts.timestamp ?? ts.time ?? 0
              const m = Math.floor(sec / 60)
              const s = Math.floor(sec % 60)
              const formatted = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
              return `- **${formatted}**: ${ts.label}`
            })
            .join('\n') +
          '\n'
      )
    }

    return lines.join('\n')
  }
}

export const summariesService = new SummariesService()
