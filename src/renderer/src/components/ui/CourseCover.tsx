import React, { useState } from 'react'
import { Play, Sparkles } from 'lucide-react'
import { mediaUrl } from '../../lib/utils'

export interface CourseCoverProps {
  src?: string | null
  title: string
  subtitle?: string
  aspectRatio?: 'video' | 'square'
  className?: string
  showPlayOnHover?: boolean
  badge?: string
}

// Deterministic tactile study palettes based on title
const PALETTES = [
  {
    bg: 'bg-[#241a12]',
    glow: 'bg-primary/20',
    accent: 'bg-primary',
    tagColor: 'text-primary border-primary/30'
  },
  {
    bg: 'bg-[#17201d]',
    glow: 'bg-accent/20',
    accent: 'bg-accent',
    tagColor: 'text-accent border-accent/30'
  },
  {
    bg: 'bg-[#14201c]',
    glow: 'bg-accent/20',
    accent: 'bg-accent',
    tagColor: 'text-accent border-accent/30'
  },
  {
    bg: 'bg-[#21171a]',
    glow: 'bg-destructive/20',
    accent: 'bg-destructive',
    tagColor: 'text-destructive border-destructive/30'
  },
  {
    bg: 'bg-[#211d12]',
    glow: 'bg-primary/20',
    accent: 'bg-primary',
    tagColor: 'text-primary border-primary/30'
  }
]

function getPalette(title: string) {
  let hash = 0
  for (let i = 0; i < (title || 'Course').length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i)
    hash |= 0
  }
  const index = Math.abs(hash) % PALETTES.length
  return PALETTES[index]
}

export function CourseCover({
  src,
  title,
  subtitle,
  aspectRatio = 'video',
  className = '',
  showPlayOnHover = false,
  badge
}: CourseCoverProps): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  const url = src && !failed ? mediaUrl(src) : null
  const palette = getPalette(title)

  return (
    <div
      className={`relative w-full overflow-hidden ${
        aspectRatio === 'video' ? 'aspect-video' : 'aspect-square'
      } rounded-xl bg-background flex items-center justify-center select-none ${className}`}
    >
      {url ? (
        <img
          src={url}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className={`relative h-full w-full flex flex-col justify-between p-3.5 sm:p-4.5 ${palette.bg} border border-white/10`}
        >
          {/* Subtle atmospheric ambient glow */}
          <div
            className={`absolute -top-10 -right-10 w-32 h-32 rounded-full ${palette.glow} blur-2xl pointer-events-none`}
          />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-accent/10 blur-2xl pointer-events-none" />

          {/* Micro dot-grid texture overlay */}
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)',
              backgroundSize: '16px 16px'
            }}
          />

          {/* Top Row: Brand pill & optional badge */}
          <div className="relative z-10 flex items-center justify-between">
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md border ${palette.tagColor} text-[9px] sm:text-[10px] font-bold tracking-widest uppercase font-mono shadow-xs`}
            >
              <Sparkles className="w-2.5 h-2.5" />
              <span>ORBIA</span>
            </div>
            {badge && (
              <span className="px-2 py-0.5 rounded-md bg-white/10 backdrop-blur-md border border-white/10 text-[10px] font-medium text-slate-200 shadow-xs">
                {badge}
              </span>
            )}
          </div>

          {/* Bottom Area: Prominent Typography */}
          <div className="relative z-10 mt-auto space-y-1">
            <h4 className="break-words whitespace-normal text-xs sm:text-sm md:text-base font-extrabold text-white leading-snug drop-shadow-md tracking-tight">
              {title || 'Sem título'}
            </h4>
            {subtitle && (
              <p className="break-words whitespace-normal text-[10px] sm:text-[11px] text-slate-300/80 leading-snug font-medium">
                {subtitle}
              </p>
            )}
          </div>

          {/* Quiet tactile bottom accent */}
          <div
            className={`absolute bottom-0 left-0 right-0 h-1 ${palette.accent}`}
          />
        </div>
      )}

      {/* Hover overlay with smooth play button */}
      {showPlayOnHover && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center z-20">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black shadow-xl shadow-black/60 transform scale-75 group-hover:scale-100 transition-transform duration-200 ease-out">
            <Play className="h-5 w-5 fill-current ml-0.5" />
          </div>
        </div>
      )}
    </div>
  )
}
