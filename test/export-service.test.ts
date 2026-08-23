import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DatabaseService } from '../src/main/services/database.service'
import { ExportService } from '../src/main/services/export.service'

describe('Export Service (Notes, Bookmarks, Flashcards)', () => {
  let tempDir: string
  let vaultDir: string
  let dbService: DatabaseService
  let exportService: ExportService

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-export-test-'))
    vaultDir = path.join(tempDir, 'TestVault')
    fs.mkdirSync(path.join(vaultDir, '.orbia'), { recursive: true })

    dbService = new DatabaseService()
    dbService.connect(vaultDir)

    dbService.saveCourseWithHierarchy(
      {
        id: 'c1',
        title: 'Python Pro',
        slug: 'python-pro',
        sourceType: 'folder',
        rootPath: path.join(vaultDir, 'Python'),
        totalDuration: 3600,
        moduleCount: 1,
        lessonCount: 1,
        isFavorite: false,
        createdAt: 1000,
        updatedAt: 1000
      },
      [
        {
          id: 'm1',
          courseId: 'c1',
          title: 'Módulo 1',
          orderIndex: 1,
          duration: 3600,
          lessonCount: 1,
          createdAt: 1000,
          lessons: [
            {
              id: 'l1',
              moduleId: 'm1',
              courseId: 'c1',
              title: 'Aula 01 - Introdução',
              orderIndex: 1,
              filePath: path.join(vaultDir, 'Python', '01.mp4'),
              fileName: '01.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              duration: 3600,
              fileSize: 1000,
              availability: 'available',
              createdAt: 1000
            }
          ]
        }
      ]
    )

    dbService.addLessonNote({
      courseId: 'c1',
      lessonId: 'l1',
      timestampSeconds: 125,
      content: 'Estruturas condicionais em Python'
    })

    dbService.createBookmark({
      courseId: 'c1',
      lessonId: 'l1',
      timestamp: 300,
      title: 'Importante para a prova'
    })

    dbService.createFlashcard({
      courseId: 'c1',
      lessonId: 'l1',
      timestamp: 450,
      question: 'Qual a diferença entre list e tuple?',
      answer: 'Tuples são imutáveis, lists são mutáveis.'
    })

    exportService = new ExportService(dbService)
  })

  afterEach(() => {
    dbService.disconnect()
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // Ignored
    }
  })

  it('exports notes to structured Markdown', () => {
    const md = exportService.exportNotesMarkdown()
    expect(md).toContain('# Anotações de Estudo — Orbia')
    expect(md).toContain('## 📚 Python Pro')
    expect(md).toContain('### 🎬 Aula 01 - Introdução')
    expect(md).toContain('**02:05** — Estruturas condicionais em Python')
  })

  it('exports bookmarks to structured Markdown', () => {
    const md = exportService.exportBookmarksMarkdown()
    expect(md).toContain('# Marcadores de Estudo (Bookmarks) — Orbia')
    expect(md).toContain('## 📚 Python Pro')
    expect(md).toContain('- 🔖 **05:00** — Importante para a prova')
  })

  it('exports flashcards to Anki CSV format with correct escaping', () => {
    const csv = exportService.exportFlashcardsCsv()
    expect(csv).toContain('"Question","Answer","Course","Lesson","Timestamp"')
    expect(csv).toContain('"Qual a diferença entre list e tuple?","Tuples são imutáveis, lists são mutáveis.","Python Pro","Aula 01 - Introdução","07:30"')
  })

  it('exports flashcards to Markdown format', () => {
    const md = exportService.exportFlashcardsMarkdown()
    expect(md).toContain('# Flashcards de Estudo — Orbia')
    expect(md).toContain('### 1. Qual a diferença entre list e tuple?')
    expect(md).toContain('> **Resposta**: Tuples são imutáveis, lists são mutáveis.')
    expect(md).toContain('Curso: Python Pro')
  })
})
