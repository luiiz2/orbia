import crypto from 'node:crypto'
import type Database from 'better-sqlite3'
import type { AiProviderId } from '../../../types/ai'
import type {
  ChatConversation,
  ChatConversationSummary,
  ChatMessage,
  ChatMessageSource,
  GroundedChatStatus
} from '../../../types/grounded-chat'
import type { GroundedScope } from '../../../types/retrieval'
import type {
  SemanticChunkLocator,
  SemanticSourceKind
} from '../../../types/semantic-index'
import { databaseService, type DatabaseService } from '../database.service'

export interface AppendUserMessageInput {
  content: string
  scope: GroundedScope
}

export type ChatMessageSourceInput = Omit<
  ChatMessageSource,
  'id' | 'messageId' | 'ordinal'
>

export interface AppendAssistantMessageInput {
  content: string
  status: GroundedChatStatus
  providerId?: AiProviderId
  modelId?: string
  sources: ChatMessageSourceInput[]
}

export interface ChatRepositoryDependencies {
  databaseService?: DatabaseService
  now?: () => number
  createId?: () => string
}

interface ConversationRow {
  id: string
  title: string
  created_at: number
  updated_at: number
  message_count?: number
}

interface MessageRow {
  id: string
  conversation_id: string
  role: ChatMessage['role']
  content: string
  scope_json: string | null
  status: GroundedChatStatus | null
  provider_id: AiProviderId | null
  model_id: string | null
  created_at: number
}

interface MessageSourceRow {
  id: string
  message_id: string
  ordinal: number
  chunk_id: string
  source_kind: SemanticSourceKind
  source_id: string
  course_id: string
  module_id: string | null
  lesson_id: string | null
  resource_id: string | null
  transcript_id: string | null
  note_id: string | null
  source_revision: string
  locator_json: string
  display_label: string
}

export class ChatRepository {
  private readonly databaseService: DatabaseService
  private readonly now: () => number
  private readonly createId: () => string
  private lastTimestamp = 0

  public constructor(
    dependencies: ChatRepositoryDependencies | DatabaseService = {}
  ) {
    if (isDatabaseService(dependencies)) {
      this.databaseService = dependencies
      this.now = Date.now
      this.createId = crypto.randomUUID
      return
    }
    this.databaseService = dependencies.databaseService ?? databaseService
    this.now = dependencies.now ?? Date.now
    this.createId = dependencies.createId ?? crypto.randomUUID
  }

  public createConversation(title = 'New conversation'): ChatConversation {
    const normalizedTitle = requireText(title, 'Conversation title')
    const db = this.requireDatabase()
    const now = this.nextTimestamp()
    const id = this.createId()
    db.prepare(
      `INSERT INTO chat_conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`
    ).run(id, normalizedTitle, now, now)
    return {
      id,
      title: normalizedTitle,
      messages: [],
      createdAt: now,
      updatedAt: now
    }
  }

  public listConversations(): ChatConversationSummary[] {
    const rows = this.requireDatabase()
      .prepare(
        `
      SELECT c.id, c.title, c.created_at, c.updated_at, COUNT(m.id) AS message_count
      FROM chat_conversations c
      LEFT JOIN chat_messages m ON m.conversation_id = c.id
      GROUP BY c.id
      ORDER BY c.updated_at DESC, c.id DESC
    `
      )
      .all() as ConversationRow[]
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      messageCount: row.message_count ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
  }

