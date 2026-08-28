import React from 'react'
import type { LucideIcon } from 'lucide-react'
import { Button } from './button'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  actionIcon?: LucideIcon
  secondaryActionLabel?: string
  onSecondaryAction?: () => void
  shortcutHint?: string
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon: ActionIcon,
  secondaryActionLabel,
  onSecondaryAction,
  shortcutHint,
  className = ''
}: EmptyStateProps): React.JSX.Element {
  return (
    <div
      className={`mx-auto flex max-w-md flex-col items-center justify-center p-8 text-center animate-in fade-in duration-200 ${className}`}
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-border/80 bg-secondary/40 text-primary shadow-inner">
        <Icon className="h-7 w-7 opacity-95 stroke-[1.75]" />
      </div>

      <div className="mt-4 space-y-1.5">
        <h3 className="text-base font-bold text-foreground tracking-tight">
          {title}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-sm mx-auto">
          {description}
        </p>
      </div>

      {(actionLabel || secondaryActionLabel) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          {actionLabel && onAction && (
            <Button
              onClick={onAction}
              variant="default"
              size="sm"
              className="rounded-xl font-semibold shadow-md shadow-primary/10 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              {ActionIcon && <ActionIcon className="mr-1.5 h-4 w-4" />}
              {actionLabel}
              {shortcutHint && (
                <kbd className="ml-2 hidden rounded-md bg-primary-foreground/20 px-1.5 py-0.5 text-[10px] font-mono text-primary-foreground sm:inline-block">
                  {shortcutHint}
                </kbd>
              )}
            </Button>
          )}

          {secondaryActionLabel && onSecondaryAction && (
            <Button
              onClick={onSecondaryAction}
              variant="outline"
              size="sm"
              className="rounded-xl transition-all hover:bg-secondary/60"
            >
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
