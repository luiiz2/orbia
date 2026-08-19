import { describe, it, expect } from 'vitest'
import { parserService } from '../src/main/services/parser.service'
import type { ScannedDirectory } from '../src/main/services/scanner.service'

describe('Parser Service', () => {
  it('parses a hierarchical course directory with natural module ordering', () => {
    const mockTree: ScannedDirectory = {
      name: 'Python Masterclass [2024]',
      fullPath: '/courses/python-masterclass',
      files: [
        {
          name: 'cover.jpg',
          fullPath: '/courses/python-masterclass/cover.jpg',
          extension: '.jpg',
          sizeBytes: 150000,
          isDirectory: false
        }
      ],
      subDirectories: [
        {
          name: '02 - Control Flow',
          fullPath: '/courses/python-masterclass/02 - Control Flow',
          files: [
            {
              name: '01 - If Else.mp4',
              fullPath: '/courses/python-masterclass/02 - Control Flow/01 - If Else.mp4',
              extension: '.mp4',
              sizeBytes: 50000000,
              isDirectory: false
            },
            {
              name: '02 - Loops.mp4',
              fullPath: '/courses/python-masterclass/02 - Control Flow/02 - Loops.mp4',
              extension: '.mp4',
              sizeBytes: 60000000,
              isDirectory: false
            }
          ],
          subDirectories: []
        },
        {
          name: '01 - Introduction',
          fullPath: '/courses/python-masterclass/01 - Introduction',
          files: [
            {
              name: '01 - Welcome.mp4',
              fullPath: '/courses/python-masterclass/01 - Introduction/01 - Welcome.mp4',
              extension: '.mp4',
              sizeBytes: 20000000,
              isDirectory: false
            },
            {
              name: '02 - Setup.mp4',
              fullPath: '/courses/python-masterclass/01 - Introduction/02 - Setup.mp4',
              extension: '.mp4',
              sizeBytes: 30000000,
              isDirectory: false
            }
          ],
          subDirectories: []
        },
        {
          name: '10 - Advanced Decorators',
          fullPath: '/courses/python-masterclass/10 - Advanced Decorators',
          files: [
            {
              name: '01 - Decorators.mp4',
              fullPath: '/courses/python-masterclass/10 - Advanced Decorators/01 - Decorators.mp4',
              extension: '.mp4',
              sizeBytes: 40000000,
              isDirectory: false
            }
          ],
          subDirectories: []
        }
      ]
    }

    const proposal = parserService.parseCourseHierarchy(mockTree)

    expect(proposal.suggestedTitle).toBe('Python Masterclass')
    expect(proposal.coverPath).toBe('/courses/python-masterclass/cover.jpg')
    expect(proposal.totalLessons).toBe(5)
    expect(proposal.modules.length).toBe(3)

    // Verify natural ordering of modules (01 -> 02 -> 10)
    expect(proposal.modules[0].title).toBe('Introduction')
    expect(proposal.modules[0].orderIndex).toBe(1)
    expect(proposal.modules[0].lessons[0].title).toBe('Welcome')
    expect(proposal.modules[0].lessons[1].title).toBe('Setup')

    expect(proposal.modules[1].title).toBe('Control Flow')
    expect(proposal.modules[1].orderIndex).toBe(2)

    expect(proposal.modules[2].title).toBe('Advanced Decorators')
    expect(proposal.modules[2].orderIndex).toBe(3)
  })

  it('parses a flat directory structure (single module course)', () => {
    const mockFlatTree: ScannedDirectory = {
      name: 'Docker Crash Course',
      fullPath: '/courses/docker-crash-course',
      files: [
        {
          name: '02 - Containers.mp4',
          fullPath: '/courses/docker-crash-course/02 - Containers.mp4',
          extension: '.mp4',
          sizeBytes: 45000000,
          isDirectory: false
        },
        {
          name: '01 - Intro.mp4',
          fullPath: '/courses/docker-crash-course/01 - Intro.mp4',
          extension: '.mp4',
          sizeBytes: 25000000,
          isDirectory: false
        },
        {
          name: '10 - Compose.mp4',
          fullPath: '/courses/docker-crash-course/10 - Compose.mp4',
          extension: '.mp4',
          sizeBytes: 80000000,
          isDirectory: false
        }
      ],
      subDirectories: []
    }

    const proposal = parserService.parseCourseHierarchy(mockFlatTree)

    expect(proposal.suggestedTitle).toBe('Docker Crash Course')
    expect(proposal.modules.length).toBe(1)
    expect(proposal.totalLessons).toBe(3)

    // Lessons sorted naturally
    const lessons = proposal.modules[0].lessons
    expect(lessons[0].title).toBe('Intro')
    expect(lessons[0].orderIndex).toBe(1)
    expect(lessons[1].title).toBe('Containers')
    expect(lessons[1].orderIndex).toBe(2)
    expect(lessons[2].title).toBe('Compose')
    expect(lessons[2].orderIndex).toBe(3)
  })
})
