# Safe Course Content Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` for the sequential tasks in this plan. The tasks share the import contracts and should not be implemented concurrently.

**Goal:** Make ZIP and folder imports safe, preview-first, and lossless while persisting module/lesson resources and user-controlled duplicate decisions.

**Architecture:** Archive preparation becomes an app-owned, uniquely named staging operation that cannot mutate the source. A main-process import session owns that staging path until approve/cancel; commit materializes managed content, journals filesystem operations, then persists the database hierarchy. The parser classifies every scanned regular file into a lesson or resource, and the existing SQLite hierarchy transaction persists those resources.

**Tech Stack:** Electron main/preload IPC, TypeScript, better-sqlite3, AdmZip, fluent-ffmpeg with ffmpeg-static, React, Zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-20-safe-content-import.md`

## Global Constraints

- Preserve the Electron main/renderer security boundary; never trust renderer paths or staging directories.
- Scanner remains read-only against user course sources.
- Perform every source mutation only after preview approval through an operation plan and journal entry.
- Preserve the existing safe-open and `media://` allowlists; content inventory is a separate classification.
- Use isolated test directories for filesystem tests.
- Run focused tests after each cohesive task; run the full suite only for final integration, cross-cutting regressions, or failure diagnosis.
- Do not commit, push, merge, or delete user source content without explicit user approval.

---

### Task 1: Make ZIP preparation source-preserving and strictly validated

**Files:**

- Modify: `src/main/services/archive.service.ts`
- Create: `src/main/services/media-validation.service.ts`
- Modify: `test/archive.test.ts`
- Create: `test/media-validation.test.ts`

**Interfaces:**

- Produces `PreparedArchive` with `sourcePath`, `stagingRoot`, `extractedPath`, `entries`, `verificationOk`, `failedEntries`, and `warnings`.
- Produces `MediaValidationResult` with `{ valid: boolean; failedFiles: string[]; warnings: string[] }`.
- Consumed by Task 2's main-process import session; no renderer receives the staging filesystem path as authority.

- [ ] **Step 1: Write source-preservation regression tests**

```ts
it('prepares a ZIP in unique staging without moving or deleting the source', async () => {
  const result = await archiveService.prepareZip({
    zipPath: zipFilePath,
    stagingBaseDir: stagingDir
  })

  expect(fs.existsSync(zipFilePath)).toBe(true)
  expect(result.extractedPath).not.toContain(
    path.join('Inbox', path.basename(zipFilePath, '.zip'))
  )
  expect(
    fs.existsSync(path.join(result.extractedPath, 'Module 01', 'Lesson.mp4'))
  ).toBe(true)
})

it('fails validation when two ZIP entries normalize to the same target path', async () => {
  const result = await archiveService.prepareZip({
    zipPath: duplicateEntryZip,
    stagingBaseDir: stagingDir
  })

  expect(result.verificationOk).toBe(false)
  expect(result.failedEntries).toContain('Module 01/Lesson.mp4')
})
```

- [ ] **Step 2: Run the archive tests and verify the new tests fail because `prepareZip` does not exist**

Run: `npm test -- test/archive.test.ts`

Expected: the new tests fail for the missing method or the current transfer-before-preview behavior, while unrelated archive tests remain readable.

- [ ] **Step 3: Implement isolated archive preparation and entry-by-entry verification**

```ts
export interface PreparedArchive {
  sourcePath: string
  stagingRoot: string
  extractedPath: string
  totalEntries: number
  totalExtractedFiles: number
  verificationOk: boolean
  failedEntries: string[]
  warnings: string[]
}

public async prepareZip(options: PrepareZipOptions): Promise<PreparedArchive> {
  const stagingRoot = fs.mkdtempSync(path.join(options.stagingBaseDir, 'orbia-import-'))
  const stagedArchivePath = path.join(stagingRoot, path.basename(options.zipPath))
  fs.copyFileSync(options.zipPath, stagedArchivePath)
  // Extract each normalized entry exactly once, reject collisions, then compare
  // every expected relative path and byte length to the staged output.
}
```

