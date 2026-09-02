import { describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import {
  GoogleDriveClient,
  type GoogleDriveBrowserClient,
  type GoogleDriveFile
} from '../../src/main/services/sources/google/google-drive-client'
import { GoogleDriveService } from '../../src/main/services/sources/google/google-drive.service'
import { GoogleDriveSourceAdapter } from '../../src/main/services/sources/adapters/google-drive.adapter'
import { RemotePlaybackSessionService } from '../../src/main/services/sources/remote-playback-session.service'
import type { SourceAdapter } from '../../src/main/services/sources/source-adapter'

async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

describe('Google Drive remote source', () => {
  it('lists only the selected folder and preserves pagination/shared-drive parameters', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          nextPageToken: 'page-2',
          files: [
            {
              id: 'file-1',
              name: 'Lesson 01.mp4',
              mimeType: 'video/mp4',
              size: '128',
              parents: ['folder-1'],
              capabilities: { canDownload: true }
            }
          ]
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    const client = new GoogleDriveClient({
      accessTokenProvider: async () => 'test-access-token',
      fetch: fetchMock
    })

    const page = await client.listChildren('folder-1', {
      driveId: 'shared-drive-1',
      pageToken: 'page-1'
    })

    expect(page.nextPageToken).toBe('page-2')
    expect(page.files[0]).toMatchObject({
      id: 'file-1',
      name: 'Lesson 01.mp4',
      size: '128'
    })
    const request = new URL(String(fetchMock.mock.calls[0][0]))
    expect(request.searchParams.get('q')).toBe(
      "'folder-1' in parents and trashed = false"
    )
    expect(request.searchParams.get('pageToken')).toBe('page-1')
    expect(request.searchParams.get('driveId')).toBe('shared-drive-1')
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer test-access-token'
    })
  })

  it('lists items shared with the account and preserves pagination and drive metadata', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          nextPageToken: 'shared-page-2',
          files: [
            {
              id: 'shared-folder-1',
              name: 'Curso compartilhado',
              mimeType: 'application/vnd.google-apps.folder',
              driveId: 'shared-drive-1',
              capabilities: { canDownload: false }
            }
          ]
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    const client = new GoogleDriveClient({
      accessTokenProvider: async () => 'test-access-token',
      fetch: fetchMock
    })

    const page = await client.listSharedWithMe({ pageToken: 'shared-page-1' })

    expect(page).toMatchObject({
      nextPageToken: 'shared-page-2',
      files: [
        {
          id: 'shared-folder-1',
          driveId: 'shared-drive-1'
        }
      ]
    })
    const request = new URL(String(fetchMock.mock.calls[0][0]))
    expect(request.searchParams.get('q')).toBe(
      'sharedWithMe = true and trashed = false'
    )
    expect(request.searchParams.get('pageToken')).toBe('shared-page-1')
    expect(request.searchParams.get('includeItemsFromAllDrives')).toBe('true')
    expect(request.searchParams.get('supportsAllDrives')).toBe('true')
  })

  it('maps the shared-with-me root without treating it as a real Drive folder', async () => {
    const client = {
      listSharedWithMe: vi.fn().mockResolvedValue({
        files: [
          {
            id: 'shared-folder-1',
            name: 'Curso compartilhado',
            mimeType: 'application/vnd.google-apps.folder',
            driveId: 'shared-drive-1',
            capabilities: { canDownload: false }
          },
          {
            id: 'shared-file-1',
            name: 'Apostila.pdf',
            mimeType: 'application/pdf',
            webViewLink: 'https://drive.google.com/file/d/shared-file-1/view',
            capabilities: { canDownload: true }
          },
          {
            id: 'shared-doc-1',
            name: 'Anotações',
            mimeType: 'application/vnd.google-apps.document',
            webViewLink: 'https://docs.google.com/document/d/shared-doc-1/edit',
            capabilities: { canDownload: true }
          }
        ],
        nextPageToken: 'shared-page-2'
      }),
      getFile: vi.fn(),
      listChildren: vi.fn(),
      openFile: vi.fn()
    } as unknown as GoogleDriveBrowserClient
    const service = createGoogleDriveServiceForTest(client)

    const listing = await service.listSharedWithMe({
      pageToken: 'shared-page-1'
    })

    expect(listing).toEqual({
      folderId: 'shared-with-me',
      folderName: 'Compartilhados comigo',
      rootKind: 'shared-with-me',
      nextPageToken: 'shared-page-2',
      entries: [
        expect.objectContaining({
          itemId: 'shared-folder-1',
          driveId: 'shared-drive-1',
          canPreview: false
        }),
        expect.objectContaining({
          itemId: 'shared-file-1',
          canPreview: true,
          webViewUrl: 'https://drive.google.com/file/d/shared-file-1/view'
        }),
        expect.objectContaining({
          itemId: 'shared-doc-1',
          canPreview: false,
          canDownload: false,
          webViewUrl: 'https://docs.google.com/document/d/shared-doc-1/edit'
        })
      ]
    })
    expect(client.getFile).not.toHaveBeenCalled()
    expect(client.listSharedWithMe).toHaveBeenCalledWith({
      pageToken: 'shared-page-1'
    })
  })

  it('prepares downloads from authoritative metadata, including unsupported preview types', async () => {
    const client = {
      getFile: vi.fn().mockResolvedValue({
        id: 'archive-1',
        name: 'materiais.zip',
        mimeType: 'application/zip',
        size: '4',
        capabilities: { canDownload: true }
      }),
      listChildren: vi.fn(),
      listSharedWithMe: vi.fn(),
      openFile: vi.fn().mockResolvedValue({
        stream: Readable.from(Buffer.from('data')),
        status: 200,
        mimeType: 'application/zip',
        totalSize: 4,
        seekable: true
      })
    } as unknown as GoogleDriveBrowserClient
    const service = createGoogleDriveServiceForTest(client)

    const download = await service.prepareDownload({
      itemId: 'archive-1',
      driveId: 'shared-drive-1'
    })

    expect(download).toMatchObject({
      name: 'materiais.zip',
      mimeType: 'application/zip',
      size: 4
    })
    expect(download.stream).toBeDefined()
    expect(client.openFile).toHaveBeenCalledWith('archive-1', {
      driveId: 'shared-drive-1',
      metadata: expect.objectContaining({ id: 'archive-1' })
    })
  })

  it('rejects downloads when Drive denies file content access', async () => {
    const client = {
      getFile: vi.fn().mockResolvedValue({
        id: 'restricted-1',
        name: 'restrito.bin',
        mimeType: 'application/octet-stream',
        capabilities: { canDownload: false }
      }),
      listChildren: vi.fn(),
      listSharedWithMe: vi.fn(),
      openFile: vi.fn()
    } as unknown as GoogleDriveBrowserClient
    const service = createGoogleDriveServiceForTest(client)

    await expect(
      service.prepareDownload({ itemId: 'restricted-1' })
    ).rejects.toThrow('cannot be downloaded')
    expect(client.openFile).not.toHaveBeenCalled()
  })

  it('does not advertise direct downloads for Google-native documents', async () => {
    const client = {
      getFile: vi.fn().mockResolvedValue({
        id: 'doc-1',
        name: 'Documento',
        mimeType: 'application/vnd.google-apps.document',
        webViewLink: 'https://docs.google.com/document/d/doc-1/edit',
        capabilities: { canDownload: true }
      }),
      listChildren: vi.fn(),
      listSharedWithMe: vi.fn(),
      openFile: vi.fn()
    } as unknown as GoogleDriveBrowserClient
    const service = createGoogleDriveServiceForTest(client)

    await expect(
      service.prepareDownload({ itemId: 'doc-1' })
    ).rejects.toThrow('must be opened in Google Drive')
    expect(client.openFile).not.toHaveBeenCalled()
  })

  it('keeps byte ranges on the remote response instead of writing a local cache', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'file-1',
            name: 'Lesson 01.mp4',
            mimeType: 'video/mp4',
            size: '6',
            capabilities: { canDownload: true }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(Readable.from(Buffer.from('cdef')) as never, {
          status: 206,
          headers: {
            'content-type': 'video/mp4',
            'content-length': '4',
            'content-range': 'bytes 2-5/6'
          }
        })
      )
    const client = new GoogleDriveClient({
      accessTokenProvider: async () => 'test-access-token',
      fetch: fetchMock
    })

    const handle = await client.openFile('file-1', {
      range: { start: 2, end: 5 }
    })

    expect(handle).toMatchObject({
      status: 206,
      totalSize: 6,
      contentRange: { start: 2, end: 5 },
      seekable: true
    })
    expect(await readStream(handle.stream)).toEqual(Buffer.from('cdef'))
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      Authorization: 'Bearer test-access-token',
      Range: 'bytes=2-5'
    })
  })

  it('reconciles a selected Drive folder without exposing local paths', async () => {
    const files: GoogleDriveFile[] = [
      {
        id: 'folder-2',
        name: 'Module 01',
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['folder-1']
      },
      {
        id: 'file-1',
        name: 'Lesson 01.mp4',
        mimeType: 'video/mp4',
        size: '128',
        parents: ['folder-1'],
        capabilities: { canDownload: true }
      }
    ]
    const client = {
      getFile: vi.fn().mockResolvedValue({
        id: 'folder-1',
        name: 'Course',
        mimeType: 'application/vnd.google-apps.folder'
      }),
      listChildren: vi
        .fn()
        .mockResolvedValue({ files, nextPageToken: undefined }),
      openFile: vi.fn(),
      probeFile: vi.fn()
    }
    const adapter = new GoogleDriveSourceAdapter(client)

    const batches = []
    for await (const batch of adapter.reconcile({
      root: {
        provider: 'google-drive',
        accountId: 'account-1',
        folderId: 'folder-1'
      }
    })) {
      batches.push(batch)
    }

    expect(batches.flatMap((batch) => batch.items)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerItemIdentity: 'folder-2',
          relativePath: 'Module 01',
          locator: {
            provider: 'google-drive',
            accountId: 'account-1',
            itemId: 'folder-2'
          }
        }),
        expect.objectContaining({
          providerItemIdentity: 'file-1',
          relativePath: 'Lesson 01.mp4',
          size: 128,
          locator: {
            provider: 'google-drive',
            accountId: 'account-1',
            itemId: 'file-1'
          }
        })
      ])
    )
  })

  it('expires opaque playback sessions and does not retain their source locator', async () => {
    let now = 1_000
    const service = new RemotePlaybackSessionService(() => now)
    const adapter = {
      open: vi.fn().mockResolvedValue({
        stream: Readable.from(Buffer.from('media')),
        status: 200,
        totalSize: 5,
        seekable: true
      })
    } as unknown as SourceAdapter
    const sessionId = service.create(adapter, {
      provider: 'google-drive',
      accountId: 'account-1',
      itemId: 'file-1'
    })

    await expect(service.open(sessionId)).resolves.toMatchObject({
      status: 200,
      totalSize: 5
    })
    expect(adapter.open).toHaveBeenCalledWith({
      provider: 'google-drive',
      accountId: 'account-1',
      itemId: 'file-1'
    })

    now += 30 * 60 * 1000 + 1
    await expect(service.open(sessionId)).rejects.toMatchObject({ status: 404 })
  })
})

function createGoogleDriveServiceForTest(
  client: GoogleDriveBrowserClient
): GoogleDriveService {
  return new GoogleDriveService(
    {
      getStatus: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      getConnectedAccount: vi.fn().mockReturnValue({
        accountId: 'account-1',
        displayName: 'Test account'
      })
    } as never,
    client as never,
    {} as never,
    {
      clear: vi.fn(),
      create: vi.fn().mockReturnValue(
        '00000000-0000-4000-8000-000000000000'
      ),
      open: vi.fn()
    } as never
  )
}
