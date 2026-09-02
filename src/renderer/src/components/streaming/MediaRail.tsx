import React, { useRef, useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react'
import { Button } from '../ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'

export interface MediaRailProps {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  count?: number
  viewAllAction?: () => void
  viewAllLabel?: string
  children: React.ReactNode
  className?: string
  id?: string
}

export function MediaRail({
  title,
  subtitle,
  icon,
  count,
  viewAllAction,
  viewAllLabel = 'Ver Tudo',
  children,
  className = '',
  id
}: MediaRailProps): React.JSX.Element | null {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = (): void => {
    const el = scrollContainerRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 10)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10)
  }

  useEffect(() => {
    checkScroll()
    const el = scrollContainerRef.current
    if (!el) return
    const handleResize = (): void => checkScroll()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [children])

  const scroll = (direction: 'left' | 'right'): void => {
    const el = scrollContainerRef.current
    if (!el) return
    const scrollAmount = el.clientWidth * 0.75
    el.scrollTo({
      left:
        direction === 'left'
          ? el.scrollLeft - scrollAmount
          : el.scrollLeft + scrollAmount,
      behavior: 'smooth'
    })
  }

  // If there are no children, don't render empty rail
  if (!children || (Array.isArray(children) && children.length === 0)) {
    return null
  }

  return (
    <section
      id={id}
      aria-label={title}
      className={`space-y-3.5 relative group/rail ${className}`}
    >
      {/* Rail Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2.5">
          {icon && (
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary border border-primary/20 shadow-xs">
              {icon}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground">
                {title}
              </h2>
              {count !== undefined && count > 0 && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary border border-primary/20">
                  {count}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="break-words whitespace-normal text-[12px] text-muted-foreground leading-snug">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Right Header: View All & Navigation Buttons */}
        <div className="flex items-center gap-2">
          {viewAllAction && (
            <Button
              variant="ghost"
              size="sm"
              onClick={viewAllAction}
              className="h-8 px-2.5 text-xs text-muted-foreground hover:text-primary gap-1 cursor-pointer"
            >
              <span>{viewAllLabel}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}

          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={!canScrollLeft}
                  onClick={() => scroll('left')}
                  className={`h-8 w-8 rounded-xl border-white/10 bg-card/80 hover:bg-secondary hover:text-foreground cursor-pointer shadow-sm transition-opacity ${
                    !canScrollLeft
                      ? 'opacity-30 cursor-not-allowed'
                      : 'opacity-100'
                  }`}
                  aria-label="Rolar para a esquerda"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Anterior</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={!canScrollRight}
                  onClick={() => scroll('right')}
                  className={`h-8 w-8 rounded-xl border-white/10 bg-card/80 hover:bg-secondary hover:text-foreground cursor-pointer shadow-sm transition-opacity ${
                    !canScrollRight
                      ? 'opacity-30 cursor-not-allowed'
                      : 'opacity-100'
                  }`}
                  aria-label="Rolar para a direita"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Próximo</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Snap-Scrolling Card Container */}
      <div
        ref={scrollContainerRef}
        onScroll={checkScroll}
        className="flex gap-4 overflow-x-auto pb-4 pt-1 px-1 no-scrollbar scroll-smooth snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {children}
      </div>
    </section>
  )
}
