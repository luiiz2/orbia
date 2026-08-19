# Changelog

All notable changes to the **Orbia** desktop application will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0-mvp] - 2026-08-18

### Added
- **Core Architecture**:
  - Dual SQLite database engine (`better-sqlite3`) with WAL mode and foreign key constraints.
  - App-level config DB in `%APPDATA%/orbia/config.db` and portable Vault library DB in `{vault}/.orbia/library.db`.
  - Custom `media://` streaming protocol supporting HTTP 206 Partial Content byte-range requests for instant video scrubbing.
  - Electron security model: `contextIsolation: true`, `nodeIntegration: false`, and strongly typed IPC bridge.

- **Vault Management**:
  - Vault onboarding screen (`VaultSelector`) with recent vaults history.
  - Vault creation and validation (`Inbox/`, `Courses/`, `.orbia/covers/`, `library.db`).
  - Seamless vault switching modal (`VaultModal`).

- **Course Scanner & Organization**:
  - Recursive read-only directory walker (`scanner.service.ts`).
  - Automatic module and lesson hierarchy parser (`parser.service.ts`).
  - Regex-based title cleaner removing release tags, resolutions, and redundant numbers (`title-cleaner.ts`).
  - Natural alphanumeric sorting using `Intl.Collator` (`natural-sort.ts`).
  - Multi-step interactive Import Wizard with hierarchy preview, inline title editing, and storage mode selector (*Store in Vault* vs *Link by Reference*).

- **Cinematic Video Player**:
  - Custom video controls overlay with 2.5s inactivity fade-out.
  - Interactive seekbar with hover timestamp preview and buffer indicators.
  - Speed selector (0.5x to 3.0x), volume control with mute toggle, fullscreen, and theater mode.
  - Collapsible curriculum and resources side panel.
  - Keyboard shortcuts (`Space`/`k`, `Arrows`, `j`/`l`, `m`, `f`, `n`/`p`, `[`/`]`).
  - Auto-save throttled to SQLite every 3 seconds during playback.
  - Auto-completion when watching 90%+ of lesson duration.
  - 5-second auto-advance countdown banner upon lesson completion.

- **Library & Progress Views**:
  - Home page with *Continue Studying* resume rail and responsive course grid.
  - Course detail view with module syllabus accordion, progress indicators, and course deletion.
  - Chronological watch history page grouped by date.
  - Settings page with instant English / Portuguese (`pt-BR`) language switching and theme customization (`Dark`, `Light`, `System`).

- **Developer Experience & Quality**:
  - Vitest test suite with 29 passing unit and integration tests.
  - Unified TypeScript build configuration via `electron-vite`.
  - Structured logging with log rotation via `electron-log`.
  - React Error Boundary for UI fault tolerance.
