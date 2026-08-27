import fs from 'node:fs'
import crypto from 'node:crypto'
import type Database from 'better-sqlite3'
import type {
  Transcript,
  TranscriptSegment,
  TranscriptSummary,
  TranscriptionSettings
} from '../../../types/transcription'
import type { MediaType } from '../../../types/course'
import { databaseService, type DatabaseService } from '../database.service'
import { parseSubtitleSegments, validateTranscriptSegments } from './transcript-utils'

interface TranscriptRow {
  id: string
  lesson_id: string
  version: number
  language: string
  provider: string
  model: string | null
  created_at: number
  source_revision: string
  settings_json: string
  status: Transcript['status']
  is_current: number
  error_message: string | null
}

interface TranscriptSegmentRow {
  id: string
  transcript_id: string
  sequence: number
  start_time: number
  end_time: number
  text: string
}

export interface LessonTranscriptionSource {
  lessonId: string
  courseId: string
  moduleId: string
  filePath: string
  fileName: string
  fileSize: number
  duration: number
  mediaType: MediaType
  sourceRevision: string
}

export interface SubtitleCandidate {
  resourceId: string
  filePath: string
  language?: string
  label?: string
  sourceRevision: string
  segments: TranscriptSegment[]
}

export interface SaveTranscriptInput {
  lessonId: string
  language: string
  provider: string
  model?: string
  sourceRevision: string
  settings: Record<string, unknown>
  segments: TranscriptSegment[]
  createdAt?: number
}

export interface TranscriptRepositoryDependencies {
  databaseService?: DatabaseService
  now?: () => number
  createId?: () => string
}

export class TranscriptRepository {
  private readonly databaseService: DatabaseService
  private readonly now: () => number
  private readonly createId: () => string

  public constructor(dependencies: TranscriptRepositoryDependencies | DatabaseService = {}) {
    if (isDatabaseService(dependencies)) {
      this.databaseService = dependencies
      this.now = Date.now
      this.createId = crypto.randomUUID
      return
    }
    this.databaseService = dependencies.databaseService ?? databaseService
    this.now = dependencies.now ?? Date.now
    this.createId = dependencies.createId ?? crypto.randomUUID
  }

  public getLessonSource(lessonId: string): LessonTranscriptionSource | null {
    const db = this.requireDatabase()
    const row = db.prepare(`
      SELECT id, course_id, module_id, file_path, file_name, file_size, duration, media_type,
             content_hash, fingerprint_signature, created_at
      FROM lessons
      WHERE id = ?
    `).get(lessonId) as {
      id: string
      course_id: string
      module_id: string
      file_path: string
      file_name: string
      file_size: number
      duration: number
      media_type: MediaType
      content_hash: string | null
      fingerprint_signature: string | null
      created_at: number
    } | undefined

    if (!row) return null

    let sourceRevision: string | null = null
    try {
      const sourceRow = db.prepare(`
        SELECT source_items.revision, source_items.checksum, source_items.fingerprint
        FROM source_items
        JOIN canonical_source_links ON canonical_source_links.source_item_id = source_items.id
        WHERE canonical_source_links.lesson_id = ?
        ORDER BY canonical_source_links.is_preferred DESC, source_items.updated_at DESC
        LIMIT 1
      `).get(lessonId) as { revision: string | null; checksum: string | null; fingerprint: string | null } | undefined
      sourceRevision = sourceRow?.revision ?? sourceRow?.checksum ?? sourceRow?.fingerprint ?? null
    } catch {
      // Connected-library tables are unavailable only for pre-v0.8 databases.
    }

    if (!sourceRevision) sourceRevision = row.content_hash ?? row.fingerprint_signature ?? null
    if (!sourceRevision) {
      try {
        const stat = fs.statSync(row.file_path)
        sourceRevision = `file:${stat.size}:${Math.round(stat.mtimeMs)}:${row.duration}`
      } catch {
        sourceRevision = `lesson:${row.id}:${row.file_size}:${row.duration}:${row.created_at}`
      }
    }

    return {
      lessonId: row.id,
      courseId: row.course_id,
      moduleId: row.module_id,
      filePath: row.file_path,
      fileName: row.file_name,
      fileSize: row.file_size,
      duration: row.duration,
      mediaType: row.media_type,
      sourceRevision
    }
  }

