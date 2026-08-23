import { describe, it, expect } from 'vitest'
import {
  extractExplicitNumber,
  resolveGenericTitle,
  resolveSequenceOrdering
} from '../../src/main/services/organization/title-sequence-resolver'
import {
  classifyFolderName,
  isInsideBackupFolder,
  isAuxiliarySectionFolder
} from '../../src/main/services/organization/auxiliary-classifier'
import {
  extractPartInfo,
  groupMultipartLessons
} from '../../src/main/services/organization/multipart-detector'
import {
  detectCourseRoots
} from '../../src/main/services/organization/course-root-detector'
import type { ScannedDirectory } from '../../src/main/services/scanner.service'

describe('Phase 1: Pure Organization Algorithms', () => {
  describe('Title & Sequence Resolver', () => {
    it('extracts explicit numbers and decimals correctly', () => {
      expect(extractExplicitNumber('Aula 01 - Intro')).toBe(1)
      expect(extractExplicitNumber('02.5 - Bonus Lecture')).toBe(2.5)
      expect(extractExplicitNumber('Lesson 10 - Functions')).toBe(10)
      expect(extractExplicitNumber('Módulo 03')).toBe(3)
      expect(extractExplicitNumber('No Number Title')).toBeNull()
    })

    it('resolves generic titles using parent folder or fallback index', () => {
      expect(resolveGenericTitle('video.mp4', '01 - Introdução aos Protocolos')).toBe('01 - Introdução aos Protocolos')
      expect(resolveGenericTitle('aula.mp4', '02 - Como Funciona a Internet')).toBe('02 - Como Funciona a Internet')
      expect(resolveGenericTitle('video.mp4', undefined, 5)).toBe('Lesson 05')
      expect(resolveGenericTitle('01 - Custom Title.mp4', '01 - Module')).toBe('01 - Custom Title')
    })

    it('handles numeric ordering 1, 2, 10 correctly', () => {
      const items = [
        { id: '3', rawFileName: 'Aula 10.mp4', cleanTitle: '10', filePath: '/a/10.mp4', explicitNumber: 10, orderIndex: 1 },
        { id: '1', rawFileName: 'Aula 1.mp4', cleanTitle: '1', filePath: '/a/1.mp4', explicitNumber: 1, orderIndex: 2 },
        { id: '2', rawFileName: 'Aula 2.mp4', cleanTitle: '2', filePath: '/a/2.mp4', explicitNumber: 2, orderIndex: 3 }
      ]

      const result = resolveSequenceOrdering(items)
      expect(result.items.map((i) => i.id)).toEqual(['1', '2', '3'])
      expect(result.items.map((i) => i.orderIndex)).toEqual([1, 2, 3])
    })

    it('handles decimal sequences 1, 1.1, 1.2, 1.5, 2, 10', () => {
      const items = [
        { id: '6', rawFileName: '10 - Deploy.mp4', cleanTitle: '10 - Deploy', filePath: '/a/10.mp4', explicitNumber: 10, orderIndex: 1 },
        { id: '1', rawFileName: '1 - Intro.mp4', cleanTitle: '1 - Intro', filePath: '/a/1.mp4', explicitNumber: 1, orderIndex: 2 },
        { id: '4', rawFileName: '1.5 - Bonus.mp4', cleanTitle: '1.5 - Bonus', filePath: '/a/1.5.mp4', explicitNumber: 1.5, orderIndex: 3 },
        { id: '2', rawFileName: '1.1 - Setup.mp4', cleanTitle: '1.1 - Setup', filePath: '/a/1.1.mp4', explicitNumber: 1.1, orderIndex: 4 },
        { id: '5', rawFileName: '2 - Basics.mp4', cleanTitle: '2 - Basics', filePath: '/a/2.mp4', explicitNumber: 2, orderIndex: 5 },
        { id: '3', rawFileName: '1.2 - Tools.mp4', cleanTitle: '1.2 - Tools', filePath: '/a/1.2.mp4', explicitNumber: 1.2, orderIndex: 6 }
      ]

      const result = resolveSequenceOrdering(items)
      expect(result.items.map((i) => i.id)).toEqual(['1', '2', '3', '4', '5', '6'])
    })

    it('detects sequence gaps in integer numbering (e.g. 1, 2, 4, 5 -> missing 3)', () => {
      const items = [
        { id: '1', rawFileName: '01 - Intro.mp4', cleanTitle: '01 - Intro', filePath: '/a/01.mp4', explicitNumber: 1, orderIndex: 1 },
        { id: '2', rawFileName: '02 - Basics.mp4', cleanTitle: '02 - Basics', filePath: '/a/02.mp4', explicitNumber: 2, orderIndex: 2 },
        { id: '4', rawFileName: '04 - Advanced.mp4', cleanTitle: '04 - Advanced', filePath: '/a/04.mp4', explicitNumber: 4, orderIndex: 3 },
        { id: '5', rawFileName: '05 - Summary.mp4', cleanTitle: '05 - Summary', filePath: '/a/05.mp4', explicitNumber: 5, orderIndex: 4 }
      ]

      const result = resolveSequenceOrdering(items)
      expect(result.detectedGaps).toEqual([
        { afterIndex: 1, expectedNumber: 3 }
      ])
    })

    it('preserves manual ordering when flagged', () => {
      const items = [
        { id: '1', rawFileName: '01 - Intro.mp4', cleanTitle: '01 - Intro', filePath: '/a/01.mp4', explicitNumber: 1, orderIndex: 1, displayOrder: 2, isManual: true },
        { id: '2', rawFileName: '02 - Basics.mp4', cleanTitle: '02 - Basics', filePath: '/a/02.mp4', explicitNumber: 2, orderIndex: 2, displayOrder: 1, isManual: true }
      ]

      const result = resolveSequenceOrdering(items, { preserveManualOrder: true })
      expect(result.items[0].id).toBe('2')
      expect(result.items[1].id).toBe('1')
      expect(result.items[0].displayOrder).toBe(1)
      expect(result.items[1].displayOrder).toBe(2)
    })
  })

  describe('Auxiliary & Backup Folder Classifier', () => {
    it('classifies backup, copy, temp, old folders as backup_temp', () => {
      expect(classifyFolderName('Backup')).toBe('backup_temp')
      expect(classifyFolderName('Old')).toBe('backup_temp')
      expect(classifyFolderName('Antigo')).toBe('backup_temp')
      expect(classifyFolderName('Copy')).toBe('backup_temp')
      expect(classifyFolderName('Cópia')).toBe('backup_temp')
      expect(classifyFolderName('Temp')).toBe('backup_temp')
      expect(classifyFolderName('Duplicates')).toBe('backup_temp')
      expect(classifyFolderName('Arquivos antigos')).toBe('backup_temp')
    })

    it('classifies bonus, extras, materials as auxiliary_section', () => {
      expect(classifyFolderName('Bonus')).toBe('auxiliary_section')
      expect(classifyFolderName('Bônus')).toBe('auxiliary_section')
      expect(classifyFolderName('Extras')).toBe('auxiliary_section')
      expect(classifyFolderName('Materials')).toBe('auxiliary_section')
      expect(classifyFolderName('Materiais')).toBe('auxiliary_section')
      expect(classifyFolderName('PDFs')).toBe('auxiliary_section')
      expect(classifyFolderName('Downloads')).toBe('auxiliary_section')
      expect(classifyFolderName('Anexos')).toBe('auxiliary_section')
      expect(classifyFolderName('Recursos')).toBe('auxiliary_section')
      expect(isAuxiliarySectionFolder('Bonus')).toBe(true)
    })

    it('identifies paths inside backup folders correctly', () => {
      expect(isInsideBackupFolder('/course/Backup/01.mp4', '/course')).toBe(true)
      expect(isInsideBackupFolder('/course/Module 1/Old/01.mp4', '/course')).toBe(true)
      expect(isInsideBackupFolder('/course/Module 1/01.mp4', '/course')).toBe(false)
    })
  })

  describe('Multipart Lesson Detector', () => {
    it('extracts part suffix information accurately', () => {
      expect(extractPartInfo('05 - Arrays - Parte 1.mp4')).toEqual({
        baseStem: '05 - Arrays',
        partNumber: 1,
        partLabel: 'Parte 1'
      })
      expect(extractPartInfo('Aula 01 - Part 2.mp4')).toEqual({
        baseStem: 'Aula 01',
        partNumber: 2,
        partLabel: 'Part 2'
      })
      expect(extractPartInfo('03. Introduction (Part 3).mkv')).toEqual({
        baseStem: '03. Introduction',
        partNumber: 3,
        partLabel: 'Part 3'
      })
      expect(extractPartInfo('Single Lesson Without Parts.mp4')).toBeNull()
    })

    it('groups multipart lessons with composite duration and parts', () => {
      const items = [
        { id: '1', fileName: '05 - Arrays - Parte 1.mp4', filePath: '/a/05-1.mp4', fileExtension: 'mp4', duration: 100, fileSize: 1000 },
        { id: '2', fileName: '05 - Arrays - Parte 2.mp4', filePath: '/a/05-2.mp4', fileExtension: 'mp4', duration: 120, fileSize: 1200 },
        { id: '3', fileName: '05 - Arrays - Parte 3.mp4', filePath: '/a/05-3.mp4', fileExtension: 'mp4', duration: 80, fileSize: 800 },
        { id: '4', fileName: '06 - Objects.mp4', filePath: '/a/06.mp4', fileExtension: 'mp4', duration: 200, fileSize: 2000 }
      ]

      const grouped = groupMultipartLessons(items)
      expect(grouped).toHaveLength(2)

      const multipart = grouped.find((g) => g.isMultipart)
      expect(multipart).toBeDefined()
      expect(multipart?.compositeTitle).toBe('05 - Arrays')
      expect(multipart?.totalDuration).toBe(300)
      expect(multipart?.totalFileSize).toBe(3000)
      expect(multipart?.parts).toHaveLength(3)
      expect(multipart?.parts.map((p) => p.partNumber)).toEqual([1, 2, 3])

      const single = grouped.find((g) => !g.isMultipart)
      expect(single).toBeDefined()
      expect(single?.compositeTitle).toBe('06 - Objects')
      expect(single?.totalDuration).toBe(200)
    })
  })

  describe('Course Root Detector', () => {
    it('detects a single course with direct modules', () => {
      const mockSingle: ScannedDirectory = {
        name: 'Python Course',
        fullPath: '/courses/python',
        files: [],
        subDirectories: [
          {
            name: '01 - Intro',
            fullPath: '/courses/python/01 - Intro',
            files: [{ name: '01.mp4', fullPath: '/courses/python/01 - Intro/01.mp4', extension: '.mp4', sizeBytes: 1000, isDirectory: false }],
            subDirectories: []
          },
          {
            name: '02 - Basics',
            fullPath: '/courses/python/02 - Basics',
            files: [{ name: '02.mp4', fullPath: '/courses/python/02 - Basics/02.mp4', extension: '.mp4', sizeBytes: 1000, isDirectory: false }],
            subDirectories: []
          }
        ]
      }

      const result = detectCourseRoots(mockSingle)
      expect(result.type).toBe('single_course')
    })

    it('detects multi-course container when child directories contain their own modules', () => {
      const mockContainer: ScannedDirectory = {
        name: 'All Courses',
        fullPath: '/all-courses',
        files: [],
        subDirectories: [
          {
            name: 'Python Masterclass',
            fullPath: '/all-courses/Python Masterclass',
            files: [],
            subDirectories: [
              {
                name: 'Module 1',
                fullPath: '/all-courses/Python Masterclass/Module 1',
                files: [{ name: '01.mp4', fullPath: '/all-courses/Python Masterclass/Module 1/01.mp4', extension: '.mp4', sizeBytes: 1000, isDirectory: false }],
                subDirectories: []
              }
            ]
          },
          {
            name: 'React Masterclass',
            fullPath: '/all-courses/React Masterclass',
            files: [],
            subDirectories: [
              {
                name: 'Module 1',
                fullPath: '/all-courses/React Masterclass/Module 1',
                files: [{ name: '01.mp4', fullPath: '/all-courses/React Masterclass/Module 1/01.mp4', extension: '.mp4', sizeBytes: 1000, isDirectory: false }],
                subDirectories: []
              }
            ]
          }
        ]
      }

      const result = detectCourseRoots(mockContainer)
      expect(result.type).toBe('batch_multi_course')
      if (result.type === 'batch_multi_course') {
        expect(result.courseRoots.map((r) => r.name)).toEqual(['Python Masterclass', 'React Masterclass'])
      }
    })
  })
})
