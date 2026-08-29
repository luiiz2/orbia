import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CourseImportService } from '../src/main/services/course-import.service'
import { ImportSessionService } from '../src/main/services/import-session.service'
import {
  materializeProposalCovers,
  type MaterializeProposalCoversOptions
} from '../src/main/services/proposal-cover.service'
import type { PreparedArchive } from '../src/main/services/archive.service'
import type { ProposedCourseStructure } from '../src/types'

describe('CourseImportService', () => {
  let tempRoot: string

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-course-import-'))
  })

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  it('moves staged ZIP content to Courses only after commit and journals the move', async () => {
    const fixture = await createZipImportFixture(tempRoot)

    const result = await fixture.imports.commitSession({
      sessionId: fixture.preparedResult.sessionId,
      isExternal: false
    })

    expect(fs.existsSync(fixture.sourceZip)).toBe(true)
    expect(fs.existsSync(fixture.extractedPath)).toBe(false)
    expect(result.course.rootPath).toBe(
      path.join(fixture.vaultPath, 'Courses', 'curso-seguro-course')
    )
    expect(
      fs.existsSync(
        path.join(result.course.rootPath, 'Module 01', '01 - Lesson.mp4')
      )
    ).toBe(true)
    expect(fixture.saved).toHaveBeenCalledOnce()
    expect(fixture.recordOperation).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'move', status: 'pending' })
    )
    expect(fixture.updateOperation).toHaveBeenCalledWith(
      expect.any(String),
      'completed',
      null
    )
    expect(() =>
      fixture.sessions.getSession(fixture.preparedResult.sessionId)
    ).toThrow('Import session not found')
  })

  it('persists an external folder reference when its move manifest is incomplete', async () => {
    const fixture = await createFolderImportFixture(tempRoot, {
      incompleteMoveManifest: true
    })

    const result = await fixture.imports.commitSession({
      sessionId: fixture.preparedResult.sessionId,
      isExternal: true
    })

    expect(result.course).toMatchObject({
      sourceType: 'local-ref',
      rootPath: fixture.sourceRoot
    })
    expect(fs.existsSync(fixture.sourceRoot)).toBe(true)
    expect(fixture.recordOperation).not.toHaveBeenCalled()
    expect(fixture.saved).toHaveBeenCalledOnce()
  })

  it('refuses a managed folder import when its move manifest is incomplete without moving the source', async () => {
    const fixture = await createFolderImportFixture(tempRoot, {
      incompleteMoveManifest: true
    })

    await expect(
      fixture.imports.commitSession({
        sessionId: fixture.preparedResult.sessionId,
        isExternal: false
      })
    ).rejects.toThrow('cannot be safely moved')

    expect(fs.existsSync(fixture.sourceRoot)).toBe(true)
    expect(fs.readdirSync(path.join(fixture.vaultPath, 'Courses'))).toEqual([])
    expect(fixture.recordOperation).not.toHaveBeenCalled()
    expect(fixture.saved).not.toHaveBeenCalled()
  })

  it('rejects an external folder reference when a scanned file changes after preview', async () => {
    const fixture = await createFolderImportFixture(tempRoot)
    fs.writeFileSync(fixture.lessonPath, 'changed folder lesson after preview')

    await expect(
      fixture.imports.commitSession({
        sessionId: fixture.preparedResult.sessionId,
        isExternal: true
      })
    ).rejects.toThrow('changed after preview')

    expect(fs.existsSync(fixture.sourceRoot)).toBe(true)
    expect(fixture.recordOperation).not.toHaveBeenCalled()
    expect(fixture.saved).not.toHaveBeenCalled()
  })

  it('deletes the original ZIP only after a successful approved commit when the persisted preference is enabled', async () => {
    const fixture = await createZipImportFixture(tempRoot, {
      deleteSourceZipAfterImport: true
    })

    await fixture.imports.commitSession({
      sessionId: fixture.preparedResult.sessionId,
      isExternal: false
    })

    expect(fs.existsSync(fixture.sourceZip)).toBe(false)
    expect(fixture.recordOperation).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'delete', status: 'pending' })
    )
    expect(fixture.updateOperation).toHaveBeenCalledWith(
      expect.any(String),
      'completed'
    )
  })

  it('materializes module materials and lesson subtitles with the final course ownership', async () => {
    const fixture = await createZipImportFixture(tempRoot)

    const result = await fixture.imports.commitSession({
      sessionId: fixture.preparedResult.sessionId,
      isExternal: false
    })

    const [, savedModules] = fixture.saved.mock.calls[0] as [
      unknown,
      Array<{
        id: string
        resources?: Array<{
          courseId: string
          moduleId: string
          filePath: string
        }>
        lessons: Array<{
          id: string
          contentResources?: Array<{
            courseId: string
            moduleId: string
            lessonId?: string
            role: string
            filePath: string
          }>
        }>
      }>
    ]
    const savedModule = savedModules[0]
    const savedLesson = savedModule.lessons[0]

    expect(savedModule.resources).toEqual([
      expect.objectContaining({
        courseId: result.course.id,
        moduleId: savedModule.id,
        filePath: path.join(result.course.rootPath, 'Module 01', 'workbook.pdf')
      })
    ])
    expect(savedLesson.contentResources).toEqual([
      expect.objectContaining({
        courseId: result.course.id,
        moduleId: savedModule.id,
        lessonId: savedLesson.id,
        role: 'subtitle',
        filePath: path.join(
          result.course.rootPath,
          'Module 01',
          '01 - Lesson.pt-BR.vtt'
        )
      })
    ])
  })

  it('rolls back the staged move and keeps the session when hierarchy persistence fails', async () => {
    const saved = vi.fn(() => {
      throw new Error('database unavailable')
    })
    const fixture = await createZipImportFixture(tempRoot, { saved })

    await expect(
      fixture.imports.commitSession({
        sessionId: fixture.preparedResult.sessionId,
        isExternal: false
      })
    ).rejects.toThrow('database unavailable')

    expect(fs.existsSync(fixture.extractedPath)).toBe(true)
    expect(
      fs.existsSync(
        path.join(fixture.vaultPath, 'Courses', 'curso-seguro-course')
      )
    ).toBe(false)
    expect(fs.existsSync(fixture.sourceZip)).toBe(true)
    expect(fixture.updateOperation).toHaveBeenCalledWith(
      expect.any(String),
      'rolled_back',
      'database unavailable'
    )
    expect(
      fixture.sessions.getSession(fixture.preparedResult.sessionId)
    ).toBeDefined()
  })

  it('keeps the moved course when only import history recording fails', async () => {
    const recordHistory = vi.fn(() => {
      throw new Error('history unavailable')
    })
    const fixture = await createZipImportFixture(tempRoot, { recordHistory })

    const result = await fixture.imports.commitSession({
      sessionId: fixture.preparedResult.sessionId,
      isExternal: false
    })

    expect(fs.existsSync(result.course.rootPath)).toBe(true)
    expect(result.warnings).toContain(
      'Import history could not be recorded: history unavailable'
    )
    expect(fixture.updateOperation).not.toHaveBeenCalledWith(
      expect.any(String),
      'rolled_back',
      expect.anything()
    )
  })

  it('keeps the original ZIP and the imported course when delete journaling is unavailable', async () => {
    const recordOperation = vi.fn((entry: { type: string }) => {
      if (entry.type === 'delete') {
        throw new Error('delete journal unavailable')
      }
    })
    const fixture = await createZipImportFixture(tempRoot, {
      deleteSourceZipAfterImport: true,
      recordOperation
    })

    const result = await fixture.imports.commitSession({
      sessionId: fixture.preparedResult.sessionId,
      isExternal: false
    })

    expect(fs.existsSync(result.course.rootPath)).toBe(true)
    expect(fs.existsSync(fixture.sourceZip)).toBe(true)
    expect(result.warnings).toContain(
      'The original ZIP was kept because its deletion could not be journaled: delete journal unavailable'
    )
  })

  it('accepts title edits by IDs while ignoring malicious path payloads', async () => {
    const fixture = await createZipImportFixture(tempRoot)
    const result = await fixture.imports.commitSession({
      sessionId: fixture.preparedResult.sessionId,
      isExternal: false,
      titleEdits: {
        courseTitle: 'Curso Renomeado',
        modules: [
          {
            id: 'module-1',
            title: 'Dia Renomeado',
            folderPath: path.join(tempRoot, 'attacker-title-edit-module')
          }
        ],
        lessons: [
          {
            id: 'lesson-1',
            title: 'Aula Renomeada',
            filePath: path.join(tempRoot, 'attacker-title-edit-lesson.mp4'),
            coverPath: path.join(tempRoot, 'attacker-title-edit-lesson.png')
          }
        ]
      },
      proposal: {
        rootPath: path.join(tempRoot, 'attacker-root'),
        coverPath: path.join(tempRoot, 'attacker-cover.png'),
        modules: [
          {
            id: 'module-1',
            folderPath: path.join(tempRoot, 'attacker-module'),
            lessons: [
              {
                id: 'lesson-1',
                filePath: path.join(tempRoot, 'attacker-lesson.mp4'),
                coverPath: path.join(tempRoot, 'attacker-lesson.png')
              }
            ]
          }
        ]
      }
    } as never)

    const [savedCourse, savedModules] = fixture.saved.mock.calls[0] as [
      { title: string; rootPath: string; coverPath?: string },
      Array<{
        title: string
        folderPath?: string
        lessons: Array<{ title: string; filePath: string; coverPath?: string }>
      }>
    ]
    expect(result.course.title).toBe('Curso Renomeado')
    expect(savedCourse.rootPath).toBe(result.course.rootPath)
    expect(savedCourse.coverPath).toBeUndefined()
    expect(savedModules[0].title).toBe('Dia Renomeado')
    expect(savedModules[0].folderPath).toContain(
      path.join('Courses', 'curso-renomeado-course', 'Module 01')
    )
    expect(savedModules[0].lessons[0]).toMatchObject({
      title: 'Aula Renomeada',
      coverPath: undefined
    })
    expect(savedModules[0].lessons[0].filePath).toContain(
      path.join(
        'Courses',
        'curso-renomeado-course',
        'Module 01',
        '01 - Lesson.mp4'
      )
    )
    expect(JSON.stringify(fixture.saved.mock.calls[0])).not.toContain(
      'attacker-'
    )
  })

  it('merges modules that receive identical titles during title editing upon commit', async () => {
    const fixture = await createZipImportFixture(tempRoot)
    // Add a second module to the session's proposal
    const session = fixture.sessions.getSession(
      fixture.preparedResult.sessionId
    )
    session.proposal!.modules.push({
      id: 'module-2',
      title: 'Módulo 2 Original',
      folderPath: path.join(fixture.extractedPath, 'Module 02'),
      orderIndex: 2,
      lessons: [
        {
          id: 'lesson-2',
          title: 'Aula 2 Original',
          originalFileName: '02 - Lesson.mp4',
          filePath: path.join(
            fixture.extractedPath,
            'Module 02',
            '02 - Lesson.mp4'
          ),
          fileExtension: 'mp4',
          mediaType: 'video',
          fileSize: 20,
          orderIndex: 1
        }
      ]
    })
    fs.mkdirSync(path.join(fixture.extractedPath, 'Module 02'), {
      recursive: true
    })
    fs.writeFileSync(
      path.join(fixture.extractedPath, 'Module 02', '02 - Lesson.mp4'),
      'lesson 2'
    )

    // Commit with title edits where module-1 and module-2 are both renamed to "Lovable PRO - Rafa Voss"
    const result = await fixture.imports.commitSession({
      sessionId: fixture.preparedResult.sessionId,
      isExternal: false,
      titleEdits: {
        courseTitle: 'AI Development',
        modules: [
          { id: 'module-1', title: 'Lovable PRO - Rafa Voss' },
          { id: 'module-2', title: 'Lovable PRO - Rafa Voss' }
        ],
        lessons: [
          { id: 'lesson-1', title: '01 - Intro' },
          { id: 'lesson-2', title: '02 - Prática' }
        ]
      }
    })

    const [, savedModules] = fixture.saved.mock.calls[0] as [
      unknown,
      Array<{ title: string; lessons: Array<{ title: string }> }>
    ]
    // Both modules must be merged into 1 single module
    expect(savedModules.length).toBe(1)
    expect(savedModules[0].title).toBe('Lovable PRO - Rafa Voss')
    expect(savedModules[0].lessons.length).toBe(2)
    expect(savedModules[0].lessons.map((l) => l.title)).toEqual([
      '01 - Intro',
      '02 - Prática'
    ])
    expect(result.course.moduleCount).toBe(1)
    expect(result.course.lessonCount).toBe(2)
  })

  it('does not create persistent covers before the course hierarchy is saved', async () => {
    const persistentCover = path.join(
      tempRoot,
      'vault',
      '.orbia',
      'covers',
      'unexpected.png'
    )
    const materializeProposal = vi.fn(
      async (proposal: ProposedCourseStructure) => {
        fs.mkdirSync(path.dirname(persistentCover), { recursive: true })
        fs.writeFileSync(persistentCover, 'cover')
        return { ...proposal, coverPath: persistentCover }
      }
    )
    const saved = vi.fn(() => {
      throw new Error('database unavailable')
    })
    const fixture = await createZipImportFixture(tempRoot, {
      materializeProposal,
      saved
    })

    await expect(
      fixture.imports.commitSession({
        sessionId: fixture.preparedResult.sessionId,
        isExternal: false
      })
    ).rejects.toThrow('database unavailable')

    expect(materializeProposal).not.toHaveBeenCalled()
    expect(fs.existsSync(persistentCover)).toBe(false)
  })

  it('records a pending cover copy before persistCover fails', async () => {
    const generatedCover = path.join(tempRoot, 'cover_deadbeef.png')
    fs.writeFileSync(generatedCover, 'cover')
    const recordOperation = vi.fn()
    const fixture = await createZipImportFixture(tempRoot, {
      proposalCoverPath: generatedCover,
      recordOperation,
      materializeProposal: materializeProposalCovers
    })
    let coverWasJournaledBeforeCopy = false
    const copyFile = vi
      .spyOn(fs.promises, 'copyFile')
      .mockImplementationOnce(async () => {
        coverWasJournaledBeforeCopy = recordOperation.mock.calls.some(
          ([entry]) => {
            const operation = entry as {
              type?: string
              sourcePath?: string
              status?: string
            }
            return (
              operation.type === 'copy' &&
              operation.sourcePath === generatedCover &&
              operation.status === 'pending'
            )
          }
        )
        throw new Error('cover copy failed')
      })

    try {
      const result = await fixture.imports.commitSession({
        sessionId: fixture.preparedResult.sessionId,
        isExternal: false
      })

      const coverJournal = recordOperation.mock.calls
        .map(
          ([entry]) =>
            entry as {
              operationId: string
              type: string
              sourcePath: string
              destinationPath: string
              status: string
            }
        )
        .find(
          (operation) =>
            operation.type === 'copy' && operation.sourcePath === generatedCover
        )

      expect(coverWasJournaledBeforeCopy).toBe(true)
      expect(coverJournal).toMatchObject({
        destinationPath: expect.stringContaining(path.join('.orbia', 'covers')),
        status: 'pending'
      })
      expect(fixture.updateOperation).toHaveBeenCalledWith(
        coverJournal!.operationId,
        'failed',
        'cover copy failed'
      )
      expect(result.warnings).toContain(
        'Course imported, but covers could not be finalized: cover copy failed'
      )
    } finally {
      copyFile.mockRestore()
    }
  })

  it('cleans an incomplete cross-volume copy without leaving a partial course in Courses', async () => {
    const fixture = await createZipImportFixture(tempRoot)
    const rename = vi
      .spyOn(fs.promises, 'rename')
      .mockRejectedValueOnce(new Error('cross-device move'))
    const copy = vi
      .spyOn(fs.promises, 'cp')
      .mockImplementationOnce(async (_source, destination) => {
        const partialRoot = String(destination)
        fs.mkdirSync(partialRoot, { recursive: true })
        fs.writeFileSync(path.join(partialRoot, 'partial.mp4'), 'partial')
        throw new Error('disk full')
      })

    try {
      await expect(
        fixture.imports.commitSession({
          sessionId: fixture.preparedResult.sessionId,
          isExternal: false
        })
      ).rejects.toThrow('disk full')

      const coursesPath = path.join(fixture.vaultPath, 'Courses')
      expect(fs.readdirSync(coursesPath)).toEqual([])
      expect(fs.existsSync(fixture.extractedPath)).toBe(true)
      expect(fixture.updateOperation).toHaveBeenCalledWith(
        'move-1',
        'failed',
        'disk full'
      )
    } finally {
      rename.mockRestore()
      copy.mockRestore()
    }
  })
})