  public listLessonIdsForModule(moduleId: string): string[] {
    return (this.requireDatabase().prepare(`
      SELECT id FROM lessons WHERE module_id = ? ORDER BY order_index, id
    `).all(moduleId) as Array<{ id: string }>).map((row) => row.id)
  }

  public listLessonIdsForCourse(courseId: string): string[] {
    return (this.requireDatabase().prepare(`
      SELECT id FROM lessons WHERE course_id = ? ORDER BY module_id, order_index, id
    `).all(courseId) as Array<{ id: string }>).map((row) => row.id)
  }

  public getCurrent(lessonId: string): Transcript | null {
    const db = this.requireDatabase()
    const row = db.prepare(`
      SELECT id, lesson_id, version, language, provider, model, created_at,
             source_revision, settings_json, status, is_current, error_message
      FROM transcripts
      WHERE lesson_id = ? AND is_current = 1
      LIMIT 1
    `).get(lessonId) as TranscriptRow | undefined
    return row ? this.mapTranscript(db, row) : null
  }

  public listVersions(lessonId: string): TranscriptSummary[] {
    const db = this.requireDatabase()
    const rows = db.prepare(`
      SELECT t.id, t.lesson_id, t.version, t.language, t.provider, t.model, t.created_at,
             t.source_revision, t.settings_json, t.status, t.is_current, t.error_message,
             COUNT(s.id) AS segment_count
      FROM transcripts t
      LEFT JOIN transcript_segments s ON s.transcript_id = t.id
      WHERE t.lesson_id = ?
      GROUP BY t.id
      ORDER BY t.version DESC
    `).all(lessonId) as Array<TranscriptRow & { segment_count: number }>
    return rows.map((row) => ({ ...this.mapTranscriptWithoutSegments(row), segmentCount: row.segment_count }))
  }

