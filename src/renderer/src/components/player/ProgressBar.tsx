import React, { useState, useRef, useCallback, useEffect } from 'react'
import { formatTime } from '../../lib/formatters'
import { cn } from '../../lib/utils'

export interface ProgressBarProps {
  currentTime: number
  duration: number
  bufferedEnd?: number
  onSeek: (time: number) => void
  className?: string
}

export function ProgressBar({
  currentTime,
  duration,
  bufferedEnd = 0,
  onSeek,
  className
}: ProgressBarProps): React.JSX.Element {
  const barRef = useRef<HTMLDivElement | null>(null)
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [dragTime, setDragTime] = useState<number | null>(null)
  const [hoverPosition, setHoverPosition] = useState<{ x: number; time: number; percent: number } | null>(null)

  const progressPercent =
    duration > 0
      ? Math.min(100, Math.max(0, ((dragTime !== null ? dragTime : currentTime) / duration) * 100))
      : 0

  const bufferedPercent =
    duration > 0 ? Math.min(100, Math.max(0, (bufferedEnd / duration) * 100)) : 0

  const calculateTimeFromEvent = useCallback(
    (e: MouseEvent | React.MouseEvent<HTMLDivElement>): number => {
      if (!barRef.current || duration <= 0) return 0
      const rect = barRef.current.getBoundingClientRect()
      const clientX = 'clientX' in e ? e.clientX : 0
      const rawPercent = (clientX - rect.left) / rect.width
      const clampedPercent = Math.max(0, Math.min(1, rawPercent))
      return clampedPercent * duration
    },
    [duration]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!barRef.current || duration <= 0) return
      const rect = barRef.current.getBoundingClientRect()
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
      const percent = (x / rect.width) * 100
      const time = (x / rect.width) * duration

      setHoverPosition({ x, time, percent })
    },
    [duration]
  )

  const handleMouseLeave = useCallback(() => {
    if (!isDragging) {
      setHoverPosition(null)
    }
  }, [isDragging])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (duration <= 0) return
      e.preventDefault()
      setIsDragging(true)
      const targetTime = calculateTimeFromEvent(e)
      setDragTime(targetTime)
    },
    [duration, calculateTimeFromEvent]
  )

  useEffect(() => {
    if (!isDragging) return

    const onWindowMouseMove = (e: MouseEvent): void => {
      const targetTime = calculateTimeFromEvent(e)
      setDragTime(targetTime)
      if (barRef.current) {
        const rect = barRef.current.getBoundingClientRect()
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
        const percent = (x / rect.width) * 100
        setHoverPosition({ x, time: targetTime, percent })
      }
    }

    const onWindowMouseUp = (e: MouseEvent): void => {
      const targetTime = calculateTimeFromEvent(e)
      setIsDragging(false)
      setDragTime(null)
      onSeek(targetTime)
    }

    window.addEventListener('mousemove', onWindowMouseMove)
    window.addEventListener('mouseup', onWindowMouseUp)

    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove)
      window.removeEventListener('mouseup', onWindowMouseUp)
    }
  }, [isDragging, calculateTimeFromEvent, onSeek])

  return (
    <div
      ref={barRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      className={cn(
        'group relative flex h-6 w-full cursor-pointer items-center py-2 select-none touch-none',
        className
      )}
      role="slider"
      aria-label="Seekbar"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={currentTime}
      aria-valuetext={formatTime(currentTime)}
      tabIndex={0}
    >
      {/* Floating Hover Timestamp Tooltip */}
      {hoverPosition && (
        <div
          className="absolute -top-8 z-30 pointer-events-none -translate-x-1/2 rounded-lg bg-black/90 px-2 py-0.5 text-[11px] font-mono font-semibold text-white shadow-xl border border-white/20"
          style={{ left: `${hoverPosition.percent}%` }}
        >
          {formatTime(hoverPosition.time)}
        </div>
      )}

      {/* Progress Track Background */}
      <div className="relative h-1.5 w-full rounded-full bg-white/20 transition-all duration-150 group-hover:h-2">
        {/* Buffered Progress */}
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-white/30 transition-all duration-150"
          style={{ width: `${bufferedPercent}%` }}
        />

        {/* Hover Highlight */}
        {hoverPosition && (
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-white/15"
            style={{ width: `${hoverPosition.percent}%` }}
          />
        )}

        {/* Played Progress */}
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-orange-600 via-orange-500 to-amber-400 shadow-sm shadow-orange-500/50"
          style={{ width: `${progressPercent}%` }}
        />

        {/* Scrubber Knob Thumb */}
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-2 ring-orange-500 shadow-lg shadow-orange-500/50 transition-transform duration-150 h-3.5 w-3.5 group-hover:scale-125"
          style={{ left: `${progressPercent}%` }}
        />
      </div>
    </div>
  )
}