  public getConversation(id: string): ChatConversation | null {
    if (!isIdentifier(id)) return null
    const db = this.requireDatabase()
    const row = db
      .prepare(
        `SELECT id, title, created_at, updated_at FROM chat_conversations WHERE id = ?`
      )
      .get(id) as ConversationRow | undefined
    if (!row) return null
    return {
      id: row.id,
      title: row.title,
      messages: this.listMessages(row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  public renameConversation(id: string, title: string): boolean {
    if (!isIdentifier(id)) return false
    const normalizedTitle = requireText(title, 'Conversation title')
    const result = this.requireDatabase()
      .prepare(
        `UPDATE chat_conversations SET title = ?, updated_at = ? WHERE id = ?`
      )
      .run(normalizedTitle, this.nextTimestamp(), id)
    return result.changes > 0
  }

  public deleteConversation(id: string): boolean {
    if (!isIdentifier(id)) return false
    return (
      this.requireDatabase()
        .prepare(`DELETE FROM chat_conversations WHERE id = ?`)
        .run(id).changes > 0
    )
  }

  public appendUserMessage(
    conversationId: string,
    input: AppendUserMessageInput
  ): ChatMessage {
    const content = requireText(input?.content, 'Message content')
    if (!input?.scope || typeof input.scope !== 'object')
      throw new Error('Message scope is required')
    return this.insertMessage(conversationId, {
      role: 'user',
      content,
      scope: input.scope,
      sources: []
    })
  }

  public appendAssistantMessage(
    conversationId: string,
    input: AppendAssistantMessageInput
  ): ChatMessage {
    const content = requireText(input?.content, 'Message content')
    if (!isGroundedChatStatus(input?.status))
      throw new Error('Assistant message status is invalid')
    if (!Array.isArray(input.sources))
      throw new Error('Assistant message sources are invalid')
    input.sources.forEach(validateSourceInput)
    return this.insertMessage(conversationId, {
      role: 'assistant',
      content,
      status: input.status,
      providerId: input.providerId,
      modelId: input.modelId,
      sources: input.sources
    })
  }

  public getRecentMessages(
    conversationId: string,
    maxMessages: number,
    maxCharacters: number
  ): ChatMessage[] {
    if (!isIdentifier(conversationId) || maxMessages <= 0 || maxCharacters <= 0)
      return []
    const messageLimit = Math.floor(maxMessages)
    const characterLimit = Math.floor(maxCharacters)
    if (!Number.isFinite(messageLimit) || !Number.isFinite(characterLimit))
      return []

    const rows = this.requireDatabase()
      .prepare(
        `
      SELECT id, conversation_id, role, content, scope_json, status, provider_id, model_id, created_at
      FROM chat_messages
      WHERE conversation_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `
      )
      .all(conversationId, messageLimit) as MessageRow[]
    const messages: ChatMessage[] = []
    let characters = 0
    for (const row of rows) {
      if (characters + row.content.length > characterLimit) break
      messages.push(this.mapMessage(row))
      characters += row.content.length
    }
    return messages.reverse()
  }

  public getMessageSource(id: string): ChatMessageSource | null {
    if (!isIdentifier(id)) return null
    const row = this.requireDatabase()
      .prepare(
        `
      SELECT id, message_id, ordinal, chunk_id, source_kind, source_id, course_id,
             module_id, lesson_id, resource_id, transcript_id, note_id, source_revision,
             locator_json, display_label
      FROM chat_message_sources WHERE id = ?
    `
      )
      .get(id) as MessageSourceRow | undefined
    return row ? mapMessageSource(row) : null
  }

  private insertMessage(
    conversationId: string,
    input: {
      role: ChatMessage['role']
      content: string
      scope?: GroundedScope
      status?: GroundedChatStatus
      providerId?: AiProviderId
      modelId?: string
      sources: ChatMessageSourceInput[]
    }
  ): ChatMessage {
    if (!isIdentifier(conversationId))
      throw new Error('Conversation ID is required')
    const db = this.requireDatabase()
    const conversation = db
      .prepare(`SELECT id FROM chat_conversations WHERE id = ?`)
      .get(conversationId)
    if (!conversation) throw new Error('Conversation not found')

    const id = this.createId()
    const createdAt = this.nextTimestamp()
    db.transaction(() => {
      db.prepare(
        `
        INSERT INTO chat_messages (
          id, conversation_id, role, content, scope_json, status, provider_id, model_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        id,
        conversationId,
        input.role,
        input.content,
        input.scope ? JSON.stringify(input.scope) : null,
        input.status ?? null,
        input.providerId ?? null,
        input.modelId ?? null,
        createdAt
      )
      const insertSource = db.prepare(`
        INSERT INTO chat_message_sources (
          id, message_id, ordinal, chunk_id, source_kind, source_id, course_id,
          module_id, lesson_id, resource_id, transcript_id, note_id, source_revision,
          locator_json, display_label, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      input.sources.forEach((source, ordinal) => {
        insertSource.run(
          this.createId(),
          id,
          ordinal,
          source.chunkId,
          source.sourceKind,
          source.sourceId,
          source.courseId,
          source.moduleId ?? null,
          source.lessonId ?? null,
          source.resourceId ?? null,
          source.transcriptId ?? null,
          source.noteId ?? null,
          source.sourceRevision,
          JSON.stringify(source.locator),
          source.displayLabel,
          createdAt
        )
      })
      db.prepare(
        `UPDATE chat_conversations SET updated_at = ? WHERE id = ?`
      ).run(createdAt, conversationId)
    })()

    return this.listMessages(conversationId).find(
      (message) => message.id === id
    )!
  }

  private listMessages(conversationId: string): ChatMessage[] {
    const rows = this.requireDatabase()
      .prepare(
        `
      SELECT id, conversation_id, role, content, scope_json, status, provider_id, model_id, created_at
      FROM chat_messages
      WHERE conversation_id = ?
      ORDER BY created_at, id
    `
      )
      .all(conversationId) as MessageRow[]
    return rows.map((row) => this.mapMessage(row))
  }

  private mapMessage(row: MessageRow): ChatMessage {
    const sources = this.requireDatabase()
      .prepare(
        `
      SELECT id, message_id, ordinal, chunk_id, source_kind, source_id, course_id,
             module_id, lesson_id, resource_id, transcript_id, note_id, source_revision,
             locator_json, display_label
      FROM chat_message_sources
      WHERE message_id = ?
      ORDER BY ordinal
    `
      )
      .all(row.id) as MessageSourceRow[]
    const scope = parseScope(row.scope_json)
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      ...(scope ? { scope } : {}),
      ...(row.status ? { status: row.status } : {}),
      ...(row.provider_id ? { providerId: row.provider_id } : {}),
      ...(row.model_id ? { modelId: row.model_id } : {}),
      sources: sources.map(mapMessageSource),
      createdAt: row.created_at
    }
  }

  private requireDatabase(): Database.Database {
    const db = this.databaseService.getDatabase()
    if (!db) throw new Error('Database is not connected to any vault.')
    return db
  }

  private nextTimestamp(): number {
    const requested = this.now()
    const clock = Number.isFinite(requested)
      ? Math.floor(requested)
      : Date.now()
    const row = this.databaseService
      .getDatabase()
      ?.prepare(
        `
      SELECT MAX(updated_at) AS max_timestamp FROM chat_conversations
    `
      )
      .get() as { max_timestamp: number | null } | undefined
    const persisted = row?.max_timestamp ?? 0
    const timestamp = Math.max(clock, this.lastTimestamp + 1, persisted + 1)
    this.lastTimestamp = timestamp
    return timestamp
  }
}

export const chatRepository = new ChatRepository(databaseService)

function mapMessageSource(row: MessageSourceRow): ChatMessageSource {
  return {
    id: row.id,
    messageId: row.message_id,
    ordinal: row.ordinal,
    chunkId: row.chunk_id,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    courseId: row.course_id,
    ...(row.module_id ? { moduleId: row.module_id } : {}),
    ...(row.lesson_id ? { lessonId: row.lesson_id } : {}),
    ...(row.resource_id ? { resourceId: row.resource_id } : {}),
    ...(row.transcript_id ? { transcriptId: row.transcript_id } : {}),
    ...(row.note_id ? { noteId: row.note_id } : {}),
    sourceRevision: row.source_revision,
    locator: parseLocator(row.locator_json),
    displayLabel: row.display_label
  }
}

function parseScope(value: string | null): GroundedScope | undefined {
  if (!value) return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as GroundedScope)
      : undefined
  } catch {
    return undefined
  }
}

function parseLocator(value: string): SemanticChunkLocator {
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as SemanticChunkLocator)
      : {}
  } catch {
    return {}
  }
}

