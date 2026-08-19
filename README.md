# 🪐 Orbia

> **Your personal, open-source learning universe.**  
> Transform disorganized folders of video lessons, PDFs, and course materials into a polished, distraction-free desktop study platform.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: Active Development](https://img.shields.io/badge/Status-v0.1--dev-orange.svg)]()

---

## 🌟 The Vision

Most self-learners accumulate gigabytes of course materials: video lessons, lecture slides, exercises, PDFs, and archives scattered across folders with messy names like `001.mp4`, `aula1.mp4`, or `Modulo 02/03_sub.mp4`.

**Orbia** bridges the gap between raw local files and modern course platforms (like Gran Cursos, Coursera, or Udemy). It gives you a unified, offline-first desktop app that automatically understands your course structure, tracks your exact study progress, and keeps you focused on learning.

---

## ✨ Key Concepts & Features

### 🏛️ Hybrid Study Vault
Inspired by tools like Obsidian, Orbia organizes your study world around the concept of a **Vault**:
- **Portable & Self-Contained**: The entire library database (`.orbia/library.db`) lives inside your vault folder. Copy or back up the vault folder, and you preserve your entire library, watch history, and progress.
- **Hybrid Flexibility**: Store courses directly inside the vault (`Courses/`) or link to existing directories anywhere on your disk by reference without duplicating files.
- **Inbox Workflow**: Drop new course folders into `Inbox/` and let Orbia detect and propose their organization.

### 🔍 Smart Detection & Organization (Zero-AI Required)
- **Automatic Hierarchy Detection**: Automatically parses directory nesting into Course ➔ Modules ➔ Lessons ➔ Sidecar Resources.
- **Natural Sorting**: `Lesson 2` reliably precedes `Lesson 10` (no more alphabetical sorting errors).
- **Title Cleaner Pipeline**: Strips release metadata (`[2024]`, `720p`), platform prefixes, numbering tags, and ugly underscores into clean, readable titles.
- **Preview & User Confirmation**: Orbia analyzes and suggests structure, but **you** always review and approve before anything is added or reorganized.

### 🎬 Distraction-Free Study Experience
- **Cinematic Video Player**: Custom HTML5 media engine with smooth scrubbing via native byte-range streaming (`media://` protocol).
- **Exact Progress Memory**: Automatically saves playback position down to the second (throttled every 3 seconds + upon pausing/seeking).
- **Granular Progress**: Real-time progress bars for each lesson, module, and overall course.
- **"Continue Studying" Rail**: Resume your active courses directly from the home dashboard in one click.
- **Watch History & Statistics**: Chronological timeline of past study sessions.

### 🛡️ Fundamental Principles
1. **Your files belong to you**: 100% local, offline-first, no mandatory account, zero telemetry.
2. **Never alter files silently**: Before any physical file renaming or moving, Orbia analyzes, proposes, previews, and waits for explicit user approval with full undo capability.
3. **AI is strictly optional**: Orbia is completely functional without AI. Optional AI enhancements (local LLM/transcription/flashcards) are reserved for future post-v1.0 iterations.
4. **Bilingual by Design**: Full internationalization from Day 1 (English and Portuguese pt-BR supported).

---

## 🏗️ Architecture & Tech Stack

```
Orbia Architecture
├── Electron (Main Process - Node.js)
│   ├── Vault Manager & App Configuration (%APPDATA%/orbia/config.db)
│   ├── Course Scanner & Heuristic Structure Parser
│   ├── SQLite Embedded Database (better-sqlite3) inside Vault (.orbia/library.db)
│   ├── Custom Media Streaming Protocol (media:// with HTTP 206 Partial Content)
│   └── Type-Safe IPC Bridge
├── Preload Layer (contextBridge)
└── React Frontend (Renderer - Vite + TypeScript)
    ├── Tailwind CSS v4 + Shadcn/UI (Dark theme default, Light mode supported)
    ├── Lucide Icons
    ├── Zustand 5.x State Stores
    └── i18next + react-i18next
```

---

## 🗺️ Roadmap & Versioning Strategy

Orbia follows semantic versioning moving gradually toward a stable v1.0:

### 🎯 v0.1 — Minimum Viable Product (Current Target)
- [ ] Create & open Vaults (Hybrid model: internal storage + external references)
- [ ] Course folder import with editable preview confirmation
- [ ] Heuristic module and lesson detection with natural sorting and title cleaning
- [ ] Course library grid with cover previews & progress indicators
- [ ] "Continue Studying" dashboard section
- [ ] Integrated custom video player with full keyboard controls & speed selector
- [ ] Exact timestamp resume & throttled auto-save
- [ ] Granular progress tracking (lesson completion at ≥90%, module & course progress)
- [ ] Chronological watch history
- [ ] Dark theme (primary) with bilingual support (EN / pt-BR)

### 🚀 v0.2 – v0.9 (Iterative Releases)
- [ ] Curriculum drawer & notes panel inside video player
- [ ] Subtitle (.srt / .vtt) sidecar auto-detection and conversion
- [ ] Attached lesson materials (PDF reader, slides, source archives)
- [ ] Global search & course filtering (In Progress, Completed, Favorites)
- [ ] Timestamped bookmarks and study notes
- [ ] Light mode theme support
- [ ] Physical file reorganizer with diff preview and undo system
- [ ] Google Drive integration (stream remote courses without full local duplication)

### 🌌 v1.0 & Beyond
- [ ] Stable public release & multi-platform installers (Windows, macOS, Linux)
- [ ] Optional local AI integrations (Whisper speech-to-text, video transcript search, smart summaries, flashcards)
- [ ] Study goals, streaks, and analytics dashboard
- [ ] Community plugin/extension system

---

## 🚀 Getting Started (Development)

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+ recommended)
- [npm](https://www.npmjs.com/) or [pnpm](https://pnpm.io/)
- C/C++ build tools (for `better-sqlite3` native compilation on your OS)

### Installation & Setup

```bash
# Clone the repository
git clone https://github.com/your-username/orbia.git
cd orbia

# Install dependencies
npm install

# Start development environment (Electron + Vite HMR)
npm run dev
```

### Build & Package

```bash
# Type check and build bundles
npm run build

# Package executable for your current OS
npm run build:win    # Windows installer (NSIS)
npm run build:mac    # macOS (.dmg)
npm run build:linux  # Linux (AppImage / deb)
```

---

## 🤝 Contributing

Contributions are warmly welcomed! Please read [`AGENTS.md`](./AGENTS.md) and our upcoming contribution guidelines before submitting Pull Requests.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
