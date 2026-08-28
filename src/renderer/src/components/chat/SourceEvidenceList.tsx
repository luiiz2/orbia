import { ExternalLink } from 'lucide-react'
import { useState } from 'react'
import type { ChatMessageSource, SourceNavigationTarget } from '@shared'
import { useGroundedChatStore } from '../../stores/useGroundedChatStore'

export interface SourceEvidenceListProps {
  sources: ChatMessageSource[]
  onNavigate?: (target: SourceNavigationTarget) => void
}

export function SourceEvidenceList({
  sources,
  onNavigate
}: SourceEvidenceListProps): React.JSX.Element | null {
  const resolveSource = useGroundedChatStore((state) => state.resolveSource)
  const [unavailable, setUnavailable] = useState<Record<string, string>>({})

  if (sources.length === 0) return null

  const handleSource = async (source: ChatMessageSource): Promise<void> => {
    try {
      const result = await resolveSource({ sourceId: source.id })
      if (result.status === 'ok') {
        onNavigate?.(result.target)
        return
      }
      setUnavailable((current) => ({ ...current, [source.id]: result.reason }))
    } catch {
      setUnavailable((current) => ({
        ...current,
        [source.id]: 'Source is unavailable'
      }))
    }
  }

  return (
    <section aria-label="Sources used" className="mt-2 space-y-1.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Sources used
      </h4>
      <ul className="space-y-1">
        {sources.map((source) => (
          <li key={source.id} className="text-xs">
            <button
              type="button"
              onClick={() => void handleSource(source)}
              className="inline-flex items-center gap-1 rounded text-left text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
              {source.displayLabel}
            </button>
            {unavailable[source.id] && (
              <p role="status" className="mt-1 text-muted-foreground">
                {unavailable[source.id]}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
