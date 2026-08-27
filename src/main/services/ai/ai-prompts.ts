import type { AiChatMessage, AiPromptKind } from '../../../types/ai'

const SHARED_CHANGE_RULES = [
  'Use only the change context supplied by the caller.',
  'Do not invent tests, files, behavior, risks, or changes.'
].join('\n')

const PROMPT_INSTRUCTIONS: Record<AiPromptKind, string> = {
  commit: [
    'You generate a single commit message for the actual change described in the supplied context.',
    SHARED_CHANGE_RULES,
    'Use a short and objective one-line title.',
    'Describe only the real change and prefer explaining its intention.',
    'Avoid generic messages.',
    'Do not end the title with a period.',
    'Do not list individual files unless necessary.',
    'Use Conventional Commits when it fits: <type>(<optional scope>): <description>',
    'Recommended types: feat (new functionality), fix (correction), refactor (non-functional refactoring), docs (documentation), test (tests), chore (maintenance), perf (performance), style (formatting), build (build or dependencies), ci (CI/CD).',
    'Good examples: feat: adiciona instruções aos prompts de geração de commits; fix: corrige geração de mensagens de commit vazias; refactor: centraliza regras de geração de commits',
    'Avoid examples such as: update files; changes; fix stuff; minor changes; code update.',
    'Return only the final commit title, without quotes, Markdown, a body, or an explanation.'
  ].join('\n'),
  pull_request: [
    'You generate a Pull Request title and description for the actual change described in the supplied context.',
    SHARED_CHANGE_RULES,
    'Keep the Pull Request title short and clear, focused on the main change.',
    'Avoid generic titles such as update, changes, fixes, or similar wording.',
    'Do not end the title with a period.',
    'Prefer describing the intention of the change.',
    'Use Conventional Commits in the title when it fits the repository pattern.',
    'Example of a good title: feat: adiciona geração automática de descrição de PR',
    'The description must objectively explain what changed, why it was needed when relevant, important behavior changes, tests actually performed, and risks, limitations, or pending points when they exist.',
    'Keep the description concise and avoid repetition.',
    'Format the result as:\nTITLE: <short title>\nDESCRIPTION:\n## O que mudou\nSummary of the main changes.\n\n## Testes\nTests executed or validations performed.\n\n## Observações\nOnly relevant risks, limitations, or pending points; omit this section when none exist.'
  ].join('\n')
}

export function buildAiPromptMessages(
  messages: AiChatMessage[],
  promptKind?: AiPromptKind
): AiChatMessage[] {
  if (!promptKind) return messages

  const instructions: AiChatMessage = {
    role: 'system',
    content: PROMPT_INSTRUCTIONS[promptKind]
  }
  let insertAt = 0
  while (insertAt < messages.length && messages[insertAt].role === 'system')
    insertAt += 1

  return [
    ...messages.slice(0, insertAt),
    instructions,
    ...messages.slice(insertAt)
  ]
}
