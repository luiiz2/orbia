import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { scannerService } from '../src/main/services/scanner.service'
import { parserService } from '../src/main/services/parser.service'

describe('Scanner Service Integration Test', () => {
  let tempDir: string

  beforeEach(async () => {
    // Create an isolated temporary test directory
    tempDir = path.join(os.tmpdir(), `orbia-test-${Date.now()}`)
    await fs.promises.mkdir(tempDir, { recursive: true })

    // Setup mock course directory hierarchy:
    // Course: "Python For Beginners [2024]"
    //  ├── cover.jpg
    //  ├── 01 - Basics/
    //  │    ├── 01 - Intro.mp4
    //  │    └── 02 - Syntax.mp4
    //  ├── 02 - Advanced/
    //  │    └── 01 - Async.mp4
    //  └── .git/ (should be ignored)
    //       └── config

    const courseDir = path.join(tempDir, 'Python For Beginners [2024]')
    const mod1Dir = path.join(courseDir, '01 - Basics')
    const mod2Dir = path.join(courseDir, '02 - Advanced')
    const gitDir = path.join(courseDir, '.git')

    await fs.promises.mkdir(mod1Dir, { recursive: true })
    await fs.promises.mkdir(mod2Dir, { recursive: true })
    await fs.promises.mkdir(gitDir, { recursive: true })

    await fs.promises.writeFile(
      path.join(courseDir, 'cover.jpg'),
      'fake-image-bytes'
    )
    await fs.promises.writeFile(
      path.join(mod1Dir, '01 - Intro.mp4'),
      'fake-video-bytes'
    )
    await fs.promises.writeFile(
      path.join(mod1Dir, '02 - Syntax.mp4'),
      'fake-video-bytes-2'
    )
    await fs.promises.writeFile(
      path.join(mod2Dir, '01 - Async.mp4'),
      'fake-video-bytes-3'
    )
    await fs.promises.writeFile(path.join(gitDir, 'config'), 'git-config')
  })

  afterEach(async () => {
    // Cleanup temporary directory
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('scans a real directory on disk and parses it correctly into a proposal', async () => {
    const courseRoot = path.join(tempDir, 'Python For Beginners [2024]')
    const scanned = await scannerService.scanDirectory(courseRoot)

    expect(scanned.name).toBe('Python For Beginners [2024]')
    expect(scanned.subDirectories.length).toBe(2) // .git should be ignored!

    const proposal = await parserService.parseCourseHierarchy(scanned)

    expect(proposal.suggestedTitle).toBe('Python For Beginners')
    expect(proposal.coverPath).toBe(path.join(courseRoot, 'cover.jpg'))
    expect(proposal.totalLessons).toBe(3)
    expect(proposal.modules.length).toBe(2)

    expect(proposal.modules[0].title).toBe('01 - Basics')
    expect(proposal.modules[0].lessons.length).toBe(2)
    expect(proposal.modules[0].lessons[0].title).toBe('01 - Intro')
    expect(proposal.modules[0].lessons[1].title).toBe('02 - Syntax')

    expect(proposal.modules[1].title).toBe('02 - Advanced')
    expect(proposal.modules[1].lessons.length).toBe(1)
    expect(proposal.modules[1].lessons[0].title).toBe('01 - Async')
  })
})
