import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ImportSessionService } from '../src/main/services/import-session.service'
import type { PreparedArchive } from '../src/main/services/archive.service'
import type { ProposedCourseStructure } from '../src/types'

const temporaryRoots: string[] = []

afterEach(() => {
  for (const temporaryRoot of temporaryRoots.splice(0)) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

function createTemporaryRoot(): string {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'orbia-import-session-')
  )
  temporaryRoots.push(temporaryRoot)
  return temporaryRoot
}

const proposal: ProposedCourseStructure = {
  suggestedTitle: 'Curso Seguro',
  rootPath: 'C:/staging/orbia-import-a/content',
  modules: [],
  totalLessons: 0,
  totalFilesScanned: 0
}

const preparedArchive: PreparedArchive = {
  sourcePath: 'C:/sources/curso.zip',
  stagingRoot: 'C:/staging/orbia-import-a',
  stagedArchivePath: 'C:/staging/orbia-import-a/curso.zip',
  extractedPath: 'C:/staging/orbia-import-a/content',
  suggestedCourseName: 'curso',
  totalEntries: 1,
  totalExtractedFiles: 1,
  verificationOk: true,
  failedEntries: [],
  warnings: []
}

describe('ImportSessionService', () => {
  it('returns an opaque preview without Main-owned paths and discards only staging when cancelled', async () => {
    const privateProposal: ProposedCourseStructure = {
      suggestedTitle: 'Curso Seguro',
      rootPath: 'C:/staging/orbia-import-a/content',
      coverPath: 'C:/staging/orbia-import-a/content/cover.png',
      modules: [
        {
          id: 'module-1',
          title: 'Dia 1',
          folderPath: 'C:/staging/orbia-import-a/content/Dia 1',
          orderIndex: 1,
          resources: [
            {
              id: 'module-resource-1',
              name: 'C:/staging/orbia-import-a/content/Dia 1/Workbook.pdf',
              filePath: 'C:/staging/orbia-import-a/content/Dia 1/Workbook.pdf',
              fileExtension: 'pdf',
              fileSize: 7,
              type: 'pdf',
              role: 'resource',
              fingerprint: 'private-module-resource-fingerprint'
            }
          ],
          lessons: [
            {
              id: 'lesson-1',
              title: 'Aula 1',
              originalFileName: '01 - Aula.mp4',
              filePath: 'C:/staging/orbia-import-a/content/Dia 1/01 - Aula.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              fileSize: 10,
              orderIndex: 1,
              coverPath:
                'C:/staging/orbia-import-a/content/Dia 1/01 - Aula.png',
              contentResources: [
                {
                  id: 'lesson-resource-1',
                  name: 'C:/staging/orbia-import-a/content/Dia 1/01 - Aula.pt-BR.vtt',
                  filePath:
                    'C:/staging/orbia-import-a/content/Dia 1/01 - Aula.pt-BR.vtt',
                  fileExtension: 'vtt',
                  fileSize: 3,
                  type: 'document',
                  role: 'subtitle',
                  language: 'pt-BR',
                  label: 'Português',
                  fingerprint: 'private-lesson-resource-fingerprint'
                }
              ]
            }
          ]
        }
      ],
      totalLessons: 1,
      totalFilesScanned: 1,
      duplicates: [
        {
          fileName: '01 - Aula.mp4',
          fileSize: 10,
          count: 2,
          paths: [
            'C:/staging/orbia-import-a/content/Dia 1/01 - Aula.mp4',
            'C:/staging/orbia-import-a/content/Copia/01 - Aula.mp4'
          ]
        }
      ]
    }
    const archive = {
      prepareZip: vi.fn().mockResolvedValue(preparedArchive),
      discardPreparedArchive: vi.fn()
    }
    const scanner = { scanDirectory: vi.fn().mockResolvedValue({}) }
    const parser = {
      parseCourseHierarchy: vi.fn().mockResolvedValue(privateProposal)
    }
    const sessions = new ImportSessionService({
      archive,
      scanner,
      parser,
      createId: () => 'session-1'
    })

    const result = await sessions.prepareZipImport({
      zipPath: preparedArchive.sourcePath,
      stagingBaseDir: 'C:/staging'
    })

    expect(result).toMatchObject({
      sessionId: 'session-1',
      sourceKind: 'zip',
      suggestedTitle: 'Curso Seguro',
      preview: {
        suggestedTitle: 'Curso Seguro',
        totalLessons: 1,
        totalFilesScanned: 1,
        duplicates: [{ fileName: '01 - Aula.mp4', fileSize: 10, count: 2 }],
        modules: [
          {
            id: 'module-1',
            title: 'Dia 1',
            resources: [
              {
                id: 'module-resource-1',
                name: 'Workbook.pdf',
                fileExtension: 'pdf',
                fileSize: 7,
                type: 'pdf',
                role: 'resource'
              }
            ],
            lessons: [
              {
                id: 'lesson-1',
                title: 'Aula 1',
                originalFileName: '01 - Aula.mp4',
                contentResources: [
                  {
                    id: 'lesson-resource-1',
                    name: '01 - Aula.pt-BR.vtt',
                    fileExtension: 'vtt',
                    fileSize: 3,
                    type: 'document',
                    role: 'subtitle',
                    language: 'pt-BR',
                    label: 'Português'
                  }
                ]
              }
            ]
          }
        ]
      }
    })
    expect(JSON.stringify(result)).not.toContain('C:/staging/orbia-import-a')
    expect(JSON.stringify(result)).not.toContain(
      'private-module-resource-fingerprint'
    )
    expect(JSON.stringify(result)).not.toContain(
      'private-lesson-resource-fingerprint'
    )
    expect(result.preview).not.toHaveProperty('rootPath')
    expect(result.preview!.modules[0]).not.toHaveProperty('folderPath')
    expect(result.preview!.modules[0].resources[0]).not.toHaveProperty(
      'filePath'
    )
    expect(result.preview!.modules[0].resources[0]).not.toHaveProperty(
      'fingerprint'
    )
    expect(result.preview!.modules[0].lessons[0]).not.toHaveProperty('filePath')
    expect(result.preview!.modules[0].lessons[0]).not.toHaveProperty(
      'coverPath'
    )
    expect(
      result.preview!.modules[0].lessons[0].contentResources[0]
    ).not.toHaveProperty('filePath')
    expect(
      result.preview!.modules[0].lessons[0].contentResources[0]
    ).not.toHaveProperty('fingerprint')
    expect(result.preview!.duplicates![0]).not.toHaveProperty('paths')

    await sessions.cancel(result.sessionId)

    expect(archive.discardPreparedArchive).toHaveBeenCalledWith(
      preparedArchive.stagingRoot,
      'C:/staging'
    )
    expect(() => sessions.getSession(result.sessionId)).toThrow(
      'Import session not found'
    )
  })

  it('returns validation errors without scanning a partially prepared ZIP', async () => {
    const invalidArchive: PreparedArchive = {
      ...preparedArchive,
      verificationOk: false,
      failedEntries: ['Module 01/Broken.mp4'],
      warnings: ['FFmpeg could not decode the staged lesson.']
    }
    const archive = {
      prepareZip: vi.fn().mockResolvedValue(invalidArchive),
      discardPreparedArchive: vi.fn()
    }
    const scanner = { scanDirectory: vi.fn() }
    const parser = { parseCourseHierarchy: vi.fn() }
    const sessions = new ImportSessionService({
      archive,
      scanner,
      parser,
      createId: () => 'session-2'
    })

    const result = await sessions.prepareZipImport({
      zipPath: invalidArchive.sourcePath,
      stagingBaseDir: 'C:/staging'
    })

    expect(result).toMatchObject({
      sessionId: 'session-2',
      sourceKind: 'zip',
      preview: undefined,
      validation: {
        verificationOk: false,
        failedEntries: ['Broken.mp4']
      }
    })
    expect(scanner.scanDirectory).not.toHaveBeenCalled()
    expect(parser.parseCourseHierarchy).not.toHaveBeenCalled()
  })

  it('blocks commit and keeps the original ZIP when it changes during preparation', async () => {
    const temporaryRoot = createTemporaryRoot()
    const sourceZip = path.join(temporaryRoot, 'curso.zip')
    fs.writeFileSync(sourceZip, 'original archive')
    const changedArchive: PreparedArchive = {
      ...preparedArchive,
      sourcePath: sourceZip,
      stagingRoot: path.join(temporaryRoot, 'staging', 'orbia-import-a'),
      stagedArchivePath: path.join(
        temporaryRoot,
        'staging',
        'orbia-import-a',
        'curso.zip'
      ),
      extractedPath: path.join(
        temporaryRoot,
        'staging',
        'orbia-import-a',
        'content'
      )
    }
    const archive = {
      prepareZip: vi.fn(async () => {
        fs.writeFileSync(sourceZip, 'replacement archive with a different size')
        return changedArchive
      }),
      discardPreparedArchive: vi.fn()
    }
    const scanner = { scanDirectory: vi.fn().mockResolvedValue({}) }
    const parser = { parseCourseHierarchy: vi.fn().mockResolvedValue(proposal) }
    const sessions = new ImportSessionService({
      archive,
      scanner,
      parser,
      createId: () => 'session-changed-zip'
    })

    const result = await sessions.prepareZipImport({
      zipPath: sourceZip,
      stagingBaseDir: path.join(temporaryRoot, 'staging')
    })

    expect(result.validation.verificationOk).toBe(false)
    expect(result.validation.warnings).toContain(
      'The original ZIP changed during preparation and was kept.'
    )
    expect(fs.readFileSync(sourceZip, 'utf8')).toBe(
      'replacement archive with a different size'
    )
    expect(scanner.scanDirectory).not.toHaveBeenCalled()
    await expect(sessions.beginCommit(result.sessionId)).rejects.toThrow(
      'did not pass validation'
    )
  })

  it('rejects a folder commit when a scanned file changes after preview', async () => {
    const temporaryRoot = createTemporaryRoot()
    const courseRoot = path.join(temporaryRoot, 'curso')
    const lessonPath = path.join(courseRoot, 'Modulo 01', 'aula.mp4')
    fs.mkdirSync(path.dirname(lessonPath), { recursive: true })
    fs.writeFileSync(lessonPath, 'first!')
    const parser = {
      parseCourseHierarchy: vi
        .fn()
        .mockResolvedValue({ ...proposal, rootPath: courseRoot })
    }
    const sessions = new ImportSessionService({
      parser,
      createId: () => 'session-folder-change'
    })

    const result = await sessions.prepareFolderImport(courseRoot)
    fs.writeFileSync(lessonPath, 'second')

    await expect(sessions.beginCommit(result.sessionId)).rejects.toThrow(
      'changed after preview'
    )

    await sessions.cancel(result.sessionId)
    expect(() => sessions.getSession(result.sessionId)).toThrow(
      'Import session not found'
    )
  })

  it('blocks a managed folder move when a hidden file is added after preview', async () => {
    const temporaryRoot = createTemporaryRoot()
    const courseRoot = path.join(temporaryRoot, 'curso')
    const lessonPath = path.join(courseRoot, 'Modulo 01', 'aula.mp4')
    const hiddenPath = path.join(courseRoot, '.private-notes.txt')
    fs.mkdirSync(path.dirname(lessonPath), { recursive: true })
    fs.writeFileSync(lessonPath, 'lesson bytes')

    const parser = {
      parseCourseHierarchy: vi
        .fn()
        .mockResolvedValue({ ...proposal, rootPath: courseRoot })
    }
    const sessions = new ImportSessionService({
      parser,
      createId: () => 'session-hidden-file'
    })
    const result = await sessions.prepareFolderImport(courseRoot)

    fs.writeFileSync(hiddenPath, 'added after preview')

    await expect(sessions.beginCommit(result.sessionId)).rejects.toThrow(
      'changed after preview'
    )
    expect(fs.existsSync(courseRoot)).toBe(true)
    expect(fs.existsSync(hiddenPath)).toBe(true)
  })

  it('blocks a managed folder move when an ignored subdirectory changes after preview', async () => {
    const temporaryRoot = createTemporaryRoot()
    const courseRoot = path.join(temporaryRoot, 'curso')
    const lessonPath = path.join(courseRoot, 'Modulo 01', 'aula.mp4')
    const ignoredPath = path.join(
      courseRoot,
      'node_modules',
      'dependency',
      'package.json'
    )
    fs.mkdirSync(path.dirname(lessonPath), { recursive: true })
    fs.mkdirSync(path.dirname(ignoredPath), { recursive: true })
    fs.writeFileSync(lessonPath, 'lesson bytes')
    fs.writeFileSync(ignoredPath, '{"version":"1"}')

    const parser = {
      parseCourseHierarchy: vi
        .fn()
        .mockResolvedValue({ ...proposal, rootPath: courseRoot })
    }
    const sessions = new ImportSessionService({
      parser,
      createId: () => 'session-ignored-directory'
    })
    const result = await sessions.prepareFolderImport(courseRoot)

    fs.writeFileSync(
      ignoredPath,
      '{"version":"2","content":"changed after preview"}'
    )

    await expect(sessions.beginCommit(result.sessionId)).rejects.toThrow(
      'changed after preview'
    )
    expect(fs.existsSync(courseRoot)).toBe(true)
    expect(fs.existsSync(ignoredPath)).toBe(true)
  })

  it('allows only one caller to claim a session and prevents cancellation while it is committing', async () => {
    const archive = {
      prepareZip: vi.fn().mockResolvedValue(preparedArchive),
      discardPreparedArchive: vi.fn()
    }
    const scanner = { scanDirectory: vi.fn().mockResolvedValue({}) }
    const parser = { parseCourseHierarchy: vi.fn().mockResolvedValue(proposal) }
    const sessions = new ImportSessionService({
      archive,
      scanner,
      parser,
      createId: () => 'session-exclusive'
    })
    const result = await sessions.prepareZipImport({
      zipPath: preparedArchive.sourcePath,
      stagingBaseDir: 'C:/staging'
    })

    await expect(sessions.beginCommit(result.sessionId)).resolves.toMatchObject(
      { id: result.sessionId }
    )
    await expect(sessions.beginCommit(result.sessionId)).rejects.toThrow(
      'already being committed'
    )
    await expect(sessions.cancel(result.sessionId)).rejects.toThrow(
      'cannot be cancelled while it is committing'
    )

    sessions.releaseCommit(result.sessionId)
    await expect(sessions.cancel(result.sessionId)).resolves.toBeUndefined()
  })

  it('completes a claimed ZIP session by discarding only its staging directory', async () => {
    const archive = {
      prepareZip: vi.fn().mockResolvedValue(preparedArchive),
      discardPreparedArchive: vi.fn()
    }
    const scanner = { scanDirectory: vi.fn().mockResolvedValue({}) }
    const parser = { parseCourseHierarchy: vi.fn().mockResolvedValue(proposal) }
    const sessions = new ImportSessionService({
      archive,
      scanner,
      parser,
      createId: () => 'session-complete-zip'
    })
    const result = await sessions.prepareZipImport({
      zipPath: preparedArchive.sourcePath,
      stagingBaseDir: 'C:/staging'
    })
    await sessions.beginCommit(result.sessionId)

    sessions.complete(result.sessionId, { discardStaging: true })

    expect(archive.discardPreparedArchive).toHaveBeenCalledWith(
      preparedArchive.stagingRoot,
      'C:/staging'
    )
    expect(() => sessions.getSession(result.sessionId)).toThrow(
      'Import session not found'
    )
  })
})
