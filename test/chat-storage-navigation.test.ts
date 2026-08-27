import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseService } from '../src/main/services/database.service'
import {
  ChatRepository,
  type ChatMessageSourceInput
} from '../src/main/services/chat/chat-repository.service'
import { SourceNavigationService } from '../src/main/services/chat/source-navigation.service'

describe('grounded chat storage and source navigation', () => {
  let tempDir: string
  let vaultDir: string
  let database: DatabaseService
  let repository: ChatRepository
  let navigation: SourceNavigationService

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-chat-storage-'))
    vaultDir = path.join(tempDir, 'vault')
    fs.mkdirSync(vaultDir, { recursive: true })
    database = new DatabaseService()
    database.connect(vaultDir)

    const db = database.getDatabase()!
    db.prepare(`INSERT INTO courses (id, title, slug, source_type, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'course-1', 'Course', 'course', 'managed', vaultDir, 1, 1
    )
    db.prepare(`INSERT INTO modules (id, course_id, title, order_index, duration, lesson_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'module-1', 'course-1', 'Module', 1, 60, 1, 1
    )
    db.prepare(`INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'lesson-1', 'module-1', 'course-1', 'Lesson', 1, path.join(vaultDir, 'lesson.mp4'), 'lesson.mp4', '.mp4', 'video', 60, 5, 1
    )
    db.prepare(`INSERT INTO transcripts (id, lesson_id, version, language, provider, created_at, source_revision, settings_json, status, is_current) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'transcript-1', 'lesson-1', 1, 'pt-BR', 'subtitle', 1, 'revision-1', '{}', 'completed', 1
    )
    db.prepare(`INSERT INTO content_resources (id, course_id, module_id, lesson_id, role, name, file_path, file_extension, resource_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'resource-material-1', 'course-1', 'module-1', null, 'resource', 'Reading', path.join(vaultDir, 'reading.md'), '.md', 'document', 1
    )
    db.prepare(`INSERT INTO content_resources (id, course_id, module_id, lesson_id, role, name, file_path, file_extension, resource_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'resource-pdf-1', 'course-1', 'module-1', 'lesson-1', 'resource', 'Slides', path.join(vaultDir, 'slides.pdf'), '.pdf', 'pdf', 1
    )
    db.prepare(`INSERT INTO content_resources (id, course_id, module_id, lesson_id, role, name, file_path, file_extension, resource_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'resource-subtitle-1', 'course-1', 'module-1', 'lesson-1', 'subtitle', 'Captions', path.join(vaultDir, 'captions.vtt'), '.vtt', 'subtitle', 1
    )
    db.prepare(`INSERT INTO lesson_notes (id, lesson_id, course_id, timestamp_seconds, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'note-1', 'lesson-1', 'course-1', 12, 'A timestamped note', 1, 1
    )
    db.prepare(`INSERT INTO courses (id, title, slug, source_type, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'course-2', 'Other Course', 'other-course', 'managed', vaultDir, 1, 1
    )
    db.prepare(`INSERT INTO modules (id, course_id, title, order_index, duration, lesson_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'module-2', 'course-2', 'Other Module', 1, 60, 1, 1
    )
    db.prepare(`INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'lesson-2', 'module-2', 'course-2', 'Other Lesson', 1, path.join(vaultDir, 'other.mp4'), 'other.mp4', '.mp4', 'video', 60, 5, 1
    )

    repository = new ChatRepository(database)
    navigation = new SourceNavigationService(database, repository)
  })

  afterEach(() => {
    database.close()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('persists an evidence snapshot and resolves its live lesson timestamp', () => {
    const conversation = repository.createConversation('Study session')
    const sourceSnapshot: ChatMessageSourceInput = {
      chunkId: 'chunk-1',
      sourceKind: 'transcript',
      sourceId: 'lesson:lesson-1:transcript',
      courseId: 'course-1',
      lessonId: 'lesson-1',
      transcriptId: 'transcript-1',
      sourceRevision: 'revision-1',
      locator: { startTime: 42, endTime: 49 },
      displayLabel: 'Lesson 1 · 00:42–00:49'
    }
    const message = repository.appendAssistantMessage(conversation.id, {
      content: 'The indexed lesson explains it as...',
      status: 'answered',
      sources: [sourceSnapshot]
    })
    const source = message.sources[0]

    expect(repository.getConversation(conversation.id)?.messages.at(-1)).toMatchObject({
      id: message.id,
      sources: [{ chunkId: 'chunk-1', sourceRevision: 'revision-1' }]
    })
    expect(navigation.resolve({ sourceId: source.id })).toEqual({
      status: 'ok',
      target: { type: 'lesson', courseId: 'course-1', lessonId: 'lesson-1', timestampSeconds: 42 }
    })
  })

  it('lists, reloads, renames and deletes local conversations with their bounded snapshots', () => {
    const conversation = repository.createConversation('Study session')
    repository.appendUserMessage(conversation.id, {
      content: 'What is dependency injection?',
      scope: { type: 'course', courseId: 'course-1' }
    })
    const assistant = repository.appendAssistantMessage(conversation.id, {
      content: 'The indexed lesson explains it as...',
      status: 'answered',
      providerId: 'ollama',
      modelId: 'local-chat',
      sources: [makeSource({ lessonId: 'lesson-1', transcriptId: 'transcript-1' })]
    })

    expect(repository.listConversations()).toEqual([{
      id: conversation.id,
      title: 'Study session',
      messageCount: 2,
      createdAt: conversation.createdAt,
      updatedAt: expect.any(Number)
    }])
    expect(repository.renameConversation(conversation.id, 'DI review')).toBe(true)

    database.close()
    database = new DatabaseService()
    database.connect(vaultDir)
    repository = new ChatRepository(database)
    expect(repository.getConversation(conversation.id)).toMatchObject({
      id: conversation.id,
      title: 'DI review',
      messages: [
        { role: 'user', content: 'What is dependency injection?', sources: [] },
        { id: assistant.id, role: 'assistant', providerId: 'ollama', modelId: 'local-chat', sources: [
          { chunkId: 'chunk-1', sourceRevision: 'revision-1', displayLabel: 'Lesson 1 · 00:42–00:49' }
        ] }
      ]
    })
    expect(repository.getConversation(conversation.id)?.messages[1].sources[0]).not.toHaveProperty('text')
    expect(repository.deleteConversation(conversation.id)).toBe(true)
    expect(repository.getConversation(conversation.id)).toBeNull()
    expect(repository.listConversations()).toEqual([])
  })

  it('keeps only the newest messages within message and character limits in chronological order', () => {
    const conversation = repository.createConversation()
    repository.appendUserMessage(conversation.id, { content: 'first', scope: { type: 'course', courseId: 'course-1' } })
    repository.appendUserMessage(conversation.id, { content: 'second', scope: { type: 'course', courseId: 'course-1' } })
    repository.appendUserMessage(conversation.id, { content: 'third', scope: { type: 'course', courseId: 'course-1' } })

    expect(repository.getRecentMessages(conversation.id, 2, 20).map((message) => message.content)).toEqual(['second', 'third'])
    expect(repository.getRecentMessages(conversation.id, 3, 11).map((message) => message.content)).toEqual(['second', 'third'])
  })

  it('preserves insertion order when several messages share the same clock tick', () => {
    const ids = ['z-conversation', 'z-first', 'a-second', 'm-third']
    const orderedRepository = new ChatRepository({
      databaseService: database,
      now: () => 100,
      createId: () => ids.shift()!
    })
    const conversation = orderedRepository.createConversation()
    orderedRepository.appendUserMessage(conversation.id, { content: 'first', scope: { type: 'course', courseId: 'course-1' } })
    orderedRepository.appendUserMessage(conversation.id, { content: 'second', scope: { type: 'course', courseId: 'course-1' } })
    orderedRepository.appendUserMessage(conversation.id, { content: 'third', scope: { type: 'course', courseId: 'course-1' } })

    expect(orderedRepository.getRecentMessages(conversation.id, 2, 20).map((message) => message.content)).toEqual(['second', 'third'])
  })

  it('rejects invalid write identifiers and source snapshots before creating rows', () => {
    expect(() => repository.createConversation('   ')).toThrow('Conversation title')
    expect(repository.renameConversation('missing-conversation', 'Renamed')).toBe(false)
    expect(() => repository.appendUserMessage('missing-conversation', {
      content: 'Question',
      scope: { type: 'course', courseId: 'course-1' }
    })).toThrow('Conversation not found')

    const conversation = repository.createConversation()
    expect(() => repository.appendAssistantMessage(conversation.id, {
      content: 'Answer',
      status: 'answered',
      sources: [makeSource({ chunkId: ' ' })]
    })).toThrow('Source chunk ID')
    expect(repository.getConversation(conversation.id)?.messages).toEqual([])
  })

  it('resolves live material and PDF targets using canonical IDs only', () => {
    const subtitleSource = persistSource(makeSource({
      sourceKind: 'subtitle',
      sourceId: 'lesson:lesson-1:subtitle',
      resourceId: 'resource-subtitle-1',
      transcriptId: undefined,
      locator: { startTime: 10, endTime: 12 },
      displayLabel: 'Captions · 00:10–00:12'
    }))
    const materialSource = persistSource(makeSource({
      sourceKind: 'markdown',
      sourceId: 'resource:resource-material-1',
      resourceId: 'resource-material-1',
      lessonId: undefined,
      transcriptId: undefined,
      locator: { fileName: 'reading.md' },
      displayLabel: 'Reading'
    }))
    const noteSource = persistSource(makeSource({
      sourceKind: 'note',
      sourceId: 'note:note-1',
      resourceId: undefined,
      transcriptId: undefined,
      noteId: 'note-1',
      locator: { noteId: 'note-1', startTime: 12, endTime: 12 },
      displayLabel: 'Note · 00:12'
    }))
    const pdfSource = persistSource(makeSource({
      sourceKind: 'pdf',
      sourceId: 'resource:resource-pdf-1',
      resourceId: 'resource-pdf-1',
      locator: { page: 3 },
      displayLabel: 'Slides · page 3'
    }))

    expect(navigation.resolve({ sourceId: materialSource.id })).toEqual({
      status: 'ok',
      target: { type: 'resource', courseId: 'course-1', moduleId: 'module-1', resourceId: 'resource-material-1' }
    })
    expect(navigation.resolve({ sourceId: subtitleSource.id })).toEqual({
      status: 'ok',
      target: { type: 'lesson', courseId: 'course-1', lessonId: 'lesson-1', timestampSeconds: 10 }
    })
    expect(navigation.resolve({ sourceId: noteSource.id })).toEqual({
      status: 'ok',
      target: { type: 'lesson', courseId: 'course-1', lessonId: 'lesson-1', timestampSeconds: 12 }
    })
    expect(navigation.resolve({ sourceId: pdfSource.id })).toEqual({
      status: 'ok',
      target: {
        type: 'resource',
        courseId: 'course-1',
        moduleId: 'module-1',
        lessonId: 'lesson-1',
        resourceId: 'resource-pdf-1',
        page: 3
      }
    })
    const fractionalPdfSource = persistSource(makeSource({
      sourceKind: 'pdf',
      sourceId: 'resource:resource-pdf-1:fractional',
      resourceId: 'resource-pdf-1',
      locator: { page: 0.5 },
      displayLabel: 'Slides · invalid page'
    }))
    expect(navigation.resolve({ sourceId: fractionalPdfSource.id })).toMatchObject({ status: 'unavailable' })
    expect(navigation.resolve({ sourceId: 'model-invented-source' })).toMatchObject({ status: 'unavailable' })
  })

  it('rejects evidence whose entire timestamp interval is after the live lesson duration', () => {
    const source = persistSource(makeSource())
    database.getDatabase()!.prepare(`UPDATE lessons SET duration = ? WHERE id = ?`).run(40, 'lesson-1')

    expect(navigation.resolve({ sourceId: source.id })).toEqual({
      status: 'unavailable',
      reason: 'Transcript locator is invalid'
    })
  })

  it('rejects deleted, mismatched and invalid targets while preserving lesson identity after a path move', () => {
    const lessonSource = persistSource(makeSource({ lessonId: 'lesson-1', transcriptId: 'transcript-1' }))
    expect(navigation.resolve({ sourceId: lessonSource.id })).toMatchObject({
      status: 'ok',
      target: { type: 'lesson', courseId: 'course-1', lessonId: 'lesson-1', timestampSeconds: 42 }
    })

    database.getDatabase()!.prepare(`UPDATE lessons SET file_path = ?, file_name = ? WHERE id = ?`).run(
      path.join(vaultDir, 'moved-lesson.mp4'), 'moved-lesson.mp4', 'lesson-1'
    )
    expect(navigation.resolve({ sourceId: lessonSource.id })).toMatchObject({
      status: 'ok',
      target: { type: 'lesson', courseId: 'course-1', lessonId: 'lesson-1' }
    })

    const mismatchedSource = persistSource(makeSource({
      sourceId: 'lesson:lesson-2:transcript',
      lessonId: 'lesson-2',
      transcriptId: undefined
    }))
    expect(navigation.resolve({ sourceId: mismatchedSource.id })).toMatchObject({ status: 'unavailable' })
    expect(navigation.resolve({ sourceId: '' })).toMatchObject({ status: 'unavailable' })

    database.getDatabase()!.prepare(`DELETE FROM lessons WHERE id = ?`).run('lesson-1')
    expect(navigation.resolve({ sourceId: lessonSource.id })).toMatchObject({ status: 'unavailable' })
  })

  function persistSource(source: ChatMessageSourceInput) {
    const conversation = repository.createConversation()
    return repository.appendAssistantMessage(conversation.id, {
      content: 'Grounded answer',
      status: 'answered',
      sources: [source]
    }).sources[0]
  }

  function makeSource(overrides: Partial<ChatMessageSourceInput> = {}): ChatMessageSourceInput {
    return {
      chunkId: 'chunk-1',
      sourceKind: 'transcript',
      sourceId: 'lesson:lesson-1:transcript',
      courseId: 'course-1',
      moduleId: 'module-1',
      lessonId: 'lesson-1',
      transcriptId: 'transcript-1',
      sourceRevision: 'revision-1',
      locator: { startTime: 42, endTime: 49 },
      displayLabel: 'Lesson 1 · 00:42–00:49',
      ...overrides
    }
  }
})
