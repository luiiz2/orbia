import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import type {
  Course,
  Module,
  Lesson,
  LessonProgress,
  WatchHistoryEntry,
  CourseProgressSummary,
  VaultStats,
  LessonNote
} from '../../types'

export class DatabaseService {
  private db: Database.Database | null = null
  private currentVaultPath: string | null = null

  public connect(vaultPath: string): void {
    if (this.db && this.currentVaultPath === vaultPath) {
      return
    }

    this.close()

    const orbiaDir = path.join(vaultPath, '.orbia')
    if (!fs.existsSync(orbiaDir)) {
      fs.mkdirSync(orbiaDir, { recursive: true })
    }

    const dbPath = path.join(orbiaDir, 'library.db')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.currentVaultPath = vaultPath

    this.runMigrations()
  }

  public close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      this.currentVaultPath = null
    }
  }

  public isConnected(): boolean {
    return this.db !== null
  }

  public getCurrentVaultPath(): string | null {
    return this.currentVaultPath
  }

  private runMigrations(): void {
    if (!this.db) throw new Error('Database is not connected to any vault.')

    // 1. Create base tables
    this.db.exec(`
      -- Courses
      CREATE TABLE IF NOT EXISTS courses (
        id              TEXT PRIMARY KEY,
        title           TEXT NOT NULL,
        slug            TEXT NOT NULL,
        source_type     TEXT NOT NULL DEFAULT 'local-vault',
        root_path       TEXT NOT NULL,
        is_external     INTEGER NOT NULL DEFAULT 0,
        cover_path      TEXT,
        description     TEXT,
        total_duration  REAL NOT NULL DEFAULT 0,
        module_count    INTEGER NOT NULL DEFAULT 0,
        lesson_count    INTEGER NOT NULL DEFAULT 0,
        is_favorite     INTEGER NOT NULL DEFAULT 0,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        last_accessed_at INTEGER
      );

      -- Modules
      CREATE TABLE IF NOT EXISTS modules (
        id           TEXT PRIMARY KEY,
        course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        title        TEXT NOT NULL,
        order_index  INTEGER NOT NULL,
        folder_path  TEXT,
        duration     REAL NOT NULL DEFAULT 0,
        lesson_count INTEGER NOT NULL DEFAULT 0,
        created_at   INTEGER NOT NULL
      );

      -- Lessons
      CREATE TABLE IF NOT EXISTS lessons (
        id             TEXT PRIMARY KEY,
        module_id      TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
        course_id      TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        title          TEXT NOT NULL,
        order_index    INTEGER NOT NULL,
        file_path      TEXT NOT NULL,
        file_name      TEXT NOT NULL,
        file_extension TEXT NOT NULL,
        media_type     TEXT NOT NULL DEFAULT 'video',
        duration       REAL NOT NULL DEFAULT 0,
        file_size      INTEGER NOT NULL DEFAULT 0,
        availability   TEXT NOT NULL DEFAULT 'local',
        cover_path     TEXT,
        created_at     INTEGER NOT NULL
      );

      -- Lesson Progress
      CREATE TABLE IF NOT EXISTS lesson_progress (
        lesson_id    TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
        course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        current_time REAL NOT NULL DEFAULT 0,
        duration     REAL NOT NULL DEFAULT 0,
        completed    INTEGER NOT NULL DEFAULT 0,
        updated_at   INTEGER NOT NULL
      );

      -- Lesson Notes
      CREATE TABLE IF NOT EXISTS lesson_notes (
        id                TEXT PRIMARY KEY,
        lesson_id         TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        course_id         TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        timestamp_seconds REAL NOT NULL DEFAULT 0,
        content           TEXT NOT NULL,
        created_at        INTEGER NOT NULL,
        updated_at        INTEGER NOT NULL
      );

      -- Watch History
      CREATE TABLE IF NOT EXISTS watch_history (
        id           TEXT PRIMARY KEY,
        lesson_id    TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        lesson_title TEXT NOT NULL,
        course_title TEXT NOT NULL,
        cover_path   TEXT,
        watched_at   INTEGER NOT NULL,
        duration     REAL NOT NULL DEFAULT 0,
        current_time REAL NOT NULL DEFAULT 0
      );

      -- File Operation Journal
      CREATE TABLE IF NOT EXISTS file_operations (
        operation_id      TEXT PRIMARY KEY,
        group_id          TEXT NOT NULL,
        type              TEXT NOT NULL,
        source_path       TEXT NOT NULL,
        destination_path  TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        new_filename      TEXT NOT NULL,
        timestamp         INTEGER NOT NULL,
        status            TEXT NOT NULL,
        error_details     TEXT,
        is_reversible     INTEGER NOT NULL DEFAULT 1
      );
    `)

    // 2. Safe column migrations for existing tables
    const columnMigrations = [
      `ALTER TABLE courses ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;`,
      `ALTER TABLE lessons ADD COLUMN cover_path TEXT;`,
      `ALTER TABLE watch_history ADD COLUMN cover_path TEXT;`
    ]

    for (const sql of columnMigrations) {
      try {
        this.db.exec(sql)
      } catch {
        // Ignored if column already exists
      }
    }

    // 3. Safe index creations
    const indexMigrations = [
      `CREATE INDEX IF NOT EXISTS idx_courses_slug ON courses(slug);`,
      `CREATE INDEX IF NOT EXISTS idx_courses_accessed ON courses(last_accessed_at);`,
      `CREATE INDEX IF NOT EXISTS idx_courses_accessed_created ON courses(last_accessed_at DESC, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_courses_favorite ON courses(is_favorite);`,
      `CREATE INDEX IF NOT EXISTS idx_modules_course ON modules(course_id);`,
      `CREATE INDEX IF NOT EXISTS idx_modules_order ON modules(course_id, order_index);`,
      `CREATE INDEX IF NOT EXISTS idx_lessons_module ON lessons(module_id);`,
      `CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id);`,
      `CREATE INDEX IF NOT EXISTS idx_lessons_order ON lessons(module_id, order_index);`,
      `CREATE INDEX IF NOT EXISTS idx_lessons_course_module_order ON lessons(course_id, module_id, order_index);`,
      `CREATE INDEX IF NOT EXISTS idx_progress_course ON lesson_progress(course_id);`,
      `CREATE INDEX IF NOT EXISTS idx_progress_course_completed ON lesson_progress(course_id, completed);`,
      `CREATE INDEX IF NOT EXISTS idx_progress_course_updated ON lesson_progress(course_id, updated_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_notes_lesson ON lesson_notes(lesson_id);`,
      `CREATE INDEX IF NOT EXISTS idx_notes_course ON lesson_notes(course_id);`,
      `CREATE INDEX IF NOT EXISTS idx_notes_course_time ON lesson_notes(course_id, timestamp_seconds);`,
      `CREATE INDEX IF NOT EXISTS idx_notes_lesson_time ON lesson_notes(lesson_id, timestamp_seconds, created_at);`,
      `CREATE INDEX IF NOT EXISTS idx_notes_course_created ON lesson_notes(course_id, created_at);`,
      `CREATE INDEX IF NOT EXISTS idx_history_lesson ON watch_history(lesson_id);`,
      `CREATE INDEX IF NOT EXISTS idx_history_course ON watch_history(course_id);`,
      `CREATE INDEX IF NOT EXISTS idx_history_date ON watch_history(watched_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_history_course_watched ON watch_history(course_id, watched_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_journal_group ON file_operations(group_id);`,
      `CREATE INDEX IF NOT EXISTS idx_journal_time ON file_operations(timestamp DESC);`
    ]

    for (const sql of indexMigrations) {
      try {
        this.db.exec(sql)
      } catch {
        // Ignored if index already exists
      }
    }
  }

  // --- Course Operations ---

  public saveCourseWithHierarchy(
    course: Course,
    modules: (Module & { lessons: Lesson[] })[]
  ): void {
    this.ensureConnected()

    const insertCourse = this.db!.prepare(`
      INSERT INTO courses (
        id, title, slug, source_type, root_path, is_external,
        cover_path, description, total_duration, module_count,
        lesson_count, is_favorite, created_at, updated_at, last_accessed_at
      ) VALUES (
        @id, @title, @slug, @sourceType, @rootPath, @isExternal,
        @coverPath, @description, @totalDuration, @moduleCount,
        @lessonCount, @isFavorite, @createdAt, @updatedAt, @lastAccessedAt
      )
    `)

    const insertModule = this.db!.prepare(`
      INSERT INTO modules (
        id, course_id, title, order_index, folder_path,
        duration, lesson_count, created_at
      ) VALUES (
        @id, @courseId, @title, @orderIndex, @folderPath,
        @duration, @lessonCount, @createdAt
      )
    `)

    const insertLesson = this.db!.prepare(`
      INSERT INTO lessons (
        id, module_id, course_id, title, order_index,
        file_path, file_name, file_extension, media_type,
        duration, file_size, availability, cover_path, created_at
      ) VALUES (
        @id, @moduleId, @courseId, @title, @orderIndex,
        @filePath, @fileName, @fileExtension, @mediaType,
        @duration, @fileSize, @availability, @coverPath, @createdAt
      )
    `)

    const transaction = this.db!.transaction(() => {
      insertCourse.run({
        id: course.id,
        title: course.title,
        slug: course.slug,
        sourceType: course.sourceType,
        rootPath: course.rootPath,
        isExternal: course.sourceType === 'local-ref' ? 1 : 0,
        coverPath: course.coverPath || null,
        description: course.description || null,
        totalDuration: course.totalDuration,
        moduleCount: course.moduleCount,
        lessonCount: course.lessonCount,
        isFavorite: course.isFavorite ? 1 : 0,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
        lastAccessedAt: course.lastAccessedAt || null
      })

      for (const mod of modules) {
        insertModule.run({
          id: mod.id,
          courseId: course.id,
          title: mod.title,
          orderIndex: mod.orderIndex,
          folderPath: mod.folderPath || null,
          duration: mod.duration,
          lessonCount: mod.lessons.length,
          createdAt: mod.createdAt
        })

        for (const lesson of mod.lessons) {
          insertLesson.run({
            id: lesson.id,
            moduleId: mod.id,
            courseId: course.id,
            title: lesson.title,
            orderIndex: lesson.orderIndex,
            filePath: lesson.filePath,
            fileName: lesson.fileName,
            fileExtension: lesson.fileExtension,
            mediaType: lesson.mediaType,
            duration: lesson.duration,
            fileSize: lesson.fileSize,
            availability: lesson.availability || 'local',
            coverPath: lesson.coverPath || null,
            createdAt: lesson.createdAt
          })
        }
      }
    })

    transaction()
  }

  public getAllCourses(): Course[] {
    if (!this.db) return []
    const stmt = this.db.prepare(`
      SELECT
        id, title, slug, source_type as sourceType, root_path as rootPath,
        cover_path as coverPath, description, total_duration as totalDuration,
        module_count as moduleCount, lesson_count as lessonCount,
        is_favorite as isFavorite,
        created_at as createdAt, updated_at as updatedAt, last_accessed_at as lastAccessedAt
      FROM courses
      ORDER BY last_accessed_at DESC NULLS LAST, created_at DESC
    `)
    const rows = stmt.all() as (Omit<Course, 'isFavorite'> & { isFavorite: number })[]
    return rows.map((r) => ({
      ...r,
      coverPath: r.coverPath || undefined,
      isFavorite: Boolean(r.isFavorite)
    }))
  }

  public getCourseById(
    courseId: string
  ): { course: Course; modules: (Module & { lessons: Lesson[] })[] } | null {
    this.ensureConnected()

    const courseStmt = this.db!.prepare(`
      SELECT
        id, title, slug, source_type as sourceType, root_path as rootPath,
        cover_path as coverPath, description, total_duration as totalDuration,
        module_count as moduleCount, lesson_count as lessonCount,
        is_favorite as isFavorite,
        created_at as createdAt, updated_at as updatedAt, last_accessed_at as lastAccessedAt
      FROM courses
      WHERE id = ?
    `)
    const course = courseStmt.get(courseId) as (Omit<Course, 'isFavorite'> & { isFavorite: number }) | undefined
    if (!course) return null

    const modulesStmt = this.db!.prepare(`
      SELECT
        id, course_id as courseId, title, order_index as orderIndex,
        folder_path as folderPath, duration, lesson_count as lessonCount,
        created_at as createdAt
      FROM modules
      WHERE course_id = ?
      ORDER BY order_index ASC
    `)
    const modules = modulesStmt.all(courseId) as Module[]

    const lessonsStmt = this.db!.prepare(`
      SELECT
        id, module_id as moduleId, course_id as courseId, title,
        order_index as orderIndex, file_path as filePath, file_name as fileName,
        file_extension as fileExtension, media_type as mediaType,
        duration, file_size as fileSize, availability, cover_path as coverPath,
        created_at as createdAt
      FROM lessons
      WHERE course_id = ?
      ORDER BY module_id, order_index ASC
    `)
    const allLessons = lessonsStmt.all(courseId) as Lesson[]

    // O(L) single-pass bucket grouping by moduleId instead of O(M * L) nested array filtering
    const lessonsByModule = new Map<string, Lesson[]>()
    for (const lesson of allLessons) {
      const formattedLesson: Lesson = {
        ...lesson,
        coverPath: lesson.coverPath || undefined
      }
      const existing = lessonsByModule.get(lesson.moduleId)
      if (existing) {
        existing.push(formattedLesson)
      } else {
        lessonsByModule.set(lesson.moduleId, [formattedLesson])
      }
    }

    const modulesWithLessons = modules.map((mod) => ({
      ...mod,
      lessons: lessonsByModule.get(mod.id) || []
    }))

    return {
      course: {
        ...course,
        coverPath: course.coverPath || undefined,
        isFavorite: Boolean(course.isFavorite)
      },
      modules: modulesWithLessons
    }
  }

  public toggleCourseFavorite(courseId: string): boolean {
    this.ensureConnected()
    const getStmt = this.db!.prepare(`SELECT is_favorite FROM courses WHERE id = ?`)
    const row = getStmt.get(courseId) as { is_favorite: number } | undefined
    if (!row) {
      throw new Error(`Course with id "${courseId}" not found.`)
    }
    const newStatus = row.is_favorite ? 0 : 1
    const now = Date.now()
    const updateStmt = this.db!.prepare(`
      UPDATE courses
      SET is_favorite = ?, updated_at = ?
      WHERE id = ?
    `)
    updateStmt.run(newStatus, now, courseId)
    return Boolean(newStatus)
  }

  public updateCourseCover(courseId: string, coverPath: string): void {
    this.ensureConnected()
    const now = Date.now()
    const stmt = this.db!.prepare(`UPDATE courses SET cover_path = ?, updated_at = ? WHERE id = ?`)
    stmt.run(coverPath, now, courseId)
  }

  public updateLessonCover(lessonId: string, coverPath: string): void {
    this.ensureConnected()
    const stmt = this.db!.prepare(`UPDATE lessons SET cover_path = ? WHERE id = ?`)
    stmt.run(coverPath, lessonId)
  }

  public deleteCourse(courseId: string): void {
    this.ensureConnected()
    const stmt = this.db!.prepare(`DELETE FROM courses WHERE id = ?`)
    stmt.run(courseId)
  }

  public updateCourseLastAccessed(courseId: string): void {
    this.ensureConnected()
    const now = Date.now()
    const stmt = this.db!.prepare(`UPDATE courses SET last_accessed_at = ? WHERE id = ?`)
    stmt.run(now, courseId)
  }

  // --- Progress Operations ---

  public saveLessonProgress(progress: {
    lessonId: string
    courseId: string
    currentTime: number
    duration: number
    completed: boolean
  }): void {
    this.ensureConnected()
    const now = Date.now()

    const stmt = this.db!.prepare(`
      INSERT INTO lesson_progress (lesson_id, course_id, current_time, duration, completed, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(lesson_id) DO UPDATE SET
        current_time = excluded.current_time,
        duration = excluded.duration,
        completed = CASE WHEN excluded.completed = 1 THEN 1 ELSE lesson_progress.completed END,
        updated_at = excluded.updated_at
    `)

    stmt.run(
      progress.lessonId,
      progress.courseId,
      progress.currentTime,
      progress.duration,
      progress.completed ? 1 : 0,
      now
    )

    this.updateCourseLastAccessed(progress.courseId)
  }

  public getLessonProgress(lessonId: string): LessonProgress | null {
    this.ensureConnected()
    const stmt = this.db!.prepare(`
      SELECT
        lesson_id as lessonId, course_id as courseId,
        lesson_progress.current_time as currentTime, duration,
        completed, updated_at as updatedAt
      FROM lesson_progress
      WHERE lesson_id = ?
    `)
    const row = stmt.get(lessonId) as (Omit<LessonProgress, 'completed'> & { completed: number }) | undefined
    if (!row) return null
    return {
      ...row,
      completed: Boolean(row.completed)
    }
  }

  public toggleLessonCompletion(lessonId: string, courseId: string): boolean {
    this.ensureConnected()
    const current = this.getLessonProgress(lessonId)
    const newStatus = current ? !current.completed : true
    const now = Date.now()

    const stmt = this.db!.prepare(`
      INSERT INTO lesson_progress (lesson_id, course_id, current_time, duration, completed, updated_at)
      VALUES (?, ?, 0, 0, ?, ?)
      ON CONFLICT(lesson_id) DO UPDATE SET
        completed = ?,
        updated_at = ?
    `)

    const completedInt = newStatus ? 1 : 0
    stmt.run(lessonId, courseId, completedInt, now, completedInt, now)
    return newStatus
  }

  public getCourseProgressSummary(courseId: string): CourseProgressSummary | null {
    this.ensureConnected()

    const stmt = this.db!.prepare(`
      WITH
        LessonStats AS (
          SELECT
            course_id,
            COUNT(*) AS total_lessons,
            COALESCE(SUM(duration), 0) AS total_duration
          FROM lessons
          WHERE course_id = ?
          GROUP BY course_id
        ),
        ProgressStats AS (
          SELECT
            course_id,
            SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS completed_lessons
          FROM lesson_progress
          WHERE course_id = ?
          GROUP BY course_id
        ),
        LastPlayedRanked AS (
          SELECT
            lp.course_id,
            lp.lesson_id,
            l.title AS lesson_title,
            lp.updated_at,
            ROW_NUMBER() OVER (ORDER BY lp.updated_at DESC, lp.rowid DESC) AS rn
          FROM lesson_progress lp
          JOIN lessons l ON l.id = lp.lesson_id
          WHERE lp.course_id = ?
        )
      SELECT
        ls.course_id AS courseId,
        ls.total_lessons AS totalLessons,
        COALESCE(ps.completed_lessons, 0) AS completedLessons,
        ls.total_duration AS totalDuration,
        lp.lesson_id AS lastPlayedLessonId,
        lp.lesson_title AS lastPlayedLessonTitle,
        lp.updated_at AS lastPlayedAt
      FROM LessonStats ls
      LEFT JOIN ProgressStats ps ON ps.course_id = ls.course_id
      LEFT JOIN LastPlayedRanked lp ON lp.course_id = ls.course_id AND lp.rn = 1
      WHERE ls.total_lessons > 0
    `)

    interface ProgressSummaryRow {
      courseId: string
      totalLessons: number
      completedLessons: number
      totalDuration: number
      lastPlayedLessonId: string | null
      lastPlayedLessonTitle: string | null
      lastPlayedAt: number | null
    }

    const row = stmt.get(courseId, courseId, courseId) as ProgressSummaryRow | undefined
    if (!row || row.totalLessons === 0) return null

    const percentage = Math.round((row.completedLessons / row.totalLessons) * 100)

    return {
      courseId: row.courseId,
      totalLessons: row.totalLessons,
      completedLessons: row.completedLessons,
      percentage,
      lastPlayedLessonId: row.lastPlayedLessonId || undefined,
      lastPlayedLessonTitle: row.lastPlayedLessonTitle || undefined,
      lastPlayedAt: row.lastPlayedAt || undefined,
      totalDuration: row.totalDuration,
      remainingDuration: Math.max(0, row.totalDuration * (1 - percentage / 100))
    }
  }

  public getAllProgressSummaries(): Record<string, CourseProgressSummary> {
    if (!this.db) return {}

    const stmt = this.db.prepare(`
      WITH
        LessonStats AS (
          SELECT
            course_id,
            COUNT(*) AS total_lessons,
            COALESCE(SUM(duration), 0) AS total_duration
          FROM lessons
          GROUP BY course_id
        ),
        ProgressStats AS (
          SELECT
            course_id,
            SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS completed_lessons
          FROM lesson_progress
          GROUP BY course_id
        ),
        LastPlayedRanked AS (
          SELECT
            lp.course_id,
            lp.lesson_id,
            l.title AS lesson_title,
            lp.updated_at,
            ROW_NUMBER() OVER (PARTITION BY lp.course_id ORDER BY lp.updated_at DESC, lp.rowid DESC) AS rn
          FROM lesson_progress lp
          JOIN lessons l ON l.id = lp.lesson_id
        )
      SELECT
        ls.course_id AS courseId,
        ls.total_lessons AS totalLessons,
        COALESCE(ps.completed_lessons, 0) AS completedLessons,
        ls.total_duration AS totalDuration,
        lp.lesson_id AS lastPlayedLessonId,
        lp.lesson_title AS lastPlayedLessonTitle,
        lp.updated_at AS lastPlayedAt
      FROM LessonStats ls
      LEFT JOIN ProgressStats ps ON ps.course_id = ls.course_id
      LEFT JOIN LastPlayedRanked lp ON lp.course_id = ls.course_id AND lp.rn = 1
      WHERE ls.total_lessons > 0
    `)

    interface ProgressSummaryRow {
      courseId: string
      totalLessons: number
      completedLessons: number
      totalDuration: number
      lastPlayedLessonId: string | null
      lastPlayedLessonTitle: string | null
      lastPlayedAt: number | null
    }

    const rows = stmt.all() as ProgressSummaryRow[]
    const summaries: Record<string, CourseProgressSummary> = {}

    for (const row of rows) {
      const percentage = Math.round((row.completedLessons / row.totalLessons) * 100)
      summaries[row.courseId] = {
        courseId: row.courseId,
        totalLessons: row.totalLessons,
        completedLessons: row.completedLessons,
        percentage,
        lastPlayedLessonId: row.lastPlayedLessonId || undefined,
        lastPlayedLessonTitle: row.lastPlayedLessonTitle || undefined,
        lastPlayedAt: row.lastPlayedAt || undefined,
        totalDuration: row.totalDuration,
        remainingDuration: Math.max(0, row.totalDuration * (1 - percentage / 100))
      }
    }

    return summaries
  }

  // --- Watch History Operations ---

  public addWatchHistory(entry: {
    lessonId: string
    courseId: string
    lessonTitle: string
    courseTitle: string
    coverPath?: string
    duration: number
    currentTime: number
  }): void {
    this.ensureConnected()
    const now = Date.now()
    const id = `hist-${now}-${Math.random().toString(36).substring(2, 7)}`

    const stmt = this.db!.prepare(`
      INSERT INTO watch_history (id, lesson_id, course_id, lesson_title, course_title, cover_path, watched_at, duration, current_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      entry.lessonId,
      entry.courseId,
      entry.lessonTitle,
      entry.courseTitle,
      entry.coverPath || null,
      now,
      entry.duration,
      entry.currentTime
    )
  }

  public getWatchHistory(limit = 50): WatchHistoryEntry[] {
    if (!this.db) return []
    const stmt = this.db.prepare(`
      SELECT
        id, lesson_id as lessonId, course_id as courseId,
        lesson_title as lessonTitle, course_title as courseTitle,
        cover_path as coverPath, watched_at as watchedAt,
        duration, watch_history.current_time as currentTime
      FROM watch_history
      ORDER BY watched_at DESC
      LIMIT ?
    `)
    return stmt.all(limit) as WatchHistoryEntry[]
  }

  // --- Lesson Notes Operations ---

  public getLessonNotes(lessonId: string): LessonNote[] {
    this.ensureConnected()
    const stmt = this.db!.prepare(`
      SELECT
        id,
        lesson_id as lessonId,
        course_id as courseId,
        timestamp_seconds as timestampSeconds,
        content,
        created_at as createdAt,
        updated_at as updatedAt
      FROM lesson_notes
      WHERE lesson_id = ?
      ORDER BY timestamp_seconds ASC, created_at ASC
    `)
    return stmt.all(lessonId) as LessonNote[]
  }

  public addLessonNote(note: Omit<LessonNote, 'id' | 'createdAt' | 'updatedAt'>): LessonNote {
    this.ensureConnected()
    const now = Date.now()
    const id = crypto.randomUUID()
    const stmt = this.db!.prepare(`
      INSERT INTO lesson_notes (
        id, lesson_id, course_id, timestamp_seconds, content, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(id, note.lessonId, note.courseId, note.timestampSeconds, note.content, now, now)
    return {
      id,
      lessonId: note.lessonId,
      courseId: note.courseId,
      timestampSeconds: note.timestampSeconds,
      content: note.content,
      createdAt: now,
      updatedAt: now
    }
  }

  public updateLessonNote(id: string, content: string): void {
    this.ensureConnected()
    const now = Date.now()
    const stmt = this.db!.prepare(`
      UPDATE lesson_notes
      SET content = ?, updated_at = ?
      WHERE id = ?
    `)
    stmt.run(content, now, id)
  }

  public deleteLessonNote(id: string): void {
    this.ensureConnected()
    const stmt = this.db!.prepare(`DELETE FROM lesson_notes WHERE id = ?`)
    stmt.run(id)
  }

  public getCourseNotes(courseId: string): LessonNote[] {
    this.ensureConnected()
    const stmt = this.db!.prepare(`
      SELECT
        id,
        lesson_id as lessonId,
        course_id as courseId,
        timestamp_seconds as timestampSeconds,
        content,
        created_at as createdAt,
        updated_at as updatedAt
      FROM lesson_notes
      WHERE course_id = ?
      ORDER BY created_at ASC
    `)
    return stmt.all(courseId) as LessonNote[]
  }

  // --- Vault Aggregated Stats ---

  public getVaultStats(): VaultStats {
    if (!this.db) {
      return {
        courseCount: 0,
        moduleCount: 0,
        lessonCount: 0,
        totalDuration: 0,
        completedLessons: 0,
        totalWatchedTime: 0
      }
    }

    const stmt = this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM courses) AS courseCount,
        (SELECT COUNT(*) FROM modules) AS moduleCount,
        (SELECT COUNT(*) FROM lessons) AS lessonCount,
        (SELECT COALESCE(SUM(duration), 0) FROM lessons) AS totalDuration,
        (SELECT COUNT(*) FROM lesson_progress WHERE completed = 1) AS completedLessons,
        (SELECT COALESCE(SUM(lesson_progress.current_time), 0) FROM lesson_progress) AS totalWatchedTime
    `)

    const row = stmt.get() as VaultStats | undefined
    if (!row) {
      return {
        courseCount: 0,
        moduleCount: 0,
        lessonCount: 0,
        totalDuration: 0,
        completedLessons: 0,
        totalWatchedTime: 0
      }
    }

    return {
      courseCount: row.courseCount || 0,
      moduleCount: row.moduleCount || 0,
      lessonCount: row.lessonCount || 0,
      totalDuration: row.totalDuration || 0,
      completedLessons: row.completedLessons || 0,
      totalWatchedTime: row.totalWatchedTime || 0
    }
  }

  private ensureConnected(): void {
    if (!this.db) {
      throw new Error('Database is not connected to an active Vault.')
    }
  }
}

export const databaseService = new DatabaseService()
