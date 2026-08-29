import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { DatabaseService } from '../src/main/services/database.service'
import { convertSrtToVtt } from '../src/main/utils/subtitle-utils'
import type { Course, Module, Lesson } from '../src/types'

describe('Notes, Favorites and Subtitle Utilities', () => {
  let tempVaultDir: string
  let dbService: DatabaseService

  const setupTestCourse = (courseId: string, isFavorite = false): void => {
    const now = Date.now()
    const course: Course = {
      id: courseId,
      title: 'Advanced React & Architecture',
      slug: 'advanced-react-architecture',
      sourceType: 'local-vault',
      rootPath: path.join(tempVaultDir, 'Courses', 'react'),
      totalDuration: 7200,
      moduleCount: 1,
      lessonCount: 2,
      isFavorite,
      createdAt: now,
      updatedAt: now
    }

    const modules: (Module & { lessons: Lesson[] })[] = [
      {
        id: `mod-${courseId}-1`,
        courseId,
        title: '01 - Hooks & State',
        orderIndex: 1,
        duration: 3600,
        lessonCount: 2,
        createdAt: now,
        lessons: [
          {
            id: `les-${courseId}-1`,
            moduleId: `mod-${courseId}-1`,
            courseId,
            title: 'UseEffect Deep Dive',
            orderIndex: 1,
            filePath: '/courses/react/01.mp4',
            fileName: '01.mp4',
            fileExtension: 'mp4',
            mediaType: 'video',
            duration: 1800,
            fileSize: 50000000,
            availability: 'local',
            createdAt: now
          },
          {
            id: `les-${courseId}-2`,
            moduleId: `mod-${courseId}-1`,
            courseId,
            title: 'Custom Hooks Architecture',
            orderIndex: 2,
            filePath: '/courses/react/02.mp4',
            fileName: '02.mp4',
            fileExtension: 'mp4',
            mediaType: 'video',
            duration: 1800,
            fileSize: 60000000,
            availability: 'local',
            createdAt: now
          }
        ]
      }
    ]

    dbService.saveCourseWithHierarchy(course, modules)
  }

  beforeEach(() => {
    tempVaultDir = path.join(
      os.tmpdir(),
      `orbia-notes-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    )
    fs.mkdirSync(tempVaultDir, { recursive: true })
    dbService = new DatabaseService()
    dbService.connect(tempVaultDir)
  })

  afterEach(() => {
    dbService.close()
    try {
      fs.rmSync(tempVaultDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  describe('Lesson Notes CRUD Operations', () => {
    it('creates, retrieves, updates and deletes lesson notes', () => {
      const courseId = 'course-notes-1'
      setupTestCourse(courseId)
      const lessonId = `les-${courseId}-1`

      // 1. Initially empty
      expect(dbService.getLessonNotes(lessonId)).toEqual([])
      expect(dbService.getCourseNotes(courseId)).toEqual([])

      // 2. Add notes
      const note1 = dbService.addLessonNote({
        lessonId,
        courseId,
        timestampSeconds: 120.5,
        content:
          'Remember to clean up event listeners inside useEffect return callback.'
      })

      expect(note1.id).toBeDefined()
      expect(note1.lessonId).toBe(lessonId)
      expect(note1.courseId).toBe(courseId)
      expect(note1.timestampSeconds).toBe(120.5)
      expect(note1.content).toBe(
        'Remember to clean up event listeners inside useEffect return callback.'
      )
      expect(note1.createdAt).toBeGreaterThan(0)
      expect(note1.updatedAt).toBeGreaterThan(0)

      const note2 = dbService.addLessonNote({
        lessonId,
        courseId,
        timestampSeconds: 45.0,
        content: 'Dependency array rules: include all referenced variables.'
      })

      // Add a note to second lesson
      const lesson2Id = `les-${courseId}-2`
      const note3 = dbService.addLessonNote({
        lessonId: lesson2Id,
        courseId,
        timestampSeconds: 300,
        content: 'Extract stateful logic into custom hook.'
      })

      // 3. Retrieve lesson notes (ordered by timestamp_seconds ASC)
      const lesson1Notes = dbService.getLessonNotes(lessonId)
      expect(lesson1Notes.length).toBe(2)
      expect(lesson1Notes[0].id).toBe(note2.id) // 45s comes first
      expect(lesson1Notes[0].timestampSeconds).toBe(45.0)
      expect(lesson1Notes[1].id).toBe(note1.id) // 120.5s comes second
      expect(lesson1Notes[1].timestampSeconds).toBe(120.5)

      // 4. Retrieve course notes (all notes for course)
      const allCourseNotes = dbService.getCourseNotes(courseId)
      expect(allCourseNotes.length).toBe(3)
      expect(allCourseNotes.map((n) => n.id)).toContain(note1.id)
      expect(allCourseNotes.map((n) => n.id)).toContain(note2.id)
      expect(allCourseNotes.map((n) => n.id)).toContain(note3.id)

      // 5. Update a note
      const originalUpdatedAt = note1.updatedAt
      // Small sleep to ensure timestamp differs
      const updatedContent =
        'Updated: Never call setState synchronously without check.'
      dbService.updateLessonNote(note1.id, updatedContent)

      const updatedNotes = dbService.getLessonNotes(lessonId)
      const updatedNote1 = updatedNotes.find((n) => n.id === note1.id)
      expect(updatedNote1).toBeDefined()
      expect(updatedNote1!.content).toBe(updatedContent)
      expect(updatedNote1!.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt)

      // 6. Delete a note
      dbService.deleteLessonNote(note2.id)
      const remainingNotes = dbService.getLessonNotes(lessonId)
      expect(remainingNotes.length).toBe(1)
      expect(remainingNotes[0].id).toBe(note1.id)

      // 7. Cascading delete when course is deleted
      dbService.deleteCourse(courseId)
      expect(dbService.getLessonNotes(lessonId)).toEqual([])
      expect(dbService.getCourseNotes(courseId)).toEqual([])
    })
  })

  describe('Course Favorite Toggle', () => {
    it('toggles favorite status and reflects across course queries', () => {
      const courseId = 'course-fav-1'
      setupTestCourse(courseId, false)

      // 1. Initial state is false
      let courseDetails = dbService.getCourseById(courseId)
      expect(courseDetails).not.toBeNull()
      expect(courseDetails!.course.isFavorite).toBe(false)

      let courses = dbService.getAllCourses()
      expect(courses[0].isFavorite).toBe(false)

      // 2. Toggle to favorite
      const toggleResult1 = dbService.toggleCourseFavorite(courseId)
      expect(toggleResult1).toBe(true)

      courseDetails = dbService.getCourseById(courseId)
      expect(courseDetails!.course.isFavorite).toBe(true)

      courses = dbService.getAllCourses()
      expect(courses[0].isFavorite).toBe(true)

      // 3. Toggle back to not favorite
      const toggleResult2 = dbService.toggleCourseFavorite(courseId)
      expect(toggleResult2).toBe(false)

      courseDetails = dbService.getCourseById(courseId)
      expect(courseDetails!.course.isFavorite).toBe(false)

      courses = dbService.getAllCourses()
      expect(courses[0].isFavorite).toBe(false)
    })

    it('throws error when toggling favorite on non-existent course', () => {
      expect(() =>
        dbService.toggleCourseFavorite('non-existent-course-id')
      ).toThrow('Course with id "non-existent-course-id" not found.')
    })
  })

  describe('Subtitle SRT to VTT Conversion Utility', () => {
    it('converts standard SRT format to valid WebVTT', () => {
      const srtInput = `1
00:01:20,000 --> 00:01:23,500
Bem-vindos ao curso de Orbia.

2
00:01:24,123 --> 00:01:27,890
Hoje vamos aprender a organizar sua biblioteca.`

      const vttOutput = convertSrtToVtt(srtInput)

      expect(vttOutput.startsWith('WEBVTT\n\n')).toBe(true)
      expect(vttOutput).toContain('00:01:20.000 --> 00:01:23.500')
      expect(vttOutput).toContain('00:01:24.123 --> 00:01:27.890')
      expect(vttOutput).toContain('Bem-vindos ao curso de Orbia.')
      expect(vttOutput).toContain(
        'Hoje vamos aprender a organizar sua biblioteca.'
      )
    })

    it('handles empty and whitespace-only subtitles gracefully', () => {
      expect(convertSrtToVtt('')).toBe('WEBVTT\n\n')
      expect(convertSrtToVtt('   \n\n  ')).toBe('WEBVTT\n\n')
    })

    it('handles timestamps with 1 or 2 digit millisecond padding', () => {
      const srtInput = `1
00:01:05,5 --> 00:01:08,50
Test subtitle with non-padded milliseconds.`

      const vttOutput = convertSrtToVtt(srtInput)

      expect(vttOutput).toContain('00:01:05.500 --> 00:01:08.500')
      expect(vttOutput).toContain('Test subtitle with non-padded milliseconds.')
    })

    it('strips UTF-8 BOM and normalizes single digit hours', () => {
      const srtInput = `\uFEFF1\n1:02:03,456 --> 1:02:05,789\nSingle digit hour subtitle.`
      const vttOutput = convertSrtToVtt(srtInput)

      expect(vttOutput.startsWith('WEBVTT\n\n')).toBe(true)
      expect(vttOutput).not.toContain('\uFEFF')
      expect(vttOutput).toContain('01:02:03.456 --> 01:02:05.789')
      expect(vttOutput).toContain('Single digit hour subtitle.')
    })

    it('strips unsupported font tags while keeping styling text', () => {
      const srtInput = `1\n00:00:01,000 --> 00:00:03,000\n<font color="#00ff00">Green text</font>`
      const vttOutput = convertSrtToVtt(srtInput)

      expect(vttOutput).not.toContain('<font')
      expect(vttOutput).not.toContain('</font>')
      expect(vttOutput).toContain('Green text')
    })
  })
})
