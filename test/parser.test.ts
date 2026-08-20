import { describe, it, expect } from 'vitest'
import { parserService } from '../src/main/services/parser.service'
import type { ScannedDirectory } from '../src/main/services/scanner.service'

describe('Parser Service', () => {
  it('reports duplicate candidates without removing or renumbering lessons', async () => {
    const mockTree: ScannedDirectory = {
      name: 'Dup Course',
      fullPath: '/courses/dup-course',
      files: [],
      subDirectories: [
        {
          name: '01 - Modulo A',
          fullPath: '/courses/dup-course/01 - Modulo A',
          files: [
            {
              name: '01 - Introducao.mp4',
              fullPath: '/courses/dup-course/01 - Modulo A/01 - Introducao.mp4',
              extension: '.mp4',
              sizeBytes: 1000,
              isDirectory: false
            },
            {
              name: '02 - Aula Real.mp4',
              fullPath: '/courses/dup-course/01 - Modulo A/02 - Aula Real.mp4',
              extension: '.mp4',
              sizeBytes: 2000,
              isDirectory: false
            }
          ],
          subDirectories: []
        },
        {
          name: '02 - Modulo B',
          fullPath: '/courses/dup-course/02 - Modulo B',
          files: [
            {
              name: '01 - Introducao.mp4',
              fullPath: '/courses/dup-course/02 - Modulo B/01 - Introducao.mp4',
              extension: '.mp4',
              sizeBytes: 1000,
              isDirectory: false
            }
          ],
          subDirectories: []
        }
      ]
    }

    const proposal = await parserService.parseCourseHierarchy(mockTree)

    expect(proposal.modules.length).toBe(2)
    expect(proposal.totalLessons).toBe(3)
    expect(proposal.modules[0].lessons.map((l) => l.title)).toEqual(['01 - Introducao', '02 - Aula Real'])
    expect(proposal.modules[1].lessons.map((l) => l.title)).toEqual(['01 - Introducao'])
    expect(proposal.modules[0].lessons.map((l) => l.orderIndex)).toEqual([1, 2])
    expect(proposal.modules[1].lessons.map((l) => l.orderIndex)).toEqual([1])
    expect(proposal.duplicates).toHaveLength(1)
    expect(proposal.duplicates![0]).toMatchObject({
      fileName: '01 - Introducao.mp4',
      fileSize: 1000,
      count: 2
    })
    expect(proposal.duplicates![0].paths).toHaveLength(2)
  })

  it('keeps only playable media as lessons and preserves every other scanned file as a resource', async () => {
    const mockTree: ScannedDirectory = {
      name: 'Keep Everything',
      fullPath: '/courses/keep-everything',
      files: [],
      subDirectories: [
        {
          name: '01 - Modulo',
          fullPath: '/courses/keep-everything/01 - Modulo',
          files: [
            {
              name: '01 - Aula.mp4',
              fullPath: '/courses/keep-everything/01 - Modulo/01 - Aula.mp4',
              extension: '.mp4',
              sizeBytes: 1000000,
              isDirectory: false
            },
            {
              name: '01 - Aula.jpg',
              fullPath: '/courses/keep-everything/01 - Modulo/01 - Aula.jpg',
              extension: '.jpg',
              sizeBytes: 50000,
              isDirectory: false
            },
            {
              name: '01 - Aula.srt',
              fullPath: '/courses/keep-everything/01 - Modulo/01 - Aula.srt',
              extension: '.srt',
              sizeBytes: 2000,
              isDirectory: false
            },
            {
              name: '01 - Aula.vtt',
              fullPath: '/courses/keep-everything/01 - Modulo/01 - Aula.vtt',
              extension: '.vtt',
              sizeBytes: 2200,
              isDirectory: false
            },
            {
              name: '01 - Aula.ass',
              fullPath: '/courses/keep-everything/01 - Modulo/01 - Aula.ass',
              extension: '.ass',
              sizeBytes: 2400,
              isDirectory: false
            },
            {
              name: '01 - Aula.sub',
              fullPath: '/courses/keep-everything/01 - Modulo/01 - Aula.sub',
              extension: '.sub',
              sizeBytes: 2600,
              isDirectory: false
            },
            {
              name: 'apostila.pdf',
              fullPath: '/courses/keep-everything/01 - Modulo/apostila.pdf',
              extension: '.pdf',
              sizeBytes: 900000,
              isDirectory: false
            },
            {
              name: 'readme.txt',
              fullPath: '/courses/keep-everything/01 - Modulo/readme.txt',
              extension: '.txt',
              sizeBytes: 300,
              isDirectory: false
            },
            {
              name: 'links - material.url',
              fullPath: '/courses/keep-everything/01 - Modulo/links - material.url',
              extension: '.url',
              sizeBytes: 100,
              isDirectory: false
            },
            {
              name: 'diagram.png',
              fullPath: '/courses/keep-everything/01 - Modulo/diagram.png',
              extension: '.png',
              sizeBytes: 120000,
              isDirectory: false
            },
            {
              name: 'extra.zip',
              fullPath: '/courses/keep-everything/01 - Modulo/extra.zip',
              extension: '.zip',
              sizeBytes: 500000,
              isDirectory: false
            },
            {
              name: 'cover.jpg',
              fullPath: '/courses/keep-everything/01 - Modulo/cover.jpg',
              extension: '.jpg',
              sizeBytes: 150000,
              isDirectory: false
            },
            {
              name: 'notes.md',
              fullPath: '/courses/keep-everything/01 - Modulo/notes.md',
              extension: '.md',
              sizeBytes: 500,
              isDirectory: false
            },
            {
              name: 'weird.xyz',
              fullPath: '/courses/keep-everything/01 - Modulo/weird.xyz',
              extension: '.xyz',
              sizeBytes: 100,
              isDirectory: false
            },
            {
              name: '.DS_Store',
              fullPath: '/courses/keep-everything/01 - Modulo/.DS_Store',
              extension: '',
              sizeBytes: 10,
              isDirectory: false
            }
          ],
          subDirectories: []
        }
      ]
    }

    const proposal = await parserService.parseCourseHierarchy(mockTree)

    expect(proposal.modules).toHaveLength(1)
    expect(proposal.totalLessons).toBe(1)
    const [lesson] = proposal.modules[0].lessons
    expect(lesson).toMatchObject({
      originalFileName: '01 - Aula.mp4',
      mediaType: 'video',
      coverPath: '/courses/keep-everything/01 - Modulo/01 - Aula.jpg'
    })

    const lessonResources = (lesson as {
      contentResources?: Array<{ name: string; role: string; type: string; filePath: string }>
    }).contentResources
    const moduleResources = (proposal.modules[0] as {
      resources?: Array<{ name: string; role: string; type: string; filePath: string }>
    }).resources

    expect(lessonResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: '01 - Aula.jpg', role: 'resource', type: 'image' }),
        expect.objectContaining({ name: '01 - Aula.srt', role: 'subtitle', type: 'document' }),
        expect.objectContaining({ name: '01 - Aula.vtt', role: 'subtitle', type: 'document' }),
        expect.objectContaining({ name: '01 - Aula.ass', role: 'subtitle', type: 'document' }),
        expect.objectContaining({ name: '01 - Aula.sub', role: 'subtitle', type: 'document' })
      ])
    )
    expect(moduleResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'apostila.pdf', type: 'pdf' }),
        expect.objectContaining({ name: 'readme.txt', type: 'document' }),
        expect.objectContaining({ name: 'links - material.url', type: 'other' }),
        expect.objectContaining({ name: 'diagram.png', type: 'image' }),
        expect.objectContaining({ name: 'extra.zip', type: 'archive' }),
        expect.objectContaining({ name: 'cover.jpg', type: 'image' }),
        expect.objectContaining({ name: 'notes.md', type: 'document' }),
        expect.objectContaining({ name: 'weird.xyz', type: 'other' })
      ])
    )

    const preservedPaths = [...(lessonResources || []), ...(moduleResources || [])].map((resource) => resource.filePath)
    expect(preservedPaths).toHaveLength(13)
    expect(preservedPaths).not.toContain('/courses/keep-everything/01 - Modulo/.DS_Store')
  })

  it('keeps root and nested modules that contain only materials', async () => {
    const mockTree: ScannedDirectory = {
      name: 'Materials Only',
      fullPath: '/courses/materials-only',
      files: [
        {
          name: 'course-guide.pdf',
          fullPath: '/courses/materials-only/course-guide.pdf',
          extension: '.pdf',
          sizeBytes: 1000,
          isDirectory: false
        }
      ],
      subDirectories: [
        {
          name: '01 - Workbook',
          fullPath: '/courses/materials-only/01 - Workbook',
          files: [
            {
              name: 'exercise.docx',
              fullPath: '/courses/materials-only/01 - Workbook/exercise.docx',
              extension: '.docx',
              sizeBytes: 2000,
              isDirectory: false
            },
            {
              name: 'cover.jpg',
              fullPath: '/courses/materials-only/01 - Workbook/cover.jpg',
              extension: '.jpg',
              sizeBytes: 3000,
              isDirectory: false
            }
          ],
          subDirectories: []
        }
      ]
    }

    const proposal = await parserService.parseCourseHierarchy(mockTree)

    expect(proposal.modules).toHaveLength(2)
    expect(proposal.totalLessons).toBe(0)
    expect(proposal.modules[0].title).toBe('Materials Only')
    expect((proposal.modules[0] as { resources?: Array<{ name: string }> }).resources).toEqual([
      expect.objectContaining({ name: 'course-guide.pdf' })
    ])
    expect(proposal.modules[1].title).toBe('01 - Workbook')
    expect(proposal.modules[1].lessons).toEqual([])
    expect((proposal.modules[1] as { resources?: Array<{ name: string }> }).resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'exercise.docx' }),
        expect.objectContaining({ name: 'cover.jpg' })
      ])
    )
  })

  it('keeps a numeric source folder name and associates clearly named lesson materials', async () => {
    const mockTree: ScannedDirectory = {
      name: 'Curso de Instalação',
      fullPath: '/courses/curso-instalacao',
      files: [],
      subDirectories: [
        {
          name: '01',
          fullPath: '/courses/curso-instalacao/01',
          files: [
            {
              name: '01 - Instalação.mp4',
              fullPath: '/courses/curso-instalacao/01/01 - Instalação.mp4',
              extension: '.mp4',
              sizeBytes: 1000000,
              isDirectory: false
            },
            {
              name: '01 - Instalação - material.pdf',
              fullPath: '/courses/curso-instalacao/01/01 - Instalação - material.pdf',
              extension: '.pdf',
              sizeBytes: 50000,
              isDirectory: false
            }
          ],
          subDirectories: []
        }
      ]
    }

    const proposal = await parserService.parseCourseHierarchy(mockTree)
    const [module] = proposal.modules
    const [lesson] = module.lessons

    expect(module.title).toBe('01')
    expect(lesson.contentResources).toEqual([
      expect.objectContaining({
        name: '01 - Instalação - material.pdf',
        role: 'resource',
        type: 'pdf'
      })
    ])
    expect(module.resources).toEqual([])
  })

  it('associates a material kept in a nested folder with its single lesson', async () => {
    const mockTree: ScannedDirectory = {
      name: 'Curso de Prática',
      fullPath: '/courses/curso-pratica',
      files: [],
      subDirectories: [
        {
          name: 'Dia 1',
          fullPath: '/courses/curso-pratica/dia-1',
          files: [],
          subDirectories: [
            {
              name: 'Aula prática',
              fullPath: '/courses/curso-pratica/dia-1/aula-pratica',
              files: [
                {
                  name: 'video.mp4',
                  fullPath: '/courses/curso-pratica/dia-1/aula-pratica/video.mp4',
                  extension: '.mp4',
                  sizeBytes: 1000000,
                  isDirectory: false
                },
                {
                  name: 'guia.pdf',
                  fullPath: '/courses/curso-pratica/dia-1/aula-pratica/guia.pdf',
                  extension: '.pdf',
                  sizeBytes: 50000,
                  isDirectory: false
                }
              ],
              subDirectories: []
            }
          ]
        }
      ]
    }

    const proposal = await parserService.parseCourseHierarchy(mockTree)
    const [module] = proposal.modules

    expect(module.lessons[0].contentResources).toEqual([
      expect.objectContaining({ name: 'guia.pdf', role: 'resource', type: 'pdf' })
    ])
    expect(module.resources).toEqual([])
  })

  it('parses a hierarchical course directory with natural module ordering', async () => {
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

    const proposal = await parserService.parseCourseHierarchy(mockTree)

    expect(proposal.suggestedTitle).toBe('Python Masterclass')
    expect(proposal.coverPath).toBe('/courses/python-masterclass/cover.jpg')
    expect(proposal.totalLessons).toBe(5)
    expect(proposal.modules.length).toBe(3)

    // Verify natural ordering of modules (01 -> 02 -> 10)
    expect(proposal.modules[0].title).toBe('01 - Introduction')
    expect((proposal.modules[0] as { resources?: Array<{ name: string }> }).resources).toEqual([
      expect.objectContaining({ name: 'cover.jpg' })
    ])
    expect(proposal.modules[0].orderIndex).toBe(1)
    expect(proposal.modules[0].lessons[0].title).toBe('01 - Welcome')
    expect(proposal.modules[0].lessons[1].title).toBe('02 - Setup')

    expect(proposal.modules[1].title).toBe('02 - Control Flow')
    expect(proposal.modules[1].orderIndex).toBe(2)

    expect(proposal.modules[2].title).toBe('10 - Advanced Decorators')
    expect(proposal.modules[2].orderIndex).toBe(3)
  })

  it('parses a flat directory structure (single module course)', async () => {
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

    const proposal = await parserService.parseCourseHierarchy(mockFlatTree)

    expect(proposal.suggestedTitle).toBe('Docker Crash Course')
    expect(proposal.modules.length).toBe(1)
    expect(proposal.totalLessons).toBe(3)

    // Lessons sorted naturally
    const lessons = proposal.modules[0].lessons
    expect(lessons[0].title).toBe('01 - Intro')
    expect(lessons[0].orderIndex).toBe(1)
    expect(lessons[1].title).toBe('02 - Containers')
    expect(lessons[1].orderIndex).toBe(2)
    expect(lessons[2].title).toBe('10 - Compose')
    expect(lessons[2].orderIndex).toBe(3)
  })

  it('reports fingerprint duplicates without removing the differently named lesson', async () => {
    const mockTree: ScannedDirectory = {
      name: 'Fingerprint Course',
      fullPath: '/courses/fp-course',
      files: [],
      subDirectories: [
        {
          name: '01 - Modulo A',
          fullPath: '/courses/fp-course/01 - Modulo A',
          files: [
            {
              name: 'intro.mp4',
              fullPath: '/courses/fp-course/01 - Modulo A/intro.mp4',
              extension: '.mp4',
              sizeBytes: 500,
              isDirectory: false,
              fingerprint: 'abc123'
            },
            {
              name: '02 - Conteudo Diferente.mp4',
              fullPath: '/courses/fp-course/01 - Modulo A/02 - Conteudo Diferente.mp4',
              extension: '.mp4',
              sizeBytes: 400,
              isDirectory: false,
              fingerprint: 'def456'
            }
          ],
          subDirectories: []
        },
        {
          name: '02 - Modulo B',
          fullPath: '/courses/fp-course/02 - Modulo B',
          files: [
            {
              name: 'copy-renamed.mp4',
              fullPath: '/courses/fp-course/02 - Modulo B/copy-renamed.mp4',
              extension: '.mp4',
              sizeBytes: 500,
              isDirectory: false,
              fingerprint: 'abc123' // same content, different name -> duplicate
            }
          ],
          subDirectories: []
        }
      ]
    }

    const proposal = await parserService.parseCourseHierarchy(mockTree)

    expect(proposal.totalLessons).toBe(3)
    expect(proposal.modules).toHaveLength(2)
    expect(proposal.modules[1].lessons).toEqual([
      expect.objectContaining({ title: 'copy-renamed', orderIndex: 1 })
    ])
    expect(proposal.duplicates).toHaveLength(1)
    expect(proposal.duplicates![0].fileName).toBe('copy-renamed.mp4')
  })
})
