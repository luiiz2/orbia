# 🤖 AGENTS.md — Master Guidelines & AI Engineering Handbook for Orbia

> **Single Source of Truth** for AI agents, pair programmers, and human contributors developing, refactoring, or maintaining the **Orbia** desktop application.

---

## 1. Project Identity & Philosophy

**Orbia** is an open-source, offline-first desktop application designed to organize and study personal course libraries.

### Core Philosophy
1. **User Ownership**: User files belong 100% to the user. The app runs completely locally with zero telemetry and no mandatory cloud accounts.
2. **Never Silent**: The application must **never** rename, move, delete, or modify user files on disk without explicit user review and approval (`Preview ➔ Approve ➔ Apply ➔ Undoable`).
3. **No Mandatory AI**: The core experience (scanning, hierarchy detection, title cleaning, playback, progress tracking, notes) must be rock-solid and genuinely useful **without any AI**. AI features are optional plugins planned strictly for post-v1.0.
4. **Platform, Not File Browser**: The UI and UX should feel like a first-class learning platform (similar to Gran Cursos, Udemy, Coursera), not a raw file explorer.

---

## 2. AI Agent Request Routing Matrix ("Where to Edit What")

Use this matrix to immediately pinpoint which files to inspect and modify for any user request:

| User Request / Feature Area | Main Process Backend | IPC & Preload Bridge | Renderer Store / Hook | UI View / Component |
|---|---|---|---|---|
| **Video Player & Streaming**<br>(Seeking, range requests, resume playback, keyboard shortcuts) | `src/main/protocol.ts`<br>(HTTP 206 Range Stream) | `src/preload/index.ts`<br>`player:save-progress` | `src/renderer/src/hooks/usePlayer.ts`<br>`stores/usePlayerStore.ts` | `components/player/VideoPlayer.tsx`<br>`components/player/PlayerControls.tsx`<br>`components/player/ProgressBar.tsx` |
| **Course Health & Problem Aulas**<br>(Missing files, 0-byte files, non-media items, delete lesson) | `src/main/services/database.service.ts`<br>(`getCourseHealth`, `deleteLesson`, `fixCourseProblems`) | `src/main/ipc/courses.ipc.ts`<br>`src/preload/index.ts` | `stores/useLibraryStore.ts`<br>(`courseHealth`, `fetchCourseHealth`, `deleteLesson`, `fixCourseProblems`) | `pages/CourseView.tsx`<br>(Problem banner, badged items, delete modal)<br>`components/player/VideoPlayer.tsx` |
| **Study Notes & Timestamps**<br>(Add note with video timestamp, markdown export, edit/delete) | `src/main/services/database.service.ts`<br>(`lesson_notes` table, `addLessonNote`, `exportCourseNotes`) | `src/main/ipc/player.ipc.ts`<br>`src/preload/index.ts` | `stores/usePlayerStore.ts`<br>(`notes`, `addNote`, `deleteNote`, `exportNotes`) | `components/player/NotesPanel.tsx`<br>`pages/PlayerView.tsx` |
| **Subtitles & Captions**<br>(SRT to WebVTT conversion, sidecars, subtitle toggle) | `src/main/utils/subtitle-utils.ts`<br>`src/main/services/database.service.ts` | `src/main/ipc/courses.ipc.ts`<br>(`courses:convert-srt-to-vtt`) | `stores/usePlayerStore.ts`<br>(`subtitleTracks`, `activeSubtitleTrack`) | `components/player/SubtitleMenu.tsx`<br>`components/player/VideoPlayer.tsx` |
| **Course Import & Archive Unpack**<br>(Folder scan, zip extract, preview wizard, duplicate merge) | `src/main/services/scanner.service.ts`<br>`src/main/services/parser.service.ts`<br>`src/main/services/archive.service.ts`<br>`src/main/services/course-import.service.ts` | `src/main/ipc/courses.ipc.ts`<br>(`prepareZipImport`, `scanFolder`, `commitImportSession`) | `stores/useLibraryStore.ts`<br>`stores/useNavigationStore.ts` | `components/import/ImportWizard.tsx`<br>`components/import/ImportModal.tsx`<br>`components/import/ImportPreview.tsx`<br>`components/library/MergeCoursesModal.tsx` |
| **Module Hierarchy & Title Cleaning**<br>(Natural sort, duplicate module grouping, title normalization) | `src/main/utils/title-cleaner.ts`<br>`src/main/utils/natural-sort.ts`<br>`src/main/utils/file-utils.ts` | — | — | `components/import/ImportPreview.tsx`<br>`pages/CourseView.tsx` |
| **Home Dashboard & Continue Studying**<br>(Continue watching rail, course grid, filter pills, search) | `src/main/services/database.service.ts`<br>(`getAllProgressSummaries`) | `src/main/ipc/player.ipc.ts`<br>`src/main/ipc/courses.ipc.ts` | `stores/useLibraryStore.ts`<br>(`filterStatus`, `searchQuery`, `progressSummaries`) | `pages/HomeView.tsx`<br>`components/library/ContinueWatchingRail.tsx`<br>`components/library/CourseCard.tsx` |
| **Course Covers & Thumbnails**<br>(Auto-cover extraction, custom cover upload, lesson thumbnails) | `src/main/services/proposal-cover.service.ts`<br>`src/main/utils/cover-generator.ts` | `src/main/ipc/courses.ipc.ts`<br>(`updateCourseCover`, `selectCoverImage`) | `stores/useLibraryStore.ts`<br>(`updateCourseCover`, `updateLessonCover`) | `components/ui/CourseCover.tsx`<br>`pages/CourseView.tsx` |
| **Study Vault Management**<br>(Create vault, open recent, switch vault, delete vault, stats) | `src/main/services/vault.service.ts`<br>`src/main/services/app-config.service.ts` | `src/main/ipc/vault.ipc.ts`<br>(`vault:create`, `vault:open`, `vault:delete`) | `stores/useVaultStore.ts`<br>(`currentVault`, `openVault`, `createVault`, `deleteVault`) | `components/vault/VaultModal.tsx`<br>`components/vault/VaultSelector.tsx`<br>`components/vault/DeleteVaultModal.tsx` |
| **Document & PDF Viewer**<br>(Attached PDF preview, document lessons, resource modal) | `src/main/protocol.ts`<br>(PDF media serving) | `src/preload/index.ts` | — | `components/documents/PdfViewerModal.tsx`<br>`components/player/DocumentLessonView.tsx` |
| **Watch History & Timeline**<br>(Session tracking, history log, last played timestamp) | `src/main/services/database.service.ts`<br>(`watch_history` table) | `src/main/ipc/player.ipc.ts`<br>(`getWatchHistory`, `addWatchHistory`) | `stores/usePlayerStore.ts`<br>`hooks/usePlayer.ts` | `pages/HistoryView.tsx` |
| **Settings & Internationalization**<br>(Theme dark/light, Portuguese/English, playback speed) | `src/main/services/app-config.service.ts` | `src/main/ipc/settings.ipc.ts`<br>`src/preload/index.ts` | `stores/useSettingsStore.ts`<br>`i18n/index.ts` | `pages/SettingsView.tsx`<br>`components/layout/ThemeProvider.tsx`<br>`i18n/locales/pt-BR/common.json` |

