import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import logoIcon from '../../assets/icon.png'

interface SplashScreenProps {
  statusText?: string
  progress?: number
  isReady?: boolean
  onFinish?: () => void
}

export function SplashScreen({
  statusText,
  isReady = false,
  onFinish
}: SplashScreenProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(true)
  const [fadingOut, setFadingOut] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  const steps = [
    t('splash.loadingConfig', 'Carregando configurações e preferências...'),
    t('splash.loadingVault', 'Acessando cofre de estudos...'),
    t('splash.loadingCourses', 'Preparando cursos e progresso...'),
    t('splash.ready', 'Tudo pronto!')
  ]

  useEffect(() => {
    const timer1 = setTimeout(() => setCurrentStep(1), 350)
    const timer2 = setTimeout(() => setCurrentStep(2), 750)
    const timer3 = setTimeout(() => setCurrentStep(3), 1150)

    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
      clearTimeout(timer3)
    }
  }, [])

  useEffect(() => {
    if (isReady && currentStep >= 2) {
      const finishTimer = setTimeout(() => {
        setFadingOut(true)
        const removeTimer = setTimeout(() => {
          setVisible(false)
          if (onFinish) onFinish()
        }, 400)
        return () => clearTimeout(removeTimer)
      }, 400)

      return () => clearTimeout(finishTimer)
    }
    return undefined
  }, [isReady, currentStep, onFinish])

  if (!visible) return null

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#080b11] text-foreground select-none transition-opacity duration-400 ease-out ${
        fadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Background ambient cosmic glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-orange-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* Main content container */}
      <div className="relative flex flex-col items-center gap-6 max-w-sm px-6 text-center animate-in fade-in zoom-in-95 duration-500">
        {/* App Logo with subtle halo */}
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 bg-primary/25 rounded-2xl blur-lg animate-pulse" />
          <img
            src={logoIcon}
            alt="Orbia Logo"
            className="relative w-20 h-20 rounded-2xl shadow-2xl object-cover ring-1 ring-white/10"
          />
        </div>

        {/* Brand Name & Tagline */}
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-wider bg-gradient-to-r from-orange-400 via-primary to-amber-400 bg-clip-text text-transparent">
            ORBIA
          </h1>
          <p className="text-xs text-muted-foreground/80 font-medium tracking-wide">
            {t('splash.tagline', 'Sua plataforma pessoal de cursos e estudos')}
          </p>
        </div>

        {/* Progress bar and dynamic status */}
        <div className="w-56 space-y-2 mt-2">
          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden p-0.5 ring-1 ring-white/10">
            <div
              className="h-full bg-gradient-to-r from-orange-500 via-primary to-amber-400 rounded-full transition-all duration-500 ease-out"
              style={{
                width: isReady && currentStep >= 2 ? '100%' : `${Math.min(15 + currentStep * 28, 85)}%`
              }}
            />
          </div>
          <p className="text-[11px] font-mono text-muted-foreground/70 transition-all duration-300">
            {statusText || steps[currentStep] || steps[0]}
          </p>
        </div>
      </div>
    </div>
  )
}