Keep `extractZip` only as a compatibility wrapper if another internal caller still needs it; it must delegate to source-preserving preparation and never transfer or delete the source. Add `discardPreparedArchive(stagingRoot)` that only accepts a resolved path below the app-owned staging base.

- [ ] **Step 4: Write the failing decode-validation tests**

```ts
it('reports a video that FFmpeg cannot decode', async () => {
  const result = await validateMediaFiles([corruptVideo], {
    runProcess: failingFfmpeg
  })

  expect(result.valid).toBe(false)
  expect(result.failedFiles).toEqual([corruptVideo])
})

it('does not flag non-media resources for decode validation', async () => {
  const result = await validateMediaFiles([pdfPath, textPath], {
    runProcess: failingFfmpeg
  })

  expect(result.valid).toBe(true)
})
```

- [ ] **Step 5: Implement full video/audio decode validation**

```ts
export async function validateMediaFiles(
  filePaths: string[],
  dependencies: MediaValidationDependencies = defaultDependencies
): Promise<MediaValidationResult> {
  const mediaFiles = filePaths.filter(
    (filePath) => isVideoFile(filePath) || isAudioFile(filePath)
  )
  // Run bundled ffmpeg with `-v error -i <file> -f null -` for each media file.
  // A non-zero exit marks that file invalid; no source or staged content is removed here.
}
```

Invoke this validator after archive-entry verification. A missing FFmpeg binary or decode failure produces `verificationOk: false`; it never silently downgrades to success.

- [ ] **Step 6: Run focused archive and media-validation tests**

Run: `npm test -- test/archive.test.ts test/media-validation.test.ts`

Expected: all tests pass, the original ZIP remains in place, and invalid staged content is reported without source mutation.

### Task 2: Introduce main-process import sessions and deferred managed-vault operations

**Files:**

- Create: `src/main/services/import-session.service.ts`
- Modify: `src/main/ipc/courses.ipc.ts`
- Modify: `src/main/services/vault.service.ts`
- Modify: `src/main/services/database.service.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/types/api.ts`
- Modify: `src/types/vault.ts`
- Modify: `test/e2e-workflow.test.ts`
- Create: `test/import-session.test.ts`

**Interfaces:**

- `prepareZipImport(zipPath): ImportPreparationResult` returns opaque `sessionId`, proposal, validation state, warnings, and source kind.
- `cancelImportSession(sessionId)` destroys only staging data.
- `commitImportSession({ sessionId, proposal, isExternal, duplicateResolutions })` resolves the source in Main, creates a managed operation plan when needed, journals it, and returns a saved course.
- Task 4 consumes the typed preparation result and session ID; Task 3's proposal resources flow through this contract unchanged.

- [ ] **Step 1: Write failing session lifecycle tests**

```ts
it('cancels a prepared ZIP import without changing the original ZIP', async () => {
  const prepared = await sessions.prepareZipImport(zipFilePath)
  await sessions.cancel(prepared.sessionId)

  expect(fs.existsSync(zipFilePath)).toBe(true)
  expect(fs.existsSync(prepared.stagingRoot)).toBe(false)
})

it('moves validated staged content to Courses only after commit and journals the move', async () => {
  const prepared = await sessions.prepareZipImport(zipFilePath)
  const result = await sessions.commit({
    sessionId: prepared.sessionId,
    proposal,
    isExternal: false
  })

  expect(result.course.course.rootPath).toContain(path.join('Courses', ''))
  expect(databaseService.getFileOperations(result.operationGroupId)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'move', status: 'completed' })
    ])
  )
})
```

- [ ] **Step 2: Run the new session tests and verify the missing session contract fails**

Run: `npm test -- test/import-session.test.ts test/e2e-workflow.test.ts`

