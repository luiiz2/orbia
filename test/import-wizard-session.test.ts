import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '' },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: vi.fn() }
}))

import { normalizeCommitImportSessionPayload } from '../src/main/ipc/courses.ipc'
import {
  buildImportTitleEdits,
  buildSourcePreparationRequest
} from '../src/renderer/src/components/import/ImportWizard'
import type { ImportSessionPreview } from '../src/types'

describe('ImportWizard secure session payload', () => {
  it('prepares sources with an opaque token only', () => {
    const request = buildSourcePreparationRequest({
      token: 'source-token-1',
      name: 'Curso privado',
      isZip: true
    })

    expect(request).toEqual({ token: 'source-token-1' })
    expect(JSON.stringify(request)).not.toContain('private')
  })

  it('sends only title edits keyed by canonical preview IDs', () => {
    const preview = {
      suggestedTitle: 'Curso Renomeado',
      rootPath: 'C:/private/source',
      totalLessons: 1,
      totalFilesScanned: 1,
      modules: [
        {
          id: 'module-1',
          title: 'Dia Renomeado',
          folderPath: 'C:/private/source/Dia 1',
          orderIndex: 1,
          lessons: [
            {
              id: 'lesson-1',
              title: 'Aula Renomeada',
              originalFileName: '01-aula.mp4',
              filePath: 'C:/private/source/Dia 1/01-aula.mp4',
              fileExtension: 'mp4',
              mediaType: 'video',
              fileSize: 10,
              orderIndex: 1
            }
          ]
        }
      ],
      duplicates: [
        {
          fileName: '01-aula.mp4',
          fileSize: 10,
          count: 2,
          paths: ['C:/private/source/Dia 1/01-aula.mp4']
        }
      ]
    } as unknown as ImportSessionPreview

    const titleEdits = buildImportTitleEdits(preview)

    expect(titleEdits).toEqual({
      courseTitle: 'Curso Renomeado',
      modules: [{ id: 'module-1', title: 'Dia Renomeado' }],
      lessons: [{ id: 'lesson-1', title: 'Aula Renomeada' }]
    })
    expect(JSON.stringify(titleEdits)).not.toContain('C:/private')
  })

  it('drops raw proposals and paths from the IPC commit payload', () => {
    const commit = normalizeCommitImportSessionPayload({
      sessionId: ' session-1 ',
      isExternal: false,
      proposal: { rootPath: 'C:/private/source', coverPath: 'C:/private/cover.png' },
      titleEdits: {
        courseTitle: 'Curso Renomeado',
        modules: [
          {
            id: 'module-1',
            title: 'Dia Renomeado',
            folderPath: 'C:/private/source/Dia 1'
          }
        ],
        lessons: [
          {
            id: 'lesson-1',
            title: 'Aula Renomeada',
            filePath: 'C:/private/source/Dia 1/01-aula.mp4'
          }
        ]
      }
    })

    expect(commit).toEqual({
      sessionId: 'session-1',
      isExternal: false,
      titleEdits: {
        courseTitle: 'Curso Renomeado',
        modules: [{ id: 'module-1', title: 'Dia Renomeado' }],
        lessons: [{ id: 'lesson-1', title: 'Aula Renomeada' }]
      }
    })
    expect(JSON.stringify(commit)).not.toContain('C:/private')
  })
})
