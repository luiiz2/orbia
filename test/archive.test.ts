import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { archiveService } from '../src/main/services/archive.service'

const TEST_TMP_DIR = path.join(__dirname, 'tmp_archive_test')

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

  it('should correctly identify .zip files', () => {
    expect(archiveService.isZipFile('course.zip')).toBe(true)
    expect(archiveService.isZipFile('COURSE.ZIP')).toBe(true)
    expect(archiveService.isZipFile('C:/files/course.mp4')).toBe(false)
    expect(archiveService.isZipFile('')).toBe(false)
  })

  it('should extract a valid zip archive with lessons and modules', async () => {
    const zip = new AdmZip()
    zip.addFile('Module 01/01 - Introduction.mp4', Buffer.from('fake video 1'))
    zip.addFile('Module 01/02 - Environment Setup.mp4', Buffer.from('fake video 2'))
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
    expect(progressUpdates.length).toBeGreaterThan(0)
    expect(progressUpdates[progressUpdates.length - 1]).toBe(100)

    expect(fs.existsSync(path.join(result.extractedPath, 'Module 01', '01 - Introduction.mp4'))).toBe(true)
    expect(fs.existsSync(path.join(result.extractedPath, 'Module 02', '01 - Deep Dive.mp4'))).toBe(true)
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
    expect(fs.existsSync(path.join(result.extractedPath, '01 - Lesson.mp4'))).toBe(true)
  })
})
