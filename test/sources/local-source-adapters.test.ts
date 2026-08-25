import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { SourceItemLocator } from '../../src/types/source'
import { LocalFolderSourceAdapter } from '../../src/main/services/sources/adapters/local-folder.adapter'
import { ManagedOfflineSourceAdapter } from '../../src/main/services/sources/adapters/managed-offline.adapter'
import { registerBuiltinSourceAdapters, SourceManagerService } from '../../src/main/services/sources/source-manager.service'
import type { SourceRepositoryService } from '../../src/main/services/sources/source-repository.service'

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = []
  for await (const value of iterable) values.push(value)
  return values
}

async function read(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

describe('local source adapters', () => {
  let tempPath: string
  let localRoot: string
  let cacheRoot: string
  let lessonPath: string

  beforeEach(() => {
    tempPath = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-source-adapter-'))
    localRoot = path.join(tempPath, 'local')
    cacheRoot = path.join(tempPath, 'cache')
    lessonPath = path.join(localRoot, 'Module', 'Lesson.mp4')
    fs.mkdirSync(path.dirname(lessonPath), { recursive: true })
    fs.mkdirSync(cacheRoot, { recursive: true })
    fs.writeFileSync(path.join(localRoot, 'Guide.pdf'), 'guide')
    fs.writeFileSync(lessonPath, 'abcdef')
    fs.writeFileSync(path.join(cacheRoot, 'asset-1.mp4'), 'cached')
    fs.mkdirSync(path.join(cacheRoot, 'folder'))
  })

  afterEach(() => {
    fs.rmSync(tempPath, { recursive: true, force: true })
  })

  it('identifies, inventories, and range-reads a local folder without writing it', async () => {
    const adapter = new LocalFolderSourceAdapter()
    const root = { provider: 'local-folder' as const, path: localRoot }

    await expect(adapter.identifyRoot(root)).resolves.toMatchObject({
      providerRootIdentity: path.resolve(localRoot),
      displayName: 'local',
      availability: 'available'
    })

    const batches = await collect(adapter.reconcile({ root }))
    expect(batches).toHaveLength(1)
    expect(batches[0].items.map((item) => item.relativePath)).toEqual(['Guide.pdf', 'Module/Lesson.mp4'])

    const handle = await adapter.open(
      { provider: 'local-folder', path: lessonPath },
      { start: 2, end: 5 }
    )
    expect(handle).toMatchObject({
      status: 206,
      totalSize: 6,
      contentRange: { start: 2, end: 5 },
      seekable: true
    })
    expect(await read(handle.stream)).toEqual(Buffer.from('cdef'))
    await expect(adapter.open({ provider: 'local-folder', path: lessonPath }, { start: 5, end: 2 }))
      .rejects.toThrow('Invalid byte range')
    await expect(adapter.open({ provider: 'local-folder', path: lessonPath }, { start: -1, end: 1 }))
      .rejects.toThrow('Invalid byte range')
    await expect(adapter.open({ provider: 'local-folder', path: lessonPath }, { start: 0, end: 6 }))
      .rejects.toThrow('Invalid byte range')
    await expect(adapter.open({ provider: 'local-folder', path: path.join(localRoot, 'Module') }))
      .rejects.toThrow('regular file')
    await expect(adapter.probe({ provider: 'local-folder', path: lessonPath })).resolves.toEqual({
      fileSize: 6,
      mimeType: 'video/mp4'
    })
  })

  it('rejects missing and file roots before scanning', async () => {
    const adapter = new LocalFolderSourceAdapter()

    await expect(adapter.identifyRoot({ provider: 'local-folder', path: lessonPath })).rejects.toThrow('directory')
    await expect(adapter.identifyRoot({ provider: 'local-folder', path: path.join(tempPath, 'missing') })).rejects.toThrow()
  })

  it('keeps managed-offline reads inside the resolved app-owned cache root', async () => {
    const adapter = new ManagedOfflineSourceAdapter({
      resolveCacheRoot: (cacheId) => cacheId === 'cache-1' ? cacheRoot : null
    })
    const root = { provider: 'managed-offline' as const, cacheId: 'cache-1' }
    const item: SourceItemLocator = {
      provider: 'managed-offline',
      cacheId: 'cache-1',
      assetId: 'asset-1',
      relativePath: 'asset-1.mp4'
    }

    await expect(adapter.identifyRoot(root)).resolves.toMatchObject({
      providerRootIdentity: 'cache-1',
      availability: 'offline'
    })
    const batches = await collect(adapter.reconcile({ root }))
    expect(batches[0].items).toEqual([
      expect.objectContaining({
        relativePath: 'asset-1.mp4',
        locator: item
      })
    ])

    const handle = await adapter.open(item)
    expect(handle.status).toBe(200)
    expect(await read(handle.stream)).toEqual(Buffer.from('cached'))
    const rangedHandle = await adapter.open(item, { start: 1, end: 3 })
    expect(rangedHandle).toMatchObject({
      status: 206,
      totalSize: 6,
      contentRange: { start: 1, end: 3 },
      seekable: true
    })
    expect(await read(rangedHandle.stream)).toEqual(Buffer.from('ach'))
    await expect(adapter.probe(item)).resolves.toEqual({ fileSize: 6, mimeType: 'video/mp4' })
    await expect(adapter.open({ ...item, relativePath: '../escape.mp4' })).rejects.toThrow('outside its cache root')
    await expect(adapter.open({ ...item, relativePath: path.resolve(cacheRoot, 'asset-1.mp4') })).rejects.toThrow('outside its cache root')
    await expect(adapter.open({ ...item, cacheId: 'unknown' })).rejects.toThrow('Unknown managed cache')
    await expect(adapter.open({ ...item, relativePath: 'folder' })).rejects.toThrow('regular file')
    await expect(adapter.open(item, { start: -1, end: 1 })).rejects.toThrow('Invalid byte range')
    await expect(adapter.open(item, { start: 5, end: 2 })).rejects.toThrow('Invalid byte range')
    await expect(adapter.open(item, { start: 0, end: 6 })).rejects.toThrow('Invalid byte range')
  })

  it('rejects a managed cache root that is missing or not a directory', async () => {
    const adapter = new ManagedOfflineSourceAdapter({
      resolveCacheRoot: (cacheId) => {
        if (cacheId === 'file-cache') return lessonPath
        if (cacheId === 'missing-cache') return path.join(tempPath, 'missing-cache')
        return null
      }
    })

    await expect(adapter.identifyRoot({ provider: 'managed-offline', cacheId: 'file-cache' }))
      .rejects.toThrow('not a directory')
    await expect(adapter.identifyRoot({ provider: 'managed-offline', cacheId: 'missing-cache' }))
      .rejects.toThrow()
  })

  it('registers the local and managed adapters through one explicit manager seam', () => {
    const manager = new SourceManagerService({} as SourceRepositoryService)

    registerBuiltinSourceAdapters(manager, {
      resolveCacheRoot: (cacheId) => cacheId === 'cache-1' ? cacheRoot : null
    })

    expect(manager.getAdapter('local-folder')).toBeInstanceOf(LocalFolderSourceAdapter)
    expect(manager.getAdapter('managed-offline')).toBeInstanceOf(ManagedOfflineSourceAdapter)
  })

  it('rejects a managed cache symlink that resolves outside the cache root', async () => {
    const outsidePath = path.join(tempPath, 'outside.mp4')
    const linkPath = path.join(cacheRoot, 'linked.mp4')
    fs.writeFileSync(outsidePath, 'outside')
    try {
      fs.symlinkSync(outsidePath, linkPath, 'file')
    } catch {
      return
    }

    const adapter = new ManagedOfflineSourceAdapter({
      resolveCacheRoot: (cacheId) => cacheId === 'cache-1' ? cacheRoot : null
    })

    await expect(adapter.open({
      provider: 'managed-offline',
      cacheId: 'cache-1',
      assetId: 'linked',
      relativePath: 'linked.mp4'
    })).rejects.toThrow('outside its cache root')
  })

  it('rejects a managed path that resolves outside the cache after its descriptor opens', async () => {
    const adapter = new ManagedOfflineSourceAdapter({
      resolveCacheRoot: (cacheId) => cacheId === 'cache-1' ? cacheRoot : null
    })
    const item: SourceItemLocator = {
      provider: 'managed-offline',
      cacheId: 'cache-1',
      assetId: 'asset-1',
      relativePath: 'asset-1.mp4'
    }
    const candidatePath = path.join(cacheRoot, 'asset-1.mp4')
    const outsidePath = path.join(tempPath, 'outside.mp4')
    const nativeRealpath = fs.promises.realpath
    let candidateResolutions = 0
    fs.writeFileSync(outsidePath, 'outside')

    const realpathSpy = vi.spyOn(fs.promises, 'realpath').mockImplementation(async (input) => {
      const resolvedInput = path.resolve(input.toString())
      if (resolvedInput === candidatePath) {
        candidateResolutions += 1
        return candidateResolutions === 1 ? candidatePath : outsidePath
      }
      return nativeRealpath(input)
    })

    try {
      await expect(adapter.open(item).then((handle) => {
        handle.stream.destroy()
        throw new Error('Managed source escape was accepted')
      })).rejects.toThrow('outside its cache root')
    } finally {
      realpathSpy.mockRestore()
    }
  })
})
