import { describe, expect, it, vi } from 'vitest'
import { validateMediaFiles } from '../src/main/services/media-validation.service'

describe('media validation', () => {
  it('reports each video or audio file that FFmpeg cannot decode', async () => {
    const result = await validateMediaFiles(
      ['C:/course/corrupt-video.mp4', 'C:/course/corrupt-audio.mp3'],
      {
        decodeFile: async (filePath) => {
          throw new Error(`cannot decode ${filePath}`)
        }
      }
    )

    expect(result.valid).toBe(false)
    expect(result.failedFiles).toEqual([
      'C:/course/corrupt-video.mp4',
      'C:/course/corrupt-audio.mp3'
    ])
    expect(result.warnings).toHaveLength(2)
  })

  it('does not attempt to decode documents and unknown attachments', async () => {
    const decodeFile = vi.fn<(_: string) => Promise<void>>()
    const result = await validateMediaFiles(
      [
        'C:/course/apostila.pdf',
        'C:/course/planilha.xlsx',
        'C:/course/code.ts'
      ],
      { decodeFile }
    )

    expect(result).toEqual({ valid: true, failedFiles: [], warnings: [] })
    expect(decodeFile).not.toHaveBeenCalled()
  })
})
