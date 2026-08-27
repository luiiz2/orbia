import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import type { AiDataType } from '../../../types/ai'
import type {
  ExtractedSemanticDocument,
  SemanticIndexScope,
  SemanticSourceDescriptor,
  SemanticSourceKind
} from '../../../types/semantic-index'
import { CODE_EXTENSIONS } from '../../utils/file-utils'
import { transcriptRepository, type TranscriptRepository } from '../transcription/transcript-repository.service'
import { databaseService, type DatabaseService } from '../database.service'

export interface PdfTextPage {
  page: number
  text: string
}

export type PdfTextExtractor = (content: Buffer, fileName: string) => Promise<PdfTextPage[]>

export interface ContentExtractorDependencies {
  databaseService?: DatabaseService
  transcriptRepository?: TranscriptRepository
  pdfExtractor?: PdfTextExtractor
}

interface LessonRow {
  id: string
  course_id: string
  module_id: string
  course_title: string
  module_title: string
  lesson_title: string
  file_path: string
  file_name: string
  file_extension: string
  media_type: string
}

interface ResourceRow {
  id: string
  course_id: string
  module_id: string
  lesson_id: string | null
  role: 'resource' | 'subtitle'
  name: string
  file_path: string
  file_extension: string
  resource_type: string
  language: string | null
  label: string | null
  course_title: string
  module_title: string
  lesson_title: string | null
}

interface NoteRow {
  id: string
  lesson_id: string
  course_id: string
  timestamp_seconds: number
  content: string
  updated_at: number
  course_title: string
  module_id: string
  module_title: string
  lesson_title: string
}

export class ContentExtractorService {
  private readonly databaseService: DatabaseService
  private readonly transcriptRepository: TranscriptRepository
  private readonly pdfExtractor: PdfTextExtractor

  public constructor(dependencies: ContentExtractorDependencies = {}) {
    this.databaseService = dependencies.databaseService ?? databaseService
    this.transcriptRepository = dependencies.transcriptRepository ?? transcriptRepository
    this.pdfExtractor = dependencies.pdfExtractor ?? extractPdfText
  }

  public listSources(scope: SemanticIndexScope, includeNotes: boolean): SemanticSourceDescriptor[] {
    const db = this.requireDatabase()
    const sources: SemanticSourceDescriptor[] = []
    const seen = new Set<string>()
    const add = (source: SemanticSourceDescriptor): void => {
      const key = `${source.sourceKind}:${source.sourceId}`
      if (seen.has(key)) return
      seen.add(key)
      sources.push(source)
    }

    const lessons = this.listLessons(db, scope)
    const selectedLessonIds = new Set(lessons.map((lesson) => lesson.id))
    const selectedSubtitleResourceIds = new Set<string>()

    for (const lesson of lessons) {
      addMetadata(add, lesson)
      const currentTranscript = this.transcriptRepository.getCurrent(lesson.id)
      if (currentTranscript?.status === 'completed' && currentTranscript.segments.length > 0) {
        add({
          sourceKind: 'transcript',
          sourceId: `lesson:${lesson.id}:transcript`,
          courseId: lesson.course_id,
          moduleId: lesson.module_id,
          lessonId: lesson.id,
          transcriptId: currentTranscript.id,
          dataType: 'transcript',
          language: currentTranscript.language,
          sourceRevision: currentTranscript.sourceRevision,
          contentRevision: `transcript:${currentTranscript.id}:v${currentTranscript.version}`,
          segments: currentTranscript.segments,
          text: currentTranscript.segments.map((segment) => segment.text).join(' '),
          locator: { transcriptId: currentTranscript.id, language: currentTranscript.language }
        })
      } else {
        const subtitle = this.transcriptRepository.getSubtitleCandidate(lesson.id)
        if (subtitle) {
          selectedSubtitleResourceIds.add(subtitle.resourceId)
          add({
            sourceKind: 'subtitle',
            sourceId: `lesson:${lesson.id}:subtitle`,
            courseId: lesson.course_id,
            moduleId: lesson.module_id,
            lessonId: lesson.id,
            resourceId: subtitle.resourceId,
            dataType: 'transcript',
            filePath: subtitle.filePath,
            fileName: path.basename(subtitle.filePath),
            language: subtitle.language,
            segments: subtitle.segments,
            locator: {
              resourceId: subtitle.resourceId,
              ...(subtitle.language ? { language: subtitle.language } : {})
            }
          })
        }
      }

      const lessonFileSource = this.fileSourceFromLesson(lesson)
      if (lessonFileSource) add(lessonFileSource)
    }

    for (const resource of this.listResources(db, scope, selectedLessonIds)) {
      if (resource.role === 'subtitle') {
        // A current transcript or the first valid subtitle already represents
        // the lesson's timestamped text. Broken/secondary subtitle files are
        // deliberately not indexed as duplicate text sources.
        if (!selectedSubtitleResourceIds.has(resource.id)) continue
        continue
      }
      addMetadata(add, resource)
      const source = this.fileSourceFromResource(resource)
      if (source) add(source)
    }

    if (includeNotes) {
      for (const note of this.listNotes(db, scope, selectedLessonIds)) {
        add({
          sourceKind: 'note',
          sourceId: `note:${note.id}`,
          courseId: note.course_id,
          moduleId: note.module_id,
          lessonId: note.lesson_id,
          noteId: note.id,
          dataType: 'notes',
          sourceRevision: `note:${note.id}:${note.updated_at}`,
          contentRevision: `note:${note.id}:${note.updated_at}:${hashText(note.content)}`,
          text: note.content,
          locator: { noteId: note.id, startTime: note.timestamp_seconds, endTime: note.timestamp_seconds }
        })
      }
    }

    void selectedLessonIds
    return sources
  }