  public saveCompleted(input: SaveTranscriptInput): Transcript {
    validateTranscriptSegments(input.segments)
    const db = this.requireDatabase()
    const createdAt = input.createdAt ?? this.now()
    const transcriptId = this.createId()
    const versionRow = db.prepare(`SELECT COALESCE(MAX(version), 0) + 1 AS version FROM transcripts WHERE lesson_id = ?`).get(input.lessonId) as { version: number }
    const version = versionRow.version

    const transaction = db.transaction(() => {
      db.prepare(`UPDATE transcripts SET is_current = 0 WHERE lesson_id = ? AND is_current = 1`).run(input.lessonId)
      db.prepare(`
        INSERT INTO transcripts (
          id, lesson_id, version, language, provider, model, created_at,
          source_revision, settings_json, status, is_current, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', 1, NULL)
      `).run(
        transcriptId,
        input.lessonId,
        version,
        input.language || 'und',
        input.provider,
        input.model ?? null,
        createdAt,
        input.sourceRevision,
        JSON.stringify(input.settings ?? {})
      )

      const insertSegment = db.prepare(`
        INSERT INTO transcript_segments (id, transcript_id, sequence, start_time, end_time, text)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      for (const segment of input.segments) {
        insertSegment.run(
          this.createId(),
          transcriptId,
          segment.sequence,
          segment.start,
          segment.end,
          segment.text.trim()
        )
      }
    })
    transaction()

    return this.getById(transcriptId)!
  }

  public getById(transcriptId: string): Transcript | null {
    const db = this.requireDatabase()
    const row = db.prepare(`
      SELECT id, lesson_id, version, language, provider, model, created_at,
             source_revision, settings_json, status, is_current, error_message
      FROM transcripts WHERE id = ?
    `).get(transcriptId) as TranscriptRow | undefined
    return row ? this.mapTranscript(db, row) : null
  }

  public getSubtitleCandidate(lessonId: string, language?: string): SubtitleCandidate | null {
    const db = this.requireDatabase()
    const rows = db.prepare(`
      SELECT id, file_path, language, label, file_size, created_at
      FROM content_resources
      WHERE lesson_id = ? AND role = 'subtitle'
      ORDER BY CASE WHEN ? IS NOT NULL AND language = ? THEN 0 ELSE 1 END, id
    `).all(lessonId, language ?? null, language ?? null) as Array<{
      id: string
      file_path: string
      language: string | null
      label: string | null
      file_size: number
      created_at: number
    }>

    const lesson = this.getLessonSource(lessonId)
    if (!lesson) return null
    for (const row of rows) {
      try {
        if (!fs.existsSync(row.file_path)) continue
        const segments = parseSubtitleSegments(fs.readFileSync(row.file_path, 'utf8'))
        if (segments.length === 0) continue
        return {
          resourceId: row.id,
          filePath: row.file_path,
          ...(row.language ? { language: row.language } : {}),
          ...(row.label ? { label: row.label } : {}),
          sourceRevision: lesson.sourceRevision,
          segments
        }
      } catch {
        // A broken subtitle is not a suitable text source.
      }
    }
    return null
  }

  public getSettings(): TranscriptionSettings {
    const row = this.requireDatabase().prepare(`
      SELECT auto_transcribe_new_lessons FROM transcription_settings WHERE id = 1
    `).get() as { auto_transcribe_new_lessons: number } | undefined
    return { autoTranscribeNewLessons: row?.auto_transcribe_new_lessons === 1 }
  }

  public setSettings(updates: Partial<TranscriptionSettings>): boolean {
    const db = this.requireDatabase()
    const current = this.getSettings()
    const next = updates.autoTranscribeNewLessons ?? current.autoTranscribeNewLessons
    db.prepare(`
      INSERT INTO transcription_settings (id, auto_transcribe_new_lessons)
      VALUES (1, ?)
      ON CONFLICT(id) DO UPDATE SET auto_transcribe_new_lessons = excluded.auto_transcribe_new_lessons
    `).run(next ? 1 : 0)
    return true
  }

  public getCourseAutoTranscribe(courseId: string): boolean {
    const row = this.requireDatabase().prepare(`SELECT auto_transcribe FROM courses WHERE id = ?`).get(courseId) as { auto_transcribe: number } | undefined
    return row?.auto_transcribe === 1
  }

  public setCourseAutoTranscribe(courseId: string, enabled: boolean): boolean {
    const result = this.requireDatabase().prepare(`UPDATE courses SET auto_transcribe = ?, updated_at = ? WHERE id = ?`).run(enabled ? 1 : 0, this.now(), courseId)
    return result.changes > 0
  }

  private mapTranscript(db: Database.Database, row: TranscriptRow): Transcript {
    const segments = db.prepare(`
      SELECT id, transcript_id, sequence, start_time, end_time, text
      FROM transcript_segments WHERE transcript_id = ? ORDER BY sequence
    `).all(row.id) as TranscriptSegmentRow[]
    return {
      ...this.mapTranscriptWithoutSegments(row),
      segments: segments.map((segment) => ({
        sequence: segment.sequence,
        start: segment.start_time,
        end: segment.end_time,
        text: segment.text
      }))
    }
  }

  private mapTranscriptWithoutSegments(row: TranscriptRow): Omit<Transcript, 'segments'> {
    let settings: Record<string, unknown> = {}
    try {
      const parsed: unknown = JSON.parse(row.settings_json)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) settings = parsed as Record<string, unknown>
    } catch {
      // Keep malformed legacy settings private and harmless.
    }
    return {
      id: row.id,
      lessonId: row.lesson_id,
      version: row.version,
      language: row.language,
      provider: row.provider,
      ...(row.model ? { model: row.model } : {}),
      createdAt: row.created_at,
      sourceRevision: row.source_revision,
      settings,
      status: row.status,
      isCurrent: row.is_current === 1,
      ...(row.error_message ? { errorMessage: row.error_message } : {})
    } as Omit<Transcript, 'segments'>
  }

  private requireDatabase(): Database.Database {
    const db = this.databaseService.getDatabase()
    if (!db) throw new Error('Database is not connected to any vault.')
    return db
  }
}

export const transcriptRepository = new TranscriptRepository(databaseService)

function isDatabaseService(value: TranscriptRepositoryDependencies | DatabaseService): value is DatabaseService {
  return Boolean(value && typeof value === 'object' && typeof (value as { getDatabase?: unknown }).getDatabase === 'function')
}
