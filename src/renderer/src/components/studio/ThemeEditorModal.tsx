import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useProfileStore } from '../../stores/useProfileStore'
import {
  Palette,
  AlertTriangle,
  CheckCircle2,
  Download,
  RotateCcw
} from 'lucide-react'
import { evaluateContrast } from '../../lib/contrast-safety'
import type { ThemePreset, ThemeConfig } from '@shared'

export interface ThemeEditorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ThemeEditorModal({
  open,
  onOpenChange
}: ThemeEditorModalProps): React.JSX.Element | null {
  const {
    themePresets,
    activeProfile,
    resolvedTheme,
    fetchThemePresets,
    fetchResolvedTheme,
    saveAppearanceOverride,
    resetAppearanceOverride
  } = useProfileStore()

  const [selectedPresetId, setSelectedPresetId] =
    useState<string>('preset_streaming')
  const [primaryColor, setPrimaryColor] = useState('#d08a52')
  const [backgroundColor, setBackgroundColor] = useState('#101312')
  const [foregroundColor, setForegroundColor] = useState('#f3eee5')
  const [borderRadius, setBorderRadius] = useState(12)

  useEffect(() => {
    if (open) {
      fetchThemePresets().catch(console.warn)
      fetchResolvedTheme().catch(console.warn)
    }
  }, [open, fetchThemePresets, fetchResolvedTheme])

  useEffect(() => {
    if (resolvedTheme) {
      setPrimaryColor(resolvedTheme.colorTokens.primary || '#d08a52')
      setBackgroundColor(resolvedTheme.colorTokens.background || '#101312')
      setForegroundColor(resolvedTheme.colorTokens.foreground || '#f3eee5')
      setBorderRadius(resolvedTheme.cardStyle.borderRadius || 12)
    }
  }, [resolvedTheme])

  const contrastEval = evaluateContrast(foregroundColor, backgroundColor)

  const handleApplyPreset = async (preset: ThemePreset): Promise<void> => {
    setSelectedPresetId(preset.id)
    if (!activeProfile) return
    await saveAppearanceOverride(
      'profile',
      activeProfile.id,
      preset.config,
      preset.id
    )
  }

  const handleCustomSave = async (): Promise<void> => {
    if (!activeProfile) return
    const customConfig: Partial<ThemeConfig> = {
      colorTokens: {
        primary: primaryColor,
        background: backgroundColor,
        foreground: foregroundColor
      },
      cardStyle: {
        aspectRatio: '16:9',
        borderRadius,
        showProgress: true,
        showDuration: true,
        showBadges: true,
        titlePlacement: 'below',
        hoverEffect: 'zoom',
        sizeScale: 1.0
      }
    }
    await saveAppearanceOverride('profile', activeProfile.id, customConfig)
  }

  const handleReset = async (): Promise<void> => {
    if (!activeProfile) return
    await resetAppearanceOverride('profile', activeProfile.id)
  }

  const handleExport = async (): Promise<void> => {
    const res = await window.api.studio.exportThemePackage(selectedPresetId)
    if (res.success) {
      alert(`Tema exportado com sucesso para: ${res.filePath}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            <span>Personalização & Estúdio de Aparência</span>
          </DialogTitle>
          <DialogDescription>
            Escolha presets visuais (Streaming, Cinema, Compact, Minimal) ou
            ajuste cores, cantos e contraste do perfil.
          </DialogDescription>
        </DialogHeader>

        {/* Presets Row */}
        <div className="space-y-2 py-2">
          <label className="text-xs font-semibold text-foreground">
            Presets Disponíveis:
          </label>
          <div className="grid grid-cols-4 gap-2">
            {themePresets.map((preset) => (
              <button
                type="button"
                key={preset.id}
                onClick={() => handleApplyPreset(preset)}
                className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                  selectedPresetId === preset.id
                    ? 'border-primary bg-primary/10 ring-2 ring-primary/30 font-semibold'
                    : 'border-border/60 bg-card hover:bg-muted/30'
                }`}
              >
                <div className="text-xs text-foreground font-bold">
                  {preset.name}
                </div>
                <div className="flex justify-center gap-1 mt-2">
                  <div
                    className="h-3 w-3 rounded-full border border-white/20"
                    style={{
                      backgroundColor:
                        preset.config.colorTokens.background || '#000'
                    }}
                  />
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{
                      backgroundColor:
                        preset.config.colorTokens.primary || '#d08a52'
                    }}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Controls */}
        <div className="space-y-3 py-2 border-t border-border/50 text-xs">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="font-semibold text-foreground">
                Cor Primária (Destaque):
              </label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-8 w-10 rounded border border-border cursor-pointer bg-transparent"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-foreground">
                Fundo (Background):
              </label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="h-8 w-10 rounded border border-border cursor-pointer bg-transparent"
                />
                <Input
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-foreground">
                Texto (Foreground):
              </label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={foregroundColor}
                  onChange={(e) => setForegroundColor(e.target.value)}
                  className="h-8 w-10 rounded border border-border cursor-pointer bg-transparent"
                />
                <Input
                  value={foregroundColor}
                  onChange={(e) => setForegroundColor(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="font-semibold text-foreground">
              Arredondamento dos Cards (px): {borderRadius}px
            </label>
            <input
              type="range"
              min={0}
              max={24}
              value={borderRadius}
              onChange={(e) => setBorderRadius(parseInt(e.target.value, 10))}
              className="w-full mt-1 accent-primary"
            />
          </div>

          {/* WCAG Contrast Safety Warning */}
          <div
            className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 ${
              contrastEval.isAA
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-primary/10 border-primary/30 text-primary'
            }`}
          >
            <div className="flex items-center gap-2">
              {contrastEval.isAA ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              )}
              <span className="text-xs">
                Contraste de Texto: <strong>{contrastEval.ratio}:1</strong>{' '}
                {contrastEval.isAA
                  ? '(Conforme WCAG AA)'
                  : '(Aviso de Baixo Contraste)'}
              </span>
            </div>

            {!contrastEval.isAA && contrastEval.suggestedColor && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setForegroundColor(contrastEval.suggestedColor!)}
                className="h-7 text-xs border-primary/40 text-primary hover:bg-primary/20"
              >
                Ajustar Automaticamente
              </Button>
            )}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between w-full pt-2">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-8 text-xs flex items-center gap-1"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Restaurar Padrão</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="h-8 text-xs flex items-center gap-1"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Exportar .orbia-theme</span>
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Fechar
            </Button>
            <Button size="sm" onClick={handleCustomSave}>
              Salvar Customização
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
