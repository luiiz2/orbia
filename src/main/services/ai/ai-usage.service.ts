import type { DatabaseService } from '../database.service'
import { databaseService } from '../database.service'
import type { AiLocalUsageStats } from '../../../types/ai'

export interface AiUsageServiceDependencies {
  db?: DatabaseService
}

interface UsageRow {
  total_requests: number
  total_prompt_tokens: number
  total_completion_tokens: number
  total_transcription_seconds: number
  total_embedded_chunks: number
  last_activity_at: number | null
}

export class AiUsageService {
  private readonly db: DatabaseService

  public constructor(dependencies: AiUsageServiceDependencies = {}) {
    this.db = dependencies.db ?? databaseService
  }

  private ensureTable(): void {
    const rawDb = this.db.getDatabase()
    if (!rawDb) return

    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS ai_local_usage (
        id                          INTEGER PRIMARY KEY CHECK(id = 1),
        total_requests              INTEGER NOT NULL DEFAULT 0,
        total_prompt_tokens         INTEGER NOT NULL DEFAULT 0,
        total_completion_tokens     INTEGER NOT NULL DEFAULT 0,
        total_transcription_seconds REAL NOT NULL DEFAULT 0.0,
        total_embedded_chunks       INTEGER NOT NULL DEFAULT 0,
        last_activity_at            INTEGER
      );

      INSERT OR IGNORE INTO ai_local_usage (id, total_requests, total_prompt_tokens, total_completion_tokens, total_transcription_seconds, total_embedded_chunks)
      VALUES (1, 0, 0, 0, 0.0, 0);
    `)
  }

  public recordUsage(metrics: {
    promptTokens?: number
    completionTokens?: number
    transcriptionSeconds?: number
    embeddedChunks?: number
  }): void {
    const rawDb = this.db.getDatabase()
    if (!rawDb) return

    try {
      this.ensureTable()
      const now = Date.now()

      rawDb
        .prepare(
          `
        UPDATE ai_local_usage
        SET
          total_requests = total_requests + 1,
          total_prompt_tokens = total_prompt_tokens + ?,
          total_completion_tokens = total_completion_tokens + ?,
          total_transcription_seconds = total_transcription_seconds + ?,
          total_embedded_chunks = total_embedded_chunks + ?,
          last_activity_at = ?
        WHERE id = 1
      `
        )
        .run(
          metrics.promptTokens || 0,
          metrics.completionTokens || 0,
          metrics.transcriptionSeconds || 0,
          metrics.embeddedChunks || 0,
          now
        )
    } catch {
      // ignore
    }
  }

  public getUsageStats(): AiLocalUsageStats {
    const rawDb = this.db.getDatabase()
    if (!rawDb) {
      return {
        totalRequests: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTranscriptionSeconds: 0,
        totalEmbeddedChunks: 0
      }
    }

    try {
      this.ensureTable()
      const row = rawDb
        .prepare(`SELECT * FROM ai_local_usage WHERE id = 1`)
        .get() as UsageRow | undefined
      if (!row) {
        return {
          totalRequests: 0,
          totalPromptTokens: 0,
          totalCompletionTokens: 0,
          totalTranscriptionSeconds: 0,
          totalEmbeddedChunks: 0
        }
      }

      return {
        totalRequests: row.total_requests || 0,
        totalPromptTokens: row.total_prompt_tokens || 0,
        totalCompletionTokens: row.total_completion_tokens || 0,
        totalTranscriptionSeconds: row.total_transcription_seconds || 0,
        totalEmbeddedChunks: row.total_embedded_chunks || 0,
        lastActivityAt: row.last_activity_at || undefined
      }
    } catch {
      return {
        totalRequests: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTranscriptionSeconds: 0,
        totalEmbeddedChunks: 0
      }
    }
  }

  public resetUsageStats(): boolean {
    const rawDb = this.db.getDatabase()
    if (!rawDb) return false

    try {
      this.ensureTable()
      rawDb
        .prepare(
          `
        UPDATE ai_local_usage
        SET
          total_requests = 0,
          total_prompt_tokens = 0,
          total_completion_tokens = 0,
          total_transcription_seconds = 0.0,
          total_embedded_chunks = 0,
          last_activity_at = NULL
        WHERE id = 1
      `
        )
        .run()
      return true
    } catch {
      return false
    }
  }
}

export const aiUsageService = new AiUsageService()
