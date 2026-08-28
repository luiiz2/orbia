import React from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Gauge } from 'lucide-react'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../ui/dropdown-menu'
import { cn } from '../../lib/utils'

export interface SpeedMenuProps {
  playbackRate: number
  onRateChange: (rate: number) => void
  className?: string
}

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0]

export function SpeedMenu({
  playbackRate,
  onRateChange,
  className
}: SpeedMenuProps): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-8 px-2 text-xs font-semibold text-white/90 hover:bg-white/10 hover:text-white gap-1 select-none',
            className
          )}
          title={`${t('player.speed')} (< / >)`}
          aria-label={t('player.speed')}
        >
          <Gauge className="h-3.5 w-3.5 opacity-80" />
          <span>{playbackRate === 1 ? '1.0x' : `${playbackRate}x`}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        side="top"
        sideOffset={8}
        className="w-28 bg-black/90 text-white border-white/20 backdrop-blur-md p-1 z-50"
      >
        {SPEED_OPTIONS.map((rate) => {
          const isSelected = Math.abs(rate - playbackRate) < 0.05
          return (
            <DropdownMenuItem
              key={rate}
              onClick={() => onRateChange(rate)}
              className={cn(
                'flex items-center justify-between text-xs py-1.5 px-2 cursor-pointer rounded transition-colors text-white/80 hover:bg-white/20 hover:text-white',
                isSelected && 'font-bold text-white bg-white/15'
              )}
            >
              <span>{rate === 1 ? 'Normal (1.0x)' : `${rate}x`}</span>
              {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
