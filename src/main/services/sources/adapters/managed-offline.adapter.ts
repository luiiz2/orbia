import fs from 'node:fs'
import path from 'node:path'
import type {
  ManagedOfflineSourceItemLocator,
  ManagedOfflineSourceRootLocator,
  SourceItemLocator,
  SourceRootLocator,
  SourceTechnicalMetadata
} from '../../../../types/source'
import { ScannerService, scannerService } from '../../scanner.service'
import { naturalCompare } from '../../../utils/natural-sort'
import {
  getSourceFileTechnicalMetadata,
  type ByteRange,
  type SourceAdapter,
  type SourceChangeBatch,
  type SourceReadHandle,
  type SourceRootIdentity
} from '../source-adapter'

export interface ManagedOfflineSourceAdapterDependencies {
  resolveCacheRoot(cacheId: string): string | null
  scanner?: ScannerService
}

export class ManagedOfflineSourceAdapter implements SourceAdapter {
  public readonly provider = 'managed-offline' as const
  private readonly scanner: ScannerService

  public constructor(
    private readonly dependencies: ManagedOfflineSourceAdapterDependencies
  ) {
    this.scanner = dependencies.scanner ?? scannerService
  }

  public async identifyRoot(
    locator: SourceRootLocator
  ): Promise<SourceRootIdentity> {
    const root = this.requireRoot(locator)
    const cacheRoot = await this.requireCacheRoot(root.cacheId)

    return {
      providerRootIdentity: root.cacheId,
      displayName: path.basename(cacheRoot) || root.cacheId,
      availability: 'offline',
      stableDeviceId: root.cacheId
    }
  }

  public async *reconcile(input: {
    root: SourceRootLocator
  }): AsyncIterable<SourceChangeBatch> {
    const root = this.requireRoot(input.root)
    const cacheRoot = await this.requireCacheRoot(root.cacheId)
    const scanned = await this.scanner.scanDirectory(cacheRoot)
    const resolvedRoot = path.resolve(cacheRoot)
    const items = this.scanner
      .collectAllFiles(scanned)
      .map((file) => {
        const relativePath = path
          .relative(resolvedRoot, file.fullPath)
          .split(path.sep)
          .join('/')
        const extension = path.extname(relativePath)
        const assetId = relativePath.slice(
          0,
          extension ? -extension.length : undefined
        )
        return {
          providerItemIdentity: assetId,
          locator: {
            provider: 'managed-offline' as const,
            cacheId: root.cacheId,
            assetId,
            relativePath
          },
          name: file.name,
          relativePath,
          size: file.sizeBytes,
          availability: 'offline' as const,
          fingerprint: file.fingerprint
        }
      })
      .sort((left, right) =>
        naturalCompare(left.relativePath, right.relativePath)
      )

    yield { items }
  }

  public async open(
    item: SourceItemLocator,
    range?: ByteRange
  ): Promise<SourceReadHandle> {
    const { filePath, handle, stats } = await this.openContainedFile(
      this.requireItem(item)
    )

    try {
      const normalizedRange = normalizeRange(range, stats.size)
      return {
        stream: handle.createReadStream(normalizedRange),
        status: normalizedRange ? 206 : 200,
        ...getSourceFileTechnicalMetadata(filePath, stats.size),
        totalSize: stats.size,
        ...(normalizedRange ? { contentRange: normalizedRange } : {}),
        seekable: true
      }
    } catch (error) {
      await handle.close()
      throw error
    }
  }

  public async probe(
    item: SourceItemLocator
  ): Promise<SourceTechnicalMetadata> {
    const { filePath, handle, stats } = await this.openContainedFile(
      this.requireItem(item)
    )
    await handle.close()
    return getSourceFileTechnicalMetadata(filePath, stats.size)
  }

  private requireRoot(
    locator: SourceRootLocator
  ): ManagedOfflineSourceRootLocator {
    if (locator.provider !== 'managed-offline')
      throw new Error(
        'Managed offline adapter received a different source provider'
      )
    return locator
  }

  private requireItem(
    locator: SourceItemLocator
  ): ManagedOfflineSourceItemLocator {
    if (locator.provider !== 'managed-offline')
      throw new Error(
        'Managed offline adapter received a different source provider'
      )
    return locator
  }

