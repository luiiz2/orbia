import { naturalCompare } from '../../../utils/natural-sort'
import type {
  GoogleDriveSourceItemLocator,
  GoogleDriveSourceRootLocator,
  SourceItemLocator,
  SourceRootLocator,
  SourceTechnicalMetadata
} from '../../../../types/source'
import {
  GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  type GoogleDriveSourceClient,
  type GoogleDriveFile
} from '../google/google-drive-client'
import type {
  ByteRange,
  SourceAdapter,
  SourceChangeBatch,
  SourceReadHandle,
  SourceRootIdentity
} from '../source-adapter'

export class GoogleDriveSourceAdapter implements SourceAdapter {
  public readonly provider = 'google-drive' as const

  public constructor(private readonly client: GoogleDriveSourceClient) {}

  public async identifyRoot(
    locator: SourceRootLocator
  ): Promise<SourceRootIdentity> {
    const root = this.requireRoot(locator)
    const metadata = await this.client.getFile(root.folderId)
    if (metadata.mimeType !== GOOGLE_DRIVE_FOLDER_MIME_TYPE) {
      throw new Error('Google Drive source root is not a folder')
    }
    return {
      providerRootIdentity: root.folderId,
      displayName: metadata.name,
      availability: 'available'
    }
  }

  public async *reconcile(input: {
    root: SourceRootLocator
  }): AsyncIterable<SourceChangeBatch> {
    const root = this.requireRoot(input.root)
    const rootMetadata = await this.client.getFile(root.folderId)
    if (rootMetadata.mimeType !== GOOGLE_DRIVE_FOLDER_MIME_TYPE) {
      throw new Error('Google Drive source root is not a folder')
    }

    const pendingFolders: Array<{ id: string; relativePath: string }> = [
      { id: root.folderId, relativePath: '' }
    ]
    const visitedFolders = new Set<string>()

    while (pendingFolders.length > 0) {
      const current = pendingFolders.shift()!
      if (visitedFolders.has(current.id)) continue
      visitedFolders.add(current.id)

      let pageToken: string | undefined
      do {
        const page = await this.client.listChildren(current.id, {
          driveId: root.driveId,
          ...(pageToken ? { pageToken } : {})
        })
        const items = page.files
          .map((file) => {
            const relativePath = joinRelativePath(
              current.relativePath,
              file.name
            )
            const isFolder = file.mimeType === GOOGLE_DRIVE_FOLDER_MIME_TYPE
            if (isFolder) {
              pendingFolders.push({ id: file.id, relativePath })
            }
            return toSourceItem(root, file, relativePath)
          })
          .sort((left, right) =>
            naturalCompare(left.relativePath, right.relativePath)
          )

        if (items.length > 0) yield { items }
        pageToken = page.nextPageToken
      } while (pageToken)
    }
  }

  public async open(
    item: SourceItemLocator,
    range?: ByteRange
  ): Promise<SourceReadHandle> {
    const locator = this.requireItem(item)
    return this.client.openFile(locator.itemId, {
      driveId: locator.driveId,
      range
    })
  }

  public async probe(
    item: SourceItemLocator
  ): Promise<SourceTechnicalMetadata> {
    const locator = this.requireItem(item)
    const metadata = await this.client.getFile(locator.itemId)
    return {
      ...(metadata.size ? { fileSize: Number(metadata.size) } : {}),
      ...(metadata.mimeType ? { mimeType: metadata.mimeType } : {})
    }
  }

  private requireRoot(
    locator: SourceRootLocator
  ): GoogleDriveSourceRootLocator {
    if (locator.provider !== 'google-drive') {
      throw new Error(
        'Google Drive adapter received a different source provider'
      )
    }
    return locator
  }

  private requireItem(
    locator: SourceItemLocator
  ): GoogleDriveSourceItemLocator {
    if (locator.provider !== 'google-drive') {
      throw new Error(
        'Google Drive adapter received a different source provider'
      )
    }
    return locator
  }
}

function toSourceItem(
  root: GoogleDriveSourceRootLocator,
  file: GoogleDriveFile,
  relativePath: string
) {
  const size = file.size ? Number(file.size) : 0
  return {
    providerItemIdentity: file.id,
    ...(file.parents?.[0] ? { parentProviderIdentity: file.parents[0] } : {}),
    locator: {
      provider: 'google-drive' as const,
      accountId: root.accountId,
      itemId: file.id,
      ...(root.driveId ? { driveId: root.driveId } : {})
    },
    name: file.name,
    relativePath,
    size: Number.isFinite(size) && size >= 0 ? size : 0,
    availability: 'available' as const,
    ...(file.mimeType ? { mimeType: file.mimeType } : {}),
    ...(file.md5Checksum ? { checksum: file.md5Checksum } : {}),
    ...(file.modifiedTime ? { revision: file.modifiedTime } : {}),
    ...(file.size || file.mimeType
      ? {
          technicalMetadata: {
            ...(file.size ? { fileSize: Number(file.size) } : {}),
            ...(file.mimeType ? { mimeType: file.mimeType } : {})
          }
        }
      : {})
  }
}

function joinRelativePath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}
