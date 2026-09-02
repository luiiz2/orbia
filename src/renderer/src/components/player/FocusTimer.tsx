import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Timer, Play, Pause, RotateCcw, CheckCircle2 } from 'lucide-react'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '../ui/dropdown-menu'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { formatTime } from '../../lib/formatters'

const TIMER_PRESETS = [
  { label: '25 min (Pomodoro)', seconds: 25 * 60 },
  { label: '45 min (Foco Intenso)', seconds: 45 * 60 },
  { label: '60 min (Sessão Longa)', seconds: 60 * 60 }
]

export function FocusTimer(): React.JSX.Element {
  const { t } = useTranslation()
  const activeCourse = usePlayerStore((state) => state.activeCourse)

  const [selectedDuration, setSelectedDuration] = useState<number>(25 * 60)
  const [timeLeft, setTimeLeft] = useState<number>(25 * 60)
  const [isRunning, setIsRunning] = useState<boolean>(false)
  const [isCompleted, setIsCompleted] = useState<boolean>(false)
  const [sessionId, setSessionId] = useState<string | null>(null)

  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setIsRunning(false)
            setIsCompleted(true)
            if (sessionId) {
              window.api.sessions
                .end(sessionId, selectedDuration)
                .catch(console.error)
              setSessionId(null)
            }
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isRunning, timeLeft, sessionId, selectedDuration])

  const handleStart = async () => {
    if (timeLeft === 0) {
      setTimeLeft(selectedDuration)
      setIsCompleted(false)
    }
    try {
      const session = await window.api.sessions.start(
        activeCourse?.id,
        'focus_timer'
      )
      setSessionId(session.id)
    } catch (err) {
      console.warn('Failed to record session start:', err)
    }
    setIsRunning(true)
  }

  const handlePause = () => {
    setIsRunning(false)
  }

  const handleReset = (newSeconds?: number) => {
    setIsRunning(false)
    setIsCompleted(false)
    const target = newSeconds !== undefined ? newSeconds : selectedDuration
    setSelectedDuration(target)
    setTimeLeft(target)
    if (sessionId) {
      window.api.sessions
        .end(sessionId, selectedDuration - timeLeft)
        .catch(console.error)
      setSessionId(null)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium transition-all select-none ${
            isCompleted
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse'
              : isRunning
                ? 'bg-primary/20 text-primary border border-primary/40 shadow-sm shadow-primary/10'
                : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border/60'
          }`}
          title={t('player.focusTimerTooltip', 'Timer de Foco')}
        >
          {isCompleted ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Timer
              className={`h-3.5 w-3.5 ${isRunning ? 'animate-spin' : ''}`}
              style={{ animationDuration: '3s' }}
            />
          )}
          <span>{formatTime(timeLeft)}</span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-56 p-3 bg-popover/95 backdrop-blur-md border border-border/80 shadow-xl"
      >
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/60">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Timer className="h-4 w-4 text-primary" />
            <span>{t('player.focusTimer', 'Timer de Foco')}</span>
          </div>
          {isCompleted && (
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
              {t('player.sessionComplete', 'Concluído!')}
            </span>
          )}
        </div>

        {/* Presets */}
        <div className="space-y-1 mb-3">
          {TIMER_PRESETS.map((preset) => (
            <button
              key={preset.seconds}
              type="button"
              onClick={() => handleReset(preset.seconds)}
              className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                selectedDuration === preset.seconds &&
                !isRunning &&
                !isCompleted
                  ? 'bg-primary/20 text-primary font-semibold'
                  : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Timer Controls */}
        <div className="flex items-center justify-center gap-2 pt-1 border-t border-border/60">
          {isRunning ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-xs border-primary/40 text-primary hover:bg-primary/10"
              onClick={handlePause}
            >
              <Pause className="h-3.5 w-3.5 mr-1" />
              {t('common.pause', 'Pausar')}
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-8 gap-1 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              onClick={handleStart}
            >
              <Play className="h-3.5 w-3.5 mr-1 fill-current" />
              {t('common.start', 'Iniciar')}
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => handleReset()}
            title={t('common.reset', 'Reiniciar')}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
