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
  SubtitleTrack,
  VideoBookmark,
  Flashcard,
  FlashcardState,
  FlashcardReviewGrade,
  StudyQueueItem,
  StudyQueueEntityType,
  CourseGoal,
  StudySession,
  ReviewDashboardStats
} from '../../types'
import { naturalCompare } from '../utils/natural-sort'
import { cleanTitle, normalizeModuleKey } from '../utils/title-cleaner'
import { isMediaFile, getMediaType } from '../utils/file-utils'
import { generateVideoFrameCover, persistCover, TEMP_COVERS_DIR } from '../utils/cover-generator'
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

    try {
      this.runMigrations()
      this.recoverPendingFileOperations(vaultPath)
      try {
        void this.healMissingDurations()
        void this.extractMissingVideoThumbnails()
      } catch (err) {
        logger.warn('[Database] connect background healing error:', err)
      }
    } catch (error) {
      this.close()
      throw error
    }
  }

  public close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      this.currentVaultPath = null
    }
  }

  public getDatabase(): Database.Database | null {
    return this.db
  }

  public disconnect(): void {
    this.close()
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

      -- Media Optimization Queue (v0.7)
      CREATE TABLE IF NOT EXISTS optimization_queue (
        id                TEXT PRIMARY KEY,
        lesson_id         TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        course_id         TEXT REFERENCES courses(id) ON DELETE CASCADE,
        source_path       TEXT NOT NULL,
        temp_output_path  TEXT,
        final_output_path TEXT,
        backup_path       TEXT,
        profile           TEXT NOT NULL,
        target_codec      TEXT NOT NULL,
        target_resolution TEXT,
        estimated_savings INTEGER NOT NULL DEFAULT 0,
        actual_savings    INTEGER,
        status            TEXT NOT NULL DEFAULT 'queued',
        progress_percent  REAL NOT NULL DEFAULT 0,
        current_fps       REAL,
        current_speed     TEXT,
        eta_seconds       INTEGER,
        retry_count       INTEGER NOT NULL DEFAULT 0,
        error_message     TEXT,
        is_shared_file    INTEGER NOT NULL DEFAULT 0,
        shared_confirmation_given INTEGER NOT NULL DEFAULT 0,
        created_at        INTEGER NOT NULL,
        updated_at        INTEGER NOT NULL
      );

      -- Media Optimization Provenance Records (Anti-Generation Loss)
      CREATE TABLE IF NOT EXISTS optimization_records (
        id                    TEXT PRIMARY KEY,
        lesson_id             TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        original_path         TEXT NOT NULL,
        original_size         INTEGER NOT NULL,
        original_codec        TEXT NOT NULL,
        original_resolution   TEXT NOT NULL,
        original_bitrate      INTEGER NOT NULL,
        original_fingerprint  TEXT NOT NULL,
        optimized_path        TEXT NOT NULL,
        optimized_size        INTEGER NOT NULL,
        optimized_codec       TEXT NOT NULL,
        optimized_resolution  TEXT NOT NULL,
        backup_path           TEXT,
        profile_used          TEXT NOT NULL,
        actual_savings_bytes  INTEGER NOT NULL DEFAULT 0,
        created_at            INTEGER NOT NULL
      );

      -- Optimization Exclusions & Inheritance Rules
      CREATE TABLE IF NOT EXISTS optimization_exclusions (
        id          TEXT PRIMARY KEY,
        scope_type  TEXT NOT NULL,
        scope_id    TEXT NOT NULL,
        is_excluded INTEGER NOT NULL DEFAULT 1,
        created_at  INTEGER NOT NULL
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
      `CREATE INDEX IF NOT EXISTS idx_import_history_time ON import_history(created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_opt_queue_status ON optimization_queue(status);`,
      `CREATE INDEX IF NOT EXISTS idx_opt_queue_created ON optimization_queue(created_at ASC);`,
      `CREATE INDEX IF NOT EXISTS idx_opt_queue_lesson ON optimization_queue(lesson_id);`,
      `CREATE INDEX IF NOT EXISTS idx_opt_records_lesson ON optimization_records(lesson_id);`,
      `CREATE INDEX IF NOT EXISTS idx_opt_records_path ON optimization_records(optimized_path);`,
      `CREATE INDEX IF NOT EXISTS idx_opt_records_fingerprint ON optimization_records(original_fingerprint);`,
      `CREATE INDEX IF NOT EXISTS idx_opt_exclusions_scope ON optimization_exclusions(scope_type, scope_id);`
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

    const orgMigrationId = '002_course_organization_engine'
    const orgMigrationApplied = this.db.prepare(`SELECT id FROM _migrations WHERE id = ?`).get(orgMigrationId)

    if (!orgMigrationApplied) {
      this.db.transaction(() => {
        const alters = [
          `ALTER TABLE courses ADD COLUMN merged_into_course_id TEXT DEFAULT NULL REFERENCES courses(id);`,
          `ALTER TABLE courses ADD COLUMN merge_metadata TEXT DEFAULT NULL;`,
          `ALTER TABLE modules ADD COLUMN is_auxiliary INTEGER NOT NULL DEFAULT 0;`,
          `ALTER TABLE modules ADD COLUMN parent_module_id TEXT DEFAULT NULL REFERENCES modules(id);`,
          `ALTER TABLE modules ADD COLUMN has_manual_order INTEGER NOT NULL DEFAULT 0;`,
          `ALTER TABLE lessons ADD COLUMN has_manual_order INTEGER NOT NULL DEFAULT 0;`,
          `ALTER TABLE lessons ADD COLUMN is_multipart INTEGER NOT NULL DEFAULT 0;`,
          `ALTER TABLE lessons ADD COLUMN parent_lesson_id TEXT DEFAULT NULL REFERENCES lessons(id);`,
          `ALTER TABLE lessons ADD COLUMN part_number INTEGER DEFAULT NULL;`,
          `ALTER TABLE lessons ADD COLUMN content_hash TEXT DEFAULT NULL;`,
          `ALTER TABLE lessons ADD COLUMN fingerprint_signature TEXT DEFAULT NULL;`
        ]
        for (const sql of alters) {
          try {
            this.db!.exec(sql)
          } catch {
            // Ignored if column already exists
          }
        }

        try {
          this.db!.exec(`CREATE INDEX IF NOT EXISTS idx_courses_merged_into ON courses(merged_into_course_id);`)
          this.db!.exec(`CREATE INDEX IF NOT EXISTS idx_lessons_content_hash ON lessons(content_hash);`)
          this.db!.exec(`CREATE INDEX IF NOT EXISTS idx_lessons_parent ON lessons(parent_lesson_id);`)
          this.db!.exec(`CREATE INDEX IF NOT EXISTS idx_modules_parent ON modules(parent_module_id);`)
        } catch {
          // Ignored
        }

        this.db!.prepare(`INSERT INTO _migrations (id, applied_at) VALUES (?, ?)`).run(orgMigrationId, Date.now())
      })()
    }

    const v03MigrationId = '003_v03_review_and_portability'
    const v03MigrationApplied = this.db.prepare(`SELECT id FROM _migrations WHERE id = ?`).get(v03MigrationId)

    if (!v03MigrationApplied) {
      this.db.transaction(() => {
        this.db!.exec(`
          CREATE TABLE IF NOT EXISTS video_bookmarks (
            id TEXT PRIMARY KEY,
            course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
            timestamp REAL NOT NULL,
            title TEXT,
            color TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_bookmarks_course ON video_bookmarks(course_id);
          CREATE INDEX IF NOT EXISTS idx_bookmarks_lesson ON video_bookmarks(lesson_id);

          CREATE TABLE IF NOT EXISTS flashcards (
            id TEXT PRIMARY KEY,
            course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
            module_id TEXT REFERENCES modules(id) ON DELETE CASCADE,
            lesson_id TEXT REFERENCES lessons(id) ON DELETE CASCADE,
            timestamp REAL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            state TEXT NOT NULL DEFAULT 'NEW',
            due_at INTEGER,
            interval_days INTEGER NOT NULL DEFAULT 0,
            success_count INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_flashcards_course ON flashcards(course_id);
          CREATE INDEX IF NOT EXISTS idx_flashcards_lesson ON flashcards(lesson_id);
          CREATE INDEX IF NOT EXISTS idx_flashcards_due ON flashcards(due_at);

          CREATE TABLE IF NOT EXISTS study_queue (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            order_index INTEGER NOT NULL,
            created_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_study_queue_order ON study_queue(order_index);

          CREATE TABLE IF NOT EXISTS course_goals (
            course_id TEXT PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
            target_date INTEGER,
            daily_minutes INTEGER,
            weekly_lessons INTEGER,
            updated_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS study_sessions (
            id TEXT PRIMARY KEY,
            course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
            started_at INTEGER NOT NULL,
            ended_at INTEGER,
            duration INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'player'
          );
          CREATE INDEX IF NOT EXISTS idx_study_sessions_started ON study_sessions(started_at);
        `)

        this.db!.prepare(`INSERT INTO _migrations (id, applied_at) VALUES (?, ?)`).run(v03MigrationId, Date.now())
      })()
    }

    const v05MigrationId = '005_v05_library_studio'
    const v05MigrationApplied = this.db.prepare(`SELECT id FROM _migrations WHERE id = ?`).get(v05MigrationId)

    if (!v05MigrationApplied) {
      this.db.transaction(() => {
        this.db!.exec(`
          CREATE TABLE IF NOT EXISTS library_appearances (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL CHECK(entity_type IN ('course', 'module', 'section', 'lesson', 'resource')),
            entity_id TEXT NOT NULL,
            root_course_id TEXT NOT NULL,
            parent_appearance_id TEXT REFERENCES library_appearances(id) ON DELETE CASCADE,
            section_id TEXT,
            custom_title TEXT,
            display_order INTEGER NOT NULL DEFAULT 0,
            is_reference INTEGER NOT NULL DEFAULT 0,
            is_hidden INTEGER NOT NULL DEFAULT 0,
            tags TEXT NOT NULL DEFAULT '[]',
            custom_metadata TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_appearances_root ON library_appearances(root_course_id);
          CREATE INDEX IF NOT EXISTS idx_appearances_parent ON library_appearances(parent_appearance_id);
          CREATE INDEX IF NOT EXISTS idx_appearances_entity ON library_appearances(entity_id);
          CREATE INDEX IF NOT EXISTS idx_appearances_hidden ON library_appearances(is_hidden);

          CREATE TABLE IF NOT EXISTS library_sections (
            id TEXT PRIMARY KEY,
            course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            module_id TEXT REFERENCES modules(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            display_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_sections_course ON library_sections(course_id);

          CREATE TABLE IF NOT EXISTS collections (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            color TEXT,
            icon TEXT,
            created_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS collection_items (
            collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
            appearance_id TEXT NOT NULL REFERENCES library_appearances(id) ON DELETE CASCADE,
            order_index INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (collection_id, appearance_id)
          );

          CREATE TABLE IF NOT EXISTS custom_field_definitions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            field_type TEXT NOT NULL CHECK(field_type IN ('text', 'number', 'date', 'boolean', 'select', 'rating', 'color', 'tag', 'url')),
            options TEXT,
            created_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS custom_field_values (
            entity_id TEXT NOT NULL,
            field_id TEXT NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
            value TEXT NOT NULL,
            PRIMARY KEY (entity_id, field_id)
          );
          CREATE INDEX IF NOT EXISTS idx_custom_values_entity ON custom_field_values(entity_id);

          CREATE TABLE IF NOT EXISTS automation_rules (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            priority INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            execution_mode TEXT NOT NULL CHECK(execution_mode IN ('automatic', 'manual')),
            trigger_event TEXT NOT NULL,
            conditions_json TEXT NOT NULL,
            actions_json TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS studio_history (
            id TEXT PRIMARY KEY,
            action_type TEXT NOT NULL,
            description TEXT NOT NULL,
            diff_payload TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            is_undone INTEGER NOT NULL DEFAULT 0
          );
          CREATE INDEX IF NOT EXISTS idx_studio_history_time ON studio_history(timestamp DESC);
        `)

        const alters = [
          `ALTER TABLE courses ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;`,
          `ALTER TABLE modules ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;`,
          `ALTER TABLE lessons ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;`,
          `ALTER TABLE content_resources ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;`
        ]
        for (const sql of alters) {
          try {
            this.db!.exec(sql)
          } catch {
            // Ignored if column already exists
          }
        }

        this.backfillLibraryAppearances()

        this.db!.prepare(`INSERT INTO _migrations (id, applied_at) VALUES (?, ?)`).run(v05MigrationId, Date.now())
      })()
    }

    // 7. Migration 006: Discovery, Course Relationships & Feedback (v0.6)
    const v06MigrationId = '006_v06_discovery'
    const hasApplied006 = this.db.prepare(`SELECT 1 FROM _migrations WHERE id = ?`).get(v06MigrationId)

    if (!hasApplied006) {
      this.db.transaction(() => {
        this.db!.exec(`
          CREATE TABLE IF NOT EXISTS course_relationships (
            id                TEXT PRIMARY KEY,
            source_course_id  TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            target_course_id  TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            relationship_type TEXT NOT NULL CHECK(relationship_type IN ('prerequisite', 'sequel', 'same_journey', 'related')),
            display_order     INTEGER NOT NULL DEFAULT 0,
            created_at        INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_course_rel_source ON course_relationships(source_course_id);
          CREATE INDEX IF NOT EXISTS idx_course_rel_target ON course_relationships(target_course_id);

          CREATE TABLE IF NOT EXISTS recommendation_feedback (
            profile_id    TEXT NOT NULL,
            course_id     TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            feedback_type TEXT NOT NULL CHECK(feedback_type IN ('like', 'dislike', 'not_interested', 'show_less', 'show_more')),
            updated_at    INTEGER NOT NULL,
            PRIMARY KEY (profile_id, course_id)
          );
          CREATE INDEX IF NOT EXISTS idx_feedback_profile ON recommendation_feedback(profile_id);

          CREATE TABLE IF NOT EXISTS recommendation_exposures (
            profile_id      TEXT NOT NULL,
            course_id       TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            last_exposed_at INTEGER NOT NULL,
            exposure_count  INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY (profile_id, course_id)
          );
          CREATE INDEX IF NOT EXISTS idx_exposures_profile ON recommendation_exposures(profile_id, last_exposed_at DESC);

          CREATE INDEX IF NOT EXISTS idx_lesson_progress_updated ON lesson_progress(updated_at DESC);
          CREATE INDEX IF NOT EXISTS idx_courses_created_at ON courses(created_at DESC);
        `)

        this.db!.prepare(`INSERT INTO _migrations (id, applied_at) VALUES (?, ?)`).run(v06MigrationId, Date.now())
      })()
    }

    const v08MigrationId = '007_v08_connected_library'
    const hasApplied008 = this.db.prepare(`SELECT 1 FROM _migrations WHERE id = ?`).get(v08MigrationId)

    if (!hasApplied008) {
      const sourceTableNames = new Set([
        'content_sources',
        'source_roots',
        'source_items',
        'canonical_source_links',
        'source_match_candidates',
        'offline_assets',
        'source_sync_runs'
      ])
      const userDataTables = (this.db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_migrations'
        ORDER BY name
      `).all() as Array<{ name: string }>).filter(({ name }) => !sourceTableNames.has(name))
      const quoteIdentifier = (name: string): string => `"${name.replaceAll('"', '""')}"`
      const hashUserDataRows = (database: Database.Database): string => {
        const hash = crypto.createHash('sha256')

        for (const { name } of userDataTables) {
          const table = quoteIdentifier(name)
          const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
          const columnNames = columns.map((column) => column.name)
          const orderBy = columnNames.map(quoteIdentifier).join(', ')
          hash.update(`${JSON.stringify([name, columnNames])}\n`)

          const rows = database.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).iterate() as Iterable<Record<string, unknown>>
          for (const row of rows) {
            const values = columnNames.map((columnName) => {
              const value = row[columnName]
              if (Buffer.isBuffer(value)) return { type: 'blob', value: value.toString('base64') }
              if (value === null) return { type: 'null' }
              return { type: typeof value, value }
            })
            hash.update(`${JSON.stringify(values)}\n`)
          }
        }

        return hash.digest('hex')
      }
      const hasUserData = userDataTables.some(({ name }) => {
        const row = this.db!.prepare(`SELECT 1 AS present FROM ${quoteIdentifier(name)} LIMIT 1`).get()
        return row !== undefined
      })

      if (hasUserData) {
        const dbPath = this.db.name
        const backupPath = `${dbPath}.v0.8.bak`
        const expectedBackupHash = hashUserDataRows(this.db)
        let temporaryBackupPath: string | null = null
        let backupDb: Database.Database | null = null

        try {
          const checkpointRows = this.db.pragma('wal_checkpoint(FULL)') as Array<{
            busy: number
            log: number
            checkpointed: number
          }>
          const checkpoint = checkpointRows[0]
          if (!checkpoint || checkpoint.busy !== 0 || checkpoint.checkpointed !== checkpoint.log) {
            throw new Error(`WAL checkpoint incomplete: ${JSON.stringify(checkpoint ?? null)}`)
          }

          const backupExists = fs.existsSync(backupPath)
          if (!backupExists) {
            temporaryBackupPath = `${backupPath}.${crypto.randomUUID()}.tmp`
            const quotedBackupPath = this.db.prepare(`SELECT quote(?) AS value`).get(temporaryBackupPath) as { value: string }
            this.db.exec(`VACUUM INTO ${quotedBackupPath.value}`)
          }

          backupDb = new Database(temporaryBackupPath ?? backupPath, { readonly: true, fileMustExist: true })
          if (backupDb.pragma('integrity_check', { simple: true }) !== 'ok') {
            throw new Error('Backup integrity check failed')
          }
          if (backupDb.prepare(`PRAGMA foreign_key_check`).all().length > 0) {
            throw new Error('Backup foreign-key check failed')
          }
          if (hashUserDataRows(backupDb) !== expectedBackupHash) {
            throw new Error('Backup row validation failed')
          }

          backupDb.close()
          backupDb = null
          if (temporaryBackupPath) {
            if (fs.existsSync(backupPath)) {
              throw new Error('Backup appeared before snapshot publication')
            }
            fs.renameSync(temporaryBackupPath, backupPath)
            temporaryBackupPath = null
          }
        } catch (error) {
          throw new Error(`Failed to validate v0.8 migration backup: ${String(error)}`)
        } finally {
          backupDb?.close()
          if (temporaryBackupPath && fs.existsSync(temporaryBackupPath)) {
            fs.rmSync(temporaryBackupPath, { force: true })
          }
        }
      }

      this.db.transaction(() => {
        this.db!.exec(`
          CREATE TABLE content_sources (
            id                 TEXT PRIMARY KEY,
            provider           TEXT NOT NULL CHECK(provider IN ('local-folder', 'removable', 'google-drive', 'managed-offline')),
            display_name       TEXT NOT NULL,
            account_identity   TEXT,
            legacy_source_type TEXT,
            legacy_config_json TEXT,
            preference_weight  REAL NOT NULL DEFAULT 0,
            availability       TEXT NOT NULL CHECK(availability IN ('available', 'offline', 'disconnected', 'auth-required', 'missing', 'syncing', 'error', 'relink-required')),
            created_at         INTEGER NOT NULL,
            updated_at         INTEGER NOT NULL
          );

          CREATE TABLE source_roots (
            id                     TEXT PRIMARY KEY,
            source_id              TEXT NOT NULL REFERENCES content_sources(id) ON DELETE CASCADE,
            provider_root_identity TEXT NOT NULL,
            display_name           TEXT NOT NULL,
            local_path             TEXT,
            stable_device_id       TEXT,
            mount_hint             TEXT,
            relative_base          TEXT,
            sync_cursor            TEXT,
            sync_corpus_json       TEXT,
            availability           TEXT NOT NULL CHECK(availability IN ('available', 'offline', 'disconnected', 'auth-required', 'missing', 'syncing', 'error', 'relink-required')),
            last_synced_at         INTEGER,
            last_verified_at       INTEGER,
            provider_config_json   TEXT,
            created_at             INTEGER NOT NULL,
            updated_at             INTEGER NOT NULL,
            UNIQUE(id, source_id),
            UNIQUE(source_id, provider_root_identity)
          );

          CREATE TABLE source_items (
            id                      TEXT PRIMARY KEY,
            source_id               TEXT NOT NULL REFERENCES content_sources(id) ON DELETE CASCADE,
            source_root_id          TEXT NOT NULL,
            provider                TEXT NOT NULL CHECK(provider IN ('local-folder', 'removable', 'google-drive', 'managed-offline')),
            provider_item_identity  TEXT NOT NULL,
            parent_provider_identity TEXT,
            name                    TEXT NOT NULL,
            relative_path           TEXT NOT NULL,
            locator_json            TEXT NOT NULL,
            mime_type               TEXT,
            size                    INTEGER CHECK(size IS NULL OR size >= 0),
            duration                REAL CHECK(duration IS NULL OR duration >= 0),
            width                   INTEGER CHECK(width IS NULL OR width > 0),
            height                  INTEGER CHECK(height IS NULL OR height > 0),
            technical_metadata_json TEXT,
            revision                TEXT,
            fingerprint             TEXT,
            checksum                TEXT,
            availability            TEXT NOT NULL CHECK(availability IN ('available', 'offline', 'disconnected', 'auth-required', 'missing', 'syncing', 'error', 'relink-required')),
            created_at              INTEGER NOT NULL,
            updated_at              INTEGER NOT NULL,
            FOREIGN KEY(source_root_id, source_id) REFERENCES source_roots(id, source_id) ON DELETE CASCADE,
            UNIQUE(source_id, provider_item_identity)
          );

          CREATE TABLE canonical_source_links (
            id             TEXT PRIMARY KEY,
            lesson_id      TEXT REFERENCES lessons(id) ON DELETE CASCADE,
            resource_id    TEXT REFERENCES content_resources(id) ON DELETE CASCADE,
            source_item_id TEXT NOT NULL REFERENCES source_items(id) ON DELETE CASCADE,
            is_manual      INTEGER NOT NULL DEFAULT 0 CHECK(is_manual IN (0, 1)),
            is_preferred   INTEGER NOT NULL DEFAULT 0 CHECK(is_preferred IN (0, 1)),
            created_at     INTEGER NOT NULL,
            updated_at     INTEGER NOT NULL,
            CHECK((lesson_id IS NOT NULL AND resource_id IS NULL) OR (lesson_id IS NULL AND resource_id IS NOT NULL))
          );

          CREATE TABLE source_match_candidates (
            id             TEXT PRIMARY KEY,
            lesson_id      TEXT REFERENCES lessons(id) ON DELETE CASCADE,
            resource_id    TEXT REFERENCES content_resources(id) ON DELETE CASCADE,
            source_item_id TEXT NOT NULL REFERENCES source_items(id) ON DELETE CASCADE,
            confidence     REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
            evidence_json  TEXT NOT NULL DEFAULT '{}',
            review_status  TEXT NOT NULL CHECK(review_status IN ('pending', 'accepted', 'rejected')),
            decided_at     INTEGER,
            created_at     INTEGER NOT NULL,
            updated_at     INTEGER NOT NULL,
            CHECK((lesson_id IS NOT NULL AND resource_id IS NULL) OR (lesson_id IS NULL AND resource_id IS NOT NULL))
          );

          CREATE TABLE offline_assets (
            id                      TEXT PRIMARY KEY,
            source_item_id          TEXT NOT NULL REFERENCES source_items(id) ON DELETE CASCADE,
            original_source_item_id TEXT REFERENCES source_items(id) ON DELETE SET NULL,
            cache_id                TEXT,
            asset_id                TEXT,
            vault_relative_path     TEXT NOT NULL,
            availability            TEXT NOT NULL DEFAULT 'offline' CHECK(availability IN ('available', 'offline', 'disconnected', 'auth-required', 'missing', 'syncing', 'error', 'relink-required')),
            size                    INTEGER CHECK(size IS NULL OR size >= 0),
            checksum                TEXT,
            state                   TEXT NOT NULL CHECK(state IN ('pending', 'valid', 'invalid')),
            is_pinned               INTEGER NOT NULL DEFAULT 0 CHECK(is_pinned IN (0, 1)),
            policy_reason           TEXT,
            codec                   TEXT,
            width                   INTEGER CHECK(width IS NULL OR width > 0),
            height                  INTEGER CHECK(height IS NULL OR height > 0),
            optimizer_profile_json  TEXT,
            last_validated_at       INTEGER,
            last_accessed_at        INTEGER,
            created_at              INTEGER NOT NULL,
            updated_at              INTEGER NOT NULL
          );

          CREATE TABLE source_sync_runs (
            id              TEXT PRIMARY KEY,
            source_id       TEXT NOT NULL REFERENCES content_sources(id) ON DELETE CASCADE,
            source_root_id  TEXT NOT NULL,
            trigger         TEXT NOT NULL,
            status          TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed', 'cancelled')),
            cursor_before   TEXT,
            cursor_after    TEXT,
            scanned_items   INTEGER NOT NULL DEFAULT 0,
            changed_items   INTEGER NOT NULL DEFAULT 0,
            error_message   TEXT,
            started_at      INTEGER NOT NULL,
            finished_at     INTEGER,
            FOREIGN KEY(source_root_id, source_id) REFERENCES source_roots(id, source_id) ON DELETE CASCADE
          );

          CREATE INDEX idx_source_roots_source ON source_roots(source_id);
          CREATE INDEX idx_source_items_identity ON source_items(source_id, provider_item_identity);
          CREATE INDEX idx_source_items_availability ON source_items(source_id, availability);
          CREATE INDEX idx_canonical_source_links_lesson ON canonical_source_links(lesson_id);
          CREATE INDEX idx_canonical_source_links_resource ON canonical_source_links(resource_id);
          CREATE INDEX idx_source_match_candidates_pending ON source_match_candidates(review_status, source_item_id);
          CREATE INDEX idx_offline_assets_state ON offline_assets(state, is_pinned);
          CREATE INDEX idx_source_sync_runs_history ON source_sync_runs(source_root_id, started_at DESC);
        `)

        this.backfillLegacySourceLinks()

        const expectedItems = this.db!.prepare(`
          SELECT
            (SELECT count(*) FROM lessons) + (SELECT count(*) FROM content_resources) AS count
        `).get() as { count: number }
        const sourceItems = this.db!.prepare(`SELECT count(*) AS count FROM source_items`).get() as { count: number }
        const sourceLinks = this.db!.prepare(`SELECT count(*) AS count FROM canonical_source_links`).get() as { count: number }
        const foreignKeyIssues = this.db!.prepare(`PRAGMA foreign_key_check`).all()

        if (sourceItems.count !== expectedItems.count || sourceLinks.count !== expectedItems.count || foreignKeyIssues.length > 0) {
          throw new Error('Connected-library migration validation failed')
        }

        this.db!.prepare(`INSERT INTO _migrations (id, applied_at) VALUES (?, ?)`).run(v08MigrationId, Date.now())
      })()
    }

    const userVersion = this.db.pragma('user_version', { simple: true }) as number

    if (userVersion < 1) {
      this.db.pragma('user_version = 1')
    }
  }

  private backfillLegacySourceLinks(): void {
    if (!this.db) throw new Error('Database is not connected to any vault.')

    const localAvailability = (localPath: string): 'available' | 'missing' | 'relink-required' => {
      if (localPath === '') return 'relink-required'
      return fs.existsSync(localPath) ? 'available' : 'missing'
    }
    const safeRelativePath = (rootPath: string, itemPath: string, untrustedName: string): string => {
      const fallback = path.win32.basename(path.posix.basename(untrustedName)).replaceAll('..', '') || 'unnamed'
      const pathApi = path.win32.isAbsolute(rootPath) && path.win32.isAbsolute(itemPath)
        ? path.win32
        : path.posix.isAbsolute(rootPath) && path.posix.isAbsolute(itemPath)
          ? path.posix
          : null

      if (!pathApi) return fallback
      const relative = pathApi.relative(pathApi.resolve(rootPath), pathApi.resolve(itemPath))
      if (relative === '' || relative === '..' || relative.startsWith(`..${pathApi.sep}`) || pathApi.isAbsolute(relative)) {
        return fallback
      }
      return relative.split(pathApi.sep).join('/')
    }

    const courses = this.db.prepare(`
      SELECT id, title, source_type, root_path, created_at, updated_at
      FROM courses
      ORDER BY id
    `).all() as Array<{
      id: string
      title: string
      source_type: string
      root_path: string
      created_at: number
      updated_at: number
    }>
    const insertSource = this.db.prepare(`
      INSERT INTO content_sources (
        id, provider, display_name, account_identity, legacy_source_type, legacy_config_json,
        availability, created_at, updated_at
      ) VALUES (?, 'local-folder', ?, NULL, ?, ?, ?, ?, ?)
    `)
    const insertRoot = this.db.prepare(`
      INSERT INTO source_roots (
        id, source_id, provider_root_identity, display_name, local_path, sync_cursor,
        availability, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)
    `)
    const insertItem = this.db.prepare(`
      INSERT INTO source_items (
        id, source_id, source_root_id, provider, provider_item_identity, parent_provider_identity,
        name, relative_path, locator_json, mime_type, size, duration, width, height,
        technical_metadata_json, revision, fingerprint, checksum, availability, created_at, updated_at
      ) VALUES (?, ?, ?, 'local-folder', ?, NULL, ?, ?, ?, NULL, ?, ?, NULL, NULL, ?, NULL, ?, ?, ?, ?, ?)
    `)
    const insertLink = this.db.prepare(`
      INSERT INTO canonical_source_links (
        id, lesson_id, resource_id, source_item_id, is_manual, is_preferred, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, 1, ?, ?)
    `)

    for (const course of courses) {
      const sourceId = `legacy-source:${course.id}`
      const rootId = `legacy-root:${course.id}`
      const rootAvailability = localAvailability(course.root_path)

      insertSource.run(
        sourceId,
        course.title,
        course.source_type,
        JSON.stringify({ sourceType: course.source_type }),
        rootAvailability,
        course.created_at,
        course.updated_at
      )
      insertRoot.run(
        rootId,
        sourceId,
        rootId,
        course.title,
        course.root_path,
        rootAvailability,
        course.created_at,
        course.updated_at
      )

      const lessons = this.db.prepare(`
        SELECT id, title, file_path, file_name, duration, file_size, content_hash, fingerprint_signature, created_at
        FROM lessons
        WHERE course_id = ?
        ORDER BY id
      `).all(course.id) as Array<{
        id: string
        title: string
        file_path: string
        file_name: string
        duration: number
        file_size: number
        content_hash: string | null
        fingerprint_signature: string | null
        created_at: number
      }>

      for (const lesson of lessons) {
        const itemId = `legacy-lesson:${lesson.id}`
        insertItem.run(
          itemId,
          sourceId,
          rootId,
          itemId,
          lesson.file_name || lesson.title,
          safeRelativePath(course.root_path, lesson.file_path, lesson.file_name || lesson.title),
          JSON.stringify({ provider: 'local-folder', path: lesson.file_path }),
          lesson.file_size,
          lesson.duration,
          JSON.stringify({ duration: lesson.duration }),
          lesson.fingerprint_signature,
          lesson.content_hash,
          localAvailability(lesson.file_path),
          lesson.created_at,
          lesson.created_at
        )
        insertLink.run(
          `legacy-link-lesson:${lesson.id}`,
          lesson.id,
          null,
          itemId,
          lesson.created_at,
          lesson.created_at
        )
      }

      const resources = this.db.prepare(`
        SELECT id, name, file_path, file_size, created_at
        FROM content_resources
        WHERE course_id = ?
        ORDER BY id
      `).all(course.id) as Array<{
        id: string
        name: string
        file_path: string
        file_size: number
        created_at: number
      }>

      for (const resource of resources) {
        const itemId = `legacy-resource:${resource.id}`
        insertItem.run(
          itemId,
          sourceId,
          rootId,
          itemId,
          resource.name,
          safeRelativePath(course.root_path, resource.file_path, resource.name),
          JSON.stringify({ provider: 'local-folder', path: resource.file_path }),
          resource.file_size,
          null,
          JSON.stringify({ size: resource.file_size }),
          null,
          null,
          localAvailability(resource.file_path),
          resource.created_at,
          resource.created_at
        )
        insertLink.run(
          `legacy-link-resource:${resource.id}`,
          null,
          resource.id,
          itemId,
          resource.created_at,
          resource.created_at
        )
      }
    }
  }

  private backfillLibraryAppearances(): void {
    if (!this.db) return

    const now = Date.now()
    const courses = this.db.prepare(`SELECT id, custom_title, is_hidden FROM courses`).all() as { id: string; custom_title?: string; is_hidden?: number }[]
    const insertApp = this.db.prepare(`
      INSERT OR IGNORE INTO library_appearances (
        id, entity_type, entity_id, root_course_id, parent_appearance_id, section_id,
        custom_title, display_order, is_reference, is_hidden, tags, custom_metadata, created_at, updated_at
      ) VALUES (
        @id, @entityType, @entityId, @rootCourseId, @parentAppearanceId, @sectionId,
        @customTitle, @displayOrder, @isReference, @isHidden, @tags, @customMetadata, @createdAt, @updatedAt
      )
    `)

    for (const c of courses) {
      const courseAppId = `app_course_${c.id}`
      insertApp.run({
        id: courseAppId,
        entityType: 'course',
        entityId: c.id,
        rootCourseId: c.id,
        parentAppearanceId: null,
        sectionId: null,
        customTitle: c.custom_title || null,
        displayOrder: 0,
        isReference: 0,
        isHidden: c.is_hidden || 0,
        tags: '[]',
        customMetadata: '{}',
        createdAt: now,
        updatedAt: now
      })

      const modules = this.db.prepare(`
        SELECT id, course_id, custom_title, display_order, is_hidden
        FROM modules
        WHERE course_id = ?
        ORDER BY display_order ASC
      `).all(c.id) as { id: string; course_id: string; custom_title?: string; display_order: number; is_hidden?: number }[]

      for (const m of modules) {
        const modAppId = `app_mod_${m.id}`
        insertApp.run({
          id: modAppId,
          entityType: 'module',
          entityId: m.id,
          rootCourseId: c.id,
          parentAppearanceId: courseAppId,
          sectionId: null,
          customTitle: m.custom_title || null,
          displayOrder: m.display_order,
          isReference: 0,
          isHidden: m.is_hidden || 0,
          tags: '[]',
          customMetadata: '{}',
          createdAt: now,
          updatedAt: now
        })

        const lessons = this.db.prepare(`
          SELECT id, module_id, course_id, custom_title, display_order, is_hidden
          FROM lessons
          WHERE module_id = ?
          ORDER BY display_order ASC
        `).all(m.id) as { id: string; module_id: string; course_id: string; custom_title?: string; display_order: number; is_hidden?: number }[]

        for (const l of lessons) {
          const lesAppId = `app_les_${l.id}`
          insertApp.run({
            id: lesAppId,
            entityType: 'lesson',
            entityId: l.id,
            rootCourseId: c.id,
            parentAppearanceId: modAppId,
            sectionId: null,
            customTitle: l.custom_title || null,
            displayOrder: l.display_order,
            isReference: 0,
            isHidden: l.is_hidden || 0,
            tags: '[]',
            customMetadata: '{}',
            createdAt: now,
            updatedAt: now
          })
        }
      }
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
        lesson_count, is_favorite, merged_into_course_id, merge_metadata,
        created_at, updated_at, last_accessed_at
      ) VALUES (
        @id, @title, @customTitle, @slug, @sourceType, @rootPath, @isExternal,
        @coverPath, @description, @totalDuration, @moduleCount,
        @lessonCount, @isFavorite, @mergedIntoCourseId, @mergeMetadata,
        @createdAt, @updatedAt, @lastAccessedAt
      )
    `)

    const insertModule = this.db!.prepare(`
      INSERT INTO modules (
        id, course_id, title, custom_title, order_index, display_order,
        has_manual_order, is_auxiliary, parent_module_id, folder_path,
        duration, lesson_count, created_at
      ) VALUES (
        @id, @courseId, @title, @customTitle, @orderIndex, @displayOrder,
        @hasManualOrder, @isAuxiliary, @parentModuleId, @folderPath,
        @duration, @lessonCount, @createdAt
      )
    `)

    const insertLesson = this.db!.prepare(`
      INSERT INTO lessons (
        id, module_id, course_id, title, custom_title, order_index, display_order,
        has_manual_order, is_multipart, parent_lesson_id, part_number,
        content_hash, fingerprint_signature, is_favorite,
        file_path, file_name, file_extension, media_type,
        duration, file_size, availability, cover_path, created_at
      ) VALUES (
        @id, @moduleId, @courseId, @title, @customTitle, @orderIndex, @displayOrder,
        @hasManualOrder, @isMultipart, @parentLessonId, @partNumber,
        @contentHash, @fingerprintSignature, @isFavorite,
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
        mergedIntoCourseId: course.mergedIntoCourseId || null,
        mergeMetadata: course.mergeMetadata || null,
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
          hasManualOrder: mod.hasManualOrder ? 1 : 0,
          isAuxiliary: mod.isAuxiliary ? 1 : 0,
          parentModuleId: mod.parentModuleId || null,
          folderPath: mod.folderPath || null,
          duration: mod.duration,
          lessonCount: mod.lessons.length,
          createdAt: mod.createdAt || Date.now()
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
            hasManualOrder: lesson.hasManualOrder ? 1 : 0,
            isMultipart: lesson.isMultipart ? 1 : 0,
            parentLessonId: lesson.parentLessonId || null,
            partNumber: lesson.partNumber || null,
            contentHash: lesson.contentHash || null,
            fingerprintSignature: lesson.fingerprintSignature || null,
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
        merged_into_course_id as mergedIntoCourseId,
        merge_metadata as mergeMetadata,
        created_at as createdAt, updated_at as updatedAt, last_accessed_at as lastAccessedAt
      FROM courses
      WHERE merged_into_course_id IS NULL
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
        id, title, custom_title as customTitle, slug, source_type as sourceType, root_path as rootPath,
        cover_path as coverPath, description, total_duration as totalDuration,
        module_count as moduleCount, lesson_count as lessonCount,
        is_favorite as isFavorite,
        merged_into_course_id as mergedIntoCourseId,
        merge_metadata as mergeMetadata,
        created_at as createdAt, updated_at as updatedAt, last_accessed_at as lastAccessedAt
      FROM courses
      WHERE id = ?
    `)
    const course = courseStmt.get(courseId) as (Omit<Course, 'isFavorite'> & { isFavorite: number }) | undefined
    if (!course) return null

    const modulesStmt = this.db!.prepare(`
      SELECT
        id, course_id as courseId, title, custom_title as customTitle, order_index as orderIndex,
        display_order as displayOrder, has_manual_order as hasManualOrder,
        is_auxiliary as isAuxiliary, parent_module_id as parentModuleId,
        folder_path as folderPath, duration, lesson_count as lessonCount,
        created_at as createdAt
      FROM modules
      WHERE course_id = ?
      ORDER BY display_order ASC, order_index ASC
    `)
    const modules = modulesStmt.all(courseId) as (Omit<Module, 'hasManualOrder' | 'isAuxiliary'> & {
      hasManualOrder: number
      isAuxiliary: number
    })[]

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

    const modulesWithLessons: (Module & { lessons: Lesson[] })[] = modules.map((mod) => {
      const resources = resourcesByModule.get(mod.id) || []
      return {
        ...mod,
        hasManualOrder: Boolean(mod.hasManualOrder),
        isAuxiliary: Boolean(mod.isAuxiliary),
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

  // --- Video Bookmarks Operations (v0.3) ---

  public createBookmark(bookmark: {
    id?: string
    courseId: string
    lessonId: string
    timestamp: number
    title?: string
    color?: string
  }): VideoBookmark {
    this.ensureConnected()
    const now = Date.now()
    const id = bookmark.id || crypto.randomUUID()
    const title = bookmark.title?.trim() || `Bookmark ${Math.floor(bookmark.timestamp)}s`
    const color = bookmark.color || '#f59e0b'

    this.db!.prepare(`
      INSERT INTO video_bookmarks (id, course_id, lesson_id, timestamp, title, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, bookmark.courseId, bookmark.lessonId, bookmark.timestamp, title, color, now, now)

    return {
      id,
      courseId: bookmark.courseId,
      lessonId: bookmark.lessonId,
      timestamp: bookmark.timestamp,
      title,
      color,
      createdAt: now,
      updatedAt: now
    }
  }

  public updateBookmark(id: string, updates: { title?: string; color?: string; timestamp?: number }): boolean {
    this.ensureConnected()
    const now = Date.now()
    const fields: string[] = []
    const params: unknown[] = []

    if (updates.title !== undefined) {
      fields.push('title = ?')
      params.push(updates.title.trim())
    }
    if (updates.color !== undefined) {
      fields.push('color = ?')
      params.push(updates.color)
    }
    if (updates.timestamp !== undefined) {
      fields.push('timestamp = ?')
      params.push(updates.timestamp)
    }

    if (fields.length === 0) return true
    fields.push('updated_at = ?')
    params.push(now)
    params.push(id)

    const res = this.db!.prepare(`UPDATE video_bookmarks SET ${fields.join(', ')} WHERE id = ?`).run(...params)
    return res.changes > 0
  }

  public deleteBookmark(id: string): boolean {
    this.ensureConnected()
    const res = this.db!.prepare(`DELETE FROM video_bookmarks WHERE id = ?`).run(id)
    return res.changes > 0
  }

  public getBookmarksByLesson(lessonId: string): VideoBookmark[] {
    this.ensureConnected()
    const rows = this.db!.prepare(`
      SELECT b.id, b.course_id as courseId, b.lesson_id as lessonId, b.timestamp, b.title, b.color,
             b.created_at as createdAt, b.updated_at as updatedAt,
             c.title as courseTitle, l.title as lessonTitle
      FROM video_bookmarks b
      LEFT JOIN courses c ON b.course_id = c.id
      LEFT JOIN lessons l ON b.lesson_id = l.id
      WHERE b.lesson_id = ?
      ORDER BY b.timestamp ASC
    `).all(lessonId) as VideoBookmark[]
    return rows
  }

  public getBookmarksByCourse(courseId: string): VideoBookmark[] {
    this.ensureConnected()
    const rows = this.db!.prepare(`
      SELECT b.id, b.course_id as courseId, b.lesson_id as lessonId, b.timestamp, b.title, b.color,
             b.created_at as createdAt, b.updated_at as updatedAt,
             c.title as courseTitle, l.title as lessonTitle
      FROM video_bookmarks b
      LEFT JOIN courses c ON b.course_id = c.id
      LEFT JOIN lessons l ON b.lesson_id = l.id
      WHERE b.course_id = ?
      ORDER BY b.created_at DESC
    `).all(courseId) as VideoBookmark[]
    return rows
  }

  public getRecentBookmarks(limit = 30): VideoBookmark[] {
    this.ensureConnected()
    const rows = this.db!.prepare(`
      SELECT b.id, b.course_id as courseId, b.lesson_id as lessonId, b.timestamp, b.title, b.color,
             b.created_at as createdAt, b.updated_at as updatedAt,
             c.title as courseTitle, l.title as lessonTitle
      FROM video_bookmarks b
      LEFT JOIN courses c ON b.course_id = c.id
      LEFT JOIN lessons l ON b.lesson_id = l.id
      ORDER BY b.created_at DESC
      LIMIT ?
    `).all(limit) as VideoBookmark[]
    return rows
  }

  // --- Flashcards Operations (v0.3) ---

  public createFlashcard(card: {
    id?: string
    courseId?: string
    moduleId?: string
    lessonId?: string
    timestamp?: number
    question: string
    answer: string
    state?: FlashcardState
    dueAt?: number
  }): Flashcard {
    this.ensureConnected()
    const now = Date.now()
    const id = card.id || crypto.randomUUID()
    const state: FlashcardState = card.state || 'NEW'
    const dueAt = card.dueAt || now

    this.db!.prepare(`
      INSERT INTO flashcards (
        id, course_id, module_id, lesson_id, timestamp, question, answer,
        state, due_at, interval_days, success_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      card.courseId || null,
      card.moduleId || null,
      card.lessonId || null,
      card.timestamp ?? null,
      card.question.trim(),
      card.answer.trim(),
      state,
      dueAt,
      0,
      0,
      now,
      now
    )

    return {
      id,
      courseId: card.courseId,
      moduleId: card.moduleId,
      lessonId: card.lessonId,
      timestamp: card.timestamp,
      question: card.question.trim(),
      answer: card.answer.trim(),
      state,
      dueAt,
      intervalDays: 0,
      successCount: 0,
      createdAt: now,
      updatedAt: now
    }
  }

  public updateFlashcard(id: string, updates: Partial<Flashcard>): boolean {
    this.ensureConnected()
    const now = Date.now()
    const fields: string[] = []
    const params: unknown[] = []

    if (updates.question !== undefined) {
      fields.push('question = ?')
      params.push(updates.question.trim())
    }
    if (updates.answer !== undefined) {
      fields.push('answer = ?')
      params.push(updates.answer.trim())
    }
    if (updates.state !== undefined) {
      fields.push('state = ?')
      params.push(updates.state)
    }
    if (updates.dueAt !== undefined) {
      fields.push('due_at = ?')
      params.push(updates.dueAt)
    }
    if (updates.intervalDays !== undefined) {
      fields.push('interval_days = ?')
      params.push(updates.intervalDays)
    }
    if (updates.successCount !== undefined) {
      fields.push('success_count = ?')
      params.push(updates.successCount)
    }

    if (fields.length === 0) return true
    fields.push('updated_at = ?')
    params.push(now)
    params.push(id)

    const res = this.db!.prepare(`UPDATE flashcards SET ${fields.join(', ')} WHERE id = ?`).run(...params)
    return res.changes > 0
  }

  public deleteFlashcard(id: string): boolean {
    this.ensureConnected()
    const res = this.db!.prepare(`DELETE FROM flashcards WHERE id = ?`).run(id)
    return res.changes > 0
  }

  public getFlashcardById(id: string): Flashcard | null {
    this.ensureConnected()
    const row = this.db!.prepare(`
      SELECT f.id, f.course_id as courseId, f.module_id as moduleId, f.lesson_id as lessonId,
             f.timestamp, f.question, f.answer, f.state, f.due_at as dueAt,
             f.interval_days as intervalDays, f.success_count as successCount,
             f.created_at as createdAt, f.updated_at as updatedAt,
             c.title as courseTitle, l.title as lessonTitle
      FROM flashcards f
      LEFT JOIN courses c ON f.course_id = c.id
      LEFT JOIN lessons l ON f.lesson_id = l.id
      WHERE f.id = ?
    `).get(id) as Flashcard | undefined
    return row || null
  }

  public getDueFlashcards(limit = 100): Flashcard[] {
    this.ensureConnected()
    const now = Date.now()
    const rows = this.db!.prepare(`
      SELECT f.id, f.course_id as courseId, f.module_id as moduleId, f.lesson_id as lessonId,
             f.timestamp, f.question, f.answer, f.state, f.due_at as dueAt,
             f.interval_days as intervalDays, f.success_count as successCount,
             f.created_at as createdAt, f.updated_at as updatedAt,
             c.title as courseTitle, l.title as lessonTitle
      FROM flashcards f
      LEFT JOIN courses c ON f.course_id = c.id
      LEFT JOIN lessons l ON f.lesson_id = l.id
      WHERE f.due_at IS NULL OR f.due_at <= ?
      ORDER BY f.due_at ASC NULLS FIRST, f.created_at ASC
      LIMIT ?
    `).all(now, limit) as Flashcard[]
    return rows
  }

  public getAllFlashcards(courseId?: string): Flashcard[] {
    this.ensureConnected()
    let query = `
      SELECT f.id, f.course_id as courseId, f.module_id as moduleId, f.lesson_id as lessonId,
             f.timestamp, f.question, f.answer, f.state, f.due_at as dueAt,
             f.interval_days as intervalDays, f.success_count as successCount,
             f.created_at as createdAt, f.updated_at as updatedAt,
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
    query += ` ORDER BY f.created_at DESC`

    return this.db!.prepare(query).all(...params) as Flashcard[]
  }

  public getFlashcardsByLesson(lessonId: string): Flashcard[] {
    this.ensureConnected()
    return this.db!.prepare(`
      SELECT f.id, f.course_id as courseId, f.module_id as moduleId, f.lesson_id as lessonId,
             f.timestamp, f.question, f.answer, f.state, f.due_at as dueAt,
             f.interval_days as intervalDays, f.success_count as successCount,
             f.created_at as createdAt, f.updated_at as updatedAt,
             c.title as courseTitle, l.title as lessonTitle
      FROM flashcards f
      LEFT JOIN courses c ON f.course_id = c.id
      LEFT JOIN lessons l ON f.lesson_id = l.id
      WHERE f.lesson_id = ?
      ORDER BY f.timestamp ASC NULLS LAST, f.created_at ASC
    `).all(lessonId) as Flashcard[]
  }

  public reviewFlashcard(id: string, grade: FlashcardReviewGrade): { success: boolean; flashcard?: Flashcard } {
    this.ensureConnected()
    const card = this.getFlashcardById(id)
    if (!card) return { success: false }

    const now = Date.now()
    let nextInterval = 0
    let nextDueAt = now
    let nextSuccessCount = card.successCount
    let nextState: FlashcardState = 'REVIEW'

    if (grade === 'AGAIN') {
      nextInterval = 0
      nextDueAt = now + 10 * 60 * 1000 // 10 minutes
      nextSuccessCount = 0
      nextState = 'LEARNING'
    } else if (grade === 'HARD') {
      nextInterval = 1
      nextDueAt = now + 24 * 60 * 60 * 1000 // 1 day
      nextSuccessCount = Math.max(1, card.successCount)
      nextState = 'LEARNING'
    } else if (grade === 'GOOD') {
      nextSuccessCount = card.successCount + 1
      if (nextSuccessCount === 1) nextInterval = 3
      else if (nextSuccessCount === 2) nextInterval = 7
      else if (nextSuccessCount === 3) nextInterval = 14
      else nextInterval = 30

      nextDueAt = now + nextInterval * 24 * 60 * 60 * 1000
      nextState = 'REVIEW'
    }

    this.db!.prepare(`
      UPDATE flashcards
      SET state = ?, due_at = ?, interval_days = ?, success_count = ?, updated_at = ?
      WHERE id = ?
    `).run(nextState, nextDueAt, nextInterval, nextSuccessCount, now, id)

    const updated = this.getFlashcardById(id)
    return { success: true, flashcard: updated || undefined }
  }

  // --- Study Queue Operations (v0.3) ---

  public addToStudyQueue(entityType: StudyQueueEntityType, entityId: string): StudyQueueItem {
    this.ensureConnected()
    const existing = this.db!.prepare(`SELECT id FROM study_queue WHERE entity_type = ? AND entity_id = ?`).get(entityType, entityId) as { id: string } | undefined
    if (existing) {
      const items = this.getStudyQueue()
      return items.find((i) => i.id === existing.id)!
    }

    const maxOrderRow = this.db!.prepare(`SELECT COALESCE(MAX(order_index), 0) as maxOrder FROM study_queue`).get() as { maxOrder: number } | undefined
    const nextOrder = (maxOrderRow?.maxOrder ?? 0) + 1
    const id = crypto.randomUUID()
    const now = Date.now()

    this.db!.prepare(`
      INSERT INTO study_queue (id, entity_type, entity_id, order_index, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, entityType, entityId, nextOrder, now)

    const items = this.getStudyQueue()
    return items.find((i) => i.id === id)!
  }

  public removeFromStudyQueue(id: string): boolean {
    this.ensureConnected()
    const res = this.db!.prepare(`DELETE FROM study_queue WHERE id = ?`).run(id)
    return res.changes > 0
  }

  public reorderStudyQueue(id: string, direction: 'up' | 'down'): boolean {
    this.ensureConnected()
    const all = this.db!.prepare(`SELECT id, order_index as orderIndex FROM study_queue ORDER BY order_index ASC, created_at ASC`).all() as Array<{ id: string; orderIndex: number }>
    const currentIndex = all.findIndex((item) => item.id === id)
    if (currentIndex === -1) return false

    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (swapIndex < 0 || swapIndex >= all.length) return false

    const currentItem = all[currentIndex]
    const otherItem = all[swapIndex]

    const tx = this.db!.transaction(() => {
      this.db!.prepare(`UPDATE study_queue SET order_index = ? WHERE id = ?`).run(otherItem.orderIndex, currentItem.id)
      this.db!.prepare(`UPDATE study_queue SET order_index = ? WHERE id = ?`).run(currentItem.orderIndex, otherItem.id)
    })
    tx()

    return true
  }

  public getStudyQueue(): StudyQueueItem[] {
    this.ensureConnected()
    const rows = this.db!.prepare(`
      SELECT id, entity_type as entityType, entity_id as entityId, order_index as orderIndex, created_at as createdAt
      FROM study_queue
      ORDER BY order_index ASC, created_at ASC
    `).all() as Array<{ id: string; entityType: StudyQueueEntityType; entityId: string; orderIndex: number; createdAt: number }>

    const results: StudyQueueItem[] = []

    for (const r of rows) {
      if (r.entityType === 'course') {
        const c = this.db!.prepare(`SELECT id, title, cover_path as coverPath, total_duration as duration FROM courses WHERE id = ?`).get(r.entityId) as { id: string; title: string; coverPath?: string; duration: number } | undefined
        if (c) {
          results.push({
            id: r.id,
            entityType: 'course',
            entityId: r.entityId,
            orderIndex: r.orderIndex,
            createdAt: r.createdAt,
            title: c.title,
            courseId: c.id,
            courseTitle: c.title,
            duration: c.duration,
            coverPath: c.coverPath
          })
        }
      } else if (r.entityType === 'module') {
        const m = this.db!.prepare(`
          SELECT m.id, m.title, m.course_id as courseId, m.duration, c.title as courseTitle, c.cover_path as coverPath
          FROM modules m
          JOIN courses c ON m.course_id = c.id
          WHERE m.id = ?
        `).get(r.entityId) as { id: string; title: string; courseId: string; duration: number; courseTitle: string; coverPath?: string } | undefined
        if (m) {
          results.push({
            id: r.id,
            entityType: 'module',
            entityId: r.entityId,
            orderIndex: r.orderIndex,
            createdAt: r.createdAt,
            title: m.title,
            courseId: m.courseId,
            courseTitle: m.courseTitle,
            moduleTitle: m.title,
            duration: m.duration,
            coverPath: m.coverPath
          })
        }
      } else if (r.entityType === 'lesson') {
        const l = this.db!.prepare(`
          SELECT l.id, l.title, l.course_id as courseId, l.duration, l.cover_path as coverPath,
                 c.title as courseTitle, m.title as moduleTitle
          FROM lessons l
          JOIN courses c ON l.course_id = c.id
          JOIN modules m ON l.module_id = m.id
          WHERE l.id = ?
        `).get(r.entityId) as { id: string; title: string; courseId: string; duration: number; coverPath?: string; courseTitle: string; moduleTitle: string } | undefined
        if (l) {
          results.push({
            id: r.id,
            entityType: 'lesson',
            entityId: r.entityId,
            orderIndex: r.orderIndex,
            createdAt: r.createdAt,
            title: l.title,
            courseId: l.courseId,
            courseTitle: l.courseTitle,
            moduleTitle: l.moduleTitle,
            duration: l.duration,
            coverPath: l.coverPath
          })
        }
      }
    }

    return results
  }

  // --- Course Goals Operations (v0.3) ---

  public getCourseGoal(courseId: string): CourseGoal | null {
    this.ensureConnected()
    const row = this.db!.prepare(`
      SELECT course_id as courseId, target_date as targetDate, daily_minutes as dailyMinutes,
             weekly_lessons as weeklyLessons, updated_at as updatedAt
      FROM course_goals
      WHERE course_id = ?
    `).get(courseId) as CourseGoal | undefined
    return row || null
  }

  public setCourseGoal(goal: {
    courseId: string
    targetDate?: number
    dailyMinutes?: number
    weeklyLessons?: number
  }): CourseGoal {
    this.ensureConnected()
    const now = Date.now()
    this.db!.prepare(`
      INSERT OR REPLACE INTO course_goals (course_id, target_date, daily_minutes, weekly_lessons, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(goal.courseId, goal.targetDate || null, goal.dailyMinutes || null, goal.weeklyLessons || null, now)

    return {
      courseId: goal.courseId,
      targetDate: goal.targetDate,
      dailyMinutes: goal.dailyMinutes,
      weeklyLessons: goal.weeklyLessons,
      updatedAt: now
    }
  }

  public deleteCourseGoal(courseId: string): boolean {
    this.ensureConnected()
    const res = this.db!.prepare(`DELETE FROM course_goals WHERE course_id = ?`).run(courseId)
    return res.changes > 0
  }

  // --- Study Sessions Operations (v0.3) ---

  public startStudySession(session: { id?: string; courseId?: string; source?: 'player' | 'focus_timer' }): StudySession {
    this.ensureConnected()
    const id = session.id || crypto.randomUUID()
    const now = Date.now()
    const source = session.source || 'player'

    this.db!.prepare(`
      INSERT INTO study_sessions (id, course_id, started_at, duration, source)
      VALUES (?, ?, ?, 0, ?)
    `).run(id, session.courseId || null, now, source)

    return {
      id,
      courseId: session.courseId,
      startedAt: now,
      duration: 0,
      source
    }
  }

  public endStudySession(id: string, duration?: number): boolean {
    this.ensureConnected()
    const now = Date.now()
    let dur = duration
    if (dur === undefined) {
      const existing = this.db!.prepare(`SELECT started_at as startedAt FROM study_sessions WHERE id = ?`).get(id) as { startedAt: number } | undefined
      dur = existing ? Math.max(0, Math.floor((now - existing.startedAt) / 1000)) : 0
    }

    const res = this.db!.prepare(`
      UPDATE study_sessions SET ended_at = ?, duration = ? WHERE id = ?
    `).run(now, dur, id)
    return res.changes > 0
  }

  public getStudySessions(limit = 50): StudySession[] {
    this.ensureConnected()
    return this.db!.prepare(`
      SELECT id, course_id as courseId, started_at as startedAt, ended_at as endedAt, duration, source
      FROM study_sessions
      ORDER BY started_at DESC
      LIMIT ?
    `).all(limit) as StudySession[]
  }

  // --- Review Dashboard Aggregator (v0.3) ---

  public getReviewDashboardStats(): ReviewDashboardStats {
    this.ensureConnected()
    const now = Date.now()

    const dueFlashcardsRow = this.db!.prepare(`
      SELECT count(*) as cnt FROM flashcards WHERE due_at IS NULL OR due_at <= ?
    `).get(now) as { cnt: number } | undefined

    const totalFlashcardsRow = this.db!.prepare(`
      SELECT count(*) as cnt FROM flashcards
    `).get() as { cnt: number } | undefined

    const bookmarksRow = this.db!.prepare(`
      SELECT count(*) as cnt FROM video_bookmarks
    `).get() as { cnt: number } | undefined

    const studyQueueRow = this.db!.prepare(`
      SELECT count(*) as cnt FROM study_queue
    `).get() as { cnt: number } | undefined

    const recentNotesRow = this.db!.prepare(`
      SELECT count(*) as cnt FROM lesson_notes
    `).get() as { cnt: number } | undefined

    const analytics = this.getStudyAnalytics()

    return {
      dueFlashcardsCount: dueFlashcardsRow?.cnt ?? 0,
      totalFlashcardsCount: totalFlashcardsRow?.cnt ?? 0,
      bookmarksCount: bookmarksRow?.cnt ?? 0,
      studyQueueCount: studyQueueRow?.cnt ?? 0,
      recentNotesCount: recentNotesRow?.cnt ?? 0,
      activeStreakDays: analytics.currentStreakDays
    }
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
    const hierarchy = this.getCourseById(courseId)
    if (!hierarchy || hierarchy.modules.length === 0) return { moduleCount: 0, lessonCount: 0, totalDuration: 0 }

    const sortedModules = [...hierarchy.modules].sort((a, b) =>
      (a.displayOrder || a.orderIndex) - (b.displayOrder || b.orderIndex) || naturalCompare(a.title, b.title)
    )

    let totalCourseLessons = 0
    let totalCourseDuration = 0

    const tx = this.db!.transaction(() => {
      for (let mIdx = 0; mIdx < sortedModules.length; mIdx++) {
        const mod = sortedModules[mIdx]
        const sortedLessons = [...mod.lessons].sort((a, b) =>
          (a.displayOrder || a.orderIndex) - (b.displayOrder || b.orderIndex) || naturalCompare(a.title, b.title)
        )

        let modDuration = 0
        for (let lIdx = 0; lIdx < sortedLessons.length; lIdx++) {
          const les = sortedLessons[lIdx]
          modDuration += les.duration || 0
          const finalDisplayOrder = les.hasManualOrder && les.displayOrder ? les.displayOrder : lIdx + 1
          this.db!.prepare(`
            UPDATE lessons SET order_index = ?, display_order = ? WHERE id = ?
          `).run(lIdx + 1, finalDisplayOrder, les.id)
        }

        totalCourseLessons += sortedLessons.length
        totalCourseDuration += modDuration
        const finalModDisplayOrder = mod.hasManualOrder && mod.displayOrder ? mod.displayOrder : mIdx + 1

        this.db!.prepare(`
          UPDATE modules SET order_index = ?, display_order = ?, lesson_count = ?, duration = ? WHERE id = ?
        `).run(mIdx + 1, finalModDisplayOrder, sortedLessons.length, modDuration, mod.id)
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
    })

    tx()

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
          } catch (statErr) {
            logger.debug('Failed to stat problem non-media lesson file:', statErr)
          }

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
    const targetCourseIds = courseId
      ? [courseId]
      : (this.db!.prepare(`SELECT id FROM courses`).all() as Array<{ id: string }>).map((c) => c.id)

    for (const cId of targetCourseIds) {
      const rawModules = this.db!.prepare(`
        SELECT id, course_id as courseId, title, order_index as orderIndex, display_order as displayOrder
        FROM modules WHERE course_id = ?
        ORDER BY display_order ASC, order_index ASC
      `).all(cId) as Array<{ id: string; courseId: string; title: string; orderIndex: number; displayOrder: number }>

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
      this.reindexCourseHierarchy(cId)
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
      const toUtcDays = (dateStr: string): number => {
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
      const hierarchy = this.getCourseById(course.id)
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

    // 5. Extract video frame thumbnails for lessons missing covers
    void this.extractMissingVideoThumbnails()

    return {
      success: true,
      separatedCoursesCount: separateResult.separatedCoursesCount,
      mergedGroupsCount: mergeResult.mergedGroupsCount,
      deduplicatedModulesCount,
      reindexedCoursesCount: allCourses.length,
      details
    }
  }

  public async extractMissingVideoThumbnails(targetCourseId?: string): Promise<{ updatedLessons: number; updatedCourses: number }> {
    if (!this.db || !this.currentVaultPath) return { updatedLessons: 0, updatedCourses: 0 }

    let updatedLessons = 0
    let updatedCourses = 0

    try {
      // 1. Find video lessons with missing or SVG covers
      const lessonQuery = targetCourseId
        ? `SELECT id, course_id as courseId, title, file_path as filePath, media_type as mediaType, cover_path as coverPath FROM lessons WHERE course_id = ? AND media_type = 'video' AND (cover_path IS NULL OR cover_path LIKE '%.svg')`
        : `SELECT id, course_id as courseId, title, file_path as filePath, media_type as mediaType, cover_path as coverPath FROM lessons WHERE media_type = 'video' AND (cover_path IS NULL OR cover_path LIKE '%.svg')`

      const lessons = this.db.prepare(lessonQuery).all(targetCourseId ? [targetCourseId] : []) as {
        id: string
        courseId: string
        title: string
        filePath: string
        mediaType: string
        coverPath: string | null
      }[]

      for (const les of lessons) {
        if (!this.db || !this.currentVaultPath) break
        if (!les.filePath || !fs.existsSync(les.filePath)) continue
        try {
          const frame = await generateVideoFrameCover(les.filePath, TEMP_COVERS_DIR, 3)
          if (frame && this.db && this.currentVaultPath) {
            const persisted = await persistCover(frame, les.courseId, this.currentVaultPath, 'lesson')
            if (persisted) {
              this.db.prepare(`UPDATE lessons SET cover_path = ? WHERE id = ?`).run(persisted, les.id)
              updatedLessons++
            }
          }
        } catch (err) {
          logger.warn(`[DatabaseService] Failed to extract video thumbnail for lesson ${les.id}:`, err)
        }
      }

      // 2. Find courses with missing or SVG covers
      if (this.db && this.currentVaultPath) {
        const courseQuery = targetCourseId
          ? `SELECT id, title, root_path as rootPath, cover_path as coverPath FROM courses WHERE id = ? AND (cover_path IS NULL OR cover_path LIKE '%.svg')`
          : `SELECT id, title, root_path as rootPath, cover_path as coverPath FROM courses WHERE (cover_path IS NULL OR cover_path LIKE '%.svg')`

        const courses = this.db.prepare(courseQuery).all(targetCourseId ? [targetCourseId] : []) as {
          id: string
          title: string
          rootPath: string
          coverPath: string | null
        }[]

        for (const c of courses) {
          if (!this.db || !this.currentVaultPath) break
          const firstVideo = this.db.prepare(
            `SELECT file_path as filePath, cover_path as coverPath FROM lessons WHERE course_id = ? AND media_type = 'video' AND file_path IS NOT NULL ORDER BY order_index ASC LIMIT 1`
          ).get(c.id) as { filePath: string; coverPath: string | null } | undefined

          if (firstVideo && firstVideo.coverPath && (firstVideo.coverPath.endsWith('.jpg') || firstVideo.coverPath.endsWith('.png'))) {
            this.db.prepare(`UPDATE courses SET cover_path = ?, updated_at = ? WHERE id = ?`).run(firstVideo.coverPath, Date.now(), c.id)
            updatedCourses++
          } else if (firstVideo?.filePath && fs.existsSync(firstVideo.filePath)) {
            try {
              const frame = await generateVideoFrameCover(firstVideo.filePath, TEMP_COVERS_DIR, 3)
              if (frame && this.db && this.currentVaultPath) {
                const persisted = await persistCover(frame, c.id, this.currentVaultPath, 'course')
                if (persisted) {
                  this.db.prepare(`UPDATE courses SET cover_path = ?, updated_at = ? WHERE id = ?`).run(persisted, Date.now(), c.id)
                  updatedCourses++
                }
              }
            } catch (err) {
              logger.warn(`[DatabaseService] Failed to extract video thumbnail for course ${c.id}:`, err)
            }
          }
        }
      }
    } catch (err) {
      logger.warn('[DatabaseService] extractMissingVideoThumbnails error:', err)
    }

    return { updatedLessons, updatedCourses }
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
        UPDATE modules SET custom_title = ?, display_order = ?, has_manual_order = 1 WHERE id = ?
      `).run(updates.customTitle ?? null, updates.displayOrder, moduleId)
    } else if (updates.customTitle !== undefined) {
      this.db!.prepare(`
        UPDATE modules SET custom_title = ? WHERE id = ?
      `).run(updates.customTitle ?? null, moduleId)
    } else if (updates.displayOrder !== undefined) {
      this.db!.prepare(`
        UPDATE modules SET display_order = ?, has_manual_order = 1 WHERE id = ?
      `).run(updates.displayOrder, moduleId)
    }
  }

  public updateLessonMetadata(lessonId: string, updates: { customTitle?: string; displayOrder?: number }): void {
    this.ensureConnected()
    if (updates.customTitle !== undefined && updates.displayOrder !== undefined) {
      this.db!.prepare(`
        UPDATE lessons SET custom_title = ?, display_order = ?, has_manual_order = 1 WHERE id = ?
      `).run(updates.customTitle ?? null, updates.displayOrder, lessonId)
    } else if (updates.customTitle !== undefined) {
      this.db!.prepare(`
        UPDATE lessons SET custom_title = ? WHERE id = ?
      `).run(updates.customTitle ?? null, lessonId)
    } else if (updates.displayOrder !== undefined) {
      this.db!.prepare(`
        UPDATE lessons SET display_order = ?, has_manual_order = 1 WHERE id = ?
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
        this.db!.prepare(`UPDATE modules SET display_order = ?, has_manual_order = 1 WHERE id = ?`).run(idx + 1, m.id)
      })

      this.db!.prepare(`UPDATE modules SET display_order = ?, has_manual_order = 1 WHERE id = ?`).run(swapIndex + 1, targetModule.id)
      this.db!.prepare(`UPDATE modules SET display_order = ?, has_manual_order = 1 WHERE id = ?`).run(currentIndex + 1, otherModule.id)
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
        this.db!.prepare(`UPDATE lessons SET display_order = ?, has_manual_order = 1 WHERE id = ?`).run(idx + 1, l.id)
      })

      this.db!.prepare(`UPDATE lessons SET display_order = ?, has_manual_order = 1 WHERE id = ?`).run(swapIndex + 1, targetLesson.id)
      this.db!.prepare(`UPDATE lessons SET display_order = ?, has_manual_order = 1 WHERE id = ?`).run(currentIndex + 1, otherLesson.id)
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