---

## 3. Ponytail Engineering Rules ("The Laziest Senior Developer")

> **"The best code is the code you never had to write."**

Before writing or modifying any code in Orbia, climb the **7-Rung Decision Ladder** and stop at the first rung that solves the problem:

1. **Rung 1: Does this need to exist at all? (YAGNI)**
   - Reject speculative features, premature abstractions, and unused utility functions.
2. **Rung 2: Does it already exist in the codebase?**
   - Search the existing project for utilities (`src/main/utils/`, `src/renderer/src/lib/`, `stores/`) before creating a new one.
3. **Rung 3: Does the standard library do it?**
   - Prefer modern JavaScript/TypeScript built-ins (e.g. `Intl.Collator`, `URLPattern`, `crypto.randomUUID()`, `Set`, `Map`, `structuredClone`) over custom helper functions or npm libraries.
4. **Rung 4: Does a native platform feature cover it?**
   - HTML/CSS: Use native elements (`<video>`, `<dialog>`, `<details>`, `<input type="range">`, CSS Grid/Flexbox, `:has()`, `@container`) instead of bloated external libraries.
5. **Rung 5: Does an already-installed dependency solve it?**
   - Use already installed packages (`better-sqlite3`, `lucide-react`, `zustand`, `radix-ui`, `tailwind-merge`). Do NOT add new npm packages unless strictly necessary.