async function createZipImportFixture(
  tempRoot: string,
  options: {
    deleteSourceZipAfterImport?: boolean
    materializeProposal?: (
      proposal: ProposedCourseStructure,
      courseId: string,
      vaultPath: string,
      options?: MaterializeProposalCoversOptions
    ) => Promise<ProposedCourseStructure>
    proposalCoverPath?: string
    recordHistory?: ReturnType<typeof vi.fn>
    recordOperation?: ReturnType<typeof vi.fn>
    saved?: ReturnType<typeof vi.fn>
    updateOperation?: ReturnType<typeof vi.fn>
  } = {}
) {
  const stagingBaseDir = path.join(tempRoot, 'staging')
  const stagingRoot = path.join(stagingBaseDir, 'orbia-import-a')
  const extractedPath = path.join(stagingRoot, 'content')
  const sourceZip = path.join(tempRoot, 'source.zip')
  const lessonPath = path.join(extractedPath, 'Module 01', '01 - Lesson.mp4')
  const moduleResourcePath = path.join(
    extractedPath,
    'Module 01',
    'workbook.pdf'
  )
  const lessonSubtitlePath = path.join(
    extractedPath,
    'Module 01',
    '01 - Lesson.pt-BR.vtt'
  )
  fs.mkdirSync(path.dirname(lessonPath), { recursive: true })
  fs.writeFileSync(sourceZip, 'zip bytes')
  fs.writeFileSync(lessonPath, 'staged lesson')
  fs.writeFileSync(moduleResourcePath, 'workbook')
  fs.writeFileSync(lessonSubtitlePath, 'WEBVTT')

  const proposal: ProposedCourseStructure = {
    suggestedTitle: 'Curso Seguro',
    rootPath: extractedPath,
    ...(options.proposalCoverPath
      ? { coverPath: options.proposalCoverPath }
      : {}),
    modules: [
      {
        id: 'module-1',
        title: 'Dia 1',
        folderPath: path.dirname(lessonPath),
        orderIndex: 1,
        resources: [
          {
            id: 'resource-module-proposal',
            name: 'workbook.pdf',
            filePath: moduleResourcePath,
            fileExtension: 'pdf',
            fileSize: 8,
            type: 'pdf',
            role: 'resource'
          }
        ],
        lessons: [
          {
            id: 'lesson-1',
            title: 'Aula 1',
            originalFileName: '01 - Lesson.mp4',
            filePath: lessonPath,
            fileExtension: 'mp4',
            mediaType: 'video',
            fileSize: 13,
            orderIndex: 1,
            contentResources: [
              {
                id: 'resource-subtitle-proposal',
                name: '01 - Lesson.pt-BR.vtt',
                filePath: lessonSubtitlePath,
                fileExtension: 'vtt',
                fileSize: 6,
                type: 'document',
                role: 'subtitle',
                language: 'pt-BR',
                label: 'Português'
              }
            ]
          }
        ]
      }
    ],
    totalLessons: 1,
    totalFilesScanned: 3
  }
  const prepared: PreparedArchive = {
    sourcePath: sourceZip,
    stagingRoot,
    stagedArchivePath: path.join(stagingRoot, 'source.zip'),
    extractedPath,
    suggestedCourseName: 'Curso Seguro',
    totalEntries: 1,
    totalExtractedFiles: 1,
    verificationOk: true,
    failedEntries: [],
    warnings: []
  }
  const archive = {
    prepareZip: vi.fn().mockResolvedValue(prepared),
    discardPreparedArchive: vi.fn((root: string) =>
      fs.rmSync(root, { recursive: true, force: true })
    )
  }
  const sessions = new ImportSessionService({
    archive,
    scanner: { scanDirectory: vi.fn().mockResolvedValue({}) },
    parser: { parseCourseHierarchy: vi.fn().mockResolvedValue(proposal) },
    createId: () => 'session-1'
  })
  const preparedResult = await sessions.prepareZipImport({
    zipPath: sourceZip,
    stagingBaseDir
  })
  const saved = options.saved ?? vi.fn()
  const recordOperation = options.recordOperation ?? vi.fn()
  const updateOperation = options.updateOperation ?? vi.fn()
  const recordHistory = options.recordHistory ?? vi.fn()
  const vaultPath = path.join(tempRoot, 'vault')
  fs.mkdirSync(path.join(vaultPath, 'Courses'), { recursive: true })
  const identifiers = [
    'course-1',
    'group-1',
    'move-1',
    'module-1',
    'lesson-1',
    'delete-1'
  ]
  const imports = new CourseImportService({
    sessions,
    vault: {
      getCurrentVault: () => ({
        id: 'vault-1',
        name: 'Vault',
        path: vaultPath,
        createdAt: 1,
        lastOpened: 1
      })
    },
    database: {
      saveCourseWithHierarchy: saved,
      recordFileOperation: recordOperation,
      updateFileOperationStatus: updateOperation,
      recordImportHistory: recordHistory,
      deleteCourse: vi.fn(),
      updateCourseCover: vi.fn(),
      updateLessonCover: vi.fn()
    },
    settings: {
      getSettings: () => ({
        deleteSourceZipAfterImport: options.deleteSourceZipAfterImport ?? false
      })
    },
    materializeProposal:
      options.materializeProposal ?? (async (value) => value),
    createId: () => identifiers.shift() ?? 'generated-id',
    now: () => 123
  })

  return {
    extractedPath,
    imports,
    preparedResult,
    recordOperation,
    saved,
    sessions,
    sourceZip,
    updateOperation,
    vaultPath
  }
}

