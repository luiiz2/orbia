# Google Drive shared content and download flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing read-only Google Drive integration so the Orbia browser exposes both “Meu Drive” and “Compartilhados comigo”, navigates shared folders recursively, and offers independent remote preview, external opening, and user-initiated downloads without exposing OAuth credentials to the renderer.

**Architecture:** Keep Google authentication, Drive API calls, stream handling, save-dialog interaction, and external-link validation in the Electron main process. Extend the existing typed preload bridge and reuse the existing browser modal. The shared-with-me root is a synthetic navigation root; folders opened from it retain their `driveId` so descendants work for shared drives as well. Downloads stream directly from Drive to a path chosen through the native save dialog and never return a token or raw stream over IPC.

**Tech Stack:** Electron, React, TypeScript, native `fetch`, Node streams/promises, Zustand-free local modal state, Vitest, existing Lucide icons and i18n dictionaries.

**Spec:** This plan supersedes the current Google Drive remote-viewing-only limit documented in `docs/superpowers/plans/2026-08-30-google-drive-remote-viewing.md`. It covers the approved extension only; it does not add write access, upload, rename, delete, or Drive mutation operations.

## Global Constraints

- Preserve the existing encrypted refresh-token flow and read-only Drive scope.
- Never send OAuth access tokens, refresh tokens, authorization headers, or raw Node streams through `window.api`.
- Keep user files and Google Drive contents unchanged; a download happens only after the user explicitly presses “Baixar” and confirms the native save dialog.
- Preserve existing My Drive browsing, remote playback sessions, recursive source reconciliation, and current preview types.
- Do not add a Google SDK or another parallel storage/download subsystem.
- Do not persist the supplied OAuth Client ID in source, `.env`, tests, plans, logs, or commits. Configure it only in the Windows user environment.
- Preserve the dirty worktree and do not reset, clean, or commit unrelated changes.
- Do not use `truncate`, fixed-width action columns, or compressed responsive layouts where a label can be cut. Long names and action labels must wrap or reflow.

---

## Task 1: Extend Drive contracts and API client for shared-with-me pagination

**Files:**
- Modify `src/types/google-drive.ts`
- Modify `src/main/services/sources/google/google-drive-client.ts`
- Extend `test/sources/google-drive-remote-viewing.test.ts`

- [x] Add explicit types for `GoogleDriveBrowseRoot` (`'my-drive' | 'shared-with-me'`), download input/result metadata, and optional entry capabilities (`canPreview`, `webViewUrl`). Keep `driveId` on every entry and breadcrumb-relevant response.
- [x] Add `GoogleDriveSourceClient.listSharedWithMe(options?: { pageToken?: string })` with the query `sharedWithMe = true and trashed = false`, `pageSize=100`, `orderBy=name_natural`, the existing Drive fields plus `webViewLink`, and `includeItemsFromAllDrives=true`/`supportsAllDrives=true`.
- [x] Preserve the optional `driveId` and `webViewLink` from shared listings through folder navigation and authoritative metadata lookup, while preserving the existing My Drive call shape.
- [x] Add failing Vitest cases for the shared-with-me query, pagination token propagation, shared-drive flags, and preservation of `driveId`/`webViewLink` in mapped entries.
- [x] Run the focused source tests and confirm they fail for the missing client behavior before implementation.
- [x] Implement the smallest client/query changes, rerun the focused tests, and inspect the diff for accidental scope expansion.

## Task 2: Add service-level shared root, preview capability, and download preparation

**Files:**
- Modify `src/main/services/sources/google/google-drive.service.ts`
- Modify `src/types/google-drive.ts` if the service result contracts require a narrow adjustment
- Extend `test/sources/google-drive-remote-viewing.test.ts`

- [x] Add `GoogleDriveService.listSharedWithMe(options?: { pageToken?: string })`, returning a synthetic folder listing named “Compartilhados comigo” without calling `getFile('shared-with-me')`.
- [x] Keep `listFolder(folderId, { driveId, pageToken })` recursive for real folders and ensure the supplied `driveId` is retained when resolving metadata and children.
- [x] Enrich playback metadata with `canDownload`, `canPreview`, and `webViewUrl`; retain the existing MIME allowlist for in-Orbia preview.
- [x] Add an internal main-process-only download preparation method that re-fetches authoritative metadata, rejects folders and explicit `canDownload === false`, and returns the Drive stream plus filename, MIME type, size, and optional external URL. It must not expose credentials or be part of the renderer-facing type surface.
- [x] Add tests for shared-root listing, recursive shared-folder listing, permission-denied download preparation, unsupported-but-downloadable files, and preview metadata.
- [x] Run the focused tests to establish the expected failures, implement the service changes, and rerun until green.

## Task 3: Implement secure main-process download and external-open IPC

**Files:**
- Modify `src/main/ipc/sources.ipc.ts`
- Modify `src/main/services/sources/google/google-drive.service.ts` only if the stream preparation contract needs wiring
- Extend `test/sources/source-ipc.test.ts`