Expected: failure identifies the missing service/IPC behavior rather than a temporary-directory setup error.

- [ ] **Step 3: Implement a bounded in-memory import-session service**

```ts
interface ImportSession {
  id: string
  source: { kind: 'zip' | 'folder'; originalPath: string }
  preparedRoot: string
  proposal: ProposedCourseStructure
  validation: ImportValidationResult
  createdAt: number
}

class ImportSessionService {
  prepareZipImport(zipPath: string): Promise<ImportPreparationResult>
  getApproved(sessionId: string): ImportSession
  cancel(sessionId: string): Promise<void>
  commit(
    sessionId: string,
    operation: ApprovedImportOperation
  ): Promise<CommittedImport>
}
```

Validate the source and session in Main. Sessions expire/clean up on cancel and failed commit. ZIP imports must be managed-vault imports because external references cannot point to cleaned staging content.

- [ ] **Step 4: Implement deferred operation planning, rollback, and setting read at commit time**

```ts
const destinationRoot = vaultService.createUniqueCourseDirectory(
  courseId,
  proposal.suggestedTitle
)
const operation = {
  type: 'move',
  sourcePath: preparedRoot,
  destinationPath: destinationRoot
}
databaseService.recordFileOperation({
  ...operation,
  status: 'pending',
  isReversible: true
})
try {
  fs.renameSync(preparedRoot, destinationRoot)
  databaseService.saveCourseWithHierarchy(rebasedCourse)
  databaseService.markFileOperationCompleted(operation.operationId)
  if (appConfigService.getSettings().deleteSourceZipAfterImport)
    deleteSourceZipAfterCommit()
} catch (error) {
  rollbackManagedMove(operation)
  databaseService.markFileOperationFailed(operation.operationId, String(error))
  throw error
}
```

Never overwrite an existing destination. A collision becomes an explicit conflict result. Read `deleteSourceZipAfterImport` from the config service at commit time, then journal deletion/quarantine only after all prior steps succeed.

- [ ] **Step 5: Wire typed preload/IPC contracts and update settings coverage**

Add warning, failed-entry, validation, and conflict fields to `OrbiaApi`; remove the old pre-preview `extractZip` renderer flow. Add an app-config re-open test proving `deleteSourceZipAfterImport` survives a new service instance.

- [ ] **Step 6: Run focused session, archive, config, and e2e tests**

Run: `npm test -- test/import-session.test.ts test/archive.test.ts test/app-config.test.ts test/e2e-workflow.test.ts`

Expected: cancel is non-mutating, commit materializes into `Courses`, source-ZIP deletion is deferred/persisted, and a filesystem/database failure rolls back the move.

### Task 3: Preserve and persist all content as module and lesson resources

**Files:**

- Modify: `src/types/course.ts`
- Modify: `src/main/utils/file-utils.ts`
- Modify: `src/main/services/parser.service.ts`
- Modify: `src/main/services/database.service.ts`
- Modify: `src/main/ipc/courses.ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/types/api.ts`
- Modify: `test/file-utils.test.ts`
- Modify: `test/parser.test.ts`
- Modify: `test/database.test.ts`
- Modify: `test/merge-courses.test.ts`
- Modify: `test/notes-and-subtitles.test.ts`

**Interfaces:**

- `ContentResource` has course/module ownership, optional lesson ownership, name/path/extension/size/media type, role, and optional fingerprint.
- `ProposedModule.resources` and `ProposedLesson.resources/subtitles` carry the same inventory through preview and commit.
- `content_resources` is saved and hydrated with the existing hierarchy transaction.

- [ ] **Step 1: Write failing parser tests for sidecars, module materials, and unknown files**

