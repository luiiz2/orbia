# Google Drive Remote Viewing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Orbia to Google Drive over the internet and browse/view selected files without Google Drive Desktop or downloading the course to disk.

**Architecture:** Keep OAuth, refresh tokens, Drive API calls, and remote playback sessions in the Main process. Store only an encrypted refresh token with Electron `safeStorage`; expose path-free metadata and opaque `media://playback/<session>` URLs through the preload bridge. Reuse the existing `SourceAdapter` seam and media protocol, while leaving the existing local import flow intact.

**Tech Stack:** Electron Main, native Node `fetch`, loopback OAuth with PKCE, Electron `safeStorage`, existing source adapters/repository seam, React dialog, TypeScript, Vitest.

**Spec:** `docs/superpowers/plans/2026-08-24-orbia-v0.8-connected-library.md` sections 14, 15, 20, and 21.

## Tasks

- [x] Add focused Google Drive contracts, encrypted credential storage, OAuth connection/status, and a Drive API client with pagination, metadata, and range-aware media requests.
- [x] Add a Google Drive source adapter and opaque remote playback sessions; extend `media://` to stream Drive responses with validated ranges and backpressure, without writing media to disk.
- [x] Expose connect, disconnect, browse, and playback preparation through Main IPC, preload, and the typed API bridge.
- [x] Replace the local synced-folder workaround in the import UI with a Google Drive browser/preview dialog for folders, video/audio, PDFs, and images.
- [x] Add focused regression tests for OAuth credential handling, Drive pagination/range behavior, remote session authorization, and IPC-safe response shapes; run targeted tests, typecheck, lint, full tests, and build.

## Important Limits

- A Google Cloud OAuth Desktop client ID must be configured as `ORBIA_GOOGLE_DRIVE_CLIENT_ID`; no credential or secret is committed to the repository.
- The first vertical slice is read-only browsing and on-demand viewing. It does not silently import, rename, delete, or cache the user’s Drive files.
- Google Docs/Sheets/Slides native editor files are listed but are not treated as downloadable media by this slice; binary media and PDFs/images are streamed when Drive permits download.
