import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { useOptimizerStore } from '../../stores/useOptimizerStore'
import { mediaUrl } from '../../lib/utils'
import { formatBytes } from '../../lib/formatters'
import {
  Eye,
  Columns2,
  ZoomIn,
  Sparkles,
  ArrowRight,
  Layers
} from 'lucide-react'

export function VisualComparatorModal(): React.JSX.Element | null {
  const {
    isVisualComparatorOpen,
    setVisualComparatorOpen,
    visualComparison,
    isComparing
  } = useOptimizerStore()

  const [selectedSampleIndex, setSelectedSampleIndex] = useState(0)
  const [viewMode, setViewMode] = useState<'split' | 'toggle'>('split')
  const [activeToggle, setActiveToggle] = useState<'orig' | 'opt'>('opt')
  const [isZoomed, setIsZoomed] = useState(false)

  if (!isVisualComparatorOpen) return null

  const samples = visualComparison?.samples || []
  const currentSample = samples[selectedSampleIndex]
  const plan = visualComparison?.plan

  return (
    <Dialog open={isVisualComparatorOpen} onOpenChange={setVisualComparatorOpen}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden bg-card border-border/80 shadow-2xl rounded-3xl">
        <DialogHeader className="p-5 pb-3 border-b border-border/50 bg-muted/20">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <Eye className="h-5 w-5 text-primary" />
              <span>Comparador Visual de Qualidade</span>
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === 'split' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('split')}
                className="h-7 text-xs rounded-xl gap-1.5"
              >
                <Columns2 className="h-3.5 w-3.5" />
                <span>Lado a Lado</span>
              </Button>
              <Button
                variant={viewMode === 'toggle' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('toggle')}
                className="h-7 text-xs rounded-xl gap-1.5"
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Alternar</span>
              </Button>
              <Button
                variant={isZoomed ? 'default' : 'outline'}
                size="sm"
                onClick={() => setIsZoomed(!isZoomed)}
                className="h-7 text-xs rounded-xl gap-1.5"
                title="Zoom 2x para avaliar legibilidade de código e textos"
              >
                <ZoomIn className="h-3.5 w-3.5" />
                <span>Zoom 2x</span>
              </Button>
            </div>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            {plan?.lessonTitle || 'Amostras de 4 segundos'} • Perfil:{' '}
            <span className="font-semibold text-foreground uppercase">{visualComparison?.profile}</span>
          </DialogDescription>
        </DialogHeader>

        {isComparing ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3">
            <div className="h-10 w-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold text-muted-foreground">
              Extraindo e codificando 3 amostras representativas...
            </p>
          </div>
        ) : !currentSample ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma amostra disponível.
          </div>
        ) : (
          <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* Timestamp Selector Tabs */}
            <div className="flex items-center justify-center gap-2">
              {samples.map((s, idx) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => setSelectedSampleIndex(idx)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    selectedSampleIndex === idx
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : 'bg-muted/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Ponto {idx + 1} ({s.timestampLabel})
                </button>
              ))}
            </div>

            {/* Video Viewport Area */}
            {viewMode === 'split' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Original Clip */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold px-1">
                    <span className="text-muted-foreground">Original ({plan?.sourceCodec.toUpperCase()})</span>
                    <Badge variant="outline" className="text-[10px] h-4.5">
                      {plan?.sourceResolution}
                    </Badge>
                  </div>
                  <div
                    className={`relative rounded-2xl overflow-hidden border border-border/80 bg-black aspect-video flex items-center justify-center ${
                      isZoomed ? 'scale-125 origin-center transition-transform' : ''
                    }`}
                  >
                    <video
                      src={mediaUrl(currentSample.originalSampleVideoPath)}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>

                {/* Optimized Clip */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold px-1">
                    <span className="text-primary font-bold">
                      Otimizado ({plan?.targetCodec.toUpperCase()})
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="default" className="text-[10px] h-4.5 bg-primary/20 text-primary border-primary/30">
                        {plan?.targetResolution}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] h-4.5 text-emerald-400 border-emerald-500/30">
                        ~{plan?.estimatedSavingsPercent}% menor
                      </Badge>
                    </div>
                  </div>
                  <div
                    className={`relative rounded-2xl overflow-hidden border-2 border-primary/60 bg-black aspect-video flex items-center justify-center ${
                      isZoomed ? 'scale-125 origin-center transition-transform' : ''
                    }`}
                  >
                    <video
                      src={mediaUrl(currentSample.optimizedSampleVideoPath)}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              </div>
            ) : (
              // Toggle Overlay Mode
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={activeToggle === 'orig' ? 'default' : 'outline'}
                      onClick={() => setActiveToggle('orig')}
                      className="h-7 text-xs rounded-xl"
                    >
                      Ver Original ({plan?.sourceCodec.toUpperCase()})
                    </Button>
                    <Button
                      size="sm"
                      variant={activeToggle === 'opt' ? 'default' : 'outline'}
                      onClick={() => setActiveToggle('opt')}
                      className="h-7 text-xs rounded-xl"
                    >
                      Ver Otimizado ({plan?.targetCodec.toUpperCase()})
                    </Button>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Clique nos botões para alternar instantaneamente e comparar nitidez.
                  </span>
                </div>

                <div
                  className={`relative rounded-2xl overflow-hidden border-2 ${
                    activeToggle === 'opt' ? 'border-primary/80' : 'border-border'
                  } bg-black aspect-video flex items-center justify-center max-w-2xl mx-auto ${
                    isZoomed ? 'scale-125 origin-center transition-transform' : ''
                  }`}
                >
                  <video
                    src={mediaUrl(
                      activeToggle === 'opt'
                        ? currentSample.optimizedSampleVideoPath
                        : currentSample.originalSampleVideoPath
                    )}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            )}

            {/* Metrics & Explanation */}
            <div className="p-3.5 rounded-2xl bg-muted/20 border border-border/50 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-foreground font-medium">{plan?.reason}</span>
              </div>
              <div className="flex items-center gap-4 text-muted-foreground">
                <span>
                  Tamanho Original: <strong className="text-foreground">{formatBytes(plan?.sourceSize || 0)}</strong>
                </span>
                <ArrowRight className="h-3 w-3" />
                <span>
                  Estimado:{' '}
                  <strong className="text-emerald-400">
                    {formatBytes(plan?.estimatedTargetSize || 0)}
                  </strong>
                </span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="p-4 border-t border-border/50 bg-muted/20 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            Amostras gravadas em codec ultra-rápido para pré-visualização instantânea sem alterar seus arquivos.
          </p>
          <Button variant="outline" size="sm" onClick={() => setVisualComparatorOpen(false)} className="rounded-xl text-xs">
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