- [x] Add validated handlers for `sources:google-list-shared-with-me`, `sources:google-download`, and `sources:google-open-external`.
- [x] Make the download handler show Electron’s native save dialog before opening the remote stream, use a sanitized metadata filename as the default, stream with `pipeline` into the selected path, and remove only an exact partial target if the transfer fails.
- [x] Return only serializable status (`success`, `cancelled`, `fileName` when appropriate, byte count, and sanitized error messages); never return a token, authorization header, stream, local path, or credential-store value.
- [x] Allow external opening only for HTTPS Drive/Google document URLs obtained from authoritative metadata; keep URL validation in Main and use Electron `shell.openExternal` there.
- [x] Add IPC tests for argument validation, shared-root pagination, canceling the save dialog without a network request, successful streamed download, permission failure, partial-file cleanup, and rejection of untrusted external URLs.
- [x] Run the focused IPC tests, implement the handlers, and rerun them with the existing source IPC coverage.

## Task 4: Extend the typed preload bridge

**Files:**
- Modify `src/types/api.ts`
- Modify `src/preload/index.ts`
- Modify `src/preload/index.d.ts` if the project’s generated/global declarations require it

- [x] Add typed bridge methods for `listSharedWithMe`, `download`, and `openExternal` using only serializable inputs and results.
- [x] Keep the existing `listFolder`, `preparePlayback`, connect, disconnect, and status methods backward compatible.
- [x] Add or update compile-level assertions in the existing API/preload tests if present; otherwise verify through the project typecheck.
- [x] Run `npm run typecheck` and correct any mismatch before touching the renderer.

## Task 5: Redesign the Google Drive browser interaction around roots and separate actions

**Files:**
- Modify `src/renderer/src/components/import/GoogleDriveBrowserModal.tsx`

- [x] Add visible tabs/buttons for “Meu Drive” and “Compartilhados comigo”; switching tabs resets breadcrumbs to the appropriate synthetic root and requests the matching first page.
- [x] Track breadcrumb kind and `driveId` explicitly so a folder opened from shared-with-me can be revisited and paginated recursively without falling back to My Drive.
- [x] Keep folders navigable and replace the current single file row button with a semantic row containing separate “Visualizar”, “Baixar”, and, when needed, “Abrir no Google Drive” actions. Avoid nested interactive elements.
- [x] Show “Visualizar” only for supported preview MIME types, but keep “Baixar” for every permitted downloadable file, including unsupported preview types. Use the external-open action for Google-native files or files without an in-app preview URL.
- [x] Add the same independent actions to the preview header and show non-blocking download progress/result feedback without leaking implementation details.
- [x] Keep “Carregar mais” pagination working independently for each root and folder, and preserve refresh, disconnect, account display, and existing preview behavior.
- [x] Reflow the modal at narrow widths: stack row actions, allow long course/file names to wrap, keep button labels intact, and preserve visible keyboard focus.
- [x] Run the relevant renderer/type checks, inspect the rendered structure for nested buttons and clipped labels, and fix any accessibility or layout regressions.

## Task 6: Add translations for the new Drive flow

**Files:**
- Modify `src/renderer/src/i18n/locales/pt-BR/common.json`
- Modify `src/renderer/src/i18n/locales/en/common.json`

- [x] Add keys for both root tabs, separate preview/download/open actions, download states, save cancellation, unsupported-preview guidance, shared-folder errors, and completion/failure feedback.
- [x] Keep Portuguese wording consistent with the existing UI and ensure English has complete fallbacks; do not hardcode new user-facing strings in the component.
- [x] Run JSON parsing/type checks and verify no translation key is missing from either locale.

## Task 7: Verify the complete flow and preserve existing behavior

**Files:**
- Modify only the focused tests above, or add `test/sources/google-drive-download.test.ts` only if the existing suites cannot express the stream/cleanup regression safely

- [x] Run focused Google Drive client, service, and IPC tests covering shared-with-me, recursive folders, pagination, permissions, preview fallback, external opening, and downloads.
- [x] Run `npx vitest run` for the complete repository suite.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build`; if the sandbox blocks the existing Electron/Vite config access, rerun the same build with the approved elevated command path and record that environment limitation separately from project failures.
- [x] Review `git diff --check` and the focused diff; confirm no OAuth secret, token, raw stream, unrelated deletion, or accidental file-system mutation entered the patch.

## Task 8: Configure the supplied OAuth Client ID and validate local startup

**Files:**
- No repository file should contain the supplied Client ID.

- [x] Set `ORBIA_GOOGLE_DRIVE_CLIENT_ID` as a Windows user environment variable and set it in the current development process for immediate verification, without echoing its value in terminal output or logs.
- [x] Start the local app/build using the configured environment and verify that Google Drive status changes from “não configurado” to the connectable state.
- [ ] Validate the OAuth browser flow with the user’s Google account, then verify both root tabs and at least one shared folder before claiming end-to-end completion.
- [ ] If Google Cloud configuration still blocks login, report the exact missing external prerequisite (Drive API, OAuth consent/test user, or redirect/client configuration) without weakening the app’s local security behavior.

## Final self-review

- [x] Confirm every approved requirement maps to an implementation or a named validation step.
- [x] Scan the final diff for `TODO`, placeholder URLs, clipped-label classes, duplicate buttons with the same action, and renderer-visible credential material.
- [x] Report modified files, tests executed, external OAuth prerequisites, and any environment-only limitation separately.