  public async extractSource(source: SemanticSourceDescriptor): Promise<ExtractedSemanticDocument[]> {
    if (source.segments && source.segments.length > 0) {
      const text = source.segments.map((segment) => segment.text.trim()).filter(Boolean).join(' ').trim()
      if (!text) throw new Error('Source contains no usable text')
      let sourceRevision = source.sourceRevision
      let contentRevision = source.contentRevision
      if (source.sourceKind === 'subtitle' && source.filePath) {
        const content = this.readSourceFile(source.filePath)
        const digest = hashBuffer(content)
        sourceRevision = `sha256:${digest}`
        contentRevision = `subtitle:${source.resourceId ?? source.sourceId}:${digest}`
      }
      if (!sourceRevision || !contentRevision) throw new Error('Source provenance is incomplete')
      return [{
        ...source,
        filePath: undefined,
        sourceRevision,
        contentRevision,
        text
      }]
    }

    if (source.text !== undefined && !source.filePath) {
      const text = source.text.trim()
      if (!text) throw new Error('Source contains no usable text')
      if (!source.sourceRevision || !source.contentRevision) throw new Error('Source provenance is incomplete')
      const sourceRevision = source.sourceRevision
      const contentRevision = source.contentRevision
      return [{ ...source, filePath: undefined, sourceRevision, contentRevision, text }]
    }

    if (!source.filePath) throw new Error('Source is unavailable')
    const content = this.readSourceFile(source.filePath)
    const digest = hashBuffer(content)
    const sourceRevision = `sha256:${digest}`
    if (source.sourceKind === 'pdf') {
      const pages = await this.pdfExtractor(content, source.fileName ?? path.basename(source.filePath))
      return pages
        .map((page) => ({
          ...source,
          filePath: undefined,
          sourceRevision,
          contentRevision: `pdf:${digest}:page:${page.page}`,
          text: page.text.trim(),
          locator: { ...source.locator, page: page.page }
        }))
        .filter((page) => page.text.length > 0)
    }

    const text = content.toString('utf8').replaceAll('\u0000', '').trim()
    if (!text) throw new Error('Source contains no usable text')
    return [{
      ...source,
      filePath: undefined,
      sourceRevision,
      contentRevision: `${source.sourceKind}:${digest}`,
      text
    }]
  }

  private listLessons(db: Database.Database, scope: SemanticIndexScope): LessonRow[] {
    const { where, params } = lessonScopeWhere(scope)
    return db.prepare(`
      SELECT l.id, l.course_id, l.module_id, c.title AS course_title,
             m.title AS module_title, l.title AS lesson_title, l.file_path,
             l.file_name, l.file_extension, l.media_type
      FROM lessons l
      JOIN courses c ON c.id = l.course_id
      JOIN modules m ON m.id = l.module_id
      WHERE ${where}
      ORDER BY l.course_id, l.module_id, l.order_index, l.id
    `).all(...params) as LessonRow[]
  }

