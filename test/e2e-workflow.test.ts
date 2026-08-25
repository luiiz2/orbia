import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { appConfigService } from '../src/main/services/app-config.service'
import { databaseService } from '../src/main/services/database.service'
import { vaultService } from '../src/main/services/vault.service'
import { scannerService } from '../src/main/services/scanner.service'
import { parserService } from '../src/main/services/parser.service'
import { archiveService } from '../src/main/services/archive.service'
import type { Course, Module, Lesson } from '../src/types'

describe('End-to-End Core Workflow Integration Test', () => {
  const testRootDir = path.join(__dirname, 'tmp_e2e_vault')
  const testConfigDbPath = path.join(testRootDir, 'test-config.db')
  const testVaultDir = path.join(testRootDir, 'MyStudyVault')
  const testZipSource = path.join(testRootDir, 'Python_Masterclass_Complete.zip')

  beforeEach(() => {
    // Setup clean temporary test directories
    if (fs.existsSync(testRootDir)) {
      fs.rmSync(testRootDir, { recursive: true, force: true })
    }
    fs.mkdirSync(testRootDir, { recursive: true })

    // Initialize App Config DB with custom path
    appConfigService.init(testConfigDbPath)
  })

  afterEach(() => {
    try {
      databaseService.close()
      appConfigService.close()
    } catch {}

    if (fs.existsSync(testRootDir)) {
      fs.rmSync(testRootDir, { recursive: true, force: true })
    }
  })

  it('executes full study lifecycle: Create Vault -> Zip Extract -> Scan -> Save -> Play Progress -> History -> Stats -> Delete', async () => {
    // 1. Create a new Study Vault
    const vault = await vaultService.createVault(testVaultDir, 'My Study Vault')
    expect(vault).toBeDefined()
    expect(vault.name).toBe('My Study Vault')
    expect(fs.existsSync(path.join(testVaultDir, '.orbia', 'library.db'))).toBe(true)
    expect(fs.existsSync(path.join(testVaultDir, 'Courses'))).toBe(true)
    expect(fs.existsSync(path.join(testVaultDir, 'Inbox'))).toBe(true)

    // Verify AppConfig recorded the active vault
    const recentVaults = appConfigService.getRecentVaults()
    expect(recentVaults.length).toBe(1)
    expect(recentVaults[0].path).toBe(testVaultDir)

    // 2. Generate a real test .zip archive with realistic messy folder hierarchy
    const zip = new AdmZip()
    // Module 1 with 2 lessons and a PDF resource
    zip.addFile(
      'Python Masterclass 2026/01 - Fundamentos do Python/001 - Aula 01 - Instalacao_e_Configuracao_1080p.mp4',
      Buffer.from('fake-video-content-1')
    )
    zip.addFile(
      'Python Masterclass 2026/01 - Fundamentos do Python/002 - Aula 02 - Variaveis e Tipos de Dados [720p].mp4',
      Buffer.from('fake-video-content-2')
    )
    zip.addFile(
      'Python Masterclass 2026/01 - Fundamentos do Python/apostila_modulo_1.pdf',
      Buffer.from('fake-pdf-content')
    )

    // Module 2 with 2 lessons
    zip.addFile(
      'Python Masterclass 2026/02 - Estruturas de Controle/01 - Estruturas Condicionais (If Else)_1080p.mp4',
      Buffer.from('fake-video-content-3')
    )
    zip.addFile(
      'Python Masterclass 2026/02 - Estruturas de Controle/02 - Loops For e While_1080p.mp4',
      Buffer.from('fake-video-content-4')
    )
    zip.writeZip(testZipSource)

    expect(fs.existsSync(testZipSource)).toBe(true)

    // 3. Extract the .zip archive into the Vault Inbox
    const inboxDir = path.join(testVaultDir, 'Inbox')
    const progressUpdates: number[] = []

    const extractResult = await archiveService.extractZip({
      zipPath: testZipSource,
      destinationDir: inboxDir,
      onProgress: (percent) => {
        progressUpdates.push(percent)
      }
    })

    expect(extractResult.extractedPath).toBeDefined()
    expect(fs.existsSync(extractResult.extractedPath)).toBe(true)
    expect(progressUpdates.length).toBeGreaterThan(0)
    expect(progressUpdates[progressUpdates.length - 1]).toBe(100)

    // 4. Scan and parse the extracted hierarchy
    const scannedDir = await scannerService.scanDirectory(extractResult.extractedPath)
    expect(scannedDir.files.length + scannedDir.subDirectories.length).toBeGreaterThan(0)

    const proposal = await parserService.parseCourseHierarchy(scannedDir)
    expect(proposal.modules.length).toBe(2)
    expect(proposal.totalLessons).toBe(4)
    expect(proposal.modules[0].resources?.some((r) => r.type === 'pdf')).toBe(true)

    // Verify Title Cleaner cleaned up raw technical strings
    expect(proposal.modules[0].title).toBe('01 - Fundamentos do Python')
    expect(proposal.modules[0].lessons[0].title).toBe('001 - Aula 01 - Instalacao e Configuracao')
    expect(proposal.modules[0].lessons[1].title).toBe('002 - Aula 02 - Variaveis e Tipos de Dados')
    expect(proposal.modules[1].title).toBe('02 - Estruturas de Controle')
    expect(proposal.modules[1].lessons[0].title).toBe('01 - Estruturas Condicionais (If Else)')

    // 5. Commit course into the SQLite database
    const courseId = 'course-e2e-001'
    const course: Course = {
      id: courseId,
      title: proposal.suggestedTitle,
      slug: 'python-masterclass-2026',
      sourceType: 'local-vault',
      rootPath: proposal.rootPath,
      coverPath: proposal.coverPath,
      totalDuration: 1200,
      moduleCount: proposal.modules.length,
      lessonCount: proposal.totalLessons,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const modulesWithLessons: (Module & { lessons: Lesson[] })[] = proposal.modules.map((m, mIdx) => {
      const moduleId = `mod-${mIdx + 1}`
      const lessons: Lesson[] = m.lessons.map((l, lIdx) => ({
        id: `les-${mIdx + 1}-${lIdx + 1}`,
        moduleId,
        courseId,
        title: l.title,
        orderIndex: l.orderIndex,
        filePath: l.filePath,
        fileName: l.originalFileName,
        fileExtension: l.fileExtension,
        mediaType: l.mediaType,
        duration: 300,
        fileSize: l.fileSize,
        availability: 'local',
        createdAt: Date.now()
      }))

      return {
        id: moduleId,
        courseId,
        title: m.title,
        orderIndex: m.orderIndex,
        folderPath: m.folderPath,
        duration: 600,
        lessonCount: lessons.length,
        createdAt: Date.now(),
        lessons
      }
    })

    databaseService.saveCourseWithHierarchy(course, modulesWithLessons)

    // 6. Verify retrieved hierarchy from database
    const retrieved = databaseService.getCourseById(courseId)
    expect(retrieved).toBeDefined()
    expect(retrieved?.course.title).toBe(proposal.suggestedTitle)
    expect(retrieved?.modules.length).toBe(2)
    expect(retrieved?.modules[0].lessons.length).toBe(2)

    // 7. Track playback progress for Lesson 1 (Partial watch: 150s / 300s -> 50% watched, not completed)
    const lesson1Id = modulesWithLessons[0].lessons[0].id
    databaseService.saveLessonProgress({
      lessonId: lesson1Id,
      courseId,
      currentTime: 150,
      duration: 300,
      completed: false
    })

    const progress1 = databaseService.getLessonProgress(lesson1Id)
    expect(progress1).toBeDefined()
    expect(progress1?.currentTime).toBe(150)
    expect(progress1?.completed).toBe(false)

    // 8. Track playback progress for Lesson 2 (Finished watch: 290s / 300s -> >= 90%, completed)
    const lesson2Id = modulesWithLessons[0].lessons[1].id
    databaseService.saveLessonProgress({
      lessonId: lesson2Id,
      courseId,
      currentTime: 290,
      duration: 300,
      completed: true
    })

    const progress2 = databaseService.getLessonProgress(lesson2Id)
    expect(progress2?.completed).toBe(true)

    // 9. Add Watch History Entries
    databaseService.addWatchHistory({
      lessonId: lesson1Id,
      courseId,
      lessonTitle: 'Aula 01 - Instalacao e Configuracao',
      courseTitle: course.title,
      currentTime: 150,
      duration: 300
    })

    const history = databaseService.getWatchHistory(10)
    expect(history.length).toBe(1)
    expect(history[0].lessonId).toBe(lesson1Id)
    expect(history[0].currentTime).toBe(150)

    // 10. Check Progress Summary calculation for the entire course
    const summary = databaseService.getCourseProgressSummary(courseId)
    expect(summary).toBeDefined()
    expect(summary?.totalLessons).toBe(4)
    expect(summary?.completedLessons).toBe(1)
    // 1 out of 4 completed = 25%
    expect(summary?.percentage).toBe(25)
    expect(summary?.lastPlayedLessonId).toBe(lesson2Id)

    // 11. Test Vault Overall Statistics
    const stats = await vaultService.getVaultStats()
    expect(stats.courseCount).toBe(1)
    expect(stats.lessonCount).toBe(4)
    expect(stats.completedLessons).toBe(1)

    // 12. Test Settings Persistence in AppConfig
    appConfigService.setSetting('language', 'pt-BR')
    appConfigService.setSetting('theme', 'light')
    appConfigService.setSetting('defaultPlaybackSpeed', 1.5)

    const updatedSettings = appConfigService.getSettings()
    expect(updatedSettings.language).toBe('pt-BR')
    expect(updatedSettings.theme).toBe('light')
    expect(updatedSettings.defaultPlaybackSpeed).toBe(1.5)

    // 13. Test Deleting Course with Cascade Integrity
    databaseService.deleteCourse(courseId)
    const afterDelete = databaseService.getCourseById(courseId)
    expect(afterDelete).toBeNull()

    const summaryAfterDelete = databaseService.getCourseProgressSummary(courseId)
    expect(summaryAfterDelete).toBeNull()
  }, 15_000)
})