```ts
it('attaches a matching SRT to its video and preserves module materials', async () => {
  const proposal = await parserService.parseCourseHierarchy(
    scannedCourseWithVideoSubtitlePdfAndXlsx
  )
  const module = proposal.modules[0]

  expect(module.lessons[0].subtitles).toEqual([
    expect.objectContaining({ format: 'srt' })
  ])
  expect(module.resources).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'apostila.pdf', role: 'attachment' }),
      expect.objectContaining({ name: 'planilha.xlsx', mediaType: 'other' })
    ])
  )
})

it('retains a module containing only resources', async () => {
  const proposal = await parserService.parseCourseHierarchy(
    scannedMaterialsOnlyModule
  )
  expect(proposal.modules[0]).toMatchObject({
    lessons: [],
    resources: [expect.any(Object)]
  })
})
```

- [ ] **Step 2: Run parser/file classification tests and verify the resource contract fails**

Run: `npm test -- test/file-utils.test.ts test/parser.test.ts`

Expected: failure shows absent proposal resource arrays or discarded subtitle/unknown files.

- [ ] **Step 3: Add a content-inventory type distinct from executable/openable media**

```ts
export type ContentResourceRole = 'attachment' | 'subtitle' | 'cover'

export interface ContentResource {
  id: string
  courseId: string
  moduleId: string
  lessonId?: string
  name: string
  filePath: string
  extension: string
  sizeBytes: number
  mediaType: MediaType
  role: ContentResourceRole
  fingerprint?: string
}
```

Keep `isSafeToOpenFile` (or the existing safe-open predicate) separate from `isScannableContentFile`. The parser must inventory every non-ignored regular file; it must not reuse `isImportableFile` if that predicate is also checked by `system:open-path`.

- [ ] **Step 4: Implement parser classification without destructive deduplication**

```ts
const lessons = files.filter(isPlayableLessonFile).map(buildLesson)
const resources = files
  .filter((file) => !isPlayableLessonFile(file))
  .map(buildResource)
attachSubtitleResourcesByNormalizedStem(lessons, resources)
attachCoverResources(lessons, resources)

return { ...module, lessons, resources }
```

Leave all duplicate candidates in the proposal. Fingerprints/names/sizes form `DuplicateCandidateGroup` metadata only; they do not remove modules, lessons, or resources.

- [ ] **Step 5: Write failing database round-trip and cascade tests**

```ts
it('round-trips module resources and lesson subtitles with a course hierarchy', () => {
  databaseService.saveCourseWithHierarchy(courseWithResources)
  const loaded = databaseService.getCourseById(courseWithResources.course.id)!

  expect(loaded.modules[0].resources).toHaveLength(2)
  expect(loaded.modules[0].lessons[0].subtitles).toHaveLength(1)
})
```

- [ ] **Step 6: Add `content_resources` persistence and hydrate derived subtitle tracks**

Create the table with foreign keys for course/module and nullable lesson. Insert resources in the existing save transaction, hydrate resources per module/lesson in `getCourseById`, and derive `Lesson.subtitles` from subtitle resources without breaking existing stored lessons.

- [ ] **Step 7: Preserve resources through course IPC mapping and run focused data tests**

Ensure `importCourse` and `importBatch` pass proposal resources to the database instead of rebuilding lessons without them.

Extend the existing course-merge transaction so normalized matching module titles receive the selected incoming lessons and resources, while a nonmatching title creates a new module. The merge must preserve resource ownership and must not discard a fingerprint candidate unless the supplied `DuplicateResolution` selects it. Add a regression test covering an existing `Dia 1` module receiving a new material and a new `Dia 2` module being created.

Run: `npm test -- test/file-utils.test.ts test/parser.test.ts test/database.test.ts test/merge-courses.test.ts test/notes-and-subtitles.test.ts`

Expected: all content classes round-trip; safe-open behavior remains separately constrained.

### Task 4: Make preview decisions explicit and surface validation failures

**Files:**