  private listResources(db: Database.Database, scope: SemanticIndexScope, selectedLessonIds: Set<string>): ResourceRow[] {
    const conditions: string[] = []
    const params: unknown[] = []
    if (scope.type === 'vault') {
      conditions.push('1 = 1')
    } else if (scope.type === 'course') {
      conditions.push('r.course_id = ?')
      params.push(scope.courseId)
    } else if (scope.type === 'lesson') {
      const lesson = db.prepare(`SELECT module_id FROM lessons WHERE id = ?`).get(scope.lessonId) as { module_id: string } | undefined
      conditions.push('r.lesson_id = ?')
      params.push(scope.lessonId)
      if (lesson) {
        conditions[0] = '(r.lesson_id = ? OR (r.lesson_id IS NULL AND r.module_id = ?))'
        params.push(lesson.module_id)
      }
    } else {
      const resourceIds = scope.resourceIds ?? []
      const selectedLessons = [...selectedLessonIds]
      if (resourceIds.length > 0) {
        conditions.push(`r.id IN (${resourceIds.map(() => '?').join(', ')})`)
        params.push(...resourceIds)
      }
      if (selectedLessons.length > 0) {
        conditions.push(`r.lesson_id IN (${selectedLessons.map(() => '?').join(', ')})`)
        params.push(...selectedLessons)
      }
      if (conditions.length === 0) return []
    }

    return db.prepare(`
      SELECT r.id, r.course_id, r.module_id, r.lesson_id, r.role, r.name,
             r.file_path, r.file_extension, r.resource_type, r.language, r.label,
             c.title AS course_title, m.title AS module_title, l.title AS lesson_title
      FROM content_resources r
      JOIN courses c ON c.id = r.course_id
      JOIN modules m ON m.id = r.module_id
      LEFT JOIN lessons l ON l.id = r.lesson_id
      WHERE ${conditions.join(' OR ')}
      ORDER BY r.course_id, r.module_id, r.lesson_id, r.id
    `).all(...params) as ResourceRow[]
  }

  private listNotes(db: Database.Database, scope: SemanticIndexScope, selectedLessonIds: Set<string>): NoteRow[] {
    const conditions: string[] = []
    const params: unknown[] = []
    if (scope.type === 'vault') {
      conditions.push('1 = 1')
    } else if (scope.type === 'course') {
      conditions.push('n.course_id = ?')
      params.push(scope.courseId)
    } else if (scope.type === 'lesson') {
      conditions.push('n.lesson_id = ?')
      params.push(scope.lessonId)
    } else {
      const noteIds = scope.noteIds ?? []
      if (noteIds.length === 0 && selectedLessonIds.size === 0) return []
      if (noteIds.length > 0) {
        conditions.push(`n.id IN (${noteIds.map(() => '?').join(', ')})`)
        params.push(...noteIds)
      }
      if (selectedLessonIds.size > 0) {
        const ids = [...selectedLessonIds]
        conditions.push(`n.lesson_id IN (${ids.map(() => '?').join(', ')})`)
        params.push(...ids)
      }
    }

    return db.prepare(`
      SELECT n.id, n.lesson_id, n.course_id, n.timestamp_seconds, n.content,
             n.updated_at, c.title AS course_title, m.id AS module_id,
             m.title AS module_title, l.title AS lesson_title
      FROM lesson_notes n
      JOIN courses c ON c.id = n.course_id
      JOIN lessons l ON l.id = n.lesson_id
      JOIN modules m ON m.id = l.module_id
      WHERE ${conditions.join(' OR ')}
      ORDER BY n.course_id, n.lesson_id, n.timestamp_seconds, n.id
    `).all(...params) as NoteRow[]
  }

  private fileSourceFromLesson(lesson: LessonRow): SemanticSourceDescriptor | null {
    const sourceKind = classifyFile(lesson.file_extension, lesson.media_type)
    if (!sourceKind) return null
    return {
      sourceKind,
      sourceId: `lesson-file:${lesson.id}`,
      courseId: lesson.course_id,
      moduleId: lesson.module_id,
      lessonId: lesson.id,
      dataType: dataTypeForSourceKind(sourceKind),
      filePath: lesson.file_path,
      fileName: lesson.file_name,
      fileExtension: lesson.file_extension,
      locator: { fileName: lesson.file_name, ...(sourceKind === 'code' ? { language: languageForExtension(lesson.file_extension) } : {}) }
    }
  }

  private fileSourceFromResource(resource: ResourceRow): SemanticSourceDescriptor | null {
    const sourceKind = classifyFile(resource.file_extension, resource.resource_type)
    if (!sourceKind) return null
    return {
      sourceKind,
      sourceId: `resource:${resource.id}`,
      courseId: resource.course_id,
      moduleId: resource.module_id,
      ...(resource.lesson_id ? { lessonId: resource.lesson_id } : {}),
      resourceId: resource.id,
      dataType: dataTypeForSourceKind(sourceKind),
      filePath: resource.file_path,
      fileName: resource.name,
      fileExtension: resource.file_extension,
      locator: {
        fileName: resource.name,
        ...(sourceKind === 'code' ? { language: languageForExtension(resource.file_extension) } : {})
      }
    }
  }