6. **Rung 6: Can it be one clean line?**
   - Don't build a 50-line class or helper when a single readable expression, pipeline, or SQL query suffices.
7. **Rung 7: Only then: Write the minimum code that works.**
   - Write simple, direct, readable code without unnecessary boilerplate or layers of indirection.

### Where to NEVER Be Lazy (Non-Negotiables):
- 🔒 **Security & Trust Boundaries**: Always validate and sanitize inputs. The renderer must never have direct Node/FS access.
- 🛡️ **Error Handling & Data Integrity**: Prevent data loss, wrap IPC calls in `try/catch`, maintain WAL journal mode in SQLite.
- ♿ **Accessibility (a11y)**: Semantic HTML, visible focus states (`focus-visible`), keyboard shortcuts with tooltips.

---

## 4. Locked Technical Architecture & Decisions

| Area | Decision | Details |
|---|---|---|
| **Runtime & Shell** | Electron + React + TypeScript | Bundled via `electron-vite` (v5+). Consistent Chromium rendering & codec support. |
| **Styling & UI** | Tailwind CSS v4 + Shadcn/UI | Dark mode as primary default; light mode supported. Radix UI primitives. |
| **Icons** | Lucide React | Uniform icon system throughout the application. |
| **State Management**| Zustand 5.x | Lightweight, decoupled stores with `useShallow` for selectors. |
| **Database Engine** | `better-sqlite3` (C++ Addon) | Synchronous, high-performance SQLite in Main process with WAL mode. |
| **Database Topology**| Dual SQLite Model | **App Config DB**: `%APPDATA%/orbia/config.db`<br>**Vault DB**: `{vaultPath}/.orbia/library.db` (portable). |
| **Vault Architecture**| Hybrid Model | Managed vault storage (`Courses/`, `Inbox/`) + external referenced course folders. |
| **Course Import Flow**| Heuristic + Preview | Auto-detect hierarchy & clean titles, but always show editable preview before committing to DB. |
| **Media Streaming** | `media://` Custom Protocol | Registered with `stream: true` supporting HTTP `206 Partial Content` Range requests. |
| **Internationalization**| `i18next` + `react-i18next`| Bilingual from Day 1: English (`en`) default + Portuguese (`pt-BR`). |
| **Release Cadence** | `v0.1` ➔ `v0.x` ➔ `v1.0` | Semver; v0.1 is the focused MVP. |

---

## 5. Complete Directory Architecture