- Modify: `src/renderer/src/components/import/ImportWizard.tsx`
- Modify: `src/renderer/src/components/import/ImportPreview.tsx`
- Modify: `src/renderer/src/stores/useLibraryStore.ts`
- Modify: `src/renderer/src/i18n/locales/en/common.json`
- Modify: `src/renderer/src/i18n/locales/pt-BR/common.json`
- Modify: `test/e2e-workflow.test.ts`

**Interfaces:**

- UI stores `sessionId`, validation result, and a user-selected `DuplicateResolution[]` rather than trusting an extracted filesystem path.
- Preview renders module resource counts and duplicate candidates, requiring an explicit resolution for a recommended exclusion.

- [ ] **Step 1: Write failing flow tests for cancellation and duplicate control**

```ts
it('does not persist or move a prepared ZIP when the preview is cancelled', async () => {
  const prepared = await prepareZipForPreview(zipFilePath)
  await cancelPreparedImport(prepared.sessionId)

  expect(fs.existsSync(zipFilePath)).toBe(true)
  expect(databaseService.getCourses()).toHaveLength(0)
})

it('keeps both duplicate candidates when the user chooses keep-both', async () => {
  const result = await commitPreparedImport({
    sessionId,
    duplicateResolutions: [{ groupId, action: 'keep-both' }]
  })
  expect(
    result.course.modules.flatMap((module) => module.lessons)
  ).toHaveLength(2)
})
```

- [ ] **Step 2: Run the flow tests and verify the current UI/IPC contract cannot express the choices**

Run: `npm test -- test/e2e-workflow.test.ts test/import-session.test.ts`

Expected: failure shows missing session cancellation and duplicate-resolution contract.

- [ ] **Step 3: Render preparation failure choices before preview**

When validation fails, render warnings and failed entries with Retry, Discard Preparation, and Select Replacement Source. Discard Preparation calls `cancelImportSession`; Select Replacement Source creates a new session and never overwrites the original ZIP. Do not show the import confirmation action until a fresh preparation returns `verificationOk: true`.

- [ ] **Step 4: Render resource inventory and duplicate decisions in the preview**

For each module, show the number and names of lesson resources/module materials. For each duplicate group, show the candidates and a default recommendation; the user can select `keep-both` or a single candidate. Do not use copy that says an item was already excluded before the user chose it.

- [ ] **Step 5: Commit only the opaque session with the approved proposal**

Replace the renderer flow that scans the raw extracted path and calls generic `importCourse` with `commitImportSession`. ZIP source type fixes managed mode in the UI; folder imports can still offer a reference/managed choice.

- [ ] **Step 6: Run focused UI/type and flow verification**

Run: `npm run typecheck && npm test -- test/import-session.test.ts test/e2e-workflow.test.ts`

Expected: TypeScript accepts the narrowed IPC contracts and preview choices cannot bypass validation/approval.

### Task 5: Verify the integrated safety contract and review the worktree diff

**Files:**

- Modify only files required by fixes discovered in the steps below.

- [ ] **Step 1: Run the integrated import-focused suite once**

Run: `npm test -- test/archive.test.ts test/media-validation.test.ts test/import-session.test.ts test/file-utils.test.ts test/parser.test.ts test/database.test.ts test/notes-and-subtitles.test.ts test/e2e-workflow.test.ts`

Expected: ZIP staging, strict validation, cancellation, deferred move/delete, resource persistence, and duplicate choices pass together.

- [ ] **Step 2: Run the project typecheck**

Run: `npm run typecheck`

Expected: both Node and web TypeScript projects exit successfully.

- [ ] **Step 3: Run the full suite once as final integration evidence**

Run: `npm test`

Expected: all test files pass. If a failure appears, add a focused regression test and repair only the responsible behavior before rerunning the smallest affected group.

- [ ] **Step 4: Inspect the complete diff and safety invariants**

Run: `git diff --check && git diff --stat && git status --short`

Confirm source ZIPs are never moved/deleted in preparation, no destination is overwritten, resource inventory does not open unsafe files, and every managed mutation has a journal record/rollback path.