  private requireDatabase(): Database.Database {
    const db = this.databaseService.getDatabase()
    if (!db) throw new Error('Database is not connected to any vault.')
    return db
  }

  private readSourceFile(filePath: string): Buffer {
    try {
      const stat = fs.statSync(filePath)
      if (!stat.isFile()) throw new Error()
      return fs.readFileSync(filePath)
    } catch {
      throw new Error('Source unavailable')
    }
  }
}

function addMetadata(add: (source: SemanticSourceDescriptor) => void, context: LessonRow | ResourceRow): void {
  const courseId = context.course_id
  const courseTitle = context.course_title
  add({
    sourceKind: 'metadata',
    sourceId: `metadata:course:${courseId}`,
    courseId,
    dataType: 'course_name',
    sourceRevision: `metadata:course:${courseId}`,
    contentRevision: `metadata:course:${courseId}:${hashText(courseTitle)}`,
    text: `Course: ${courseTitle}`,
    locator: {}
  })

  const moduleId = context.module_id
  const moduleTitle = context.module_title
  add({
    sourceKind: 'metadata',
    sourceId: `metadata:module:${moduleId}`,
    courseId,
    moduleId,
    dataType: 'materials',
    sourceRevision: `metadata:module:${moduleId}`,
    contentRevision: `metadata:module:${moduleId}:${hashText(moduleTitle)}`,
    text: `Course: ${courseTitle}\nModule: ${moduleTitle}`,
    locator: {}
  })

  const lessonId = 'lesson_id' in context ? context.lesson_id : context.id
  if (lessonId) {
    const lessonTitle = context.lesson_title
    add({
      sourceKind: 'metadata',
      sourceId: `metadata:lesson:${lessonId}`,
      courseId,
      moduleId,
      lessonId,
      dataType: 'materials',
      sourceRevision: `metadata:lesson:${lessonId}`,
      contentRevision: `metadata:lesson:${lessonId}:${hashText(lessonTitle ?? '')}`,
      text: `Course: ${courseTitle}\nModule: ${moduleTitle}\nLesson: ${lessonTitle ?? ''}`,
      locator: {}
    })
  }
}

function lessonScopeWhere(scope: SemanticIndexScope): { where: string; params: string[] } {
  if (scope.type === 'vault') return { where: '1 = 1', params: [] }
  if (scope.type === 'lesson') return { where: 'l.id = ?', params: [scope.lessonId] }
  if (scope.type === 'course') return { where: 'l.course_id = ?', params: [scope.courseId] }
  const ids = scope.lessonIds ?? []
  if (ids.length === 0) return { where: '1 = 0', params: [] }
  return { where: `l.id IN (${ids.map(() => '?').join(', ')})`, params: ids }
}

function classifyFile(extension: string, type: string): SemanticSourceKind | null {
  const normalized = extension.toLowerCase().startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`
  if (normalized === '.pdf' || type === 'pdf') return 'pdf'
  if (normalized === '.md' || normalized === '.markdown') return 'markdown'
  if (normalized === '.txt' || normalized === '.text' || normalized === '.csv') return 'text'
  if (type === 'code' || CODE_EXTENSIONS.has(normalized)) return 'code'
  return null
}

function dataTypeForSourceKind(sourceKind: SemanticSourceKind): AiDataType {
  if (sourceKind === 'pdf') return 'pdf'
  if (sourceKind === 'transcript' || sourceKind === 'subtitle') return 'transcript'
  if (sourceKind === 'note') return 'notes'
  if (sourceKind === 'metadata') return 'course_name'
  return 'materials'
}

function languageForExtension(extension: string): string {
  const normalized = extension.toLowerCase().replace(/^\./, '')
  const languages: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescriptreact',
    js: 'javascript',
    jsx: 'javascriptreact',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    cs: 'csharp',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    yml: 'yaml',
    yaml: 'yaml',
    ps1: 'powershell'
  }
  return languages[normalized] ?? normalized
}

function hashBuffer(content: Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function hashText(text: string): string {
  return hashBuffer(Buffer.from(text, 'utf8'))
}

async function extractPdfText(content: Buffer, _fileName: string): Promise<PdfTextPage[]> {
  const mupdf = await import('mupdf')
  const document = mupdf.Document.openDocument(content, 'application/pdf')
  try {
    const pages: PdfTextPage[] = []
    for (let index = 0; index < document.countPages(); index += 1) {
      const page = document.loadPage(index)
      pages.push({ page: index + 1, text: page.toStructuredText().asText() })
    }
    return pages
  } finally {
    document.destroy()
  }
}

export const contentExtractorService = new ContentExtractorService()
