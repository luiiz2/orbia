import type Database from 'better-sqlite3'
import type {
  ChatMessageSource,
  SourceNavigationRequest,
  SourceNavigationResult
} from '../../../types/grounded-chat'
import { databaseService, type DatabaseService } from '../database.service'
import { chatRepository, type ChatRepository } from './chat-repository.service'

export interface SourceNavigationServiceDependencies {
  databaseService?: DatabaseService
  chatRepository?: ChatRepository
}

interface LessonRow {
  course_id: string
  module_id: string
  duration: number
}

interface ResourceRow {
  course_id: string
  module_id: string
  lesson_id: string | null
  role: string
  resource_type: string
}

export class SourceNavigationService {
  private readonly databaseService: DatabaseService
  private readonly chatRepository: ChatRepository

  public constructor(
    dependencies: SourceNavigationServiceDependencies | DatabaseService = {},
    repository = chatRepository
  ) {
    if (isDatabaseService(dependencies)) {
      this.databaseService = dependencies
      this.chatRepository = repository
      return
    }
    this.databaseService = dependencies.databaseService ?? databaseService
    this.chatRepository = dependencies.chatRepository ?? chatRepository
  }

  public resolve(input: SourceNavigationRequest): SourceNavigationResult {
    if (!input || !isIdentifier(input.sourceId)) return unavailable('Source record ID is invalid')
    const source = this.chatRepository.getMessageSource(input.sourceId)
    if (!source) return unavailable('Source record is unavailable')

    const db = this.requireDatabase()
    if (!db.prepare(`SELECT id FROM courses WHERE id = ?`).get(source.courseId)) {
      return unavailable('Course is unavailable')
    }
    if (source.moduleId && !db.prepare(`SELECT id FROM modules WHERE id = ? AND course_id = ?`).get(source.moduleId, source.courseId)) {
      return unavailable('Module ownership is invalid')
    }

    const lesson = this.resolveLesson(db, source)
    if (source.lessonId && !lesson) return unavailable('Lesson ownership is invalid')
    if (source.transcriptId && !this.hasTranscript(db, source.transcriptId, source.lessonId)) {
      return unavailable('Transcript ownership is invalid')
    }
    if (source.noteId && !this.hasNote(db, source.noteId, source.lessonId, source.courseId)) {
      return unavailable('Note ownership is invalid')
    }

    const resource = this.resolveResource(db, source)
    if (source.resourceId && !resource) return unavailable('Resource ownership is invalid')

    if ((source.sourceKind === 'transcript' || source.sourceKind === 'subtitle' || source.sourceKind === 'note') && lesson) {
      const timestampSeconds = boundedTimestamp(source, lesson.duration)
      if (timestampSeconds === null) return unavailable('Transcript locator is invalid')
      return {
        status: 'ok',
        target: {
          type: 'lesson',
          courseId: lesson.course_id,
          lessonId: source.lessonId!,
          timestampSeconds
        }
      }
    }

    if (resource && source.sourceKind !== 'note' && source.sourceKind !== 'metadata') {
      const target = {
        type: 'resource' as const,
        courseId: resource.course_id,
        ...(source.moduleId ? { moduleId: resource.module_id } : {}),
        ...(resource.lesson_id ? { lessonId: resource.lesson_id } : {}),
        resourceId: source.resourceId!
      }
      if (source.sourceKind !== 'pdf') return { status: 'ok', target }
      const page = positivePage(source.locator.page)
      return page === null || resource.resource_type !== 'pdf'
        ? unavailable('PDF locator is invalid')
        : { status: 'ok', target: { ...target, page } }
    }

    return unavailable('Source navigation is unsupported')
  }

  private resolveLesson(db: Database.Database, source: ChatMessageSource): LessonRow | null {
    if (!source.lessonId) return null
    const row = db.prepare(`
      SELECT course_id, module_id, duration
      FROM lessons
      WHERE id = ? AND course_id = ?
    `).get(source.lessonId, source.courseId) as LessonRow | undefined
    if (!row || (source.moduleId && row.module_id !== source.moduleId)) return null
    return row
  }

  private resolveResource(db: Database.Database, source: ChatMessageSource): ResourceRow | null {
    if (!source.resourceId) return null
    const row = db.prepare(`
      SELECT course_id, module_id, lesson_id, role, resource_type
      FROM content_resources
      WHERE id = ? AND course_id = ?
    `).get(source.resourceId, source.courseId) as ResourceRow | undefined
    const expectedRole = source.sourceKind === 'subtitle' ? 'subtitle' : 'resource'
    if (!row || row.role !== expectedRole) return null
    if (source.moduleId && row.module_id !== source.moduleId) return null
    if (source.lessonId && row.lesson_id !== source.lessonId) return null
    return row
  }

  private hasTranscript(db: Database.Database, transcriptId: string, lessonId: string | undefined): boolean {
    return Boolean(lessonId && db.prepare(`SELECT id FROM transcripts WHERE id = ? AND lesson_id = ?`).get(transcriptId, lessonId))
  }

  private hasNote(db: Database.Database, noteId: string, lessonId: string | undefined, courseId: string): boolean {
    return Boolean(lessonId && db.prepare(`SELECT id FROM lesson_notes WHERE id = ? AND lesson_id = ? AND course_id = ?`).get(noteId, lessonId, courseId))
  }

  private requireDatabase(): Database.Database {
    const db = this.databaseService.getDatabase()
    if (!db) throw new Error('Database is not connected to any vault.')
    return db
  }
}

export const sourceNavigationService = new SourceNavigationService({ databaseService, chatRepository })

function boundedTimestamp(source: ChatMessageSource, duration: number): number | null {
  const { startTime, endTime } = source.locator
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime! < 0 || endTime! < startTime!) return null
  if (!Number.isFinite(duration) || duration < 0) return null
  const lowerBound = Math.max(0, startTime!)
  const upperBound = Math.min(endTime!, duration)
  return lowerBound <= upperBound ? lowerBound : null
}

function positivePage(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

function unavailable(reason: string): SourceNavigationResult {
  return { status: 'unavailable', reason }
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isDatabaseService(value: SourceNavigationServiceDependencies | DatabaseService): value is DatabaseService {
  return Boolean(value && typeof value === 'object' && typeof (value as { getDatabase?: unknown }).getDatabase === 'function')
}
