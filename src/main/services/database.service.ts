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
  LessonNote,
  MergeCoursesResult,
  MergePreview,
  MergePreviewModule,
  MergeDuplicateCandidate,
  ImportHistoryEntry,
  FileOperationRecord,
  AttachedResource,
  ContentResource,
  SubtitleTrack
} from '../../types'
import { naturalCompare } from '../utils/natural-sort'
import { logger } from './logger.service'

interface MergePreviewTargetModule {
  courseId: string
  moduleId: string
  lessons: Lesson[]
}

interface PendingFileOperation {
  operationId: string
  type: string
  sourcePath: string
  destinationPath: string
}

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
    this.recoverPendingFileOperations(vaultPath)
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

  /**
   * Returns the exact local files the active library owns or references for
   * playback and display. This is intentionally read-only so the media
   * protocol can authorize renderer requests without trusting renderer paths.
   */
  public getRegisteredMediaPaths(): string[] {
    if (!this.db) return []

    const stmt = this.db.prepare(`
      SELECT cover_path AS filePath
      FROM courses
      WHERE cover_path IS NOT NULL AND cover_path <> ''
      UNION
      SELECT file_path AS filePath
      FROM lessons
      WHERE file_path <> ''
      UNION
      SELECT cover_path AS filePath
      FROM lessons
      WHERE cover_path IS NOT NULL AND cover_path <> ''
      UNION
      SELECT file_path AS filePath
      FROM content_resources
      WHERE file_path <> ''
    `)
    const rows = stmt.all() as Array<{ filePath: string }>
    return rows.map((row) => row.filePath)
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

      -- Course content material. Module resources have no lesson_id; lesson
      -- resources and subtitle tracks use the same canonical storage.
      CREATE TABLE IF NOT EXISTS content_resources (
        id              TEXT PRIMARY KEY,
        course_id       TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        module_id       TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
        lesson_id       TEXT REFERENCES lessons(id) ON DELETE CASCADE,
        role            TEXT NOT NULL CHECK(role IN ('resource', 'subtitle')),
        name            TEXT NOT NULL,
        file_path       TEXT NOT NULL,
        file_extension  TEXT NOT NULL,
        file_size       INTEGER NOT NULL DEFAULT 0,
        resource_type   TEXT NOT NULL,
        language        TEXT,
        label           TEXT,
        created_at      INTEGER NOT NULL,
        CHECK(role <> 'subtitle' OR lesson_id IS NOT NULL)
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

      -- Import History
      CREATE TABLE IF NOT EXISTS import_history (
        id              TEXT PRIMARY KEY,
        file_name       TEXT NOT NULL,
        file_path       TEXT NOT NULL,
        file_size       INTEGER NOT NULL DEFAULT 0,
        status          TEXT NOT NULL DEFAULT 'completed',
        course_id       TEXT,
        course_title    TEXT,
        extracted_files INTEGER NOT NULL DEFAULT 0,
        created_at      INTEGER NOT NULL,
        error_details   TEXT
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
      `CREATE INDEX IF NOT EXISTS idx_content_resources_course ON content_resources(course_id);`,
      `CREATE INDEX IF NOT EXISTS idx_content_resources_module ON content_resources(module_id);`,
      `CREATE INDEX IF NOT EXISTS idx_content_resources_lesson ON content_resources(lesson_id);`,
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
      `CREATE INDEX IF NOT EXISTS idx_journal_time ON file_operations(timestamp DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_import_history_time ON import_history(created_at DESC);`
    ]

    for (const sql of indexMigrations) {
      try {
        this.db.exec(sql)
      } catch {
        // Ignored if index already exists
      }
    }

    // 4. Versioned migrations (PRAGMA user_version) — wrapped in transactions
    // NOTE: `current_time` is a reserved SQLite keyword (UTC time constant).
    // Bare `current_time` in SELECTs resolves to the keyword, NOT the column —
    // column references MUST be table-qualified (e.g. lesson_progress.current_time).
    const userVersion = this.db.pragma('user_version', { simple: true }) as number

    if (userVersion < 1) {
      // v0 schema is compatible with v1 — no data migrations required.
      // (A previous attempt used `typeof(current_time) = 'text'` to detect
      // legacy TEXT progress; bare `current_time` resolves to the SQLite
      // keyword constant, making the predicate always-true and rewriting
      // every row with the migration-run timestamp. Reverted — schema has
      // always stored current_time as REAL seconds.)
      this.db.pragma('user_version = 1')
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

    const insertContentResource = this.db!.prepare(`
      INSERT INTO content_resources (
        id, course_id, module_id, lesson_id, role, name, file_path,
        file_extension, file_size, resource_type, language, label, created_at
      ) VALUES (
        @id, @courseId, @moduleId, @lessonId, @role, @name, @filePath,
        @fileExtension, @fileSize, @type, @language, @label, @createdAt
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

        for (const resource of moduleResourcesForPersistence(mod, course.id)) {
          insertContentResource.run(toContentResourceRow(resource))
        }

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

          for (const resource of lessonResourcesForPersistence(lesson, course.id, mod.id)) {
            insertContentResource.run(toContentResourceRow(resource))
          }
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

    const resourcesStmt = this.db!.prepare(`
      SELECT
        id, course_id as courseId, module_id as moduleId, lesson_id as lessonId,
        role, name, file_path as filePath, file_extension as fileExtension,
        file_size as fileSize, resource_type as type, language, label,
        created_at as createdAt
      FROM content_resources
      WHERE course_id = ?
      ORDER BY module_id ASC, lesson_id ASC, created_at ASC, id ASC
    `)
    const allResources = (resourcesStmt.all(courseId) as ContentResourceRow[]).map(contentResourceFromRow)
    const resourcesByModule = new Map<string, ContentResource[]>()
    const resourcesByLesson = new Map<string, ContentResource[]>()
    for (const resource of allResources) {
      if (resource.lessonId) {
        const lessonResources = resourcesByLesson.get(resource.lessonId)
        if (lessonResources) lessonResources.push(resource)
        else resourcesByLesson.set(resource.lessonId, [resource])
      } else {
        const moduleResources = resourcesByModule.get(resource.moduleId)
        if (moduleResources) moduleResources.push(resource)
        else resourcesByModule.set(resource.moduleId, [resource])
      }
    }

    // O(L) single-pass bucket grouping by moduleId instead of O(M * L) nested array filtering
    const lessonsByModule = new Map<string, Lesson[]>()
    for (const lesson of allLessons) {
      const contentResources = resourcesByLesson.get(lesson.id) || []
      const attachedResources = contentResources
        .map(toAttachedResource)
        .filter((resource): resource is AttachedResource => resource !== undefined)
      const subtitles = contentResources
        .map(toSubtitleTrack)
        .filter((subtitle): subtitle is SubtitleTrack => subtitle !== undefined)
      const formattedLesson: Lesson = {
        ...lesson,
        coverPath: lesson.coverPath || undefined,
        ...(contentResources.length > 0 ? { contentResources } : {}),
        ...(attachedResources.length > 0 ? { resources: attachedResources } : {}),
        ...(subtitles.length > 0 ? { subtitles } : {})
      }
      const existing = lessonsByModule.get(lesson.moduleId)
      if (existing) {
        existing.push(formattedLesson)
      } else {
        lessonsByModule.set(lesson.moduleId, [formattedLesson])
      }
    }

    const modulesWithLessons = modules.map((mod) => {
      const resources = resourcesByModule.get(mod.id) || []
      return {
        ...mod,
        ...(resources.length > 0 ? { resources } : {}),
        lessons: lessonsByModule.get(mod.id) || []
      }
    })

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

  /** Persists a probed lesson duration (lazy probe on first playback). */
  public updateLessonDuration(lessonId: string, duration: number): void {
    this.ensureConnected()
    const value = Number.isFinite(duration) && duration > 0 ? duration : 0
    if (!value) return
    this.db!.prepare(`UPDATE lessons SET duration = ? WHERE id = ? AND duration <= 0`).run(value, lessonId)
  }

  /** Records a file operation journal entry (used by delete/undo workflows). */
  public recordFileOperation(entry: FileOperationRecord): void {
    this.ensureConnected()
    this.db!.prepare(`
      INSERT INTO file_operations (
        operation_id, group_id, type, source_path, destination_path,
        original_filename, new_filename, timestamp, status, error_details, is_reversible
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.operationId,
      entry.groupId,
      entry.type,
      entry.sourcePath,
      entry.destinationPath,
      entry.originalFileName,
      entry.newFileName,
      entry.timestamp,
      entry.status,
      entry.errorDetails ?? null,
      entry.isReversible ? 1 : 0
    )
  }

  /** Updates the lifecycle state of a previously journaled filesystem operation. */
  public updateFileOperationStatus(
    operationId: string,
    status: 'pending' | 'completed' | 'failed' | 'rolled_back',
    errorDetails: string | null = null
  ): void {
    this.ensureConnected()
    this.db!
      .prepare(`UPDATE file_operations SET status = ?, error_details = ? WHERE operation_id = ?`)
      .run(status, errorDetails, operationId)
  }

  /**
   * Reconciles mutations that were journaled before a process crash. Only
   * managed course moves are reversible without guessing; every other pending
   * operation is kept intact on disk and marked for manual review.
   */
  private recoverPendingFileOperations(vaultPath: string): void {
    this.ensureConnected()
    const coursesRoot = path.join(vaultPath, 'Courses')
    const pendingOperations = this.db!
      .prepare(`
        SELECT
          operation_id AS operationId,
          type,
          source_path AS sourcePath,
          destination_path AS destinationPath
        FROM file_operations
        WHERE status = 'pending'
      `)
      .all() as PendingFileOperation[]

    for (const operation of pendingOperations) {
      try {
        this.recoverPendingFileOperation(operation, coursesRoot)
      } catch (error) {
        const details = `Recovery could not safely reconcile this interrupted operation: ${errorMessage(error)}`
        this.updateFileOperationStatus(operation.operationId, 'failed', details)
        logger.warn(details, { operationId: operation.operationId })
      }
    }
  }

  private recoverPendingFileOperation(operation: PendingFileOperation, coursesRoot: string): void {
    if (operation.type !== 'move' || !isStrictPathWithin(coursesRoot, operation.destinationPath)) {
      this.updateFileOperationStatus(
        operation.operationId,
        'failed',
        'Recovery requires manual review; no filesystem changes were made.'
      )
      return
    }

    const sourceState = getPathState(operation.sourcePath)
    const destinationState = getPathState(operation.destinationPath)

    if (sourceState === 'inaccessible' || destinationState === 'inaccessible') {
      this.updateFileOperationStatus(
        operation.operationId,
        'failed',
        'Recovery requires manual review; a path could not be inspected safely.'
      )
      return
    }

    if (sourceState === 'present' && destinationState === 'missing') {
      this.updateFileOperationStatus(
        operation.operationId,
        'rolled_back',
        'Recovered after restart: the managed move was not applied.'
      )
      return
    }

    if (sourceState === 'missing' && destinationState === 'present') {
      const persistedCourse = this.db!
        .prepare(`SELECT 1 FROM courses WHERE root_path = ? LIMIT 1`)
        .get(operation.destinationPath)
      if (persistedCourse) {
        this.updateFileOperationStatus(
          operation.operationId,
          'completed',
          'Recovered after restart: course persistence was confirmed.'
        )
        return
      }

      const sourceParent = path.dirname(operation.sourcePath)
      if (!isRealDirectory(operation.destinationPath) || !isRealDirectory(sourceParent)) {
        this.updateFileOperationStatus(
          operation.operationId,
          'failed',
          'Recovery requires manual review; the move cannot be safely reversed.'
        )
        return
      }

      fs.renameSync(operation.destinationPath, operation.sourcePath)
      this.updateFileOperationStatus(
        operation.operationId,
        'rolled_back',
        'Recovered after restart: reverted the move because no course was persisted.'
      )
      return
    }

    this.updateFileOperationStatus(
      operation.operationId,
      'failed',
      'Recovery requires manual review; the source and destination state is ambiguous.'
    )
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

  /** All progress rows for a course (bulk hydration for course views). */
  public getLessonProgressByCourse(courseId: string): LessonProgress[] {
    this.ensureConnected()
    const stmt = this.db!.prepare(`
      SELECT
        lesson_id as lessonId, course_id as courseId,
        lesson_progress.current_time as currentTime, duration,
        completed, updated_at as updatedAt
      FROM lesson_progress
      WHERE course_id = ?
    `)
    const rows = stmt.all(courseId) as (Omit<LessonProgress, 'completed'> & { completed: number })[]
    return rows.map((row) => ({ ...row, completed: Boolean(row.completed) }))
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
        wh.id, wh.lesson_id as lessonId, wh.course_id as courseId,
        wh.lesson_title as lessonTitle, wh.course_title as courseTitle,
        wh.cover_path as coverPath, l.cover_path as lessonCoverPath,
        l.file_extension as fileExtension, wh.watched_at as watchedAt,
        wh.duration, wh.current_time as currentTime
      FROM watch_history wh
      LEFT JOIN lessons l ON l.id = wh.lesson_id
      ORDER BY wh.watched_at DESC
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

  // --- Course Merging & Deduplication ---

  /**
   * Calculates a user-reviewable merge proposal from persisted data. This
   * method performs SELECT-only reads and deliberately does not call either
   * mutable merge routine or create a database transaction.
   */
  public getMergePreview(courseIds: string[]): MergePreview {
    this.ensureConnected()

    const ids = [
      ...new Set(
        (Array.isArray(courseIds) ? courseIds : [])
          .map((courseId) => (typeof courseId === 'string' ? courseId.trim() : ''))
          .filter(Boolean)
      )
    ]
    if (ids.length < 2) {
      throw new Error('Select at least two courses to preview a merge.')
    }

    const selected = ids.map((courseId) => this.getCourseById(courseId))
    if (selected.some((course) => course === null)) {
      throw new Error('One or more selected courses no longer exist.')
    }

    const courses = selected as Array<NonNullable<(typeof selected)[number]>>
    const [canonical, ...secondaries] = [...courses].sort(
      (a, b) =>
        b.course.lessonCount - a.course.lessonCount ||
        a.course.createdAt - b.course.createdAt
    )

    const targetModules = new Map<string, MergePreviewTargetModule>()
    for (const module of canonical.modules) {
      const key = this.mergePreviewModuleKey(module)
      if (!targetModules.has(key)) {
        targetModules.set(key, {
          courseId: canonical.course.id,
          moduleId: module.id,
          lessons: [...module.lessons]
        })
      }
    }

    const modules: MergePreviewModule[] = []
    const duplicateCandidates: MergeDuplicateCandidate[] = []
    for (const secondary of secondaries) {
      for (const sourceModule of secondary.modules) {
        const key = this.mergePreviewModuleKey(sourceModule)
        const targetModule = targetModules.get(key)
        const materialCount = this.countMergePreviewMaterials(sourceModule)

        if (!targetModule) {
          modules.push({
            sourceCourseId: secondary.course.id,
            sourceModuleId: sourceModule.id,
            title: sourceModule.title,
            action: 'create',
            lessonCount: sourceModule.lessons.length,
            materialCount
          })
          targetModules.set(key, {
            courseId: canonical.course.id,
            moduleId: sourceModule.id,
            lessons: [...sourceModule.lessons]
          })
          continue
        }

        modules.push({
          sourceCourseId: secondary.course.id,
          sourceModuleId: sourceModule.id,
          title: sourceModule.title,
          action: 'merge',
          targetModuleId: targetModule.moduleId,
          lessonCount: sourceModule.lessons.length,
          materialCount
        })

        for (const sourceLesson of sourceModule.lessons) {
          let matchingLesson: Lesson | undefined
          let reason: MergeDuplicateCandidate['reason'] | undefined
          for (const targetLesson of targetModule.lessons) {
            const candidateReason = this.getMergePreviewDuplicateReason(sourceLesson, targetLesson)
            if (candidateReason) {
              matchingLesson = targetLesson
              reason = candidateReason
              break
            }
          }

          if (matchingLesson && reason) {
            duplicateCandidates.push({
              sourceCourseId: secondary.course.id,
              sourceModuleId: sourceModule.id,
              sourceLessonId: sourceLesson.id,
              targetCourseId: targetModule.courseId,
              targetModuleId: targetModule.moduleId,
              targetLessonId: matchingLesson.id,
              reason
            })
          }

          // This is an in-memory projection only. Candidates remain present so
          // later source modules can be previewed without an implicit exclusion.
          targetModule.lessons.push(sourceLesson)
        }
      }
    }

    return {
      canonicalCourseId: canonical.course.id,
      canonicalCourseTitle: canonical.course.title,
      selectedCourseIds: ids,
      totalLessons: courses.reduce(
        (total, course) => total + course.modules.reduce((sum, module) => sum + module.lessons.length, 0),
        0
      ),
      totalMaterials: courses.reduce(
        (total, course) =>
          total + course.modules.reduce((sum, module) => sum + this.countMergePreviewMaterials(module), 0),
        0
      ),
      modules,
      duplicateCandidates
    }
  }

  private mergePreviewModuleKey(module: Module): string {
    const normalized = this.normalizeMergePreviewValue(module.title)
    return normalized || `module:${module.id}`
  }

  private countMergePreviewMaterials(module: Module & { lessons: Lesson[] }): number {
    return (
      (module.resources?.length || 0) +
      module.lessons.reduce(
        (count, lesson) => count + (lesson.contentResources?.length ?? lesson.resources?.length ?? 0),
        0
      )
    )
  }

  private getMergePreviewDuplicateReason(
    source: Lesson,
    target: Lesson
  ): MergeDuplicateCandidate['reason'] | undefined {
    const sourceTitle = this.normalizeMergePreviewValue(source.title)
    const targetTitle = this.normalizeMergePreviewValue(target.title)
    if (sourceTitle && sourceTitle === targetTitle) return 'same-title'

    const sourceFileName = path.basename(source.fileName, path.extname(source.fileName)).toLowerCase()
    const targetFileName = path.basename(target.fileName, path.extname(target.fileName)).toLowerCase()
    if (sourceFileName && sourceFileName === targetFileName) return 'same-file-name'

    if (source.filePath && source.filePath === target.filePath) return 'same-file-path'
    return undefined
  }

  private normalizeMergePreviewValue(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  public mergeDuplicateCourses(): MergeCoursesResult {
    this.ensureConnected()

    const allCourses = this.getAllCourses()
    if (allCourses.length <= 1) {
      return {
        success: true,
        mergedGroupsCount: 0,
        removedCoursesCount: 0,
        deduplicatedLessonsCount: 0,
        details: []
      }
    }

    const normalize = (str: string): string => {
      return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }

    // Group courses by normalized title
    const groups = new Map<string, Course[]>()
    for (const c of allCourses) {
      const key = normalize(c.title) || c.title.toLowerCase().trim()
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(c)
    }

    let mergedGroupsCount = 0
    let removedCoursesCount = 0
    let deduplicatedLessonsCount = 0
    const details: MergeCoursesResult['details'] = []

    const mergeTransaction = this.db!.transaction(() => {
      for (const [, courseList] of groups.entries()) {
        if (courseList.length <= 1) continue

        // Pick canonical course (prefer one with highest lessonCount, or oldest created_at)
        courseList.sort((a, b) => b.lessonCount - a.lessonCount || a.createdAt - b.createdAt)
        const canonical = courseList[0]
        const secondaries = courseList.slice(1)

        let groupRemovedLessons = 0

        // Get canonical hierarchy
        const canonicalHierarchy = this.getCourseById(canonical.id)
        if (!canonicalHierarchy) continue

        for (const secondary of secondaries) {
          const secondaryHierarchy = this.getCourseById(secondary.id)
          if (!secondaryHierarchy) continue

          for (const secMod of secondaryHierarchy.modules) {
            const secModNorm = normalize(secMod.title)

            // Check if canonical course has a module with matching normalized title
            const matchingCanMod = canonicalHierarchy.modules.find(
              (cm) => normalize(cm.title) === secModNorm
            )

            if (matchingCanMod) {
              // Merge lessons into matching canonical module
              for (const secLesson of secMod.lessons) {
                const secLessonNorm = normalize(secLesson.title)
                const secFileBase = path.basename(secLesson.fileName, path.extname(secLesson.fileName)).toLowerCase()

                const matchingCanLesson = matchingCanMod.lessons.find((cl) => {
                  const clNorm = normalize(cl.title)
                  const clFileBase = path.basename(cl.fileName, path.extname(cl.fileName)).toLowerCase()
                  return clNorm === secLessonNorm || clFileBase === secFileBase || cl.filePath === secLesson.filePath
                })

                if (matchingCanLesson) {
                  // Duplicate lesson: migrate progress / notes / history, then delete secondary lesson.
                  // Progress merges by taking the furthest position (never drops it on PK conflict).
                  this.db!.prepare(`
                    INSERT INTO lesson_progress (lesson_id, course_id, current_time, duration, completed, updated_at)
                    SELECT ?, ?, lesson_progress.current_time, duration, completed, updated_at
                    FROM lesson_progress WHERE lesson_id = ?
                    ON CONFLICT(lesson_id) DO UPDATE SET
                      current_time = MAX(lesson_progress.current_time, excluded.current_time),
                      duration = MAX(lesson_progress.duration, excluded.duration),
                      completed = MAX(lesson_progress.completed, excluded.completed),
                      updated_at = excluded.updated_at
                  `).run(matchingCanLesson.id, canonical.id, secLesson.id)

                  this.db!.prepare(`
                    UPDATE OR IGNORE lesson_notes SET lesson_id = ?, course_id = ? WHERE lesson_id = ?
                  `).run(matchingCanLesson.id, canonical.id, secLesson.id)

                  this.db!.prepare(`
                    UPDATE OR IGNORE watch_history SET lesson_id = ?, course_id = ? WHERE lesson_id = ?
                  `).run(matchingCanLesson.id, canonical.id, secLesson.id)

                  this.db!.prepare(`DELETE FROM lessons WHERE id = ?`).run(secLesson.id)
                  groupRemovedLessons++
                  deduplicatedLessonsCount++
                } else {
                  // New lesson: reassign to canonical module & canonical course
                  this.db!.prepare(`
                    UPDATE lessons SET course_id = ?, module_id = ? WHERE id = ?
                  `).run(canonical.id, matchingCanMod.id, secLesson.id)

                  this.db!.prepare(`
                    UPDATE lesson_progress SET course_id = ? WHERE lesson_id = ?
                  `).run(canonical.id, secLesson.id)

                  this.db!.prepare(`
                    UPDATE lesson_notes SET course_id = ? WHERE lesson_id = ?
                  `).run(canonical.id, secLesson.id)

                  this.db!.prepare(`
                    UPDATE watch_history SET course_id = ? WHERE lesson_id = ?
                  `).run(canonical.id, secLesson.id)

                  matchingCanMod.lessons.push({
                    ...secLesson,
                    moduleId: matchingCanMod.id,
                    courseId: canonical.id
                  })
                }
              }

              // Delete empty secondary module
              this.db!.prepare(`DELETE FROM modules WHERE id = ?`).run(secMod.id)
            } else {
              // Module does not exist in canonical course: transfer entire module
              this.db!.prepare(`
                UPDATE modules SET course_id = ? WHERE id = ?
              `).run(canonical.id, secMod.id)

              this.db!.prepare(`
                UPDATE lessons SET course_id = ? WHERE module_id = ?
              `).run(canonical.id, secMod.id)

              this.db!.prepare(`
                UPDATE lesson_progress SET course_id = ? WHERE course_id = ?
              `).run(canonical.id, secondary.id)

              this.db!.prepare(`
                UPDATE lesson_notes SET course_id = ? WHERE course_id = ?
              `).run(canonical.id, secondary.id)

              this.db!.prepare(`
                UPDATE watch_history SET course_id = ? WHERE course_id = ?
              `).run(canonical.id, secondary.id)

              canonicalHierarchy.modules.push({
                ...secMod,
                courseId: canonical.id
              })
            }
          }

          // Delete secondary course
          this.db!.prepare(`DELETE FROM courses WHERE id = ?`).run(secondary.id)
          removedCoursesCount++
        }

        // Re-index all modules and lessons of canonical course naturally
        const reindexed = this.reindexCourseHierarchy(canonical.id)

        mergedGroupsCount++
        details.push({
          title: canonical.title,
          canonicalCourseId: canonical.id,
          mergedCoursesCount: courseList.length,
          totalModules: reindexed.moduleCount,
          totalLessons: reindexed.lessonCount,
          removedDuplicateLessons: groupRemovedLessons
        })
      }
    })

    mergeTransaction()

    return {
      success: true,
      mergedGroupsCount,
      removedCoursesCount,
      deduplicatedLessonsCount,
      details
    }
  }

  /**
   * Re-indexes all modules and lessons of a course naturally (order_index,
   * lesson_count, duration, totals). Shared by duplicate merge and manual merge.
   */
  private reindexCourseHierarchy(courseId: string): {
    moduleCount: number
    lessonCount: number
    totalDuration: number
  } {
    const hierarchy = this.getCourseById(courseId)
    if (!hierarchy) return { moduleCount: 0, lessonCount: 0, totalDuration: 0 }

    const sortedModules = [...hierarchy.modules].sort((a, b) =>
      naturalCompare(a.title, b.title) || (a.orderIndex - b.orderIndex)
    )

    let totalCourseLessons = 0
    let totalCourseDuration = 0

    for (let mIdx = 0; mIdx < sortedModules.length; mIdx++) {
      const mod = sortedModules[mIdx]
      // Preserve original per-module lesson order (stable); titles only as tiebreak.
      const sortedLessons = [...mod.lessons].sort((a, b) =>
        (a.orderIndex - b.orderIndex) || naturalCompare(a.title, b.title)
      )

      let modDuration = 0
      for (let lIdx = 0; lIdx < sortedLessons.length; lIdx++) {
        const les = sortedLessons[lIdx]
        modDuration += les.duration || 0
        this.db!.prepare(`
          UPDATE lessons SET order_index = ? WHERE id = ?
        `).run(lIdx + 1, les.id)
      }

      totalCourseLessons += sortedLessons.length
      totalCourseDuration += modDuration

      this.db!.prepare(`
        UPDATE modules SET order_index = ?, lesson_count = ?, duration = ? WHERE id = ?
      `).run(mIdx + 1, sortedLessons.length, modDuration, mod.id)
    }

    this.db!.prepare(`
      UPDATE courses SET module_count = ?, lesson_count = ?, total_duration = ?, updated_at = ? WHERE id = ?
    `).run(
      sortedModules.length,
      totalCourseLessons,
      totalCourseDuration,
      Date.now(),
      courseId
    )

    return {
      moduleCount: sortedModules.length,
      lessonCount: totalCourseLessons,
      totalDuration: totalCourseDuration
    }
  }

  /**
   * Merges a user-selected list of courses into a single course.
   * All modules/lessons of secondary courses are transferred as-is (no lesson
   * deduplication — the user explicitly chose to combine separate parts).
   * Progress, notes, and watch history are re-pointed to the canonical course.
   */
  public mergeCoursesByIds(courseIds: string[], targetTitle?: string): MergeCoursesResult {
    this.ensureConnected()

    const ids = [...new Set((courseIds || []).map((id) => id.trim()).filter(Boolean))]
    if (ids.length < 2) {
      throw new Error('Select at least two courses to merge.')
    }

    const courses = ids
      .map((id) => this.getCourseById(id))
      .filter((c): c is NonNullable<typeof c> => c !== null)
    if (courses.length < 2) {
      throw new Error('One or more selected courses no longer exist.')
    }

    // Canonical: highest lesson count (keeps the richest course's cover/metadata)
    courses.sort(
      (a, b) => b.course.lessonCount - a.course.lessonCount || a.course.createdAt - b.course.createdAt
    )
    const canonical = courses[0]
    const secondaries = courses.slice(1)

    const mergeTransaction = this.db!.transaction(() => {
      for (const secondary of secondaries) {
        for (const mod of secondary.modules) {
          this.db!.prepare(`
            UPDATE modules SET course_id = ? WHERE id = ?
          `).run(canonical.course.id, mod.id)

          this.db!.prepare(`
            UPDATE lessons SET course_id = ? WHERE module_id = ?
          `).run(canonical.course.id, mod.id)
        }

        this.db!.prepare(`
          UPDATE lesson_progress SET course_id = ? WHERE course_id = ?
        `).run(canonical.course.id, secondary.course.id)

        this.db!.prepare(`
          UPDATE lesson_notes SET course_id = ? WHERE course_id = ?
        `).run(canonical.course.id, secondary.course.id)

        this.db!.prepare(`
          UPDATE watch_history SET course_id = ? WHERE course_id = ?
        `).run(canonical.course.id, secondary.course.id)

        this.db!.prepare(`DELETE FROM courses WHERE id = ?`).run(secondary.course.id)
      }

      if (targetTitle && targetTitle.trim()) {
        this.db!.prepare(`
          UPDATE courses SET title = ? WHERE id = ?
        `).run(targetTitle.trim(), canonical.course.id)
      }

      // Re-index within the transaction so a failure rolls back everything.
      this.reindexCourseHierarchy(canonical.course.id)
    })

    mergeTransaction()

    const canonicalCourse = this.getCourseById(canonical.course.id)
    const reindexed = {
      moduleCount: canonicalCourse?.modules.length ?? 0,
      lessonCount:
        canonicalCourse?.modules.reduce((acc, m) => acc + (m.lessons?.length || 0), 0) ?? 0,
      totalDuration: canonicalCourse?.course.totalDuration ?? 0
    }

    return {
      success: true,
      mergedGroupsCount: 1,
      removedCoursesCount: secondaries.length,
      deduplicatedLessonsCount: 0,
      details: [
        {
          title: (targetTitle && targetTitle.trim()) || canonical.course.title,
          canonicalCourseId: canonical.course.id,
          mergedCoursesCount: courses.length,
          totalModules: reindexed.moduleCount,
          totalLessons: reindexed.lessonCount,
          removedDuplicateLessons: 0
        }
      ]
    }
  }

  // --- Import History ---

  public recordImportHistory(entry: Omit<ImportHistoryEntry, 'id' | 'createdAt'>): ImportHistoryEntry {
    this.ensureConnected()
    const id = crypto.randomUUID()
    const createdAt = Date.now()

    const stmt = this.db!.prepare(`
      INSERT INTO import_history (
        id, file_name, file_path, file_size, status,
        course_id, course_title, extracted_files, created_at, error_details
      ) VALUES (
        @id, @fileName, @filePath, @fileSize, @status,
        @courseId, @courseTitle, @extractedFiles, @createdAt, @errorDetails
      )
    `)

    stmt.run({
      id,
      fileName: entry.fileName,
      filePath: entry.filePath,
      fileSize: entry.fileSize,
      status: entry.status || 'completed',
      courseId: entry.courseId || null,
      courseTitle: entry.courseTitle || null,
      extractedFiles: entry.extractedFiles || 0,
      createdAt,
      errorDetails: entry.errorDetails || null
    })

    return {
      id,
      fileName: entry.fileName,
      filePath: entry.filePath,
      fileSize: entry.fileSize,
      status: entry.status,
      courseId: entry.courseId,
      courseTitle: entry.courseTitle,
      extractedFiles: entry.extractedFiles,
      createdAt,
      errorDetails: entry.errorDetails
    }
  }

  public getImportHistory(limit = 100): ImportHistoryEntry[] {
    this.ensureConnected()
    const stmt = this.db!.prepare(`
      SELECT
        id,
        file_name as fileName,
        file_path as filePath,
        file_size as fileSize,
        status,
        course_id as courseId,
        course_title as courseTitle,
        extracted_files as extractedFiles,
        created_at as createdAt,
        error_details as errorDetails
      FROM import_history
      ORDER BY created_at DESC
      LIMIT ?
    `)
    return stmt.all(limit) as ImportHistoryEntry[]
  }

  public clearImportHistory(): boolean {
    this.ensureConnected()
    this.db!.prepare(`DELETE FROM import_history`).run()
    return true
  }

  private ensureConnected(): void {
    if (!this.db) {
      throw new Error('Database is not connected to an active Vault.')
    }
  }
}

type ContentResourceRow = {
  id: string
  courseId: string
  moduleId: string
  lessonId: string | null
  role: string
  name: string
  filePath: string
  fileExtension: string
  fileSize: number
  type: string
  language: string | null
  label: string | null
  createdAt: number
}

function moduleResourcesForPersistence(module: Module, courseId: string): ContentResource[] {
  return (module.resources || []).map((resource) => withResourceOwnership(resource, courseId, module.id))
}

function isStrictPathWithin(parentPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(candidatePath))
  return (
    relativePath.length > 0 &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  )
}

function isRealDirectory(entryPath: string): boolean {
  try {
    const entry = fs.lstatSync(entryPath)
    return entry.isDirectory() && !entry.isSymbolicLink()
  } catch {
    return false
  }
}

function getPathState(entryPath: string): 'missing' | 'present' | 'inaccessible' {
  try {
    fs.lstatSync(entryPath)
    return 'present'
  } catch (error) {
    return isMissingPathError(error) ? 'missing' : 'inaccessible'
  }
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function lessonResourcesForPersistence(lesson: Lesson, courseId: string, moduleId: string): ContentResource[] {
  if (lesson.contentResources !== undefined) {
    return lesson.contentResources.map((resource) =>
      withResourceOwnership(resource, courseId, moduleId, lesson.id)
    )
  }

  return [
    ...(lesson.resources || []).map((resource) => legacyAttachedResource(resource, courseId, moduleId, lesson)),
    ...(lesson.subtitles || []).map((subtitle) => legacySubtitleResource(subtitle, courseId, moduleId, lesson))
  ]
}

function withResourceOwnership(
  resource: ContentResource,
  courseId: string,
  moduleId: string,
  lessonId?: string
): ContentResource {
  const ownedResource: ContentResource = {
    id: resource.id,
    courseId,
    moduleId,
    role: resource.role,
    name: resource.name,
    filePath: resource.filePath,
    fileExtension: resource.fileExtension,
    fileSize: resource.fileSize,
    type: resource.type,
    language: resource.language,
    label: resource.label,
    createdAt: resource.createdAt
  }
  if (lessonId) ownedResource.lessonId = lessonId
  return ownedResource
}

function legacyAttachedResource(
  resource: AttachedResource,
  courseId: string,
  moduleId: string,
  lesson: Lesson
): ContentResource {
  return {
    id: resource.id,
    courseId,
    moduleId,
    lessonId: lesson.id,
    role: 'resource',
    name: resource.name,
    filePath: resource.filePath,
    fileExtension: resource.fileExtension,
    fileSize: resource.fileSize,
    type: resource.type,
    createdAt: lesson.createdAt
  }
}

function legacySubtitleResource(
  subtitle: SubtitleTrack,
  courseId: string,
  moduleId: string,
  lesson: Lesson
): ContentResource {
  return {
    id: subtitle.id,
    courseId,
    moduleId,
    lessonId: lesson.id,
    role: 'subtitle',
    name: subtitle.label,
    filePath: subtitle.filePath,
    fileExtension: subtitle.format,
    fileSize: 0,
    type: 'document',
    language: subtitle.language,
    label: subtitle.label,
    createdAt: lesson.createdAt
  }
}

function toContentResourceRow(resource: ContentResource): Record<string, string | number | null> {
  return {
    id: resource.id,
    courseId: resource.courseId,
    moduleId: resource.moduleId,
    lessonId: resource.lessonId ?? null,
    role: resource.role,
    name: resource.name,
    filePath: resource.filePath,
    fileExtension: resource.fileExtension,
    fileSize: resource.fileSize,
    type: resource.type,
    language: resource.language ?? null,
    label: resource.label ?? null,
    createdAt: resource.createdAt
  }
}

function contentResourceFromRow(row: ContentResourceRow): ContentResource {
  const resource: ContentResource = {
    id: row.id,
    courseId: row.courseId,
    moduleId: row.moduleId,
    role: row.role as ContentResource['role'],
    name: row.name,
    filePath: row.filePath,
    fileExtension: row.fileExtension,
    fileSize: row.fileSize,
    type: row.type as ContentResource['type'],
    createdAt: row.createdAt
  }
  if (row.lessonId) resource.lessonId = row.lessonId
  if (row.language) resource.language = row.language
  if (row.label) resource.label = row.label
  return resource
}

function toAttachedResource(resource: ContentResource): AttachedResource | undefined {
  if (resource.role !== 'resource' || !resource.lessonId || !isAttachedResourceType(resource.type)) {
    return undefined
  }
  return {
    id: resource.id,
    lessonId: resource.lessonId,
    name: resource.name,
    filePath: resource.filePath,
    fileExtension: resource.fileExtension,
    fileSize: resource.fileSize,
    type: resource.type
  }
}

function toSubtitleTrack(resource: ContentResource): SubtitleTrack | undefined {
  if (resource.role !== 'subtitle' || !resource.lessonId) return undefined
  const format = resource.fileExtension.replace(/^\./, '').toLowerCase()
  if (format !== 'srt' && format !== 'vtt') return undefined
  return {
    id: resource.id,
    lessonId: resource.lessonId,
    language: resource.language || 'und',
    label: resource.label || resource.name,
    filePath: resource.filePath,
    format
  }
}

function isAttachedResourceType(
  type: ContentResource['type']
): type is AttachedResource['type'] {
  return type === 'pdf' || type === 'code' || type === 'archive' || type === 'document'
}

export const databaseService = new DatabaseService()
