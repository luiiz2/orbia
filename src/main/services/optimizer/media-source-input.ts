import fs from 'node:fs'
import { Readable } from 'node:stream'
import type { MediaMetadata } from '../../../types/optimizer'
import { mediaAnalyzerService } from './media-analyzer.service'

/**
 * Unified Media Source Input Contract.
 * Abstracts local files, progressive streams, and future cloud/remote streams.
 */
export interface MediaSourceInput {
  getMetadata(): Promise<MediaMetadata>
  getInputStream(): Promise<Readable>
  getLocalFilePath(): string | null
  isDirectFile(): boolean
}

/**
 * Local filesystem source input.
 */
export class LocalFileSourceInput implements MediaSourceInput {
  private filePath: string
  private cachedMetadata: MediaMetadata | null = null

  constructor(filePath: string) {
    this.filePath = filePath
  }

  public async getMetadata(): Promise<MediaMetadata> {
    if (!this.cachedMetadata) {
      this.cachedMetadata = await mediaAnalyzerService.analyze(this.filePath)
    }
    return this.cachedMetadata
  }

  public async getInputStream(): Promise<Readable> {
    return fs.createReadStream(this.filePath)
  }

  public getLocalFilePath(): string | null {
    return this.filePath
  }

  public isDirectFile(): boolean {
    return true
  }
}

/**
 * Stream-based source input (progressive buffer for tests / piped sources).
 */
export class StreamSourceInput implements MediaSourceInput {
  private streamFactory: () => Promise<Readable>
  private staticMetadata: MediaMetadata
  private fallbackTempPath?: string

  constructor(
    streamFactory: () => Promise<Readable>,
    metadata: MediaMetadata,
    fallbackTempPath?: string
  ) {
    this.streamFactory = streamFactory
    this.staticMetadata = metadata
    this.fallbackTempPath = fallbackTempPath
  }

  public async getMetadata(): Promise<MediaMetadata> {
    return this.staticMetadata
  }

  public async getInputStream(): Promise<Readable> {
    return this.streamFactory()
  }

  public getLocalFilePath(): string | null {
    return this.fallbackTempPath || null
  }

  public isDirectFile(): boolean {
    return Boolean(
      this.fallbackTempPath && fs.existsSync(this.fallbackTempPath)
    )
  }
}

/**
 * Adapter ready for future Remote/Cloud sources (e.g. Google Drive stream in v0.8).
 */
export class RemoteStreamSourceAdapter implements MediaSourceInput {
  private remoteSourceId: string
  private remoteUrl: string
  private metadataProvider: () => Promise<MediaMetadata>
  private streamProvider: () => Promise<Readable>

  constructor(
    remoteSourceId: string,
    remoteUrl: string,
    metadataProvider: () => Promise<MediaMetadata>,
    streamProvider: () => Promise<Readable>
  ) {
    this.remoteSourceId = remoteSourceId
    this.remoteUrl = remoteUrl
    this.metadataProvider = metadataProvider
    this.streamProvider = streamProvider
  }

  public async getMetadata(): Promise<MediaMetadata> {
    return this.metadataProvider()
  }

  public async getInputStream(): Promise<Readable> {
    return this.streamProvider()
  }

  public getLocalFilePath(): string | null {
    return null
  }

  public isDirectFile(): boolean {
    return false
  }

  public getRemoteId(): string {
    return this.remoteSourceId
  }

  public getRemoteUrl(): string {
    return this.remoteUrl
  }
}
