import React from 'react'
import { Play, Star, Plus, Check, Info, Clock, CheckCircle2 } from 'lucide-react'
import { CourseCover } from '../ui/CourseCover'
import { Badge } from '../ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import { formatDurationHuman, formatTime } from '../../lib/formatters'

export interface MediaCardProps {
  id: string
  title: string
  subtitle?: string
  coverPath?: string | null
  duration?: number
  currentTime?: number
  progressPercentage?: number
  isCompleted?: boolean
  isFavorite?: boolean
  badge?: string
  isQueued?: boolean
  onPlay?: () => void
  onClick?: () => void
  onToggleFavorite?: () => void
  onAddToQueue?: () => void
  onMoreInfo?: () => void
  className?: string
  aspectRatio?: 'video' | 'square'
  type?: 'course' | 'lesson'
}

export function MediaCard({
  title,
  subtitle,
  coverPath,
  duration,
  currentTime,
  progressPercentage = 0,
  isCompleted = false,
  isFavorite = false,
  badge,
  isQueued = false,
  onPlay,
  onClick,
  onToggleFavorite,
  onAddToQueue,
  onMoreInfo,
  className = '',
  aspectRatio = 'video',
  type = 'course'
}: MediaCardProps): React.JSX.Element {
  const percentage = isCompleted ? 100 : Math.min(100, Math.max(0, Math.round(progressPercentage)))

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (onClick) onClick()
      else if (onPlay) onPlay()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick || onPlay}
      onKeyDown={handleKeyDown}
      className={`group relative flex flex-col cursor-pointer select-none rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-transform duration-200 ease-out hover:-translate-y-1 ${className}`}
    >
      {/* 16:9 Media Artwork Container */}
      <div
        className={`relative w-full overflow-hidden rounded-xl border border-white/[0.08] bg-[#0A0D14] shadow-md transition-all duration-300 group-hover:border-primary/40 group-hover:shadow-xl group-hover:shadow-primary/10 ${
          aspectRatio === 'video' ? 'aspect-video' : 'aspect-square'
        }`}
      >
        <CourseCover
          src={coverPath}
          title={title}
          subtitle={subtitle}
          aspectRatio={aspectRatio}
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
        />

        {/* Dark Vignette Overlay on Hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />

        {/* Top-Left Action: Favorite Star */}
        {onToggleFavorite && (
          <div
            className="absolute top-2 left-2 z-30"
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite()
            }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                  className={`flex h-7.5 w-7.5 items-center justify-center rounded-lg backdrop-blur-md transition-all duration-200 cursor-pointer shadow-sm ${
                    isFavorite
                      ? 'bg-amber-500/30 text-amber-400 border border-amber-500/50 opacity-100'
                      : 'bg-black/60 text-white/70 hover:text-amber-400 hover:bg-black/80 border border-white/10 opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <Star
                    className={`h-4 w-4 transition-transform active:scale-125 ${
                      isFavorite ? 'fill-amber-400 text-amber-400' : ''
                    }`}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs font-semibold">
                {isFavorite ? 'Favoritado' : 'Adicionar aos Favoritos'}
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Top-Right Badges */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5 z-30 pointer-events-none">
          {badge && (
            <Badge
              variant="secondary"
              className="text-[10px] bg-black/75 backdrop-blur-md border-white/10 text-slate-200 py-0.5 px-2 font-mono shadow-sm"
            >
              {badge}
            </Badge>
          )}

          {isCompleted ? (
            <Badge variant="success" className="gap-1 shadow-sm font-semibold py-0.5 px-2">
              <CheckCircle2 className="h-3 w-3" />
              <span>Concluído</span>
            </Badge>
          ) : percentage > 0 ? (
            <span className="rounded-md bg-black/75 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-white/10 shadow-sm font-mono">
              {percentage}%
            </span>
          ) : null}
        </div>

        {/* Center Hover Action: Play Button */}
        <div className="absolute inset-0 flex items-center justify-center z-20 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xl shadow-primary/40 transform scale-75 group-hover:scale-100 transition-transform duration-200 ease-out">
            <Play className="h-6 w-6 fill-current ml-0.5" />
          </div>
        </div>

        {/* Bottom-Right Duration / Time Pill */}
        {duration && duration > 0 && (
          <div className="absolute bottom-2 right-2 z-30 pointer-events-none">
            <span className="rounded-md bg-black/80 backdrop-blur-md px-2 py-0.5 text-[10px] font-mono font-medium text-slate-300 border border-white/10 shadow-sm flex items-center gap-1">
              <Clock className="h-2.5 w-2.5 text-primary" />
              {currentTime && currentTime > 0
                ? `${formatTime(currentTime)} / ${formatTime(duration)}`
                : type === 'lesson'
                ? formatTime(duration)
                : formatDurationHuman(duration)}
            </span>
          </div>
        )}

        {/* Bottom-Left Hover Actions: Add to Queue & More Info */}
        <div
          className="absolute bottom-2 left-2 z-30 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {onAddToQueue && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAddToQueue()
                  }}
                  aria-label="Adicionar à fila"
                  className={`flex h-7 w-7 items-center justify-center rounded-lg backdrop-blur-md border transition-colors cursor-pointer ${
                    isQueued
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-black/70 text-white/80 hover:text-white hover:bg-black/90 border-white/15'
                  }`}
                >
                  {isQueued ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs font-semibold">
                {isQueued ? 'Na Fila' : 'Tocar a Seguir'}
              </TooltipContent>
            </Tooltip>
          )}

          {onMoreInfo && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMoreInfo()
                  }}
                  aria-label="Mais informações"
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/70 hover:bg-black/90 text-white/80 hover:text-white border border-white/15 backdrop-blur-md transition-colors cursor-pointer"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs font-semibold">
                Detalhes
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Bottom Progress Line */}
        {percentage > 0 && (
          <div className="absolute bottom-0 inset-x-0 h-[3px] bg-black/60 z-10 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                isCompleted ? 'bg-emerald-400' : 'bg-gradient-to-r from-orange-500 to-amber-400'
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        )}
      </div>

      {/* Metadata Row below card */}
      <div className="pt-2 px-0.5 space-y-0.5">
        <h3 className="text-[13px] font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1 leading-snug">
          {title}
        </h3>
        {subtitle && (
          <p className="text-[11px] text-muted-foreground line-clamp-1">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  )
}
