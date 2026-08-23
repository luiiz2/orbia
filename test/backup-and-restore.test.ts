import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import AdmZip from 'adm-zip'
import { DatabaseService } from '../src/main/services/database.service'
import { BackupService } from '../src/main/services/backup.service'

describe('Backup & Restore Service (.orbia format)', () => {
  let tempDir: string
  let vaultDir: string
  let backupFile: string
  let dbService: DatabaseService
  let backupService: BackupService

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-backup-test-'))
    vaultDir = path.join(tempDir, 'TestVault')
    fs.mkdirSync(path.join(vaultDir, '.orbia', 'covers'), { recursive: true })
    backupFile = path.join(tempDir, 'test-backup.orbia')

    dbService = new DatabaseService()
    dbService.connect(vaultDir)

    // Populate some test data
    dbService.saveCourseWithHierarchy(
      {
        id: 'course-backup-1',
        title: 'Curso de Arquitetura',
        slug: 'curso-de-arquitetura',
        sourceType: 'folder',
        rootPath: path.join(vaultDir, 'Curso'),
        totalDuration: 3600,
        moduleCount: 1,
        lessonCount: 2,
        isFavorite: true,
        createdAt: 1000,
        updatedAt: 1000
      },
      [
        {
          id: 'mod-1',
          courseId: 'course-backup-1',
          title: 'Módulo 01',
          orderIndex: 1,
          folderPath: path.join(vaultDir, 'Curso', 'M01'),
          duration: 3600,
          lessonCount: 2,
          lessons: [
            {
              id: 'les-1',
              moduleId: 'mod-1',
              courseId: 'course-backup-1',
              title: 'Aula 01',
              orderIndex: 1,
              filePath: path.join(vaultDir, 'Curso', 'M01', '01.mp4'),
              fileName: '01.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 1800,
              fileSize: 1000,
              availability: 'available',
              createdAt: 1000
            },
            {
              id: 'les-2',
              moduleId: 'mod-1',
              courseId: 'course-backup-1',
              title: 'Aula 02',
              orderIndex: 2,
              filePath: path.join(vaultDir, 'Curso', 'M01', '02.mp4'),
              fileName: '02.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 1800,
              fileSize: 1000,
              availability: 'available',
              createdAt: 1000
            }
          ]
        }
      ]
    )

    // Add a note, bookmark, flashcard
    dbService.addLessonNote({
      courseId: 'course-backup-1',
      lessonId: 'les-1',
      timestampSeconds: 120,
      content: 'Minha anotação importante de estudo'
    })

    dbService.createBookmark({
      courseId: 'course-backup-1',
      lessonId: 'les-1',
      timestamp: 450,
      title: 'Revisar este ponto'
    })

    dbService.createFlashcard({
      courseId: 'course-backup-1',
      lessonId: 'les-1',
      question: 'O que é DDD?',
      answer: 'Domain-Driven Design'
    })

    // Write a dummy cover
    fs.writeFileSync(path.join(vaultDir, '.orbia', 'covers', 'thumb1.jpg'), 'fake-image-bytes')

    backupService = new BackupService(dbService)
  })

  afterEach(() => {
    dbService.disconnect()
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // Ignored
    }
  })

  it('creates a valid .orbia backup archive with manifest, library.db and covers', async () => {
    const createRes = await backupService.createBackup({
      vaultPath: vaultDir,
      targetFilePath: backupFile,
      vaultName: 'Meu Vault de Estudos'
    })

    expect(createRes.success).toBe(true)
    expect(createRes.fileSizeBytes).toBeGreaterThan(0)
    expect(fs.existsSync(backupFile)).toBe(true)

    // Inspect archive entries
    const zip = new AdmZip(backupFile)
    const entryNames = zip.getEntries().map((e) => e.entryName)
    expect(entryNames).toContain('manifest.json')
    expect(entryNames).toContain('library.db')
    expect(entryNames).toContain('covers/thumb1.jpg')
  })

  it('inspects a backup archive and returns accurate preview metadata', async () => {
    await backupService.createBackup({
      vaultPath: vaultDir,
      targetFilePath: backupFile,
      vaultName: 'Meu Vault de Estudos'
    })

    const preview = await backupService.inspectBackup(backupFile)
    expect(preview.valid).toBe(true)
    expect(preview.manifest?.vaultName).toBe('Meu Vault de Estudos')
    expect(preview.manifest?.courseCount).toBe(1)
    expect(preview.manifest?.notesCount).toBe(1)
    expect(preview.manifest?.bookmarksCount).toBe(1)
    expect(preview.manifest?.flashcardsCount).toBe(1)
    expect(preview.manifest?.includesCourseFiles).toBe(false)
  })

  it('rejects path traversal attacks in malicious backup files', async () => {
    const maliciousZip = new AdmZip()
    maliciousZip.addFile('manifest.json', Buffer.from(JSON.stringify({ format: 'orbia-backup' })))
    maliciousZip.addFile('library.db', Buffer.from('dummy'))
    maliciousZip.addFile('../../Windows/System32/evil.txt', Buffer.from('malicious payload'))
    const maliciousPath = path.join(tempDir, 'evil.orbia')
    maliciousZip.writeZip(maliciousPath)

    const preview = await backupService.inspectBackup(maliciousPath)
    expect(preview.valid).toBe(false)
    expect(preview.error).toMatch(/Security violation: Path traversal/i)
  })

  it('successfully restores a backup into a new or clean vault', async () => {
    await backupService.createBackup({
      vaultPath: vaultDir,
      targetFilePath: backupFile
    })

    // Create a brand new target vault
    const newVaultDir = path.join(tempDir, 'RestoredVault')
    fs.mkdirSync(newVaultDir, { recursive: true })

    const restoreRes = await backupService.restoreBackup({
      vaultPath: newVaultDir,
      backupFilePath: backupFile
    })

    expect(restoreRes.success).toBe(true)
    expect(restoreRes.restoredCoursesCount).toBe(1)

    // Verify restored database contents
    const restoredCourses = dbService.getAllCourses()
    expect(restoredCourses.length).toBe(1)
    expect(restoredCourses[0].title).toBe('Curso de Arquitetura')

    const notes = dbService.getCourseNotes('course-backup-1')
    expect(notes.length).toBe(1)
    expect(notes[0].content).toBe('Minha anotação importante de estudo')

    const bookmarks = dbService.getBookmarksByCourse('course-backup-1')
    expect(bookmarks.length).toBe(1)
    expect(bookmarks[0].title).toBe('Revisar este ponto')

    const flashcards = dbService.getAllFlashcards('course-backup-1')
    expect(flashcards.length).toBe(1)
    expect(flashcards[0].question).toBe('O que é DDD?')
  })
})