async function createFolderImportFixture(
  tempRoot: string,
  options: { incompleteMoveManifest?: boolean } = {}
) {
  const sourceRoot = path.join(tempRoot, 'source-folder')
  const lessonPath = path.join(sourceRoot, 'Module 01', '01 - Lesson.mp4')
  fs.mkdirSync(path.dirname(lessonPath), { recursive: true })
  fs.writeFileSync(lessonPath, 'folder lesson')

  const proposal: ProposedCourseStructure = {
    suggestedTitle: 'Curso Externo',
    rootPath: sourceRoot,
    modules: [
      {
        id: 'module-proposal',
        title: 'Módulo 1',
        folderPath: path.dirname(lessonPath),
        orderIndex: 1,
        lessons: [
          {
            id: 'lesson-proposal',
            title: 'Aula 1',
            originalFileName: '01 - Lesson.mp4',
            filePath: lessonPath,
            fileExtension: 'mp4',
            mediaType: 'video',
            fileSize: 13,
            orderIndex: 1
          }
        ]
      }
    ],
    totalLessons: 1,
    totalFilesScanned: 1
  }
  const sessions = new ImportSessionService({
    parser: { parseCourseHierarchy: vi.fn().mockResolvedValue(proposal) },
    createId: () => 'folder-session'
  })
  const sourceStats = options.incompleteMoveManifest
    ? await fs.promises.lstat(sourceRoot)
    : undefined
  const lstatSpy = options.incompleteMoveManifest
    ? vi
        .spyOn(fs.promises, 'lstat')
        .mockResolvedValueOnce(sourceStats!)
        .mockRejectedValueOnce(
          Object.assign(new Error('permission denied'), { code: 'EACCES' })
        )
    : undefined
  let preparedResult
  try {
    preparedResult = await sessions.prepareFolderImport(sourceRoot)
  } finally {
    lstatSpy?.mockRestore()
  }
  const saved = vi.fn()
  const recordOperation = vi.fn()
  const vaultPath = path.join(tempRoot, 'vault')
  fs.mkdirSync(path.join(vaultPath, 'Courses'), { recursive: true })
  const identifiers = [
    'course-folder',
    'group-folder',
    'module-folder',
    'lesson-folder'
  ]
  const imports = new CourseImportService({
    sessions,
    vault: {
      getCurrentVault: () => ({
        id: 'vault-1',
        name: 'Vault',
        path: vaultPath,
        createdAt: 1,
        lastOpened: 1
      })
    },
    database: {
      saveCourseWithHierarchy: saved,
      recordFileOperation: recordOperation,
      updateFileOperationStatus: vi.fn(),
      recordImportHistory: vi.fn(),
      deleteCourse: vi.fn(),
      updateCourseCover: vi.fn(),
      updateLessonCover: vi.fn()
    },
    settings: { getSettings: () => ({ deleteSourceZipAfterImport: false }) },
    materializeProposal: async (value) => value,
    createId: () => identifiers.shift() ?? 'generated-id',
    now: () => 123
  })

  return {
    imports,
    lessonPath,
    preparedResult,
    recordOperation,
    saved,
    sourceRoot,
    vaultPath
  }
}
