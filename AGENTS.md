# 🤖 AGENTS.md — Agent & Contributor Guidelines for Orbia

> This document serves as the single source of truth for AI agents and human contributors developing, modifying, or maintaining the **Orbia** codebase.

---

## 0. Critical Agent Operational Rule: Project Path Confirmation

> [!IMPORTANT]
> **Before reading, creating, editing, deleting, moving, running, installing, building, testing, or executing ANYTHING related to the project in a new session or development task, ALWAYS ask the user:**
> *"What is the current absolute path of the Orbia project?"*
>
> - **NEVER** assume the project is in the current working directory.
> - **NEVER** infer the project path from previous commands or shell variables.
> - **NEVER** pick or guess a folder autonomously.
> - **NEVER** run repository commands until the user explicitly provides or confirms the absolute project path.
> - Once confirmed for the active task, use that exact project root unless the user specifies otherwise.

---

## 1. Project Identity & Philosophy

**Orbia** is an open-source, offline-first desktop application designed to organize and study personal course libraries.

### Core Philosophy
1. **User Ownership**: User files belong to the user. The app runs 100% locally with zero telemetry and no mandatory cloud accounts.
2. **Never Silent**: The application must **never** rename, move, delete, or modify user files on disk without explicit user review and approval (Preview ➔ Approve ➔ Apply ➔ Undoable).
3. **No Mandatory AI**: The core experience (scanning, hierarchy detection, title cleaning, playback, progress tracking) must be rock-solid and genuinely useful **without any AI**. AI features are optional plugins planned strictly for post-v1.0.
4. **Platform, Not File Browser**: The UI and UX should feel like a first-class learning platform (similar to Gran Cursos, Udemy, Coursera), not a raw folder explorer.

---

## 2. Locked Technical & Product Decisions

Every contributor and agent must adhere to these established decisions (do not change without explicit user approval):

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

## 3. Directory Architecture

```
orbia/
├── resources/                     # Static unbundled assets (app icons, installer graphics)
├── src/
│   ├── main/                      # Electron Main Process (Node.js runtime)
│   │   ├── index.ts               # App entry point, lifecycle & window management
│   │   ├── protocol.ts            # media:// protocol handler with Range support
│   │   ├── ipc/                   # Modular IPC handlers (vault, courses, player, etc.)
│   │   ├── services/              # Business logic (vault, scanner, parser, database, journal)
│   │   └── utils/                 # Utilities (title cleaner, natural sort, file helpers)
│   │
│   ├── preload/                   # Preload Scripts (Isolated bridge)
│   │   ├── index.ts               # contextBridge.exposeInMainWorld('api', ...)
│   │   └── index.d.ts             # Global typed interface for window.api
│   │
│   └── renderer/                  # Vite + React Frontend (Browser runtime)
│       ├── index.html
│       └── src/
│           ├── main.tsx           # React entry point & i18n initialization
│           ├── App.tsx            # App root, providers, and view router
│           ├── components/        # UI components (ui/, layout/, library/, course/, player/, import/, vault/)
│           ├── pages/             # Route views (Home, Course, Player, History, Settings)
│           ├── stores/            # Zustand stores (useLibraryStore, usePlayerStore, useVaultStore, etc.)
│           ├── hooks/             # Custom React hooks (usePlayer, useCourseProgress, etc.)
│           ├── i18n/              # Locales (en/common.json, pt-BR/common.json)
│           ├── types/             # Shared TypeScript domain contracts
│           └── styles/            # Tailwind CSS and global styling variables
├── electron.vite.config.ts        # Unified build configuration
├── electron-builder.yml           # Packaging configuration
├── package.json
└── tsconfig.json
```

---

## 4. Key Architectural & Implementation Invariants

### 1. Electron Security Model
- `contextIsolation: true` and `nodeIntegration: false` are mandatory on all `BrowserWindow` instances.
- The Renderer process must **never** receive direct Node.js or unrestricted filesystem access.
- Expose only narrow, strongly typed methods via `contextBridge.exposeInMainWorld('api', ...)`.
- All privileged operations, database interactions, and filesystem mutations belong strictly in the **Main** process.
- **Never trust renderer-provided payloads or paths**: always validate, sanitize, and verify boundaries in the Main process before executing.

### 2. Database & Process Isolation
- **NEVER** import or execute `better-sqlite3` inside the `renderer/` process.
- Store database files strictly in:
  - App metadata: `app.getPath('userData')/config.db`
  - Vault metadata: `{vaultRoot}/.orbia/library.db`
- Enable WAL mode (`PRAGMA journal_mode = WAL;`) and enforce foreign keys (`PRAGMA foreign_keys = ON;`).

### 3. Content Source & Storage Abstraction
- The domain model must separate **course structure** from **physical storage location**.
- A `Course`, `Module`, `Lesson`, or `Resource` must **not** be tightly coupled to an absolute local path (e.g., `C:\path\to\file.mp4`).
- Storage identifiers should abstract the source provider (`local-vault`, `local-ref`, `google-drive`, etc.) and internal relative paths or remote IDs.
- **Google Drive (Core Pre-v1 Feature)**: The architecture must accommodate local files, vault files, and Google Drive resources (with states: remote-only, on-demand cached, local copy, offline availability). Do not overengineer prematurely, but design contracts to support multiple content providers.

