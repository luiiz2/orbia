import { Check, Pencil, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import type { ChatConversationSummary } from '@shared'

export interface ConversationListProps {
  conversations: ChatConversationSummary[]
  activeConversationId?: string
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
}

export function ConversationList({
  conversations,
  activeConversationId,
  onSelect,
  onRename,
  onDelete
}: ConversationListProps): React.JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')

  const startRename = (conversation: ChatConversationSummary): void => {
    setEditingId(conversation.id)
    setTitle(conversation.title)
  }

  const saveRename = async (): Promise<void> => {
    if (!editingId || !(await onRename(editingId, title))) return
    setEditingId(null)
  }

  return (
    <nav aria-label="Conversations" className="min-h-0 overflow-y-auto">
      <ul className="space-y-1">
        {conversations.map((conversation) => (
          <li key={conversation.id} className="flex items-center gap-1">
            {editingId === conversation.id ? (
              <>
                <label
                  className="sr-only"
                  htmlFor={`conversation-title-${conversation.id}`}
                >
                  Conversation title
                </label>
                <input
                  id={`conversation-title-${conversation.id}`}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void saveRename()
                    if (event.key === 'Escape') setEditingId(null)
                  }}
                  className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => void saveRename()}
                  className="rounded p-1 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Save conversation title"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="rounded p-1 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Cancel renaming conversation"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onSelect(conversation.id)}
                  aria-current={
                    conversation.id === activeConversationId
                      ? 'page'
                      : undefined
                  }
                  className="min-w-0 flex-1 rounded px-2 py-1.5 text-left text-xs hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary aria-[current=page]:bg-secondary"
                >
                  <span className="block break-words whitespace-normal leading-snug">
                    {conversation.title}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => startRename(conversation)}
                  className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={`Rename ${conversation.title}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void onDelete(conversation.id)}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={`Delete ${conversation.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
