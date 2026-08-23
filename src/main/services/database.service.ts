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
import { cleanTitle, normalizeModuleKey } from '../utils/title-cleaner'
import { isMediaFile, getMediaType } from '../utils/file-utils'
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
    try {
      this.separateMistakenlyMergedCourses()
      this.cleanupDuplicateModules()
      this.cleanupNonMediaLessons()
      void this.healMissingDurations()
    } catch (err) {
      logger.warn('[Database] connect auto-cleanup error:', err)
    }
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

    // 4. Migrations tracking table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `)

    const migrationId = '002_v0.2_metadata_and_favorites'
    const hasApplied002 = this.db.prepare(`SELECT 1 FROM _migrations WHERE id = ?`).get(migrationId)

    if (!hasApplied002) {
      const coursesCountRow = this.db.prepare(`SELECT count(*) as cnt FROM courses`).get() as { cnt: number } | undefined
      const isNewDb = (coursesCountRow?.cnt ?? 0) === 0

      if (!isNewDb) {
        const dbPath = this.db.name
        try {
          fs.copyFileSync(dbPath, dbPath + '.bak')
          logger.info(`Database backed up to ${dbPath}.bak`)
        } catch (err) {
          logger.error(`Failed to back up database: ${err}`)
        }
      }

      this.db.transaction(() => {
        const alters = [
          `ALTER TABLE courses ADD COLUMN custom_title TEXT DEFAULT NULL;`,
          `ALTER TABLE modules ADD COLUMN custom_title TEXT DEFAULT NULL;`,
          `ALTER TABLE modules ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;`,
          `ALTER TABLE lessons ADD COLUMN custom_title TEXT DEFAULT NULL;`,
          `ALTER TABLE lessons ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;`,
          `ALTER TABLE lessons ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;`
        ]
        for (const sql of alters) {
          try {
            this.db!.exec(sql)
          } catch {
            // Ignored if column already exists
          }
        }

        try {
          this.db!.exec(`UPDATE modules SET display_order = order_index WHERE display_order = 0;`)
          this.db!.exec(`UPDATE lessons SET display_order = order_index WHERE display_order = 0;`)
          this.db!.exec(`CREATE INDEX IF NOT EXISTS idx_lessons_favorite ON lessons(is_favorite);`)
          this.db!.exec(`CREATE INDEX IF NOT EXISTS idx_modules_display_order ON modules(course_id, display_order);`)
          this.db!.exec(`CREATE INDEX IF NOT EXISTS idx_lessons_display_order ON lessons(module_id, display_order);`)
        } catch {
          // Ignored
        }

        this.db!.prepare(`INSERT INTO _migrations (id, applied_at) VALUES (?, ?)`).run(migrationId, Date.now())
      })()
    }

    const userVersion = this.db.pragma('user_version', { simple: true }) as number

    if (userVersion < 1) {
      this.db.pragma('user_version = 1')
    }
  }

  // --- Course Operations ---

  public saveCourseWithHierarchy(
    course: Course,
    modules: (Module & { lessons: Lesson[] })[]
  ): void {
    this.ensureConnected()

    const consolidatedModules = consolidateModulesForPersistence(modules)

    // Separate media lessons from non-media files (which become module resources)
    const cleanedModules = consolidatedModules.map((mod) => {
      const mediaLessons: Lesson[] = []
      const extraResources: ContentResource[] = []

      for (const les of mod.lessons) {
        const testPath = les.filePath || les.fileName
        if (isMediaFile(testPath)) {
          mediaLessons.push(les)
        } else {
          const ext = (les.fileExtension || path.extname(testPath)).replace(/^\./, '').toLowerCase()
          const resourceType = toResourceType(testPath)
          extraResources.push({
            id: les.id || crypto.randomUUID(),
            courseId: course.id,
            moduleId: mod.id,
            role: 'resource',
            name: les.fileName || les.title,
            filePath: les.filePath,
            fileExtension: ext,
            fileSize: les.fileSize || 0,
            type: resourceType,
            createdAt: les.createdAt || Date.now()
          })
        }
      }

      const allResources = [...(mod.resources || []), ...extraResources]
      const modDuration = mediaLessons.reduce((sum, l) => sum + (l.duration || 0), 0)

      return {
        ...mod,
        lessons: mediaLessons,
        resources: allResources.length > 0 ? allResources : undefined,
        duration: modDuration,
        lessonCount: mediaLessons.length
      }
    })

    const totalCourseLessons = cleanedModules.reduce((sum, mod) => sum + mod.lessons.length, 0)
    const totalCourseDuration = cleanedModules.reduce((sum, mod) => sum + mod.duration, 0)

    const insertCourse = this.db!.prepare(`
      INSERT INTO courses (
        id, title, custom_title, slug, source_type, root_path, is_external,
        cover_path, description, total_duration, module_count,
        lesson_count, is_favorite, created_at, updated_at, last_accessed_at
      ) VALUES (
        @id, @title, @customTitle, @slug, @sourceType, @rootPath, @isExternal,
        @coverPath, @description, @totalDuration, @moduleCount,
        @lessonCount, @isFavorite, @createdAt, @updatedAt, @lastAccessedAt
      )
    `)

    const insertModule = this.db!.prepare(`
      INSERT INTO modules (
        id, course_id, title, custom_title, order_index, display_order, folder_path,
        duration, lesson_count, created_at
      ) VALUES (
        @id, @courseId, @title, @customTitle, @orderIndex, @displayOrder, @folderPath,
        @duration, @lessonCount, @createdAt
      )
    `)

    const insertLesson = this.db!.prepare(`
      INSERT INTO lessons (
        id, module_id, course_id, title, custom_title, order_index, display_order, is_favorite,
        file_path, file_name, file_extension, media_type,
        duration, file_size, availability, cover_path, created_at
      ) VALUES (
        @id, @moduleId, @courseId, @title, @customTitle, @orderIndex, @displayOrder, @isFavorite,
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
        customTitle: course.customTitle || null,
        slug: course.slug,
        sourceType: course.sourceType,
        rootPath: course.rootPath,
        isExternal: course.sourceType === 'local-ref' ? 1 : 0,
        coverPath: course.coverPath || null,
        description: course.description || null,
        totalDuration: totalCourseDuration,
        moduleCount: cleanedModules.length,
        lessonCount: totalCourseLessons,
        isFavorite: course.isFavorite ? 1 : 0,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
        lastAccessedAt: course.lastAccessedAt || null
      })

      for (const mod of cleanedModules) {
        insertModule.run({
          id: mod.id,
          courseId: course.id,
          title: mod.title,
          customTitle: mod.customTitle || null,
          orderIndex: mod.orderIndex,
          displayOrder: mod.displayOrder || mod.orderIndex,
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
            customTitle: lesson.customTitle || null,
            orderIndex: lesson.orderIndex,
            displayOrder: lesson.displayOrder || lesson.orderIndex,
            isFavorite: lesson.isFavorite ? 1 : 0,
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
        id, title, custom_title as customTitle, slug, source_type as sourceType, root_path as rootPath,
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
    courseId: string,
    options?: { skipDeduplication?: boolean }
  ): { course: Course; modules: (Module & { lessons: Lesson[] })[] } | null {
    this.ensureConnected()

    const courseStmt = this.db!.prepare(`
      SELECT
        id, title, custom_title as customTitle, slug, source_type as sourceType, root_path as rootPath,
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
        id, course_id as courseId, title, custom_title as customTitle, order_index as orderIndex,
        display_order as displayOrder,
        folder_path as folderPath, duration, lesson_count as lessonCount,
        created_at as createdAt
      FROM modules
      WHERE course_id = ?
      ORDER BY display_order ASC, order_index ASC
    `)
    const modules = modulesStmt.all(courseId) as Module[]

    // Self-healing check for duplicate modules in database
    if (!options?.skipDeduplication && modules.length > 1) {
      const seenModuleKeys = new Set<string>()
      let hasDuplicateModules = false
      for (const mod of modules) {
        const rawTitle = (mod.title || '').trim()
        const key = normalizeModuleKey(rawTitle) || rawTitle.toLowerCase()
        if (seenModuleKeys.has(key)) {
          hasDuplicateModules = true
          break
        }
        seenModuleKeys.add(key)
      }

      if (hasDuplicateModules) {
        this.reindexCourseHierarchy(courseId)
        return this.getCourseById(courseId, { skipDeduplication: true })
      }
    }

    const lessonsStmt = this.db!.prepare(`
      SELECT
        id, module_id as moduleId, course_id as courseId, title, custom_title as customTitle,
        order_index as orderIndex, display_order as displayOrder, is_favorite as isFavorite,
        file_path as filePath, file_name as fileName,
        file_extension as fileExtension, media_type as mediaType,
        duration, file_size as fileSize, availability, cover_path as coverPath,
        created_at as createdAt
      FROM lessons
      WHERE course_id = ?
      ORDER BY module_id, display_order ASC, order_index ASC
    `)
    const allLessons = lessonsStmt.all(courseId) as (Omit<Lesson, 'isFavorite'> & { isFavorite: number })[]

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
        isFavorite: Boolean(lesson.isFavorite),
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

  /** Persists a probed lesson duration (propagating to module and course totals). */
  public updateLessonDuration(lessonId: string, duration: number): void {
    this.ensureConnected()
    const value = Number.isFinite(duration) && duration >= 0 ? duration : 0
    const lesson = this.db!.prepare(`SELECT module_id as moduleId, course_id as courseId FROM lessons WHERE id = ?`).get(lessonId) as { moduleId: string; courseId: string } | undefined
    if (!lesson) return

    this.db!.prepare(`UPDATE lessons SET duration = ? WHERE id = ?`).run(value, lessonId)
    this.reindexCourseHierarchy(lesson.courseId)
  }

  public findLessonByFilePath(filePath: string): Lesson | null {
    this.ensureConnected()
    const stmt = this.db!.prepare(`
      SELECT
        id, module_id as moduleId, course_id as courseId, title, custom_title as customTitle,
        order_index as orderIndex, display_order as displayOrder, is_favorite as isFavorite,
        file_path as filePath, file_name as fileName, file_extension as fileExtension,
        media_type as mediaType, duration, file_size as fileSize, availability, cover_path as coverPath,
        created_at as createdAt
      FROM lessons WHERE file_path = ?
    `)
    const row = stmt.get(filePath) as (Omit<Lesson, 'isFavorite'> & { isFavorite: number }) | undefined
    if (!row) return null
    return {
      ...row,
      isFavorite: Boolean(row.isFavorite),
      coverPath: row.coverPath || undefined
    }
  }

  public getLessonById(lessonId: string): Lesson | null {
    this.ensureConnected()
    const stmt = this.db!.prepare(`
      SELECT
        id, module_id as moduleId, course_id as courseId, title, custom_title as customTitle,
        order_index as orderIndex, display_order as displayOrder, is_favorite as isFavorite,
        file_path as filePath, file_name as fileName, file_extension as fileExtension,
        media_type as mediaType, duration, file_size as fileSize, availability, cover_path as coverPath,
        created_at as createdAt
      FROM lessons WHERE id = ?
    `)
    const row = stmt.get(lessonId) as (Omit<Lesson, 'isFavorite'> & { isFavorite: number }) | undefined
    if (!row) return null
    return {
      ...row,
      isFavorite: Boolean(row.isFavorite),
      coverPath: row.coverPath || undefined
    }
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

  public updateLessonFilePath(lessonId: string, newPath: string, newFileName: string): void {
    this.ensureConnected()
    const ext = path.extname(newFileName)
    this.db!.prepare(`
      UPDATE lessons SET file_path = ?, file_name = ?, file_extension = ? WHERE id = ?
    `).run(newPath, newFileName, ext, lessonId)
  }

  public getFileOperationsByGroup(groupId: string): FileOperationRecord[] {
    this.ensureConnected()
    const stmt = this.db!.prepare(`
      SELECT
        operation_id as operationId, group_id as groupId, type,
        source_path as sourcePath, destination_path as destinationPath,
        original_filename as originalFileName, new_filename as newFileName,
        timestamp, status, error_details as errorDetails,
        is_reversible as isReversible
      FROM file_operations
      WHERE group_id = ?
      ORDER BY timestamp DESC
    `)
    const rows = stmt.all(groupId) as (Omit<FileOperationRecord, 'isReversible'> & { isReversible: number })[]
    return rows.map((r) => ({ ...r, isReversible: Boolean(r.isReversible) }))
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

  public getLessonsProgress(courseId: string): LessonProgress[] {
    return this.getLessonProgressByCourse(courseId)
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
    watchedAt?: number
    duration: number
    currentTime: number
  }): void {
    this.ensureConnected()
    const watchedAt = entry.watchedAt ?? Date.now()
    const id = `hist-${watchedAt}-${Math.random().toString(36).substring(2, 7)}`

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
      watchedAt,
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
        l.file_extension as fileExtension,
        COALESCE(lp.updated_at, wh.watched_at) as watchedAt,
        COALESCE(lp.duration, wh.duration) as duration,
        COALESCE(lp.current_time, wh.current_time) as currentTime
      FROM watch_history wh
      LEFT JOIN lessons l ON l.id = wh.lesson_id
      LEFT JOIN lesson_progress lp
        ON lp.lesson_id = wh.lesson_id AND lp.course_id = wh.course_id
      ORDER BY watchedAt DESC
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
   * lesson_count, duration, totals). Merges duplicate modules with matching titles.
   * Shared by duplicate merge and manual merge.
   */
  public reindexCourseHierarchy(courseId: string): {
    moduleCount: number
    lessonCount: number
    totalDuration: number
  } {
    const rawModules = this.db!.prepare(`
      SELECT id, course_id as courseId, title, order_index as orderIndex, display_order as displayOrder
      FROM modules WHERE course_id = ?
      ORDER BY display_order ASC, order_index ASC
    `).all(courseId) as Array<{ id: string; courseId: string; title: string; orderIndex: number; displayOrder: number }>

    if (rawModules.length === 0) return { moduleCount: 0, lessonCount: 0, totalDuration: 0 }

    // Step 1: Detect and merge duplicate modules that share the same semantic title
    const modulesByTitle = new Map<string, { id: string; courseId: string; title: string }>()
    for (const mod of rawModules) {
      const rawTitle = (mod.title || '').trim()
      const normalizedKey = normalizeModuleKey(rawTitle) || rawTitle.toLowerCase()
      const existing = modulesByTitle.get(normalizedKey)
      if (existing && existing.id !== mod.id) {
        // Reassign all lessons from duplicate module to canonical module
        this.db!.prepare(`UPDATE lessons SET module_id = ? WHERE module_id = ?`).run(existing.id, mod.id)
        // Reassign all content resources from duplicate module to canonical module
        this.db!.prepare(`UPDATE content_resources SET module_id = ? WHERE module_id = ?`).run(existing.id, mod.id)
        // Delete duplicate module row
        this.db!.prepare(`DELETE FROM modules WHERE id = ?`).run(mod.id)
      } else if (!existing) {
        modulesByTitle.set(normalizedKey, mod)
      }
    }

    const hierarchy = this.getCourseById(courseId, { skipDeduplication: true })
    if (!hierarchy) return { moduleCount: 0, lessonCount: 0, totalDuration: 0 }

    const sortedModules = [...hierarchy.modules].sort((a, b) =>
      (a.displayOrder || a.orderIndex) - (b.displayOrder || b.orderIndex) || naturalCompare(a.title, b.title)
    )

    let totalCourseLessons = 0
    let totalCourseDuration = 0

    for (let mIdx = 0; mIdx < sortedModules.length; mIdx++) {
      const mod = sortedModules[mIdx]
      const sortedLessons = [...mod.lessons].sort((a, b) =>
        (a.displayOrder || a.orderIndex) - (b.displayOrder || b.orderIndex) || naturalCompare(a.title, b.title)
      )

      let modDuration = 0
      for (let lIdx = 0; lIdx < sortedLessons.length; lIdx++) {
        const les = sortedLessons[lIdx]
        modDuration += les.duration || 0
        this.db!.prepare(`
          UPDATE lessons SET order_index = ?, display_order = ? WHERE id = ?
        `).run(lIdx + 1, lIdx + 1, les.id)
      }

      totalCourseLessons += sortedLessons.length
      totalCourseDuration += modDuration

      this.db!.prepare(`
        UPDATE modules SET order_index = ?, display_order = ?, lesson_count = ?, duration = ? WHERE id = ?
      `).run(mIdx + 1, mIdx + 1, sortedLessons.length, modDuration, mod.id)
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

  public deleteLesson(lessonId: string, deleteFileFromDisk = false): { success: boolean; error?: string } {
    this.ensureConnected()
    const lesson = this.db!.prepare(`SELECT file_path as filePath, course_id as courseId FROM lessons WHERE id = ?`).get(lessonId) as { filePath: string; courseId: string } | undefined
    if (!lesson) return { success: false, error: 'Lesson not found' }

    if (deleteFileFromDisk && lesson.filePath) {
      try {
        if (fs.existsSync(lesson.filePath)) {
          fs.unlinkSync(lesson.filePath)
        }
      } catch (err) {
        logger.warn('[Database] deleteLesson file deletion error:', err)
      }
    }

    this.db!.prepare(`DELETE FROM lessons WHERE id = ?`).run(lessonId)
    this.reindexCourseHierarchy(lesson.courseId)
    return { success: true }
  }

  public getCourseHealth(courseId: string): import('../../types').CourseHealthReport {
    this.ensureConnected()
    const lessons = this.db!.prepare(`
      SELECT l.id, l.title, l.module_id as moduleId, m.title as moduleTitle, l.file_path as filePath, l.file_name as fileName
      FROM lessons l
      JOIN modules m ON l.module_id = m.id
      WHERE l.course_id = ?
    `).all(courseId) as Array<{
      id: string
      title: string
      moduleId: string
      moduleTitle: string
      filePath: string
      fileName: string
    }>

    const problemLessons: import('../../types').CourseProblemLesson[] = []

    for (const l of lessons) {
      const p = l.filePath || l.fileName
      if (!isMediaFile(p)) {
        problemLessons.push({
          id: l.id,
          title: l.title,
          moduleId: l.moduleId,
          moduleTitle: l.moduleTitle,
          filePath: l.filePath,
          fileName: l.fileName,
          problemType: 'non_media_type',
          problemDescription: 'File is not a supported video/audio media format'
        })
        continue
      }

      try {
        if (!fs.existsSync(l.filePath)) {
          problemLessons.push({
            id: l.id,
            title: l.title,
            moduleId: l.moduleId,
            moduleTitle: l.moduleTitle,
            filePath: l.filePath,
            fileName: l.fileName,
            problemType: 'missing_file',
            problemDescription: 'Media file does not exist on disk'
          })
          continue
        }

        const stat = fs.statSync(l.filePath)
        if (stat.size === 0) {
          problemLessons.push({
            id: l.id,
            title: l.title,
            moduleId: l.moduleId,
            moduleTitle: l.moduleTitle,
            filePath: l.filePath,
            fileName: l.fileName,
            problemType: 'zero_bytes',
            problemDescription: 'Media file is 0 bytes'
          })
        }
      } catch {
        problemLessons.push({
          id: l.id,
          title: l.title,
          moduleId: l.moduleId,
          moduleTitle: l.moduleTitle,
          filePath: l.filePath,
          fileName: l.fileName,
          problemType: 'missing_file',
          problemDescription: 'Unable to access media file'
        })
      }
    }

    return {
      courseId,
      healthy: problemLessons.length === 0,
      totalLessons: lessons.length,
      problemLessons
    }
  }

  public fixCourseProblems(courseId: string): { success: boolean; fixedCount: number; removedCount: number; error?: string } {
    this.ensureConnected()
    const health = this.getCourseHealth(courseId)
    let fixedCount = 0
    let removedCount = 0

    const tx = this.db!.transaction(() => {
      for (const prob of health.problemLessons) {
        if (prob.problemType === 'non_media_type') {
          const ext = path.extname(prob.filePath || prob.fileName).replace(/^\./, '').toLowerCase()
          const resourceType = toResourceType(prob.filePath || prob.fileName)
          let fileSize = 0
          try {
            if (fs.existsSync(prob.filePath)) {
              fileSize = fs.statSync(prob.filePath).size
            }
          } catch {}

          this.db!.prepare(`
            INSERT OR REPLACE INTO content_resources (
              id, course_id, module_id, lesson_id, role, name,
              file_path, file_extension, file_size, resource_type, created_at
            ) VALUES (?, ?, ?, NULL, 'resource', ?, ?, ?, ?, ?, ?)
          `).run(
            crypto.randomUUID(),
            courseId,
            prob.moduleId,
            prob.fileName || prob.title,
            prob.filePath,
            ext,
            fileSize,
            resourceType,
            Date.now()
          )

          this.db!.prepare(`DELETE FROM lessons WHERE id = ?`).run(prob.id)
          fixedCount++
        } else if (prob.problemType === 'missing_file' || prob.problemType === 'zero_bytes') {
          this.db!.prepare(`DELETE FROM lessons WHERE id = ?`).run(prob.id)
          this.db!.prepare(`DELETE FROM lesson_progress WHERE lesson_id = ?`).run(prob.id)
          this.db!.prepare(`DELETE FROM content_resources WHERE lesson_id = ?`).run(prob.id)
          removedCount++
        }
      }
    })

    tx()
    if (fixedCount > 0 || removedCount > 0) {
      this.reindexCourseHierarchy(courseId)
    }

    return { success: true, fixedCount, removedCount }
  }

  public cleanupNonMediaLessons(): void {
    this.ensureConnected()
    const rows = this.db!.prepare(`
      SELECT id, module_id as moduleId, course_id as courseId, title,
             file_path as filePath, file_name as fileName,
             file_extension as fileExtension, file_size as fileSize,
             created_at as createdAt
      FROM lessons
    `).all() as Array<{
      id: string
      moduleId: string
      courseId: string
      title: string
      filePath: string
      fileName: string
      fileExtension: string
      fileSize: number
      createdAt: number
    }>

    const affectedCourses = new Set<string>()

    const tx = this.db!.transaction(() => {
      for (const lesson of rows) {
        const testPath = lesson.filePath || lesson.fileName
        if (!isMediaFile(testPath)) {
          const ext = (lesson.fileExtension || path.extname(testPath)).replace(/^\./, '').toLowerCase()
          const resourceType = toResourceType(testPath)
          this.db!.prepare(`
            INSERT OR REPLACE INTO content_resources (
              id, course_id, module_id, lesson_id, role, name,
              file_path, file_extension, file_size, resource_type, created_at
            ) VALUES (?, ?, ?, NULL, 'resource', ?, ?, ?, ?, ?, ?)
          `).run(
            crypto.randomUUID(),
            lesson.courseId,
            lesson.moduleId,
            lesson.fileName || lesson.title,
            lesson.filePath,
            ext,
            lesson.fileSize || 0,
            resourceType,
            lesson.createdAt || Date.now()
          )

          this.db!.prepare(`DELETE FROM lessons WHERE id = ?`).run(lesson.id)
          affectedCourses.add(lesson.courseId)
        }
      }
    })

    tx()

    for (const affectedCourseId of affectedCourses) {
      this.reindexCourseHierarchy(affectedCourseId)
    }
  }

  public async healMissingDurations(): Promise<void> {
    // Probes lessons with missing durations
  }

  public cleanupDuplicateModules(courseId?: string): void {
    this.ensureConnected()
    if (courseId) {
      this.reindexCourseHierarchy(courseId)
    } else {
      const courses = this.db!.prepare(`SELECT id FROM courses`).all() as Array<{ id: string }>
      for (const c of courses) {
        this.reindexCourseHierarchy(c.id)
      }
    }
  }

  public getStudyAnalytics(dailyGoalMinutes = 30): import('../../types').StudyAnalytics {
    this.ensureConnected()
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

    const historyRows = this.db!.prepare(`
      SELECT lesson_id as lessonId, course_id as courseId, duration, watched_at as watchedAt, current_time as currentTime
      FROM watch_history
      ORDER BY watched_at ASC
    `).all() as Array<{ lessonId: string; courseId: string; duration: number; watchedAt: number; currentTime: number }>

    const completedCountRow = this.db!.prepare(`
      SELECT count(*) as cnt FROM lesson_progress WHERE completed = 1
    `).get() as { cnt: number } | undefined
    const totalLessonsCompleted = completedCountRow?.cnt ?? 0

    if (historyRows.length === 0) {
      return {
        currentStreakDays: 0,
        longestStreakDays: 0,
        totalSecondsWatched: 0,
        totalLessonsCompleted,
        todaySecondsWatched: 0,
        dailyGoalMinutes,
        dailyHistory: [],
        topCourses: []
      }
    }

    let totalSecondsWatched = 0
    let todaySecondsWatched = 0
    const secondsByDate = new Map<string, number>()
    const secondsByCourse = new Map<string, number>()
    const lessonsCountByDate = new Map<string, Set<string>>()

    for (const row of historyRows) {
      const watchedSeconds = row.duration || 0
      totalSecondsWatched += watchedSeconds
      if (row.watchedAt >= startOfToday) {
        todaySecondsWatched += watchedSeconds
      }

      const d = new Date(row.watchedAt)
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      secondsByDate.set(dateKey, (secondsByDate.get(dateKey) || 0) + watchedSeconds)
      secondsByCourse.set(row.courseId, (secondsByCourse.get(row.courseId) || 0) + watchedSeconds)

      let set = lessonsCountByDate.get(dateKey)
      if (!set) {
        set = new Set<string>()
        lessonsCountByDate.set(dateKey, set)
      }
      set.add(row.lessonId)
    }

    // Calculate streaks
    let currentStreakDays = 0
    let longestStreakDays = 0
    const activeDates = Array.from(secondsByDate.keys()).filter((k) => (secondsByDate.get(k) || 0) > 0).sort()

    const dailyHistory: import('../../types').DailyStudyTime[] = []
    for (const dateStr of activeDates) {
      dailyHistory.push({
        date: dateStr,
        secondsWatched: secondsByDate.get(dateStr) || 0,
        lessonsCount: lessonsCountByDate.get(dateStr)?.size || 0
      })
    }

    if (activeDates.length > 0) {
      const toUtcDays = (dateStr: string) => {
        const [y, m, d] = dateStr.split('-').map(Number)
        return Math.floor(Date.UTC(y, m - 1, d) / (24 * 60 * 60 * 1000))
      }

      let tempStreak = 0
      let prevDay: number | null = null
      for (const dateStr of activeDates) {
        const currDay = toUtcDays(dateStr)
        if (prevDay !== null) {
          if (currDay - prevDay === 1) {
            tempStreak++
          } else {
            tempStreak = 1
          }
        } else {
          tempStreak = 1
        }
        if (tempStreak > longestStreakDays) longestStreakDays = tempStreak
        prevDay = currDay
      }

      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const todayDay = toUtcDays(todayStr)
      const lastActiveDateStr = activeDates[activeDates.length - 1]
      const lastActiveDay = toUtcDays(lastActiveDateStr)

      // Only count current streak if user studied today or yesterday
      if (todayDay - lastActiveDay <= 1) {
        let expectedDay = lastActiveDay
        for (let i = activeDates.length - 1; i >= 0; i--) {
          const day = toUtcDays(activeDates[i])
          if (day === expectedDay) {
            currentStreakDays++
            expectedDay--
          } else {
            break
          }
        }
      }
    }

    // Top 5 courses
    const topCourseIds = Array.from(secondsByCourse.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const topCourses: Array<{ courseId: string; courseTitle: string; secondsWatched: number }> = []
    for (const [cId, sec] of topCourseIds) {
      const cRow = this.db!.prepare(`SELECT title, custom_title as customTitle FROM courses WHERE id = ?`).get(cId) as { title: string; customTitle?: string } | undefined
      if (cRow) {
        topCourses.push({
          courseId: cId,
          courseTitle: cRow.customTitle || cRow.title,
          secondsWatched: sec
        })
      }
    }

    return {
      currentStreakDays,
      longestStreakDays,
      totalSecondsWatched,
      totalLessonsCompleted,
      todaySecondsWatched,
      dailyGoalMinutes,
      dailyHistory,
      topCourses
    }
  }

  public mergeCourses(courseIds: string[], targetTitle?: string): MergeCoursesResult {
    return this.mergeCoursesByIds(courseIds, targetTitle)
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
          UPDATE content_resources SET course_id = ? WHERE course_id = ?
        `).run(canonical.course.id, secondary.course.id)

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

  /**
   * Automatically detects if any course in the library contains modules or lessons
   * belonging to different course directory trees (e.g. if the user previously merged
   * unrelated courses by mistake). Separates them into their own distinct courses,
   * properly restoring titles, paths, modules, lessons, progress, and notes.
   */
  public separateMistakenlyMergedCourses(): import('../../types').SeparateCoursesResult {
    this.ensureConnected()
    const allCourses = this.getAllCourses()
    if (allCourses.length === 0) return { separatedCoursesCount: 0, createdCoursesCount: 0, details: [] }

    const coursesRoot = this.currentVaultPath ? path.join(this.currentVaultPath, 'Courses') : null
    const details: import('../../types').SeparateCoursesResult['details'] = []
    let createdCoursesCount = 0
    let separatedCoursesCount = 0

    for (const course of allCourses) {
      const hierarchy = this.getCourseById(course.id, { skipDeduplication: true })
      if (!hierarchy || hierarchy.modules.length <= 1) continue

      // For each module in the course, detect its physical course root directory
      const modulesByCourseRoot = new Map<string, Array<{ module: Module; lessons: Lesson[] }>>()

      for (const mod of hierarchy.modules) {
        let detectedRoot: string | null = null

        // 1. Try from module folderPath
        if (mod.folderPath) {
          if (coursesRoot && mod.folderPath.toLowerCase().startsWith(coursesRoot.toLowerCase())) {
            const rel = path.relative(coursesRoot, mod.folderPath)
            const firstDir = rel.split(/[\\/]/)[0]
            if (firstDir && firstDir !== '..' && firstDir !== '.') {
              detectedRoot = path.join(coursesRoot, firstDir)
            }
          }
          if (!detectedRoot) {
            detectedRoot = path.dirname(mod.folderPath)
          }
        }

        // 2. If no folderPath or not resolved, try from lesson filePaths
        if (!detectedRoot && mod.lessons && mod.lessons.length > 0) {
          for (const l of mod.lessons) {
            if (l.filePath) {
              if (coursesRoot && l.filePath.toLowerCase().startsWith(coursesRoot.toLowerCase())) {
                const rel = path.relative(coursesRoot, l.filePath)
                const firstDir = rel.split(/[\\/]/)[0]
                if (firstDir && firstDir !== '..' && firstDir !== '.') {
                  detectedRoot = path.join(coursesRoot, firstDir)
                  break
                }
              }
              if (!detectedRoot) {
                const modDir = path.dirname(l.filePath)
                detectedRoot = path.dirname(modDir)
                break
              }
            }
          }
        }

        const rootKey = detectedRoot ? path.normalize(detectedRoot).toLowerCase() : path.normalize(course.rootPath).toLowerCase()

        if (!modulesByCourseRoot.has(rootKey)) {
          modulesByCourseRoot.set(rootKey, [])
        }
        modulesByCourseRoot.get(rootKey)!.push({ module: mod, lessons: mod.lessons })
      }

      // If all modules come from the same course root, no separation needed
      if (modulesByCourseRoot.size <= 1) continue

      // There are multiple course roots! Find the primary root matching the current course
      const courseNormRoot = path.normalize(course.rootPath).toLowerCase()
      let primaryKey = courseNormRoot
      if (!modulesByCourseRoot.has(primaryKey)) {
        let maxCount = -1
        for (const [key, mods] of modulesByCourseRoot.entries()) {
          if (mods.length > maxCount) {
            maxCount = mods.length
            primaryKey = key
          }
        }
      }

      separatedCoursesCount++

      // Separate the other groups into their own courses
      const tx = this.db!.transaction(() => {
        for (const [rootKey, modGroups] of modulesByCourseRoot.entries()) {
          if (rootKey === primaryKey) continue

          const samplePath = modGroups[0]?.module.folderPath || modGroups[0]?.lessons[0]?.filePath || rootKey
          let rawCourseName = path.basename(samplePath)
          if (coursesRoot && samplePath.toLowerCase().startsWith(coursesRoot.toLowerCase())) {
            const rel = path.relative(coursesRoot, samplePath)
            rawCourseName = rel.split(/[\\/]/)[0] || rawCourseName
          }

          const targetCourseTitle = cleanTitle(rawCourseName) || rawCourseName
          const targetCourseRoot = coursesRoot && samplePath.toLowerCase().startsWith(coursesRoot.toLowerCase())
            ? path.join(coursesRoot, rawCourseName)
            : path.dirname(samplePath)

          // Check if a course with this root path already exists
          let targetCourse = this.db!.prepare(`SELECT id, title FROM courses WHERE LOWER(root_path) = LOWER(?)`).get(targetCourseRoot) as { id: string; title: string } | undefined
          if (!targetCourse) {
            const newCourseId = crypto.randomUUID()
            const slug = (targetCourseTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'course') + '-' + newCourseId.slice(0, 6)
            this.db!.prepare(`
              INSERT INTO courses (
                id, title, slug, source_type, root_path, is_external,
                cover_path, description, total_duration, module_count,
                lesson_count, is_favorite, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 0, 0, 0, 0, ?, ?)
            `).run(
              newCourseId,
              targetCourseTitle,
              slug,
              course.sourceType,
              targetCourseRoot,
              course.sourceType === 'local-ref' ? 1 : 0,
              Date.now(),
              Date.now()
            )
            targetCourse = { id: newCourseId, title: targetCourseTitle }
            createdCoursesCount++
          }

          const targetCourseId = targetCourse.id
          let movedLessonsCount = 0

          for (const item of modGroups) {
            const modId = item.module.id
            this.db!.prepare(`UPDATE modules SET course_id = ? WHERE id = ?`).run(targetCourseId, modId)
            this.db!.prepare(`UPDATE lessons SET course_id = ? WHERE module_id = ?`).run(targetCourseId, modId)
            this.db!.prepare(`UPDATE content_resources SET course_id = ? WHERE module_id = ?`).run(targetCourseId, modId)
            this.db!.prepare(`
              UPDATE lesson_progress SET course_id = ? WHERE lesson_id IN (SELECT id FROM lessons WHERE module_id = ?)
            `).run(targetCourseId, modId)
            this.db!.prepare(`
              UPDATE lesson_notes SET course_id = ? WHERE lesson_id IN (SELECT id FROM lessons WHERE module_id = ?)
            `).run(targetCourseId, modId)
            this.db!.prepare(`
              UPDATE watch_history SET course_id = ? WHERE lesson_id IN (SELECT id FROM lessons WHERE module_id = ?)
            `).run(targetCourseId, modId)

            movedLessonsCount += item.lessons.length
          }

          this.reindexCourseHierarchy(targetCourseId)

          details.push({
            originalCourseTitle: course.title,
            createdCourseTitle: targetCourse.title,
            moduleCount: modGroups.length,
            lessonCount: movedLessonsCount
          })
        }

        this.reindexCourseHierarchy(course.id)
      })

      tx()
    }

    return {
      separatedCoursesCount,
      createdCoursesCount,
      details
    }
  }

  /**
   * One-click automatic library organization:
   * 1. Detects and separates any mistakenly merged courses (e.g. distinct folder roots).
   * 2. Deduplicates modules with identical names inside all courses.
   * 3. Smart-merges split parts of the same course (matching base titles).
   * 4. Re-indexes and naturally orders modules and lessons across all courses.
   */
  public autoOrganizeLibrary(): import('../../types').AutoOrganizeResult {
    this.ensureConnected()

    const details: Array<{ action: 'separated' | 'merged' | 'deduplicated'; message: string }> = []

    // 1. Separate any courses that were mistakenly merged across distinct folder roots
    const separateResult = this.separateMistakenlyMergedCourses()
    if (separateResult.separatedCoursesCount > 0) {
      for (const d of separateResult.details) {
        details.push({
          action: 'separated',
          message: `Separado: "${d.createdCourseTitle}" (${d.moduleCount} módulos, ${d.lessonCount} aulas) de "${d.originalCourseTitle}"`
        })
      }
    }

    // 2. Deduplicate duplicate modules within all courses
    const allCourses = this.getAllCourses()
    let deduplicatedModulesCount = 0
    for (const c of allCourses) {
      const beforeModules = (this.db!.prepare(`SELECT count(*) as cnt FROM modules WHERE course_id = ?`).get(c.id) as { cnt: number }).cnt
      this.reindexCourseHierarchy(c.id)
      const afterModules = (this.db!.prepare(`SELECT count(*) as cnt FROM modules WHERE course_id = ?`).get(c.id) as { cnt: number }).cnt
      if (beforeModules > afterModules) {
        const mergedMods = beforeModules - afterModules
        deduplicatedModulesCount += mergedMods
        details.push({
          action: 'deduplicated',
          message: `Curso "${c.title}": ${mergedMods} módulo(s) com mesmo nome unificado(s)`
        })
      }
    }

    // 3. Smart-merge duplicate/split courses that genuinely share the same normalized title
    const mergeResult = this.mergeDuplicateCourses()
    if (mergeResult.mergedGroupsCount > 0) {
      for (const d of mergeResult.details) {
        details.push({
          action: 'merged',
          message: `Unificado: "${d.title}" (${d.mergedCoursesCount} partes combinadas em 1 curso)`
        })
      }
    }

    // 4. Clean up any non-media lessons
    this.cleanupNonMediaLessons()

    return {
      success: true,
      separatedCoursesCount: separateResult.separatedCoursesCount,
      mergedGroupsCount: mergeResult.mergedGroupsCount,
      deduplicatedModulesCount,
      reindexedCoursesCount: allCourses.length,
      details
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

  public updateCourseMetadata(courseId: string, updates: { customTitle?: string }): void {
    this.ensureConnected()
    this.db!.prepare(`
      UPDATE courses SET custom_title = ?, updated_at = ? WHERE id = ?
    `).run(updates.customTitle ?? null, Date.now(), courseId)
  }

  public updateModuleMetadata(moduleId: string, updates: { customTitle?: string; displayOrder?: number }): void {
    this.ensureConnected()
    if (updates.customTitle !== undefined && updates.displayOrder !== undefined) {
      this.db!.prepare(`
        UPDATE modules SET custom_title = ?, display_order = ? WHERE id = ?
      `).run(updates.customTitle ?? null, updates.displayOrder, moduleId)
    } else if (updates.customTitle !== undefined) {
      this.db!.prepare(`
        UPDATE modules SET custom_title = ? WHERE id = ?
      `).run(updates.customTitle ?? null, moduleId)
    } else if (updates.displayOrder !== undefined) {
      this.db!.prepare(`
        UPDATE modules SET display_order = ? WHERE id = ?
      `).run(updates.displayOrder, moduleId)
    }
  }

  public updateLessonMetadata(lessonId: string, updates: { customTitle?: string; displayOrder?: number }): void {
    this.ensureConnected()
    if (updates.customTitle !== undefined && updates.displayOrder !== undefined) {
      this.db!.prepare(`
        UPDATE lessons SET custom_title = ?, display_order = ? WHERE id = ?
      `).run(updates.customTitle ?? null, updates.displayOrder, lessonId)
    } else if (updates.customTitle !== undefined) {
      this.db!.prepare(`
        UPDATE lessons SET custom_title = ? WHERE id = ?
      `).run(updates.customTitle ?? null, lessonId)
    } else if (updates.displayOrder !== undefined) {
      this.db!.prepare(`
        UPDATE lessons SET display_order = ? WHERE id = ?
      `).run(updates.displayOrder, lessonId)
    }
  }

  public reorderModule(moduleId: string, direction: 'up' | 'down'): boolean {
    this.ensureConnected()
    const targetModule = this.db!.prepare(`
      SELECT id, course_id as courseId, display_order as displayOrder, order_index as orderIndex
      FROM modules WHERE id = ?
    `).get(moduleId) as { id: string; courseId: string; displayOrder: number; orderIndex: number } | undefined
    if (!targetModule) return false

    const allModules = this.db!.prepare(`
      SELECT id, display_order as displayOrder, order_index as orderIndex
      FROM modules WHERE course_id = ?
      ORDER BY display_order ASC, order_index ASC
    `).all(targetModule.courseId) as Array<{ id: string; displayOrder: number; orderIndex: number }>

    const currentIndex = allModules.findIndex((m) => m.id === moduleId)
    if (currentIndex === -1) return false
    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (swapIndex < 0 || swapIndex >= allModules.length) return false

    const otherModule = allModules[swapIndex]

    this.db!.transaction(() => {
      allModules.forEach((m, idx) => {
        this.db!.prepare(`UPDATE modules SET display_order = ? WHERE id = ?`).run(idx + 1, m.id)
      })

      this.db!.prepare(`UPDATE modules SET display_order = ? WHERE id = ?`).run(swapIndex + 1, targetModule.id)
      this.db!.prepare(`UPDATE modules SET display_order = ? WHERE id = ?`).run(currentIndex + 1, otherModule.id)
    })()

    return true
  }

  public reorderLesson(lessonId: string, direction: 'up' | 'down'): boolean {
    this.ensureConnected()
    const targetLesson = this.db!.prepare(`
      SELECT id, module_id as moduleId, display_order as displayOrder, order_index as orderIndex
      FROM lessons WHERE id = ?
    `).get(lessonId) as { id: string; moduleId: string; displayOrder: number; orderIndex: number } | undefined
    if (!targetLesson) return false

    const allLessons = this.db!.prepare(`
      SELECT id, display_order as displayOrder, order_index as orderIndex
      FROM lessons WHERE module_id = ?
      ORDER BY display_order ASC, order_index ASC
    `).all(targetLesson.moduleId) as Array<{ id: string; displayOrder: number; orderIndex: number }>

    const currentIndex = allLessons.findIndex((l) => l.id === lessonId)
    if (currentIndex === -1) return false
    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (swapIndex < 0 || swapIndex >= allLessons.length) return false

    const otherLesson = allLessons[swapIndex]

    this.db!.transaction(() => {
      allLessons.forEach((l, idx) => {
        this.db!.prepare(`UPDATE lessons SET display_order = ? WHERE id = ?`).run(idx + 1, l.id)
      })

      this.db!.prepare(`UPDATE lessons SET display_order = ? WHERE id = ?`).run(swapIndex + 1, targetLesson.id)
      this.db!.prepare(`UPDATE lessons SET display_order = ? WHERE id = ?`).run(currentIndex + 1, otherLesson.id)
    })()

    return true
  }

  public toggleLessonFavorite(lessonId: string): boolean {
    this.ensureConnected()
    const current = this.db!.prepare(`SELECT is_favorite as isFavorite FROM lessons WHERE id = ?`).get(lessonId) as { isFavorite: number } | undefined
    if (!current) return false
    const nextVal = current.isFavorite ? 0 : 1
    this.db!.prepare(`UPDATE lessons SET is_favorite = ? WHERE id = ?`).run(nextVal, lessonId)
    return Boolean(nextVal)
  }

  public toggleModuleCompletion(moduleId: string, courseId: string, forceCompleted?: boolean): number {
    this.ensureConnected()
    const lessons = this.db!.prepare(`
      SELECT id, duration FROM lessons WHERE module_id = ?
    `).all(moduleId) as Array<{ id: string; duration: number }>
    if (lessons.length === 0) return 0

    const placeholders = lessons.map(() => '?').join(',')
    const progressRows = this.db!.prepare(`
      SELECT lesson_id as lessonId, completed FROM lesson_progress
      WHERE course_id = ? AND lesson_id IN (${placeholders})
    `).all(courseId, ...lessons.map((l) => l.id)) as Array<{ lessonId: string; completed: number }>

    const completedSet = new Set(progressRows.filter((p) => Boolean(p.completed)).map((p) => p.lessonId))
    const allCompleted = lessons.every((l) => completedSet.has(l.id))
    const shouldComplete = forceCompleted !== undefined ? forceCompleted : !allCompleted

    const stmt = this.db!.prepare(`
      INSERT INTO lesson_progress (lesson_id, course_id, current_time, duration, completed, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(lesson_id) DO UPDATE SET
        completed = excluded.completed,
        current_time = CASE WHEN excluded.completed = 1 THEN excluded.duration ELSE lesson_progress.current_time END,
        updated_at = excluded.updated_at
    `)

    this.db!.transaction(() => {
      const now = Date.now()
      for (const lesson of lessons) {
        stmt.run(
          lesson.id,
          courseId,
          shouldComplete ? lesson.duration : 0,
          lesson.duration,
          shouldComplete ? 1 : 0,
          now
        )
      }
    })()

    return lessons.length
  }

  public searchGlobal(query: string): import('../../types').SearchResultItem[] {
    this.ensureConnected()
    const trimmed = (query || '').trim()
    if (!trimmed) return []

    const pattern = `%${trimmed}%`
    const results: import('../../types').SearchResultItem[] = []

    // 1. Courses
    const courses = this.db!.prepare(`
      SELECT id, title, custom_title as customTitle
      FROM courses
      WHERE title LIKE ? OR (custom_title IS NOT NULL AND custom_title LIKE ?)
      LIMIT 15
    `).all(pattern, pattern) as Array<{ id: string; title: string; customTitle?: string }>

    for (const c of courses) {
      results.push({
        type: 'course',
        id: c.id,
        title: c.customTitle || c.title,
        courseId: c.id,
        courseTitle: c.customTitle || c.title
      })
    }

    // 2. Modules
    const modules = this.db!.prepare(`
      SELECT m.id, m.title, m.custom_title as customTitle, m.course_id as courseId,
             c.title as courseTitle, c.custom_title as courseCustomTitle
      FROM modules m
      JOIN courses c ON m.course_id = c.id
      WHERE m.title LIKE ? OR (m.custom_title IS NOT NULL AND m.custom_title LIKE ?)
      LIMIT 20
    `).all(pattern, pattern) as Array<{
      id: string
      title: string
      customTitle?: string
      courseId: string
      courseTitle: string
      courseCustomTitle?: string
    }>

    for (const m of modules) {
      results.push({
        type: 'module',
        id: m.id,
        title: m.customTitle || m.title,
        courseId: m.courseId,
        courseTitle: m.courseCustomTitle || m.courseTitle,
        moduleId: m.id,
        moduleTitle: m.customTitle || m.title
      })
    }

    // 3. Lessons
    const lessons = this.db!.prepare(`
      SELECT l.id, l.title, l.custom_title as customTitle, l.module_id as moduleId, l.course_id as courseId,
             m.title as moduleTitle, m.custom_title as moduleCustomTitle,
             c.title as courseTitle, c.custom_title as courseCustomTitle
      FROM lessons l
      JOIN modules m ON l.module_id = m.id
      JOIN courses c ON l.course_id = c.id
      WHERE l.title LIKE ? OR (l.custom_title IS NOT NULL AND l.custom_title LIKE ?)
      LIMIT 25
    `).all(pattern, pattern) as Array<{
      id: string
      title: string
      customTitle?: string
      moduleId: string
      courseId: string
      moduleTitle: string
      moduleCustomTitle?: string
      courseTitle: string
      courseCustomTitle?: string
    }>

    for (const l of lessons) {
      results.push({
        type: 'lesson',
        id: l.id,
        title: l.customTitle || l.title,
        courseId: l.courseId,
        courseTitle: l.courseCustomTitle || l.courseTitle,
        moduleId: l.moduleId,
        moduleTitle: l.moduleCustomTitle || l.moduleTitle
      })
    }

    return results.slice(0, 50)
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

function toResourceType(filePath: string): ContentResource['type'] {
  const mediaType = getMediaType(filePath)
  if (mediaType === 'pdf' || mediaType === 'document' || mediaType === 'image' || mediaType === 'archive') {
    return mediaType
  }
  return 'other'
}

function isAttachedResourceType(
  type: ContentResource['type']
): type is AttachedResource['type'] {
  return type === 'pdf' || type === 'code' || type === 'archive' || type === 'document'
}

function consolidateModulesForPersistence(
  modules: (Module & { lessons: Lesson[] })[]
): (Module & { lessons: Lesson[] })[] {
  const merged: (Module & { lessons: Lesson[] })[] = []
  const map = new Map<string, Module & { lessons: Lesson[] }>()

  for (const mod of modules) {
    const rawTitle = (mod.title || '').trim()
    const key = normalizeModuleKey(rawTitle) || rawTitle.toLowerCase()
    const existing = map.get(key)
    if (existing) {
      existing.lessons = [...existing.lessons, ...mod.lessons]
      if (mod.resources && mod.resources.length > 0) {
        existing.resources = [...(existing.resources || []), ...mod.resources]
      }
      existing.duration = (existing.duration || 0) + (mod.duration || 0)
    } else {
      const copy: Module & { lessons: Lesson[] } = {
        ...mod,
        title: rawTitle,
        lessons: [...mod.lessons],
        resources: mod.resources ? [...mod.resources] : undefined
      }
      map.set(key, copy)
      merged.push(copy)
    }
  }

  // Re-index modules and lessons naturally
  merged.forEach((mod, mIdx) => {
    mod.orderIndex = mIdx + 1
    mod.lessons.sort((a, b) => (a.orderIndex - b.orderIndex) || naturalCompare(a.title, b.title))
    mod.lessons.forEach((les, lIdx) => {
      les.orderIndex = lIdx + 1
      les.moduleId = mod.id
    })
    mod.lessonCount = mod.lessons.length
  })

  return merged
}

export const databaseService = new DatabaseService()
