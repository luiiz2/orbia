import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const state = vi.hoisted(() => ({
  handler: undefined as
    | undefined
    | ((request: { url: string; headers: Headers }) => Promise<Response>),
  fetch: vi.fn()
}))

vi.mock('electron', () => ({
  protocol: {
    registerSchemesAsPrivileged: vi.fn(),
    handle: vi.fn(
      (
        _scheme: string,
        handler: (request: {
          url: string
          headers: Headers
        }) => Promise<Response>
      ) => {
        state.handler = handler
      }
    )
  },
  net: {
    fetch: state.fetch
  }
}))

vi.mock('../src/main/services/logger.service', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

import {
  createMainMediaPathAuthorizer,
  setupMediaProtocol,
  type MediaPathAuthorizer
} from '../src/main/protocol'

function toMediaUrl(filePath: string): string {
  const encodedPath = filePath
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `media:///${encodedPath.replace(/^\/+/, '')}`
}

describe('media:// path authorization', () => {
  let tempRoot: string

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-media-protocol-'))
    state.handler = undefined
    state.fetch.mockReset()
  })

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  it('allows only exact registered paths plus app-owned cover artifacts', async () => {
    const vaultPath = path.join(tempRoot, 'vault')
    const temporaryCoversPath = path.join(tempRoot, 'temporary-covers')
    const localVaultLesson = path.join(
      vaultPath,
      'Courses',
      'curso',
      'aula.mp4'
    )
    const localRefLesson = path.join(tempRoot, 'external-course', 'audio.mp3')
    const courseCover = path.join(tempRoot, 'external-cover.png')
    const lessonCover = path.join(tempRoot, 'lesson-cover.jpg')
    const resource = path.join(tempRoot, 'external-course', 'guide.pdf')
    const temporaryCover = path.join(temporaryCoversPath, 'cover_1234abcd.svg')
    const persistedCover = path.join(
      vaultPath,
      '.orbia',
      'covers',
      'course-1-cover.jpg'
    )
    const arbitraryPdf = path.join(tempRoot, 'private.pdf')
    const arbitraryVideo = path.join(
      vaultPath,
      'Courses',
      'curso',
      'unregistered.mp4'
    )

    const authorizer = createMainMediaPathAuthorizer(
      {
        getRegisteredMediaPaths: () => [
          localVaultLesson,
          localRefLesson,
          courseCover,
          lessonCover,
          resource
        ],
        getCurrentVaultPath: () => vaultPath
      },
      { temporaryCoversPath }
    )

    expect(await authorizer.isPathAuthorized(localVaultLesson)).toBe(true)
    expect(await authorizer.isPathAuthorized(localRefLesson)).toBe(true)
    expect(await authorizer.isPathAuthorized(courseCover)).toBe(true)
    expect(await authorizer.isPathAuthorized(lessonCover)).toBe(true)
    expect(await authorizer.isPathAuthorized(resource)).toBe(true)
    expect(await authorizer.isPathAuthorized(temporaryCover)).toBe(true)
    expect(await authorizer.isPathAuthorized(persistedCover)).toBe(true)
    expect(await authorizer.isPathAuthorized(arbitraryPdf)).toBe(false)
    expect(await authorizer.isPathAuthorized(arbitraryVideo)).toBe(false)
  })

  it('rejects a syntactically valid but unregistered file before streaming it', async () => {
    const arbitraryPdf = path.join(tempRoot, 'private.pdf')
    fs.writeFileSync(arbitraryPdf, 'private')
    const authorizer: MediaPathAuthorizer = {
      isPathAuthorized: vi.fn().mockResolvedValue(false)
    }

    setupMediaProtocol({ authorizer })

    const response = await state.handler!({
      url: toMediaUrl(arbitraryPdf),
      headers: new Headers()
    })

    expect(response.status).toBe(403)
    expect(await response.text()).toContain('not registered')
    expect(authorizer.isPathAuthorized).toHaveBeenCalledWith(
      path.normalize(arbitraryPdf)
    )
    expect(state.fetch).not.toHaveBeenCalled()
  })

  it('streams an authorized registered lesson with HTTP 206 Partial Content on Range header', async () => {
    const lessonPath = path.join(tempRoot, 'lesson.mp4')
    fs.writeFileSync(lessonPath, 'video content sample')
    const authorizer: MediaPathAuthorizer = {
      isPathAuthorized: vi.fn().mockResolvedValue(true)
    }

    setupMediaProtocol({ authorizer })

    const response = await state.handler!({
      url: toMediaUrl(lessonPath),
      headers: new Headers({ range: 'bytes=0-4' })
    })

    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe('bytes 0-4/20')
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(response.headers.get('Content-Length')).toBe('5')
    const text = await response.text()
    expect(text).toBe('video')
  })
})
