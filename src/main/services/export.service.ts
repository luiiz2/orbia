import { databaseService, type DatabaseService } from './database.service'
import { formatTime } from '../utils/time-format'

export class ExportService {
  private readonly db: DatabaseService

  public constructor(db: DatabaseService = databaseService) {
    this.db = db
  }

  /**
   * Exports study notes to clean Markdown format grouped by course and lesson.
   */
  public exportNotesMarkdown(courseId?: string): string {
    const rawDb = this.db.getDatabase()
    if (!rawDb) throw new Error('Database is not connected.')

    let query = `
      SELECT n.content, n.timestamp_seconds as timestampSeconds, n.created_at as createdAt,
             c.title as courseTitle, l.title as lessonTitle
      FROM lesson_notes n
      JOIN courses c ON n.course_id = c.id
      JOIN lessons l ON n.lesson_id = l.id
    `
    const params: unknown[] = []
    if (courseId) {
      query += ` WHERE n.course_id = ?`
      params.push(courseId)
    }
    query += ` ORDER BY c.title ASC, l.order_index ASC, n.timestamp_seconds ASC`

    const rows = rawDb.prepare(query).all(...params) as Array<{
      content: string
      timestampSeconds: number
      createdAt: number
      courseTitle: string
      lessonTitle: string
    }>

    let md = `# Anotações de Estudo — Orbia\n\n`
    if (rows.length === 0) {
      md += `*Nenhuma anotação registrada.*\n`
      return md
    }

    let currentCourse = ''
    let currentLesson = ''

    for (const r of rows) {
      if (r.courseTitle !== currentCourse) {
        currentCourse = r.courseTitle
        currentLesson = ''
        md += `\n## 📚 ${currentCourse}\n\n`
      }
      if (r.lessonTitle !== currentLesson) {
        currentLesson = r.lessonTitle
        md += `### 🎬 ${currentLesson}\n\n`
      }

      const timeStr = formatTime(r.timestampSeconds)
      md += `- **${timeStr}** — ${r.content}\n`
    }

    return md
  }

  /**
   * Exports video bookmarks to clean Markdown format grouped by course and lesson.
   */
  public exportBookmarksMarkdown(courseId?: string): string {
    const rawDb = this.db.getDatabase()
    if (!rawDb) throw new Error('Database is not connected.')

    let query = `
      SELECT b.title, b.timestamp, b.created_at as createdAt,
             c.title as courseTitle, l.title as lessonTitle
      FROM video_bookmarks b
      JOIN courses c ON b.course_id = c.id
      JOIN lessons l ON b.lesson_id = l.id
    `
    const params: unknown[] = []
    if (courseId) {
      query += ` WHERE b.course_id = ?`
      params.push(courseId)
    }
    query += ` ORDER BY c.title ASC, l.order_index ASC, b.timestamp ASC`

    const rows = rawDb.prepare(query).all(...params) as Array<{
      title: string
      timestamp: number
      createdAt: number
      courseTitle: string
      lessonTitle: string
    }>

    let md = `# Marcadores de Estudo (Bookmarks) — Orbia\n\n`
    if (rows.length === 0) {
      md += `*Nenhum marcador registrado.*\n`
      return md
    }

    let currentCourse = ''
    let currentLesson = ''

    for (const r of rows) {
      if (r.courseTitle !== currentCourse) {
        currentCourse = r.courseTitle
        currentLesson = ''
        md += `\n## 📚 ${currentCourse}\n\n`
      }
      if (r.lessonTitle !== currentLesson) {
        currentLesson = r.lessonTitle
        md += `### 🎬 ${currentLesson}\n\n`
      }

      const timeStr = formatTime(r.timestamp)
      md += `- 🔖 **${timeStr}** — ${r.title}\n`
    }

    return md
  }

  /**
   * Exports flashcards to RFC 4180 CSV format compatible with Anki import.
   */
  public exportFlashcardsCsv(courseId?: string): string {
    const rawDb = this.db.getDatabase()
    if (!rawDb) throw new Error('Database is not connected.')

    let query = `
      SELECT f.question, f.answer, f.timestamp,
             c.title as courseTitle, l.title as lessonTitle
      FROM flashcards f
      LEFT JOIN courses c ON f.course_id = c.id
      LEFT JOIN lessons l ON f.lesson_id = l.id
    `
    const params: unknown[] = []
    if (courseId) {
      query += ` WHERE f.course_id = ?`
      params.push(courseId)
    }
    query += ` ORDER BY f.created_at ASC`

    const rows = rawDb.prepare(query).all(...params) as Array<{
      question: string
      answer: string
      timestamp: number | null
      courseTitle: string | null
      lessonTitle: string | null
    }>

    const escapeCsv = (str: string | null | undefined): string => {
      if (!str) return '""'
      const escaped = str.replace(/"/g, '""')
      return `"${escaped}"`
    }

    const lines: string[] = [
      '"Question","Answer","Course","Lesson","Timestamp"'
    ]

    for (const r of rows) {
      const timeStr = r.timestamp !== null ? formatTime(r.timestamp) : ''
      lines.push(
        [
          escapeCsv(r.question),
          escapeCsv(r.answer),
          escapeCsv(r.courseTitle),
          escapeCsv(r.lessonTitle),
          escapeCsv(timeStr)
        ].join(',')
      )
    }

    return lines.join('\n')
  }

  /**
   * Exports flashcards to Markdown format.
   */
  public exportFlashcardsMarkdown(courseId?: string): string {
    const rawDb = this.db.getDatabase()
    if (!rawDb) throw new Error('Database is not connected.')

    let query = `
      SELECT f.question, f.answer, f.timestamp, f.state, f.success_count as successCount,
             c.title as courseTitle, l.title as lessonTitle
      FROM flashcards f
      LEFT JOIN courses c ON f.course_id = c.id
      LEFT JOIN lessons l ON f.lesson_id = l.id
    `
    const params: unknown[] = []
    if (courseId) {
      query += ` WHERE f.course_id = ?`
      params.push(courseId)
    }
    query += ` ORDER BY f.created_at ASC`

    const rows = rawDb.prepare(query).all(...params) as Array<{
      question: string
      answer: string
      timestamp: number | null
      state: string
      successCount: number
      courseTitle: string | null
      lessonTitle: string | null
    }>

    let md = `# Flashcards de Estudo — Orbia\n\n`
    if (rows.length === 0) {
      md += `*Nenhum flashcard cadastrado.*\n`
      return md
    }

    rows.forEach((r, idx) => {
      md += `### ${idx + 1}. ${r.question}\n\n`
      md += `> **Resposta**: ${r.answer}\n\n`

      const metaParts: string[] = []
      if (r.courseTitle) metaParts.push(`Curso: ${r.courseTitle}`)
      if (r.lessonTitle) metaParts.push(`Aula: ${r.lessonTitle}`)
      if (r.timestamp !== null)
        metaParts.push(`Timestamp: ${formatTime(r.timestamp)}`)
      metaParts.push(`Estado: ${r.state} (${r.successCount} acertos)`)

      md += `*${metaParts.join(' · ')}*\n\n---\n\n`
    })

    return md
  }
}

export const exportService = new ExportService()
