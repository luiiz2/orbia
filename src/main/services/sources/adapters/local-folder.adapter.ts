import fs from 'node:fs'
import path from 'node:path'
import type {
  LocalFolderSourceItemLocator,
  LocalFolderSourceRootLocator,
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

export class LocalFolderSourceAdapter implements SourceAdapter {
  public readonly provider = 'local-folder' as const

  public constructor(
    private readonly scanner: ScannerService = scannerService
  ) {}

  public async identifyRoot(
    locator: SourceRootLocator
  ): Promise<SourceRootIdentity> {
    const root = this.requireRoot(locator)
    const stats = await fs.promises.stat(root.path)
    if (!stats.isDirectory())
      throw new Error(`Source root is not a directory: ${root.path}`)

    return {
      providerRootIdentity: path.resolve(root.path),
      displayName:
        path.basename(path.resolve(root.path)) || path.resolve(root.path),
      availability: 'available',
      ...(stats.dev !== 0 && stats.ino !== 0
        ? { stableDeviceId: `${stats.dev}:${stats.ino}` }
        : {})
    }
  }

  public async *reconcile(input: {
    root: SourceRootLocator
  }): AsyncIterable<SourceChangeBatch> {
    const root = this.requireRoot(input.root)
    const scanned = await this.scanner.scanDirectory(root.path)
    const resolvedRoot = path.resolve(root.path)
    const items = this.scanner
      .collectAllFiles(scanned)
      .map((file) => {
        const relativePath = path
          .relative(resolvedRoot, file.fullPath)
          .split(path.sep)
          .join('/')
        return {
          providerItemIdentity: relativePath,
          locator: { provider: 'local-folder' as const, path: file.fullPath },
          name: file.name,
          relativePath,
          size: file.sizeBytes,
          availability: 'available' as const,
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
    const locator = this.requireItem(item)
    const stats = await this.requireRegularFile(locator.path)
    const normalizedRange = normalizeRange(range, stats.size)

    return {
      stream: fs.createReadStream(locator.path, normalizedRange),
      status: normalizedRange ? 206 : 200,
      ...getSourceFileTechnicalMetadata(locator.path, stats.size),
      totalSize: stats.size,
      ...(normalizedRange ? { contentRange: normalizedRange } : {}),
      seekable: true
    }
  }

  public async probe(
    item: SourceItemLocator
  ): Promise<SourceTechnicalMetadata> {
    const locator = this.requireItem(item)
    return getSourceFileTechnicalMetadata(
      locator.path,
      (await this.requireRegularFile(locator.path)).size
    )
  }

  private requireRoot(
    locator: SourceRootLocator
  ): LocalFolderSourceRootLocator {
    if (locator.provider !== 'local-folder')
      throw new Error(
        'Local folder adapter received a different source provider'
      )
    return locator
  }

  private requireItem(
    locator: SourceItemLocator
  ): LocalFolderSourceItemLocator {
    if (locator.provider !== 'local-folder')
      throw new Error(
        'Local folder adapter received a different source provider'
      )
    return locator
  }

  private async requireRegularFile(filePath: string): Promise<fs.Stats> {
    const stats = await fs.promises.stat(filePath)
    if (!stats.isFile())
      throw new Error(`Source item is not a regular file: ${filePath}`)
    return stats
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
