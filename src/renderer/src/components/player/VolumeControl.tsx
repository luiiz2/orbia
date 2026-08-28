import React, { useState } from 'react'
import { Volume2, Volume1, VolumeX } from 'lucide-react'
import { Button, Tooltip, TooltipTrigger, TooltipContent, Slider } from '../ui'
import { cn } from '../../lib/utils'

export interface VolumeControlProps {
  volume: number
  isMuted: boolean
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void
  className?: string
}

export function VolumeControl({
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
  className
}: VolumeControlProps): React.JSX.Element {
  const [isHovered, setIsHovered] = useState<boolean>(false)

  const effectiveVolume = isMuted ? 0 : volume

  const getVolumeIcon = (): React.ReactNode => {
    if (isMuted || effectiveVolume === 0) {
      return <VolumeX className="h-4 w-4 text-destructive-foreground/90" />
    }
    if (effectiveVolume < 0.5) {
      return <Volume1 className="h-4 w-4" />
    }
    return <Volume2 className="h-4 w-4" />
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 transition-all duration-200',
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Mute Toggle Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleMute}
            className="h-8.5 w-8.5 rounded-xl text-white/90 hover:bg-white/15 hover:text-white cursor-pointer"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {getVolumeIcon()}
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="flex items-center gap-1.5 bg-black/90 text-white border-white/20"
        >
          <span>{isMuted ? 'Unmute' : 'Mute'}</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-mono">
            M
          </kbd>
        </TooltipContent>
      </Tooltip>

      {/* Volume Slider Container */}
      <div
        className={cn(
          'transition-all duration-200 ease-out overflow-hidden flex items-center',
          isHovered
            ? 'w-20 opacity-100'
            : 'w-0 sm:w-16 opacity-70 sm:opacity-90 hover:opacity-100'
        )}
      >
        <Slider
          value={[effectiveVolume * 100]}
          max={100}
          step={1}
          onValueChange={(vals) => {
            const val = vals[0] / 100
            onVolumeChange(val)
          }}
          className="w-16 cursor-pointer py-2"
          trackClassName="bg-white/20 h-1"
          rangeClassName="bg-white"
          thumbClassName="h-3 w-3 bg-white border-0 shadow"
          aria-label="Volume"
        />
      </div>
    </div>
  )
}
