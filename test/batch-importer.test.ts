import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { ScannerService } from '../src/main/services/scanner.service'
import { ParserService } from '../src/main/services/parser.service'
import { DatabaseService } from '../src/main/services/database.service'

describe('Multi-Course Batch Importer Engine', () => {
  let tempRoot: string
  let tempVaultDir: string
  let scanner: ScannerService
  let parser: ParserService
  let dbService: DatabaseService

  beforeEach(() => {
    tempRoot = path.join(os.tmpdir(), `orbia-batch-root-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
    tempVaultDir = path.join(os.tmpdir(), `orbia-batch-vault-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
    fs.mkdirSync(tempRoot, { recursive: true })
    fs.mkdirSync(tempVaultDir, { recursive: true })

    scanner = new ScannerService()
    parser = new ParserService()
    dbService = new DatabaseService()
    dbService.connect(tempVaultDir)
  })

  afterEach(() => {
    dbService.close()
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true })
      fs.rmSync(tempVaultDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('scans multi-course root and detects separate course proposals', async () => {
    // Create Course 1: "Python Fundamentals"
    const course1Dir = path.join(tempRoot, '01. Python Fundamentals')
    const c1Mod1 = path.join(course1Dir, '01 - Intro')
    fs.mkdirSync(c1Mod1, { recursive: true })
    fs.writeFileSync(path.join(c1Mod1, '01 - Welcome.mp4'), 'video content 1')

    // Create Course 2: "Docker Bootcamp"
    const course2Dir = path.join(tempRoot, 'Docker Bootcamp 2026')
    const c2Mod1 = path.join(course2Dir, 'Module 1')
    fs.mkdirSync(c2Mod1, { recursive: true })
    fs.writeFileSync(path.join(c2Mod1, '01 - Setup.mp4'), 'video content 2')

    // Scan multi-course root
    const scannedDirs = await scanner.scanMultiCourseRoot(tempRoot)
    expect(scannedDirs.length).toBe(2)

    // Parse each proposal
    const proposals = await Promise.all(
      scannedDirs.map((dir) => parser.parseCourseHierarchy(dir))
    )

    expect(proposals.length).toBe(2)
    const titles = proposals.map((p) => p.suggestedTitle)
    expect(titles).toContain('Python Fundamentals')
    expect(titles).toContain('Docker Bootcamp')
  })
})
