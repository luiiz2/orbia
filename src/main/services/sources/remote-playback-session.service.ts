import { randomUUID } from 'node:crypto'
import type { SourceItemLocator } from '../../../types/source'
import type {
  ByteRange,
  SourceAdapter,
  SourceReadHandle
} from './source-adapter'

export const REMOTE_PLAYBACK_SESSION_TTL_MS = 30 * 60 * 1000

interface PlaybackSession {
  adapter: SourceAdapter
  item: SourceItemLocator
  expiresAt: number
}

export class RemotePlaybackSessionError extends Error {
  public constructor(public readonly status: 404 | 410) {
    super('Remote playback session is unavailable')
    this.name = 'RemotePlaybackSessionError'
  }
}

export class RemotePlaybackSessionService {
  private readonly sessions = new Map<string, PlaybackSession>()

  public constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly maxSessions = 128
  ) {}

  public create(adapter: SourceAdapter, item: SourceItemLocator): string {
    this.removeExpired()
    while (this.sessions.size >= this.maxSessions) {
      const oldest = this.sessions.keys().next().value
      if (typeof oldest !== 'string') break
      this.sessions.delete(oldest)
    }

    const id = randomUUID()
    this.sessions.set(id, {
      adapter,
      item,
      expiresAt: this.now() + REMOTE_PLAYBACK_SESSION_TTL_MS
    })
    return id
  }

  public async open(id: string, range?: ByteRange): Promise<SourceReadHandle> {
    this.removeExpired()
    const session = this.sessions.get(id)
    if (!session) throw new RemotePlaybackSessionError(404)
    session.expiresAt = this.now() + REMOTE_PLAYBACK_SESSION_TTL_MS
    return range
      ? session.adapter.open(session.item, range)
      : session.adapter.open(session.item)
  }

  public clear(): void {
    this.sessions.clear()
  }

  private removeExpired(): void {
    const now = this.now()
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(id)
    }
  }
}
