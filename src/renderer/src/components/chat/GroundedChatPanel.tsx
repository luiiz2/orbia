import { Loader2, Send, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { SourceNavigationTarget } from '@shared'
import {
  type GroundedChatContext,
  useGroundedChatStore
} from '../../stores/useGroundedChatStore'
import { ConversationList } from './ConversationList'
import { SourceEvidenceList } from './SourceEvidenceList'

export interface GroundedChatPanelProps {
  context?: GroundedChatContext
  onClose?: () => void
  onNavigate?: (target: SourceNavigationTarget) => void
}

export function GroundedChatPanel({
  context,
  onClose,
  onNavigate
}: GroundedChatPanelProps): React.JSX.Element {
  const [question, setQuestion] = useState('')
  const [lastQuestion, setLastQuestion] = useState('')
  const {
    isOpen,
    conversations,
    conversationId,
    messages,
    isLoading,
    error,
    coverage,
    open,
    close,
    loadConversations,
    loadConversation,
    ask,
    cancel,
    rename,
    deleteConversation,
    clearError
  } = useGroundedChatStore()

  useEffect(() => {
    if (context) {
      open(context)
    }
    void loadConversations()
  }, [context, loadConversations, open])

  const submit = async (): Promise<void> => {
    const value = question.trim()
    if (!value) return
    setLastQuestion(value)
    await ask(value)
    const latest = useGroundedChatStore.getState().messages.at(-1)
    if (!useGroundedChatStore.getState().error && latest?.status !== 'failed')
      setQuestion('')
  }

  const handleClose = (): void => {
    void cancel()
    close()
    onClose?.()
  }

  if (!isOpen) return <></>

  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant')
  const insufficient = lastAssistant?.status === 'insufficient_evidence'
  const failed = lastAssistant?.status === 'failed'

  return (
    <aside
      aria-label="Grounded chat"
      className="flex h-full min-h-0 flex-col border-l border-border bg-background"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border p-3">
        <div>
          <h2 className="text-sm font-semibold">Ask your library</h2>
          <p className="text-xs text-muted-foreground">
            Answers use indexed study content only
          </p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="rounded p-1.5 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Close grounded chat"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[10rem_minmax(0,1fr)]">
        <div className="min-h-0 border-r border-border p-2">
          <ConversationList
            conversations={conversations}
            activeConversationId={conversationId}
            onSelect={(id) => void loadConversation(id)}
            onRename={rename}
            onDelete={deleteConversation}
          />
        </div>

        <div className="flex min-h-0 flex-col">
          <div
            className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3"
            aria-live="polite"
            aria-busy={isLoading}
          >
            {messages.map((message) => (
              <article
                key={message.id}
                className={`rounded-lg p-2.5 text-sm ${message.role === 'user' ? 'ml-6 bg-primary text-primary-foreground' : 'mr-6 bg-secondary'}`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.status === 'insufficient_evidence' && (
                  <p role="status" className="mt-2 text-xs font-medium">
                    Insufficient indexed content to provide a grounded answer.
                  </p>
                )}
                {message.role === 'assistant' && (
                  <SourceEvidenceList
                    sources={message.sources}
                    onNavigate={onNavigate}
                  />
                )}
              </article>
            ))}
            {isLoading && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Searching indexed content…
              </p>
            )}
            {insufficient && coverage && (
              <p className="text-xs text-muted-foreground">
                Index coverage: {coverage.indexedSources} sources,{' '}
                {coverage.indexedChunks} chunks.
              </p>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="mx-3 mb-2 rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
            >
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!question.trim() || isLoading}
                className="mt-1 font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={clearError}
                className="ml-3 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Dismiss
              </button>
            </div>
          )}
          {failed && !error && (
            <div
              role="alert"
              className="mx-3 mb-2 rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
            >
              <p>This answer could not be generated.</p>
              <button
                type="button"
                onClick={() => void ask(question.trim() || lastQuestion)}
                disabled={isLoading || !(question.trim() || lastQuestion)}
                className="mt-1 font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Retry
              </button>
            </div>
          )}

          <form
            className="border-t border-border p-3"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <label
              htmlFor="grounded-chat-question"
              className="mb-1 block text-xs font-medium"
            >
              Question
            </label>
            <textarea
              id="grounded-chat-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={3}
              disabled={isLoading}
              className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
              placeholder="Ask about the indexed study material"
            />
            <div className="mt-2 flex justify-end gap-2">
              {isLoading && (
                <button
                  type="button"
                  onClick={() => void cancel()}
                  className="rounded px-3 py-1.5 text-xs font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={!question.trim() || isLoading}
                className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                Ask
              </button>
            </div>
          </form>
        </div>
      </div>
    </aside>
  )
}
