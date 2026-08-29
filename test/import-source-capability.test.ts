import { describe, expect, it, vi } from 'vitest'
import path from 'node:path'

vi.mock('electron', () => ({
  app: { getPath: () => '' },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: vi.fn() }
}))

import {
  CoverImageSelectionRegistry,
  ImportSourceCapabilityRegistry,
  normalizeImportSourceCapabilityToken
} from '../src/main/ipc/courses.ipc'

describe('secure import source capabilities', () => {
  it('returns a path-free capability and resolves its path exactly once', () => {
    const registry = new ImportSourceCapabilityRegistry({
      now: () => 1_000,
      createToken: () => 'source-token-1'
    })
    const source = registry.issue('C:/private/downloads/course.zip', 'zip')

    expect(source).toEqual({
      token: 'source-token-1',
      name: 'course',
      isZip: true
    })
    expect(JSON.stringify(source)).not.toContain('C:/private')
    expect(normalizeImportSourceCapabilityToken({ token: source.token })).toBe(
      source.token
    )
    expect(registry.consume(source.token, 'zip')).toBe(
      path.resolve('C:/private/downloads/course.zip')
    )
    expect(() => registry.consume(source.token, 'zip')).toThrow(
      /invalid or already used/i
    )
  })

  it('rejects raw paths, expired tokens, and a mismatched source kind', () => {
    let now = 1_000
    const registry = new ImportSourceCapabilityRegistry({
      now: () => now,
      createToken: () => 'source-token-2',
      ttlMs: 10
    })

    expect(
      normalizeImportSourceCapabilityToken({ zipPath: 'C:/private/course.zip' })
    ).toBeNull()
    expect(
      normalizeImportSourceCapabilityToken({
        token: 'source-token-2',
        folderPath: 'C:/private/course'
      })
    ).toBeNull()

    const mismatched = registry.issue('C:/private/course', 'folder')
    expect(() => registry.consume(mismatched.token, 'zip')).toThrow(
      /source kind/i
    )
    expect(() => registry.consume(mismatched.token, 'folder')).toThrow(
      /invalid or already used/i
    )

    const expired = registry.issue('C:/private/course.zip', 'zip')
    now += 11
    expect(() => registry.consume(expired.token, 'zip')).toThrow(/expired/i)
  })

  it('resolves a native cover selection only once and never accepts a raw renderer path', () => {
    const registry = new CoverImageSelectionRegistry()
    const selectedPath = registry.issue('C:/private/covers/selected.png')

    expect(registry.consume(selectedPath)).toBe(
      path.resolve('C:/private/covers/selected.png')
    )
    expect(() => registry.consume(selectedPath)).toThrow(/native .*picker/i)
    expect(() => registry.consume('C:/private/covers/unselected.png')).toThrow(
      /native .*picker/i
    )
  })

  it('expires an unused native cover selection', () => {
    let now = 0
    const registry = new CoverImageSelectionRegistry({
      now: () => now,
      ttlMs: 100
    })
    const selectedPath = registry.issue('C:/private/covers/selected.png')

    now = 100

    expect(() => registry.consume(selectedPath)).toThrow(/expired/i)
  })
})
