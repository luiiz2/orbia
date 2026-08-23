import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  assessMediaHealth,
  pickCanonicalMediaCopy,
  type MediaHealthAssessment
} from '../../src/main/services/organization/media-health-inspector'
import {
  getStagedFileHash,
  verifyMediaEquality,
  classifyDuplicateScope
} from '../../src/main/services/organization/duplicate-detector'
import {
  resolveLessonIdentities
} from '../../src/main/services/organization/identity-resolver'
import type { Lesson } from '../../src/types'

describe('Phase 2: Duplicate & Identity Resolution Engine', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `orbia-dup-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
    fs.mkdirSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  describe('Media Health Inspector', () => {
    it('ranks healthy playable file above broken high-res copy (Health > Quality invariant)', async () => {
      const healthy720p: MediaHealthAssessment = {
        filePath: '/course/720p.mp4',
        exists: true,
        sizeBytes: 50 * 1024 * 1024,
        isPlayable: true,
        duration: 600,
        isCorrupted: false,
        qualityScore: 112050
      }

      const broken1080p: MediaHealthAssessment = {
        filePath: '/course/1080p_corrupted.mp4',
        exists: true,
        sizeBytes: 150 * 1024 * 1024,
        isPlayable: false,
        duration: 0,
        isCorrupted: true,
        qualityScore: 3150
      }

      const winner = pickCanonicalMediaCopy(healthy720p, broken1080p)
      expect(winner.filePath).toBe('/course/720p.mp4')
    })
  })

  describe('Staged Duplicate Detector', () => {
    it('detects identical content with different filenames via staged hash', async () => {
      const fileA = path.join(tempDir, '01 - Intro.mp4')
      const fileB = path.join(tempDir, 'Copy of Intro.mp4')
      const content = Buffer.from('identical video stream test data byte sequence')
      fs.writeFileSync(fileA, content)
      fs.writeFileSync(fileB, content)

      const hashA = await getStagedFileHash(fileA)
      const hashB = await getStagedFileHash(fileB)
      expect(hashA).toBeTruthy()
      expect(hashA).toBe(hashB)

      const match = await verifyMediaEquality(
        { filePath: fileA, fileName: '01 - Intro.mp4', sizeBytes: content.length },
        { filePath: fileB, fileName: 'Copy of Intro.mp4', sizeBytes: content.length }
      )
      expect(match.isDuplicate).toBe(true)
      expect(match.confidence).toBe('CONFIRMED_HASH')
    })

    it('rejects files with different sizes immediately without full hash calculation', async () => {
      const match = await verifyMediaEquality(
        { filePath: '/a.mp4', fileName: 'a.mp4', sizeBytes: 1000 },
        { filePath: '/b.mp4', fileName: 'b.mp4', sizeBytes: 2000 }
      )
      expect(match.isDuplicate).toBe(false)
    })

    it('classifies duplicate scopes correctly (same module, cross module, cross course, backup)', () => {
      const source = { filePath: '/course/mod1/01.mp4', fileName: '01.mp4', sizeBytes: 100, courseId: 'c1', moduleId: 'm1' }
      const sameMod = { filePath: '/course/mod1/01_copy.mp4', fileName: '01_copy.mp4', sizeBytes: 100, courseId: 'c1', moduleId: 'm1' }
      const diffMod = { filePath: '/course/mod2/01.mp4', fileName: '01.mp4', sizeBytes: 100, courseId: 'c1', moduleId: 'm2' }
      const diffCourse = { filePath: '/course2/mod1/01.mp4', fileName: '01.mp4', sizeBytes: 100, courseId: 'c2', moduleId: 'm3' }
      const backup = { filePath: '/course/Backup/01.mp4', fileName: '01.mp4', sizeBytes: 100, courseId: 'c1', moduleId: 'm1' }

      expect(classifyDuplicateScope(source, sameMod, '/course')).toBe('SAME_MODULE')
      expect(classifyDuplicateScope(source, diffMod, '/course')).toBe('CROSS_MODULE')
      expect(classifyDuplicateScope(source, diffCourse, '/course')).toBe('CROSS_COURSE')
      expect(classifyDuplicateScope(source, backup, '/course')).toBe('BACKUP_FOLDER')
    })
  })

  describe('Lesson Identity Resolver (Rename & Move Recovery)', () => {
    it('relinquishes missing state and relinks renamed file preserving lesson identity', async () => {
      const oldPath = path.join(tempDir, '01_old_name.mp4')
      const newPath = path.join(tempDir, '01 - Clean Title.mp4')
      const content = Buffer.from('video payload 12345678')
      // Only new file exists on disk
      fs.writeFileSync(newPath, content)

      const existingLesson: Lesson = {
        id: 'lesson-uuid-1',
        courseId: 'course-1',
        moduleId: 'mod-1',
        title: 'Old Title',
        orderIndex: 1,
        filePath: oldPath,
        fileName: '01_old_name.mp4',
        fileExtension: 'mp4',
        mediaType: 'video',
        duration: 120,
        fileSize: content.length,
        availability: 'local',
        createdAt: 1000
      }

      const scanned = [
        {
          filePath: newPath,
          fileName: '01 - Clean Title.mp4',
          sizeBytes: content.length,
          duration: 120,
          moduleId: 'mod-1'
        }
      ]

      const resolved = await resolveLessonIdentities(scanned, [existingLesson], 'course-1')
      expect(resolved).toHaveLength(1)
      expect(resolved[0].type).toBe('RENAMED_IN_PLACE')
      expect(resolved[0].lessonId).toBe('lesson-uuid-1')
      expect(resolved[0].newFilePath).toBe(newPath)
      expect(resolved[0].newFileName).toBe('01 - Clean Title.mp4')
    })

    it('relinks file moved to another module inside the same course', async () => {
      const oldPath = path.join(tempDir, 'mod1', '01.mp4')
      const newPath = path.join(tempDir, 'mod2', '01.mp4')
      fs.mkdirSync(path.join(tempDir, 'mod2'), { recursive: true })
      const content = Buffer.from('video payload moved')
      fs.writeFileSync(newPath, content)

      const existingLesson: Lesson = {
        id: 'lesson-uuid-2',
        courseId: 'course-1',
        moduleId: 'mod-1',
        title: 'Lesson 1',
        orderIndex: 1,
        filePath: oldPath,
        fileName: '01.mp4',
        fileExtension: 'mp4',
        mediaType: 'video',
        duration: 60,
        fileSize: content.length,
        availability: 'local',
        createdAt: 1000
      }

      const scanned = [
        {
          filePath: newPath,
          fileName: '01.mp4',
          sizeBytes: content.length,
          duration: 60,
          moduleId: 'mod-2'
        }
      ]

      const resolved = await resolveLessonIdentities(scanned, [existingLesson], 'course-1')
      expect(resolved).toHaveLength(1)
      expect(resolved[0].type).toBe('MOVED_IN_COURSE')
      expect(resolved[0].lessonId).toBe('lesson-uuid-2')
      expect(resolved[0].newModuleId).toBe('mod-2')
    })

    it('treats file moved to another course as a new lesson (strict course boundary)', async () => {
      const oldPath = path.join(tempDir, 'courseA', '01.mp4')
      const newPath = path.join(tempDir, 'courseB', '01.mp4')
      fs.mkdirSync(path.join(tempDir, 'courseB'), { recursive: true })
      const content = Buffer.from('video payload across courses')
      fs.writeFileSync(newPath, content)

      const existingLesson: Lesson = {
        id: 'lesson-uuid-3',
        courseId: 'course-A',
        moduleId: 'mod-A',
        title: 'Lesson 1',
        orderIndex: 1,
        filePath: oldPath,
        fileName: '01.mp4',
        fileExtension: 'mp4',
        mediaType: 'video',
        duration: 60,
        fileSize: content.length,
        availability: 'local',
        createdAt: 1000
      }

      const scanned = [
        {
          filePath: newPath,
          fileName: '01.mp4',
          sizeBytes: content.length,
          duration: 60,
          moduleId: 'mod-B'
        }
      ]

      const resolved = await resolveLessonIdentities(scanned, [existingLesson], 'course-B')
      // Since existing lesson belongs to course-A, it cannot transfer identity into course-B
      const movedAcross = resolved.find((r) => r.type === 'MOVED_ACROSS_COURSES')
      expect(movedAcross).toBeDefined()
      expect(movedAcross?.lessonId).toBeUndefined() // no metadata transfer!
    })
  })
})