### 4. Course Identity Survives Relocation
- Absolute filesystem paths must **never** be used as the primary identifier for courses, modules, or lessons.
- When course folders are moved to a different directory, external drive, or new computer, the user must be able to reconnect/repoint the root path without losing study progress, history, bookmarks, or notes.
- Do not compute expensive full-file hashes on multi-gigabyte video files; use stable UUIDs combined with lightweight structural heuristics (folder hierarchy, relative paths, file sizes).

### 5. Read-Only Scanner & Mutation Pipeline
- Scanning and filesystem mutations are strictly separated responsibilities.
- The course scanner is **read-only**; it must **never** rename, move, delete, or write files directly.
- All file organization actions must follow this strict pipeline:
  ```
  Scan ➔ Normalize ➔ Interpret ➔ Build Proposal ➔ Show Preview ➔ User Approves ➔ Build Operation Plan ➔ Execute ➔ Journal ➔ Undo Ready
  ```

### 6. File Operation Journal & Architectural Undo
- Undo is an architectural requirement, not an optional UI convenience.
- Every physical file mutation must generate an immutable journal entry containing:
  `operationId`, `groupId`, `type` (rename/move/copy), `sourcePath`, `destinationPath`, `originalFileName`, `newFileName`, `timestamp`, `status` (pending/completed/failed), and `errorDetails`.
- Operations must be grouped by import/organization batch for atomic inspection and full reversal.
- Before mutation: validate the operation plan, detect path collisions/locks, and require explicit user approval.
- If an operation is non-reversible, warn the user explicitly before execution.

### 7. Lightweight Backup & Migration
- Orbia libraries can hold hundreds of gigabytes or terabytes of video. Backup mechanisms must **NEVER** duplicate media files.
- Backup packages must be lightweight archives of: library structure, metadata, progress, history, notes, bookmarks, settings, content-source mappings, and file operation journals.
- A user must be able to export their metadata backup and restore it on another machine seamlessly.

### 8. Video Streaming & `media://` Protocol
- The `media://` scheme must be registered with `protocol.registerSchemesAsPrivileged` **BEFORE** `app.whenReady()` with `stream: true`, `supportFetchAPI: true`, and `bypassCSP: true`.
- Handlers must support HTTP `206 Partial Content` byte-range headers to enable scrub/seek functionality in HTML5 `<video>` elements without buffering entire files into memory.

### 9. Natural Sorting & Title Cleaning
- Numbered modules and lessons must be sorted with natural alphanumeric ordering (`Intl.Collator` with `{ numeric: true }` or regex-based numeric parsing) so `Lesson 10` succeeds `Lesson 9`.
- Raw filenames (e.g. `001 - Introducao ao Python_720p.mp4`) must be cleaned by the title cleaner service into readable titles (`Introdução ao Python`) while preserving the underlying storage URI.

### 10. Progress Tracking Persistence
- Playback position must be throttled during continuous video playback (every 3–5 seconds) to prevent I/O disk thrashing.
- Immediate persistence must be triggered on `pause`, `seeked`, `ended`, and window unload events.
- A lesson is marked complete when `currentTime / duration >= 0.90` (or manual toggle).

### 11. Internationalization (i18n)
- **Do not hardcode user-facing strings** in JSX or components.
- Always use `const { t } = useTranslation()` and store translation keys in `src/renderer/src/i18n/locales/{lang}/common.json`.

---

## 5. Testing Requirements

High-priority business logic requires dedicated unit and integration tests:
- **Core Algorithms**: Natural sorting, regex title cleaner, hierarchy detection heuristics, duplicate detection.
- **Data & Progress**: Progress calculation algorithms, throttled persistence logic, database migrations (up/down), backup export and restore.
- **File Mutation Engine**: Operation plan generation, collision/conflict detection, execution journal, and Undo rollback.
- **Path & Vault Handling**: Relative path resolution, cross-platform path separators (Windows `\` vs POSIX `/`), vault relocation/relinking.
- **Safety Invariant**: All tests involving filesystem mutations **MUST** execute exclusively within isolated temporary test directories (`tmp/`), never against real user course directories.

---

## 6. Version Scope Discipline

- Agents must work **strictly on the requested milestone/version**.
- If the active milestone is `v0.1`, do not implement features designated for `v0.2+` or speculative future systems.
- Do not introduce AI infrastructure, remote synchronization, or complex plugin systems before their scheduled milestone.
- Write simple, clean, and extensible code that solves the current goal well.

---

## 7. Technical Reference: Learnflix v2

- **Reference Repository**: [https://github.com/OnaitsirC-MiromA/learnflix-v2](https://github.com/OnaitsirC-MiromA/learnflix-v2)
- **Role**: Benchmark and source of technical ideas for local course parsing, natural sort, sidecar matching, playback persistence, and media streaming.
- **Boundary**: Do **not** clone Learnflix's visual UI, copy its architecture blindly, or restrict Orbia to its feature boundaries. Orbia has its own hybrid Vault architecture, physical file journal/undo, and multi-source vision.

---

## 8. Working with the User & Decision Protocol

When proposing architecture changes or answering product decisions:
1. **Explain the decision concisely.**
2. **Present 2–4 distinct, viable options** with clear trade-offs.
3. **Provide a clear recommendation** with technical rationale.
4. **Ask questions one at a time** — never overwhelm the user with multi-question surveys.
5. **Never make irreversible product or file-system decisions silently.**
