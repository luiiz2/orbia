# Contributing to Orbia

Thank you for your interest in contributing to **Orbia**! We are building the modern, open-source, offline-first learning platform for personal course libraries.

---

## 🛠️ Development Setup

### Prerequisites

- **Node.js**: >= 20.0.0
- **npm**: >= 10.0.0
- **C++ Build Tools**: Visual Studio Build Tools (Windows) or Xcode Command Line Tools (macOS) for compiling `better-sqlite3`.

### Getting Started

1. **Clone the repository**:

   ```bash
   git clone https://github.com/orbia/orbia.git
   cd orbia
   ```

2. **Install dependencies & rebuild native modules**:

   ```bash
   npm install
   npm run rebuild
   ```

3. **Start Development Server**:

   ```bash
   npm run dev
   ```

4. **Run Tests**:

   ```bash
   npm test
   ```

5. **Typecheck & Production Build**:
   ```bash
   npm run typecheck
   npm run build
   ```

---

## 🏛️ Architecture & Guidelines

Before proposing code changes, please review [`AGENTS.md`](./AGENTS.md) and [`README.md`](./README.md) for core architectural invariants:

1. **Zero Telemetry & Local First**: All metadata and progress stay in SQLite on the user's disk.
2. **Never Silent**: The file scanner is strictly read-only. No file renaming or relocation occurs without user approval.
3. **Dual SQLite Topology**: Global configuration in `%APPDATA%/orbia/config.db`, course metadata and progress in `{vault}/.orbia/library.db`.
4. **Range Streaming**: The `media://` custom protocol provides HTTP 206 Partial Content byte ranges for seek operations.
5. **i18n Bilingual**: All user-facing strings must use `useTranslation()` (`en` and `pt-BR`).

---

## 📝 Commit & PR Guidelines

- Write clean, descriptive commit messages.
- Add unit tests for any new parser heuristics, title cleaners, or database queries.
- Ensure `npm test` and `npm run typecheck` pass with 0 errors before submitting a pull request.