function validateSourceInput(source: ChatMessageSourceInput): void {
  if (!source || typeof source !== 'object')
    throw new Error('Source snapshot is invalid')
  requireText(source.chunkId, 'Source chunk ID')
  requireText(source.sourceId, 'Source ID')
  requireText(source.courseId, 'Source course ID')
  requireText(source.sourceRevision, 'Source revision')
  requireText(source.displayLabel, 'Source display label')
  if (!isSourceKind(source.sourceKind))
    throw new Error('Source kind is invalid')
  if (
    !source.locator ||
    typeof source.locator !== 'object' ||
    Array.isArray(source.locator)
  ) {
    throw new Error('Source locator is invalid')
  }
}

function requireText(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new Error(`${name} is required`)
  return value.trim()
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isGroundedChatStatus(value: unknown): value is GroundedChatStatus {
  return (
    value === 'answered' ||
    value === 'insufficient_evidence' ||
    value === 'failed' ||
    value === 'cancelled'
  )
}

function isSourceKind(value: unknown): value is SemanticSourceKind {
  return (
    value === 'transcript' ||
    value === 'subtitle' ||
    value === 'pdf' ||
    value === 'markdown' ||
    value === 'text' ||
    value === 'code' ||
    value === 'note' ||
    value === 'metadata'
  )
}

function isDatabaseService(
  value: ChatRepositoryDependencies | DatabaseService
): value is DatabaseService {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as { getDatabase?: unknown }).getDatabase === 'function'
  )
}
