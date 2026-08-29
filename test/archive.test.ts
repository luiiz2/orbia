import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { ArchiveService } from '../src/main/services/archive.service'

const TEST_TMP_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), 'orbia-archive-test-')
)
const archiveService = new ArchiveService({
  validateMedia: async () => ({ valid: true, failedFiles: [], warnings: [] })
})

describe('ArchiveService (.zip extraction)', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_TMP_DIR)) {
      fs.rmSync(TEST_TMP_DIR, { recursive: true, force: true })
    }
    fs.mkdirSync(TEST_TMP_DIR, { recursive: true })
  })

  afterEach(() => {
    if (fs.existsSync(TEST_TMP_DIR)) {
      fs.rmSync(TEST_TMP_DIR, { recursive: true, force: true })
    }
  })

  it('should extract a valid zip archive with lessons and modules', async () => {
    const zip = new AdmZip()
    zip.addFile('Module 01/01 - Introduction.mp4', Buffer.from('fake video 1'))
    zip.addFile(
      'Module 01/02 - Environment Setup.mp4',
      Buffer.from('fake video 2')
    )
    zip.addFile('Module 02/01 - Deep Dive.mp4', Buffer.from('fake video 3'))

    const zipFilePath = path.join(TEST_TMP_DIR, 'python-course.zip')
    zip.writeZip(zipFilePath)

    const destDir = path.join(TEST_TMP_DIR, 'Inbox')

    const progressUpdates: number[] = []
    const result = await archiveService.extractZip({
      zipPath: zipFilePath,
      destinationDir: destDir,
      onProgress: (percent) => {
        progressUpdates.push(percent)
      }
    })

    expect(result.totalExtractedFiles).toBe(3)
    expect(result.suggestedCourseName).toBe('python-course')
    expect(result.verificationOk).toBe(true)
    expect(result.failedEntries).toEqual([])
    expect(result.warnings).toEqual([])
    expect(progressUpdates.length).toBeGreaterThan(0)
    expect(progressUpdates[progressUpdates.length - 1]).toBe(100)

    // Preparing an import must never move or delete the user's ZIP.
    expect(fs.existsSync(zipFilePath)).toBe(true)
    expect(
      fs.existsSync(
        path.join(result.extractedPath, 'Module 01', '01 - Introduction.mp4')
      )
    ).toBe(true)
    expect(
      fs.existsSync(
        path.join(result.extractedPath, 'Module 02', '01 - Deep Dive.mp4')
      )
    ).toBe(true)
  })

  it('should unwrap single root folder inside zip for clean hierarchy', async () => {
    const zip = new AdmZip()
    zip.addFile('Masterclass_Root/01 - Lesson.mp4', Buffer.from('video data'))

    const zipFilePath = path.join(TEST_TMP_DIR, 'wrapped-course.zip')
    zip.writeZip(zipFilePath)

    const destDir = path.join(TEST_TMP_DIR, 'Inbox')

    const result = await archiveService.extractZip({
      zipPath: zipFilePath,
      destinationDir: destDir
    })

    expect(path.basename(result.extractedPath)).toBe('Masterclass_Root')
    expect(
      fs.existsSync(path.join(result.extractedPath, '01 - Lesson.mp4'))
    ).toBe(true)
  })

  it('skips unsafe zip-slip paths and reports them as warnings', async () => {
    // AdmZip normalizes '../' at addFile time, so craft a real malicious entry
    // by byte-patching the entry name inside the produced zip (same byte length).
    const zip = new AdmZip()
    zip.addFile('Module 01/safe-lesson.mp4', Buffer.from('safe video content'))
    zip.addFile('b.mp4', Buffer.from('x'))

    const zipFilePath = path.join(TEST_TMP_DIR, 'zip-slip.zip')
    const patched = Buffer.from(
      zip.toBuffer().toString('latin1').split('b.mp4').join('../..'),
      'latin1'
    )
    fs.writeFileSync(zipFilePath, patched)

    const destDir = path.join(TEST_TMP_DIR, 'Inbox')

    const result = await archiveService.extractZip({
      zipPath: zipFilePath,
      destinationDir: destDir
    })

    expect(result.totalExtractedFiles).toBe(1)
    expect(result.warnings.some((w) => w.includes('Skipped unsafe path'))).toBe(
      true
    )
    expect(
      fs.existsSync(path.join(result.extractedPath, 'safe-lesson.mp4'))
    ).toBe(true)
    expect(fs.existsSync(path.join(TEST_TMP_DIR, 'evil.mp4'))).toBe(false)
  })

  it('detects duplicate zip entries via post-extraction verification', async () => {
    // AdmZip dedupes addFile with identical names — byte-patch a second entry
    // name into the first one's (same byte length) to simulate a real duplicate zip.
    const zip = new AdmZip()
    zip.addFile('Module 01/01 - Lesson.mp4', Buffer.from('video data'))
    zip.addFile(
      'Module 01/02 - Lesson.mp4',
      Buffer.from('video data overwrite')
    )

    const zipFilePath = path.join(TEST_TMP_DIR, 'dupe-entry.zip')
    const patched = Buffer.from(
      zip
        .toBuffer()
        .toString('latin1')
        .split('02 - Lesson.mp4')
        .join('01 - Lesson.mp4'),
      'latin1'
    )
    fs.writeFileSync(zipFilePath, patched)

    const destDir = path.join(TEST_TMP_DIR, 'Inbox')

    const result = await archiveService.extractZip({
      zipPath: zipFilePath,
      destinationDir: destDir
    })

    // The conflicting entry is never allowed to overwrite the first staged file.
    expect(result.totalExtractedFiles).toBe(1)
    expect(result.verificationOk).toBe(false)
    expect(
      result.warnings.some((w) => w.includes('Duplicate destination path'))
    ).toBe(true)
  })

  it('prepares a ZIP in a unique staging directory without moving the source', async () => {
    const zip = new AdmZip()
    zip.addFile('Module 01/01 - Lesson.mp4', Buffer.from('video data'))
    const zipFilePath = path.join(TEST_TMP_DIR, 'staged-course.zip')
    zip.writeZip(zipFilePath)

    const stagingBaseDir = path.join(TEST_TMP_DIR, 'staging')

    const result = await archiveService.prepareZip({
      zipPath: zipFilePath,
      stagingBaseDir
    })

    expect(fs.existsSync(zipFilePath)).toBe(true)
    expect(result.stagingRoot).toMatch(/orbia-import-/)
    expect(result.extractedPath).toContain(result.stagingRoot)
    expect(
      fs.existsSync(path.join(result.extractedPath, '01 - Lesson.mp4'))
    ).toBe(true)
  })

  it('cleans the copied staging directory when the ZIP cannot be read', async () => {
    const zipFilePath = path.join(TEST_TMP_DIR, 'corrupt.zip')
    const stagingBaseDir = path.join(TEST_TMP_DIR, 'staging')
    fs.writeFileSync(zipFilePath, 'not a ZIP archive')

    await expect(
      archiveService.prepareZip({
        zipPath: zipFilePath,
        stagingBaseDir
      })
    ).rejects.toThrow('Could not read ZIP archive')

    expect(fs.existsSync(zipFilePath)).toBe(true)
    expect(fs.readdirSync(stagingBaseDir)).toEqual([])
  })

  it('rejects a highly compressible ZIP before writing its payload into staging', async () => {
    const zip = new AdmZip()
    zip.addFile('Module 01/repeated.txt', Buffer.alloc(2 * 1024 * 1024))
    const zipFilePath = path.join(TEST_TMP_DIR, 'high-ratio.zip')
    const stagingBaseDir = path.join(TEST_TMP_DIR, 'staging')
    zip.writeZip(zipFilePath)

    const writeFileSync = vi.spyOn(fs, 'writeFileSync')
    try {
      await expect(
        archiveService.prepareZip({
          zipPath: zipFilePath,
          stagingBaseDir
        })
      ).rejects.toThrow('compression ratio')

      expect(fs.existsSync(zipFilePath)).toBe(true)
      expect(fs.readdirSync(stagingBaseDir)).toEqual([])
      const stagingWrites = writeFileSync.mock.calls.filter(
        ([target]) =>
          typeof target === 'string' && target.startsWith(stagingBaseDir)
      )
      expect(stagingWrites).toHaveLength(0)
    } finally {
      writeFileSync.mockRestore()
    }
  })

  it('keeps the source ZIP even when the legacy delete option is passed', async () => {
    const zip = new AdmZip()
    zip.addFile('Module 01/01 - Lesson.mp4', Buffer.from('video data'))
    const zipFilePath = path.join(TEST_TMP_DIR, 'delete-course.zip')
    zip.writeZip(zipFilePath)

    const destDir = path.join(TEST_TMP_DIR, 'Inbox')

    const result = await archiveService.extractZip({
      zipPath: zipFilePath,
      destinationDir: destDir,
      deleteSourceArchive: true
    })

    expect(fs.existsSync(zipFilePath)).toBe(true)
    expect(
      fs.existsSync(path.join(result.extractedPath, '01 - Lesson.mp4'))
    ).toBe(true)
  })

  it('blocks a prepared ZIP when full media validation reports a corrupt file', async () => {
    const zip = new AdmZip()
    zip.addFile('Module 01/01 - Broken.mp4', Buffer.from('not real media'))
    const zipFilePath = path.join(TEST_TMP_DIR, 'broken-course.zip')
    zip.writeZip(zipFilePath)

    const validatingArchiveService = new ArchiveService({
      validateMedia: async (filePaths) => ({
        valid: false,
        failedFiles: filePaths,
        warnings: ['FFmpeg could not decode the staged lesson.']
      })
    })

    const result = await validatingArchiveService.prepareZip({
      zipPath: zipFilePath,
      stagingBaseDir: path.join(TEST_TMP_DIR, 'staging')
    })

    expect(result.verificationOk).toBe(false)
    expect(result.failedEntries).toContain('Module 01/01 - Broken.mp4')
    expect(result.warnings).toContain(
      'FFmpeg could not decode the staged lesson.'
    )
    expect(fs.existsSync(zipFilePath)).toBe(true)
  })

  it('does not report successful verification when media validation cannot run', async () => {
    const zip = new AdmZip()
    zip.addFile('Module 01/notes.pdf', Buffer.from('course notes'))
    const zipFilePath = path.join(TEST_TMP_DIR, 'unvalidated-course.zip')
    zip.writeZip(zipFilePath)

    const validatingArchiveService = new ArchiveService({
      validateMedia: async () => {
        throw new Error('validator unavailable')
      }
    })

    const result = await validatingArchiveService.prepareZip({
      zipPath: zipFilePath,
      stagingBaseDir: path.join(TEST_TMP_DIR, 'staging')
    })

    expect(result.verificationOk).toBe(false)
    expect(result.warnings).toContain(
      'Media validation could not run: validator unavailable'
    )
    expect(fs.existsSync(zipFilePath)).toBe(true)
  })
})
