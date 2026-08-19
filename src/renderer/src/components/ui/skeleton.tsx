import * as React from 'react'
import { cn } from '../../lib/utils'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  shimmer?: boolean
}

function Skeleton({
  className,
  shimmer = true,
  ...props
}: SkeletonProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'rounded-xl bg-muted/70 border border-border/40',
        shimmer && 'animate-shimmer',
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
