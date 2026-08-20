import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  net: { fetch: vi.fn() },
  protocol: {
    handle: vi.fn(),
    registerSchemesAsPrivileged: vi.fn()
  }
}))

import { extractAndValidateMediaPath } from '../src/main/protocol'
import { mediaUrl } from '../src/renderer/src/lib/utils'

describe('mediaUrl', () => {
  it('uses the canonical host and round-trips a Windows drive path with special characters', () => {
    const sourcePath = 'C:\\Cursos\\aula #1.mp4'
    const url = mediaUrl(sourcePath)
    const result = extractAndValidateMediaPath(url)

    expect(url).toBe('media://local-media/C%3A/Cursos/aula%20%231.mp4')
    expect(result).toMatchObject({ valid: true, statusCode: 200 })
    expect(result.filePath).toContain('C:')
    if (process.platform === 'win32') {
      expect(result.filePath).toBe(path.normalize(sourcePath))
    }
  })

  it.runIf(process.platform === 'win32')(
    'restores the drive letter from an encoded legacy media host',
    () => {
      const result = extractAndValidateMediaPath('media://C%3A/Cursos/aula%20%231.mp4')

      expect(result).toEqual({
        valid: true,
        filePath: path.normalize('C:\\Cursos\\aula #1.mp4'),
        statusCode: 200
      })
    }
  )

  it('keeps POSIX paths absolute while encoding special characters by segment', () => {
    const sourcePath = '/courses/aula #1.mp4'
    const url = mediaUrl(sourcePath)
    const result = extractAndValidateMediaPath(url)

    expect(url).toBe('media://local-media/courses/aula%20%231.mp4')
    expect(result).toMatchObject({
      valid: true,
      statusCode: 200,
      filePath: path.normalize(sourcePath)
    })
  })
})
