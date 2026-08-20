# Safe Course Content Import — P0 Specification

## Goal

Import folders and ZIP archives without silently losing, moving, overwriting, or deleting user content. Every scanned regular file must remain represented in the imported course as a lesson, a module resource, a lesson resource, a subtitle, or a cover resource.

## Decisions already made

- The pipeline is `Scan -> Normalize -> Interpret -> Proposal -> Preview -> Approve -> Operation Plan -> Execute -> Journal -> Undo ready`.
- A ZIP source remains untouched while the preview is prepared. Extraction happens in a unique app-owned staging directory.
- Validation is strict: every ZIP entry is checked after extraction and video/audio files are decoded with the bundled FFmpeg before the proposal can be approved.
- A failed validation blocks import and exposes retry, cancel, and replacement/reselection choices. Cancelling removes only staging data.
- Managed imports move validated content to `Vault/Courses/` only after approval. External folder imports remain references.
- The persisted `deleteSourceZipAfterImport` preference is honoured only after successful validation, file operations, and database persistence.
- Duplicate candidates are never silently removed. The preview recommends a resolution, but the user chooses whether to keep both or exclude an item. Any deletion is limited to the managed vault and journaled.
- Files with the same normalized module title enter the same module; a new module is created only when no matching module exists.
- Unknown extensions are preserved as resources, but this must not broaden the renderer's allowlist for `shell.openPath` or `media://`.

## Content classification

1. Video and audio files are lessons.
2. Subtitle sidecars (`.srt`, `.vtt`, `.sub`, `.ass`) with the same normalized stem as a lesson attach to that lesson.
3. A cover/thumbnail remains a `cover` resource and may also supply the visual cover; it is never dropped from the inventory.
4. PDFs, documents, images, archives, links, spreadsheets, code, and unknown regular files become resources of their containing module unless an explicit lesson-sidecar rule attaches them to a lesson.
5. A module containing only resources is valid and remains visible in the proposal and stored course.

## Persistence and security

- Add `content_resources` with a required course and module owner and optional lesson owner. Save and hydrate it in the existing course hierarchy transaction.
- Existing courses and lessons remain compatible. No automatic migration attempts to infer resources that were previously discarded.
- Keep the safe-open/media protocol allowlists separate from content inventory classification.

## Out of scope

- Cloud/Google Drive import.
- Recovery of files omitted by prior imports without an explicit user-initiated re-scan.
- Automatic deletion of source folders or ZIPs after failed validation.
