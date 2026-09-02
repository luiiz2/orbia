# Dead Code Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Orbia source files, symbols, state, and dependencies that have no active consumer while preserving active runtime paths, test-only domain coverage, and pre-existing worktree changes.

**Architecture:** Build a conservative static import graph from the Main, preload, and renderer entrypoints, then confirm candidates with repository-wide references. Delete only files with no production consumer, remove symbols with no source/test consumer, and remove state or translations whose sole consumer is an unreachable component; keep ambient declarations and test-only algorithm helpers unless their tests are also obsolete.

**Tech Stack:** TypeScript, React, Electron/Vite, Zustand, Vitest, ESLint.

**Spec:** User request to inspect Orbia and remove dead code.

## Global Constraints

- Preserve all pre-existing working-tree changes; do not reset, clean, or overwrite unrelated files.
- Treat `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/main.tsx`, `src/preload/index.d.ts`, and `src/renderer/src/env.d.ts` as entrypoint or ambient files even when they have no importers.
- Confirm every deletion with repository-wide references and the static entrypoint graph.
- Do not remove test-only organization or review helpers in this pass because their tests are explicit consumers and deletion would reduce meaningful coverage.
- Do not add dependencies, refactor active services, or change observable application behavior.

---

### Task 1: Establish the dead-code inventory

**Files:**

- Read: `src/main/index.ts`, `src/main/ipc/index.ts`, `src/preload/index.ts`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`
- Read: `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `electron.vite.config.ts`, `package.json`
- Read: all candidate files returned by the source import graph

- [x] **Step 1: Record the current worktree boundary**

Run:

```powershell
git status --short
git diff --name-only
```

Preserve every existing modified path and limit edits to newly confirmed dead-code paths.

- [x] **Step 2: Verify unused local symbols are not hiding behind compiler configuration**

Run:

```powershell
npx tsc --noEmit -p tsconfig.node.json --composite false --noUnusedLocals --noUnusedParameters
npx tsc --noEmit -p tsconfig.web.json --composite false --noUnusedLocals --noUnusedParameters
```

Use the result as supporting evidence, not as the sole deletion criterion because exported symbols are intentionally exempt.

### Task 2: Delete unreachable source files and stale barrels

**Files:**

- Delete: `src/main/services/search/index.ts`
- Delete: `src/main/services/semantic-index/index.ts`
- Delete: `src/main/services/transcription/index.ts`
- Delete: `src/main/utils/module-identity.ts`
- Delete: `src/main/utils/search-utils.ts`
- Delete: `src/renderer/src/components/documents/index.ts`
- Delete: `src/renderer/src/components/import/index.ts`
- Delete: `src/renderer/src/components/layout/index.ts`
- Delete: `src/renderer/src/components/player/index.ts`
- Delete: `src/renderer/src/components/vault/index.ts`
- Delete: `src/renderer/src/components/import/ImportModal.tsx`
- Delete: `src/renderer/src/components/layout/Sidebar.tsx`
- Delete: `src/renderer/src/components/library/ContinueStudying.tsx`
- Delete: `src/renderer/src/components/library/EmptyLibrary.tsx`
- Delete unused `ContentSource` type from `src/types/course.ts`
- Remove unused media source adapters from `src/main/services/optimizer/media-source-input.ts`
- Remove unused `isAudioFile` and `areModuleTitlesEquivalent` helpers
- Remove the unused `@radix-ui/react-tabs` dependency from `package.json` and `package-lock.json`

- [x] **Step 1: Reconfirm each deletion has no active importer**

Run:

```powershell
rg -n "ImportModal|Sidebar|module-identity|main/utils/search-utils|services/search|services/semantic-index|services/transcription|components/documents|components/import|components/layout|components/player|components/vault" src test docs
```

Ignore references inside the candidate files themselves and inside historical plan text; retain any file with a real runtime or test import.

- [x] **Step 2: Apply the file deletions**

Delete only the files listed above. Do not replace their exports with a new barrel or compatibility layer because no in-repository consumer exists.

- [x] **Step 3: Re-run TypeScript checks after deletion**

Run:

```powershell
npx tsc --noEmit -p tsconfig.node.json --composite false
npx tsc --noEmit -p tsconfig.web.json --composite false
```

Expected: both commands exit 0 and no active import points to a deleted file.

### Task 3: Remove state and locale entries owned only by the dead sidebar

**Files:**

- Modify: `src/renderer/src/stores/useNavigationStore.ts`
- Modify: `src/renderer/src/i18n/locales/en/common.json`
- Modify: `src/renderer/src/i18n/locales/pt-BR/common.json`

- [x] **Step 1: Remove the unused sidebar contract**

Delete `isSidebarCollapsed`, `toggleSidebar`, and `setSidebarCollapsed` from the `NavigationState` interface and store initializer. Keep all navigation actions used by `App`, `TopBar`, shortcuts, pages, and source-navigation tests.

- [x] **Step 2: Remove the unused sidebar translation**

Delete only the `toggleSidebar` key from both locale objects. Keep the other navigation labels and preserve valid JSON.

- [x] **Step 3: Verify no remaining reference exists**

Run:

```powershell
rg -n "isSidebarCollapsed|toggleSidebar|setSidebarCollapsed" src test
```

Expected: no matches.

### Task 4: Review and verify the cleanup

**Files:**

- Read: complete final diff for all cleanup-owned paths
- Read: final worktree status

- [x] **Step 1: Check the diff and static graph**

Run:

```powershell
git diff --check
git diff --stat
git diff -- src/main src/renderer/src/stores/useNavigationStore.ts src/renderer/src/i18n/locales/en/common.json src/renderer/src/i18n/locales/pt-BR/common.json
```

Confirm no pre-existing modified file was accidentally changed and no deleted path remains referenced by active source.

- [x] **Step 2: Run required validation**

Run:

```powershell
npx vitest run
npm run typecheck
npm run lint
npm run build
```

Report any failure with its exact command and distinguish pre-existing worktree failures from cleanup regressions.
