import React from 'react'
import { ListPlus, Trash2, X, Play, ArrowUp, ArrowDown, Sparkles } from 'lucide-react'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { formatTime } from '../../lib/formatters'
import { Button } from '../ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'

export function PlaybackQueueDrawer(): React.JSX.Element {
  const {
    activeLesson,
    playbackQueue,
    loadLesson,
    removeFromQueue,
    reorderQueue,
    clearQueue
  } = usePlayerStore()

  return (
    <div className="flex flex-col h-full bg-card/95 select-none p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/15 text-primary border border-orange-500/20 shadow-xs">
            <ListPlus className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Fila de Reprodução</h3>
            <p className="text-[11px] text-muted-foreground">A Seguir ({playbackQueue.length})</p>
          </div>
        </div>

        {playbackQueue.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearQueue}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 gap-1 cursor-pointer"
              >
                <Trash2 className="h-3 w-3" />
                <span>Limpar</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Limpar fila de reprodução</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Currently Playing Card */}
      {activeLesson && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold text-primary uppercase font-mono tracking-wider">
            Tocando Agora
          </span>
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-primary/10 border border-primary/25">
            <div className="flex items-center gap-2 min-w-0 pr-2">
              <Play className="h-3.5 w-3.5 text-primary fill-primary shrink-0" />
              <p className="text-xs font-semibold text-white truncate">{activeLesson.title}</p>
            </div>
            {activeLesson.duration > 0 && (
              <span className="text-[10px] font-mono text-primary font-medium shrink-0">
                {formatTime(activeLesson.duration)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Up Next List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase font-mono tracking-wider">
          A Seguir
        </span>

        {playbackQueue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center space-y-2 text-muted-foreground">
            <Sparkles className="h-8 w-8 text-muted-foreground/40 stroke-1" />
            <p className="text-xs">Sua fila de reprodução está vazia.</p>
            <p className="text-[11px] text-muted-foreground/70 max-w-[200px]">
              Adicione aulas à fila pelos cards ou pelo currículo para assistir em sequência.
            </p>
          </div>
        ) : (
          playbackQueue.map((lesson, idx) => (
            <div
              key={lesson.id}
              className="group/item flex items-center justify-between p-2.5 rounded-xl bg-card border border-border/60 hover:border-primary/40 hover:bg-secondary/60 transition-all"
            >
              <div
                className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                onClick={() => {
                  removeFromQueue(lesson.id)
                  loadLesson(lesson.id)
                }}
              >
                <span className="text-xs font-mono font-bold text-muted-foreground w-4 text-center">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-medium text-foreground group-hover/item:text-primary transition-colors truncate">
                    {lesson.title}
                  </h4>
                  {lesson.duration > 0 && (
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {formatTime(lesson.duration)}
                    </span>
                  )}
                </div>
              </div>

              {/* Reorder and Delete Controls */}
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity">
                {idx > 0 && (
                  <button
                    type="button"
                    onClick={() => reorderQueue(idx, idx - 1)}
                    aria-label="Mover para cima"
                    className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                )}
                {idx < playbackQueue.length - 1 && (
                  <button
                    type="button"
                    onClick={() => reorderQueue(idx, idx + 1)}
                    aria-label="Mover para baixo"
                    className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeFromQueue(lesson.id)}
                  aria-label="Remover da fila"
                  className="p-1 rounded hover:bg-rose-500/20 text-muted-foreground hover:text-rose-400 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
