import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { DatabaseService } from '../database.service'
import { databaseService } from '../database.service'
import type {
  AiStorageCategory,
  AiStorageStats,
  AiCategoryStorageStats
} from '../../../types/ai'
import { logger } from '../logger.service'

export interface AiStorageServiceDependencies {
  db?: DatabaseService
}

export class AiStorageService {
  private readonly db: DatabaseService

  public constructor(dependencies: AiStorageServiceDependencies = {}) {
    this.db = dependencies.db ?? databaseService
  }

  public async getStorageStats(): Promise<AiStorageStats> {
    const rawDb = this.db.getDatabase()

    let transcriptCount = 0
    let transcriptBytes = 0
    let semanticIndexCount = 0
    let semanticIndexBytes = 0
    let summaryCount = 0
    let summaryBytes = 0
    let chatCount = 0
    let chatBytes = 0
    let tempFileCount = 0
    let tempFileBytes = 0

    if (rawDb) {
      try {
        // 1. Transcripts
        const trRow = rawDb
          .prepare(
            `
          SELECT
            COUNT(DISTINCT t.id) as count,
            COALESCE(SUM(LENGTH(s.text)), 0) as char_bytes
          FROM transcripts t
          LEFT JOIN transcript_segments s ON t.id = s.transcript_id
        `
          )
          .get() as { count: number; char_bytes: number } | undefined
        transcriptCount = trRow?.count || 0
        transcriptBytes = Math.round((trRow?.char_bytes || 0) * 1.5) // Approximate encoding overhead
      } catch {
        // Table might not exist yet
      }

      try {
        // 2. Semantic Index (embeddings & chunks)
        const embRow = rawDb
          .prepare(
            `
          SELECT
            COUNT(c.id) as chunk_count,
            COALESCE(SUM(LENGTH(CAST(c.text AS BLOB)) + COALESCE(LENGTH(e.vector), 0)), 0) as total_bytes
          FROM semantic_index_chunks c
          LEFT JOIN semantic_index_embeddings e ON c.id = e.chunk_id
        `
          )
          .get() as { chunk_count: number; total_bytes: number } | undefined
        semanticIndexCount = embRow?.chunk_count || 0
        semanticIndexBytes = embRow?.total_bytes || 0
      } catch {
        // Table might not exist yet
      }

      try {
        // 3. Summaries
        const sumRow = rawDb
          .prepare(
            `
          SELECT
            COUNT(id) as count,
            COALESCE(SUM(LENGTH(overview) + LENGTH(full_markdown) + LENGTH(key_concepts_json)), 0) as total_bytes
          FROM ai_summaries
        `
          )
          .get() as { count: number; total_bytes: number } | undefined
        summaryCount = sumRow?.count || 0
        summaryBytes = sumRow?.total_bytes || 0
      } catch {
        // Table might not exist yet
      }

      try {
        // 4. Chat History
        const chatRow = rawDb
          .prepare(
            `
          SELECT
            COUNT(m.id) as message_count,
            COALESCE(SUM(LENGTH(m.content)), 0) as message_bytes
          FROM chat_messages m
        `
          )
          .get() as { message_count: number; message_bytes: number } | undefined
        chatCount = chatRow?.message_count || 0
        chatBytes = chatRow?.message_bytes || 0
      } catch {
        // Table might not exist yet
      }
    }

    // 5. Temp extraction & whisper cache files in os temp dir
    try {
      const orbiaTempDir = path.join(os.tmpdir(), 'orbia-cache')
      if (fs.existsSync(orbiaTempDir)) {
        const files = fs.readdirSync(orbiaTempDir)
        for (const file of files) {
          const filePath = path.join(orbiaTempDir, file)
          const stats = fs.statSync(filePath)
          if (stats.isFile()) {
            tempFileCount++
            tempFileBytes += stats.size
          }
        }
      }
    } catch {
      // ignore
    }

    const categories: Record<AiStorageCategory, AiCategoryStorageStats> = {
      transcripts: {
        category: 'transcripts',
        itemCount: transcriptCount,
        sizeBytes: transcriptBytes,
        description: 'Transcrições de aulas e segmentos temporais'
      },
      semanticIndex: {
        category: 'semanticIndex',
        itemCount: semanticIndexCount,
        sizeBytes: semanticIndexBytes,
        description: 'Índice vetorial e chunks de busca semântica'
      },
      summaries: {
        category: 'summaries',
        itemCount: summaryCount,
        sizeBytes: summaryBytes,
        description: 'Sínteses estruturadas de aulas, módulos e cursos'
      },
      chatHistory: {
        category: 'chatHistory',
        itemCount: chatCount,
        sizeBytes: chatBytes,
        description: 'Histórico de conversas e mensagens fundamentadas'
      },
      tempFiles: {
        category: 'tempFiles',
        itemCount: tempFileCount,
        sizeBytes: tempFileBytes,
        description: 'Arquivos temporários de áudio e extração'
      }
    }

    const totalSizeBytes = Object.values(categories).reduce(
      (acc, cat) => acc + cat.sizeBytes,
      0
    )

    return {
      totalSizeBytes,
      categories
    }
  }

  public async clearCategory(category: AiStorageCategory): Promise<boolean> {
    const rawDb = this.db.getDatabase()
    if (!rawDb) throw new Error('Database is not connected to any vault')

    logger.info(`[AiStorageService] Clearing category: ${category}`)

    switch (category) {
      case 'transcripts': {
        rawDb.transaction(() => {
          rawDb.exec(
            `DELETE FROM transcript_segments; DELETE FROM transcripts;`
          )
        })()
        return true
      }

      case 'semanticIndex': {
        rawDb.transaction(() => {
          rawDb.exec(`
            DELETE FROM semantic_index_embeddings;
            DELETE FROM semantic_index_chunks;
            DELETE FROM semantic_index_generations;
          `)
        })()
        return true
      }

      case 'summaries': {
        rawDb.exec(`DELETE FROM ai_summaries;`)
        return true
      }

      case 'chatHistory': {
        rawDb.transaction(() => {
          rawDb.exec(`
            DELETE FROM chat_message_sources;
            DELETE FROM chat_messages;
            DELETE FROM chat_conversations;
          `)
        })()
        return true
      }

      case 'tempFiles': {
        try {
          const orbiaTempDir = path.join(os.tmpdir(), 'orbia-cache')
          if (fs.existsSync(orbiaTempDir)) {
            const files = fs.readdirSync(orbiaTempDir)
            for (const file of files) {
              const filePath = path.join(orbiaTempDir, file)
              try {
                fs.rmSync(filePath, { recursive: true, force: true })
              } catch {
                // ignore
              }
            }
          }
        } catch (err) {
          logger.warn('[AiStorageService] Failed to clear temp files:', err)
        }
        return true
      }

      default:
        throw new Error(`Unknown AI storage category: ${category}`)
    }
  }
}

export const aiStorageService = new AiStorageService()
