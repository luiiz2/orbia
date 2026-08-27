import { describe, expect, it } from 'vitest'
import type { AiChatMessage } from '../src/types/ai'
import { buildAiPromptMessages } from '../src/main/services/ai/ai-prompts'

const existingMessages: AiChatMessage[] = [
  {
    role: 'system',
    content: 'Use the repository context supplied by the caller.'
  },
  { role: 'user', content: 'Describe the staged change.' }
]

describe('AI change-description prompts', () => {
  it('adds grounded Conventional Commit instructions after existing system context', () => {
    const result = buildAiPromptMessages(existingMessages, 'commit')

    expect(result).toHaveLength(3)
    expect(result[0]).toEqual(existingMessages[0])
    expect(result[1]).toMatchObject({ role: 'system' })
    expect(result[1].content).toContain('Use Conventional Commits when it fits')
    expect(result[1].content).toContain('Do not end the title with a period')
    expect(result[1].content).toContain('Describe only the real change')
    expect(result[1].content).toContain('Avoid generic messages')
    expect(result[2]).toEqual(existingMessages[1])
  })

  it('adds concise Pull Request title and description instructions', () => {
    const result = buildAiPromptMessages(existingMessages, 'pull_request')
    const instructions = result[1].content

    expect(instructions).toContain(
      'Keep the Pull Request title short and clear'
    )
    expect(instructions).toContain('## O que mudou')
    expect(instructions).toContain('## Testes')
    expect(instructions).toContain('## Observações')
    expect(instructions).toContain(
      'Do not invent tests, files, behavior, risks, or changes'
    )
  })

  it('leaves ordinary chat messages unchanged when no prompt kind is requested', () => {
    expect(buildAiPromptMessages(existingMessages)).toBe(existingMessages)
  })
})
