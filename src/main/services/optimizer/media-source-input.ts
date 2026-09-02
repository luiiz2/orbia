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