  private async resolveItemPath(
    locator: ManagedOfflineSourceItemLocator
  ): Promise<{ cacheRoot: string; filePath: string }> {
    if (!locator.relativePath || path.isAbsolute(locator.relativePath)) {
      throw new Error('Managed source item is outside its cache root')
    }
    const cacheRoot = await this.requireCacheRoot(locator.cacheId)
    const candidate = path.resolve(cacheRoot, locator.relativePath)
    this.requireContainedPath(cacheRoot, candidate)
    const realCandidate = await fs.promises.realpath(candidate)
    this.requireContainedPath(cacheRoot, realCandidate)
    return { cacheRoot, filePath: realCandidate }
  }

  private async openContainedFile(
    locator: ManagedOfflineSourceItemLocator
  ): Promise<{
    filePath: string
    handle: fs.promises.FileHandle
    stats: fs.Stats
  }> {
    const { cacheRoot, filePath } = await this.resolveItemPath(locator)
    const inspected = await this.inspectContainedPath(cacheRoot, filePath)

    const handle = await fs.promises.open(
      filePath,
      process.platform === 'win32'
        ? fs.constants.O_RDONLY
        : fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW
    )
    try {
      const stats = await handle.stat()
      const postOpenInspection = await this.inspectContainedPath(
        cacheRoot,
        filePath
      )
      const confirmedPath = await fs.promises.realpath(filePath)
      this.requireContainedPath(cacheRoot, confirmedPath)
      const finalInspection = await this.inspectContainedPath(
        cacheRoot,
        filePath
      )
      const finalFile = finalInspection.at(-1)!
      if (
        !stats.isFile() ||
        !this.hasSameIdentity(stats, inspected.at(-1)!.stats) ||
        !this.hasSameIdentity(stats, finalFile.stats) ||
        !this.hasSamePathState(inspected, postOpenInspection) ||
        !this.hasSamePathState(inspected, finalInspection)
      ) {
        throw new Error(
          'Managed source item changed after containment validation'
        )
      }
      return { filePath: confirmedPath, handle, stats }
    } catch (error) {
      await handle.close()
      throw error
    }
  }

  private async requireCacheRoot(cacheId: string): Promise<string> {
    const configuredRoot = this.dependencies.resolveCacheRoot(cacheId)
    if (!configuredRoot) throw new Error(`Unknown managed cache: ${cacheId}`)
    const cacheRoot = path.resolve(configuredRoot)
    const stats = await fs.promises.stat(cacheRoot)
    if (!stats.isDirectory())
      throw new Error(`Managed cache root is not a directory: ${cacheRoot}`)
    return fs.promises.realpath(cacheRoot)
  }

  private requireContainedPath(cacheRoot: string, candidate: string): void {
    const relative = path.relative(cacheRoot, candidate)
    if (
      relative === '' ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error('Managed source item is outside its cache root')
    }
  }

  private async inspectContainedPath(
    cacheRoot: string,
    filePath: string
  ): Promise<Array<{ path: string; stats: fs.Stats }>> {
    const relativePath = path.relative(cacheRoot, filePath)
    this.requireContainedPath(cacheRoot, filePath)
    const segments = relativePath.split(path.sep)
    const paths = [cacheRoot]
    let currentPath = cacheRoot
    for (const segment of segments) {
      currentPath = path.join(currentPath, segment)
      paths.push(currentPath)
    }

    const entries = await Promise.all(
      paths.map(async (entryPath, index) => {
        const stats = await fs.promises.lstat(entryPath)
        const isFile = index === paths.length - 1
        if (
          stats.isSymbolicLink() ||
          (isFile ? !stats.isFile() : !stats.isDirectory())
        ) {
          throw new Error(
            isFile
              ? `Source item is not a regular file: ${entryPath}`
              : `Managed source path is not a directory: ${entryPath}`
          )
        }
        return { path: entryPath, stats }
      })
    )
    return entries
  }

  private hasSamePathState(
    expected: Array<{ path: string; stats: fs.Stats }>,
    actual: Array<{ path: string; stats: fs.Stats }>
  ): boolean {
    return (
      expected.length === actual.length &&
      expected.every(
        (entry, index) =>
          entry.path === actual[index].path &&
          this.hasSameIdentity(entry.stats, actual[index].stats)
      )
    )
  }

  private hasSameIdentity(left: fs.Stats, right: fs.Stats): boolean {
    return left.dev === right.dev && left.ino === right.ino
  }
}

function normalizeRange(
  range: ByteRange | undefined,
  size: number
): ByteRange | undefined {
  if (!range) return undefined
  if (
    !Number.isInteger(range.start) ||
    !Number.isInteger(range.end) ||
    range.start < 0 ||
    range.end < range.start ||
    range.end >= size
  ) {
    throw new Error('Invalid byte range')
  }
  return range
}