```
orbia/
├── resources/                     # Static unbundled assets (app icons, installer graphics)
├── src/
│   ├── main/                      # Electron Main Process (Node.js runtime)
│   │   ├── index.ts               # App entry point, lifecycle & window management
│   │   ├── protocol.ts            # media:// protocol handler with HTTP 206 Range support
│   │   ├── ipc/                   # Modular IPC handlers
│   │   │   ├── courses.ipc.ts     # Course scanning, importing, covers, health, deletion
│   │   │   ├── player.ipc.ts      # Playback progress, watch history, timestamped notes
│   │   │   ├── vault.ipc.ts       # Vault creation, opening, deletion, statistics
│   │   │   └── settings.ipc.ts    # Application settings get/set
│   │   ├── services/              # Business logic & Domain Services
│   │   │   ├── database.service.ts # Vault SQLite engine (courses, modules, lessons, notes)
│   │   │   ├── app-config.service.ts # Global config SQLite engine (vault registry, app settings)
│   │   │   ├── vault.service.ts   # Vault filesystem lifecycle & validation
│   │   │   ├── scanner.service.ts # Read-only filesystem tree walker
│   │   │   ├── parser.service.ts  # Heuristic hierarchy & sidecar parser
│   │   │   ├── archive.service.ts # Zip archive extractor & staging
│   │   │   └── proposal-cover.service.ts # Cover image detection & generation
│   │   └── utils/                 # Utilities & Pure Functions
│   │       ├── file-utils.ts      # Media/code/document extension sets & type resolution
│   │       ├── natural-sort.ts    # Alphanumeric natural ordering (Intl.Collator)
│   │       ├── title-cleaner.ts   # Filename sanitizer & module key normalizer
│   │       ├── subtitle-utils.ts  # SRT to WebVTT parser/converter
│   │       └── search-utils.ts    # Diacritic & case-insensitive matching
│   │
│   ├── preload/                   # Preload Scripts (Isolated bridge)
│   │   ├── index.ts               # contextBridge.exposeInMainWorld('api', ...)
│   │   └── index.d.ts             # Global typed interface for window.api
│   │
│   ├── types/                     # Shared TypeScript Domain Contracts
│   │   ├── api.ts                 # OrbiaApi interface (IPC contract)
│   │   ├── course.ts              # Course, Module, Lesson, ContentResource, HealthReport
│   │   ├── vault.ts               # Vault, VaultStats, VaultConfig
│   │   ├── progress.ts            # LessonProgress, CourseProgressSummary, WatchHistoryEntry
│   │   ├── notes.ts               # LessonNote
│   │   ├── journal.ts             # FileOperationRecord
│   │   └── index.ts               # Barrel exports
│   │
│   └── renderer/                  # Vite + React Frontend (Browser runtime)
│       ├── index.html
│       └── src/
│           ├── main.tsx           # React entry point & i18n initialization
│           ├── App.tsx            # App root, view router & modals
│           ├── pages/             # Main Route Views
│           │   ├── HomeView.tsx   # Dashboard, Continue Watching Rail, Course Grid
│           │   ├── CourseView.tsx # Course Detail, Curriculum Accordion, Health Alerts
│           │   ├── PlayerView.tsx # Immersive Video Player, Curriculum & Notes Tabs
│           │   ├── HistoryView.tsx# Chronological Study Timeline
│           │   └── SettingsView.tsx # Appearance, Playback & Storage Preferences
│           ├── components/
│           │   ├── player/        # VideoPlayer, Controls, ProgressBar, NotesPanel, SubtitleMenu
│           │   ├── library/       # ContinueWatchingRail, CourseCard, MergeCoursesModal
│           │   ├── import/        # ImportWizard, ImportPreview, ImportModal
│           │   ├── vault/         # VaultModal, VaultSelector, DeleteVaultModal
│           │   ├── documents/     # PdfViewerModal
│           │   ├── layout/        # AppShell, TopBar, Sidebar, ThemeProvider, SplashScreen
│           │   └── ui/            # Button, Dialog, Card, Badge, Accordion, Progress, Tooltip
│           ├── stores/            # Zustand Stores (useLibraryStore, usePlayerStore, useVaultStore, etc.)
│           ├── hooks/             # Custom Hooks (usePlayer, useCourseProgress)
│           ├── i18n/              # Locales (pt-BR/common.json, en/common.json)
│           └── lib/               # utils (cn, mediaUrl), formatters (time, bytes), search
├── test/                          # Comprehensive Vitest Test Suites (39+ files, 246+ tests)
├── electron.vite.config.ts        # Unified build configuration
├── electron-builder.yml           # Packaging configuration
├── package.json
└── tsconfig.json
```

---

## 6. Database Topology & SQLite Schemas

### 1. App Configuration DB (`%APPDATA%/orbia/config.db`)
- `vault_registry`: Tracks all known study vaults on the machine (`path`, `name`, `last_opened`, `created_at`).
- `app_settings`: Key-value store for global preferences (`theme`, `language`, `defaultPlaybackSpeed`, `autoPlayNext`).

### 2. Vault Database (`{vaultPath}/.orbia/library.db`)
- `courses`: `id`, `title`, `slug`, `source_type`, `root_path`, `cover_path`, `description`, `total_duration`, `module_count`, `lesson_count`, `is_favorite`, `created_at`, `updated_at`.
- `modules`: `id`, `course_id`, `title`, `order_index`, `folder_path`, `duration`, `lesson_count`, `created_at`.
- `lessons`: `id`, `module_id`, `course_id`, `title`, `order_index`, `file_path`, `file_name`, `file_extension`, `media_type`, `duration`, `file_size`, `availability`, `cover_path`, `created_at`.
- `content_resources`: `id`, `course_id`, `module_id`, `lesson_id`, `role`, `name`, `file_path`, `file_extension`, `file_size`, `resource_type`, `created_at`.
- `lesson_progress`: `lesson_id`, `course_id`, `current_time`, `duration`, `completed`, `last_played_at`.
- `watch_history`: `id`, `lesson_id`, `course_id`, `lesson_title`, `course_title`, `duration`, `seconds_watched`, `watched_at`.
- `lesson_notes`: `id`, `lesson_id`, `course_id`, `timestamp_seconds`, `content`, `created_at`, `updated_at`.
- `file_operations`: Immutable journal for physical file mutations (`operation_id`, `group_id`, `type`, `source_path`, `destination_path`, `timestamp`, `status`, `is_reversible`).

---

## 7. Testing & Verification Standards

High-priority business logic is backed by 39+ automated test suites in `test/`:
- **Core Algorithms**: `test/natural-sort.test.ts`, `test/title-cleaner.test.ts`, `test/edge-cases.test.ts`.
- **Database & Queries**: `test/database.test.ts`, `test/course-health-and-deletion.test.ts`.
- **Streaming & Media**: `test/media-protocol-authorization.test.ts`, `test/module-deduplication-and-seeking.test.ts`.
- **State & Stores**: `test/library-store.test.ts`, `test/notes-and-subtitles.test.ts`.

### Cadence
- After any code change, always run:
  1. `npx vitest run` (ensure 100% tests pass)
  2. `npm run typecheck` (verify Node and Web TypeScript types)
  3. `npm run build` (verify Vite and Electron bundles compile)

### Permanent Test-Creation Policy

Keep the test suite small, focused, fast, and valuable. Before adding a test, audit nearby coverage and answer: **what meaningful regression would this catch that existing tests would not?**

- Classify relevant existing tests as `KEEP`, `MERGE`, `REMOVE`, or `IMPROVE` before changing the suite.
- Create tests only for meaningful regression protection: business rules, critical workflows, data integrity, persistence, parsing/import/export, integrations, destructive behavior, realistic high-risk edge cases, or real bugs.
- Prefer extending or merging an existing test and using a readable parameterized case over creating a new file or a test for every function, component, hook, or helper.
- Do not create tests merely to increase coverage, preserve a test count, verify constants/framework behavior, or duplicate another layer's protection.
- Remove redundant, obsolete, fragile, or low-value tests when better coverage supersedes them; do not modify production behavior just to keep a low-value test passing.
- Treat every test as maintenance cost. If its regression-prevention value is not clear and greater than that cost, do not add it.

