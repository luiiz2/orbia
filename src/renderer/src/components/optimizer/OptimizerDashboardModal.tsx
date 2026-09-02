import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { Progress } from '../ui/progress'
import { useOptimizerStore } from '../../stores/useOptimizerStore'
import { formatBytes, formatTime } from '../../lib/formatters'
import {
  HardDrive,
  Cpu,
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  X,
  Eye,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  History,
  Settings,
  Trash2,
  Search,
  ArrowRight,
  ShieldCheck,
  Zap,
  Layers,
  BarChart3
} from 'lucide-react'
import type { OptimizationProfile, OptimizationJobStatus } from '@shared'

function getBasename(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath
}

export function OptimizerDashboardModal(): React.JSX.Element | null {
  const {
    isOptimizerModalOpen,
    setOptimizerModalOpen,
    activeTab,
    setActiveTab,
    metrics,
    analysis,
    queue,
    records,
    hardwareCapabilities,
    settings,
    isAnalyzing,
    fetchRecords,
    updateSettings,
    analyzeVault,
    queueVaultOptimization,
    pauseJob,
    resumeJob,
    cancelJob,
    retryJob,
    clearCompletedQueue,
    pauseAll,
    resumeAll,
    restoreOriginal,
    generateVisualComparison,
    subscribeToProgress
  } = useOptimizerStore()

  const [selectedProfile, setSelectedProfile] =
    useState<OptimizationProfile>('balanced')
  const [searchFilter, setSearchFilter] = useState('')
  const [excludedLessons, setExcludedLessons] = useState<Set<string>>(new Set())
  const [allowSharedFiles, setAllowSharedFiles] = useState(false)

  useEffect(() => {
    if (isOptimizerModalOpen) {
      const unsub = subscribeToProgress()
      return () => unsub()
    }
    return undefined
  }, [isOptimizerModalOpen, subscribeToProgress])

  if (!isOptimizerModalOpen) return null

  const handleStartVaultOptimization = async (): Promise<void> => {
    if (!analysis) {
      await analyzeVault(selectedProfile)
    }
    await queueVaultOptimization({
      profile: selectedProfile,
      excludedLessonIds: Array.from(excludedLessons),
      allowSharedOptimization: allowSharedFiles
    })
  }

  const getStatusBadge = (status: OptimizationJobStatus): React.JSX.Element => {
    switch (status) {
      case 'encoding':
        return (
          <Badge className="bg-primary text-primary-foreground animate-pulse text-[10px] h-5 gap-1">
            <Zap className="h-3 w-3" /> Codificando
          </Badge>
        )
      case 'validating':
        return (
          <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] h-5 gap-1">
            <ShieldCheck className="h-3 w-3" /> Validando
          </Badge>
        )
      case 'backing_up':
        return (
          <Badge className="bg-accent/20 text-accent border-accent/30 text-[10px] h-5">
            Criando Backup
          </Badge>
        )
      case 'replacing':
        return (
          <Badge className="bg-accent/20 text-accent border-accent/30 text-[10px] h-5">
            Ativando
          </Badge>
        )
      case 'completed':
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] h-5 gap-1">
            <CheckCircle2 className="h-3 w-3" /> Concluído
          </Badge>
        )
      case 'paused':
        return (
          <Badge
            variant="outline"
            className="text-muted-foreground text-[10px] h-5 gap-1"
          >
            <Pause className="h-3 w-3" /> Pausado
          </Badge>
        )
      case 'requires_review':
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] h-5 gap-1">
            <AlertTriangle className="h-3 w-3" /> Requer Revisão
          </Badge>
        )
      case 'failed':
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] h-5">
            Falhou
          </Badge>
        )
      case 'queued':
      default:
        return (
          <Badge variant="outline" className="text-[10px] h-5">
            Na Fila
          </Badge>
        )
    }
  }

  return (
    <Dialog open={isOptimizerModalOpen} onOpenChange={setOptimizerModalOpen}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden bg-card border-border/80 shadow-2xl rounded-3xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <DialogHeader className="p-5 pb-3 border-b border-border/50 bg-muted/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-md">
                <HardDrive className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-extrabold text-foreground flex items-center gap-2">
                  <span>Otimizador de Armazenamento de Vídeo</span>
                  <Badge
                    variant="outline"
                    className="text-[10px] h-4.5 px-1.5 border-primary/40 text-primary"
                  >
                    v0.7
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Reduza o espaço em disco dos seus cursos mantendo qualidade
                  impecável e backup original seguro.
                </DialogDescription>
              </div>
            </div>

            {/* Hardware Capability Badge */}
            <div className="flex items-center gap-2">
              {hardwareCapabilities?.hardwareAccelerationAvailable ? (
                <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs px-2.5 py-0.5 gap-1.5 shadow-xs">
                  <Zap className="h-3.5 w-3.5 fill-emerald-400" />
                  <span>
                    Aceleração GPU ({hardwareCapabilities.preferredHevcEncoder})
                  </span>
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-muted-foreground text-xs px-2.5 py-0.5 gap-1.5"
                >
                  <Cpu className="h-3.5 w-3.5" />
                  <span>Modo CPU (Software)</span>
                </Badge>
              )}
            </div>
          </div>

          {/* Tabs Navigation */}
          <div className="flex items-center gap-1.5 mt-4 pt-2 border-t border-border/40 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'overview'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Visão Geral</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('analyze')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'analyze'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              }`}
            >
              <FileCheck className="h-3.5 w-3.5" />
              <span>Análise & Revisão</span>
              {analysis && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 text-white font-mono">
                  {analysis.recommendedCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('queue')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'queue'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Fila de Otimização</span>
              {queue.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-primary/30 text-primary font-mono">
                  {queue.filter((q) => q.status !== 'completed').length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('history')
                fetchRecords()
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              <span>Histórico & Backups</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'settings'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              }`}
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Configurações</span>
            </button>
          </div>
        </DialogHeader>

        {/* Tab Content Body */}
        <div className="flex-1 p-5 overflow-y-auto min-h-[350px]">
          {/* TAB 1: VISÃO GERAL */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Metrics Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="p-4 rounded-2xl border border-border/80 bg-card shadow-xs">
                  <span className="text-xs text-muted-foreground">
                    Tamanho Total da Biblioteca
                  </span>
                  <p className="text-2xl font-black text-foreground mt-1">
                    {formatBytes(metrics?.totalVaultSizeBytes || 0)}
                  </p>
                  <span className="text-[11px] text-muted-foreground">
                    {metrics?.totalVideosCount || 0} vídeos registrados
                  </span>
                </div>

                <div className="p-4 rounded-2xl border border-primary/40 bg-primary/5 shadow-xs">
                  <span className="text-xs text-primary font-semibold">
                    Economia Potencial Estimada
                  </span>
                  <p className="text-2xl font-black text-primary mt-1">
                    ~
                    {formatBytes(
                      metrics?.potentialSavingsBytes ||
                        analysis?.estimatedTotalSavingsBytes ||
                        0
                    )}
                  </p>
                  <span className="text-[11px] text-primary/80">
                    {analysis
                      ? `${analysis.estimatedTotalSavingsPercent}% de redução`
                      : 'Analise para estimar'}
                  </span>
                </div>

                <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 shadow-xs">
                  <span className="text-xs text-emerald-400 font-semibold">
                    Espaço Já Economizado
                  </span>
                  <p className="text-2xl font-black text-emerald-400 mt-1">
                    {formatBytes(metrics?.alreadySavedBytes || 0)}
                  </p>
                  <span className="text-[11px] text-emerald-400/80">
                    {metrics?.optimizedVideosCount || 0} vídeos otimizados
                  </span>
                </div>

                <div className="p-4 rounded-2xl border border-border/80 bg-card shadow-xs">
                  <span className="text-xs text-muted-foreground">
                    Backups Ativos em Disco
                  </span>
                  <p className="text-2xl font-black text-foreground mt-1">
                    {formatBytes(metrics?.backupsSizeBytes || 0)}
                  </p>
                  <span className="text-[11px] text-muted-foreground">
                    Retenção de {settings?.backupRetentionDays || 7} dias
                  </span>
                </div>
              </div>

              {/* Action Banner */}
              <div className="p-5 rounded-2xl border border-primary/30 bg-primary/10 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1 max-w-lg">
                  <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span>Otimização Inteligente e Determinística</span>
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    O Orbia analisa cada arquivo individualmente. Vídeos que já
                    estão eficientes (AV1, HEVC com baixa taxa de bits) são
                    preservados sem re-codificação inútil.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={() => analyzeVault(selectedProfile)}
                    disabled={isAnalyzing}
                    className="h-10 px-4 text-xs font-semibold rounded-xl gap-2"
                  >
                    {isAnalyzing ? (
                      <div className="h-3.5 w-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Search className="h-3.5 w-3.5" />
                    )}
                    <span>Analisar Biblioteca (Leitura)</span>
                  </Button>

                  <Button
                    onClick={handleStartVaultOptimization}
                    disabled={isAnalyzing}
                    className="h-10 px-5 text-xs font-bold rounded-xl bg-primary text-primary-foreground shadow-md gap-2"
                  >
                    <Zap className="h-4 w-4" />
                    <span>Otimizar Biblioteca</span>
                  </Button>
                </div>
              </div>

              {/* Profile Selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground">
                  Perfil de Otimização Desejado:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div
                    onClick={() => setSelectedProfile('balanced')}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                      selectedProfile === 'balanced'
                        ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                        : 'border-border/80 bg-card hover:bg-muted/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">
                        Equilibrado (Recomendado)
                      </span>
                      {selectedProfile === 'balanced' && (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      HEVC CRF 23. Perfeita nitidez para aulas, código e slides
                      com redução de ~40-60% do tamanho.
                    </p>
                  </div>

                  <div
                    onClick={() => setSelectedProfile('max_quality')}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                      selectedProfile === 'max_quality'
                        ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                        : 'border-border/80 bg-card hover:bg-muted/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">
                        Qualidade Máxima
                      </span>
                      {selectedProfile === 'max_quality' && (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      HEVC CRF 19. Preservação quase sem perdas para vídeos com
                      texturas complexas ou cinema.
                    </p>
                  </div>

                  <div
                    onClick={() => setSelectedProfile('space_saving')}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                      selectedProfile === 'space_saving'
                        ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                        : 'border-border/80 bg-card hover:bg-muted/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">
                        Economia Extrema
                      </span>
                      {selectedProfile === 'space_saving' && (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      HEVC CRF 26 + redução automática de 4K para 1080p.
                      Economia de até ~70-80% do espaço.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ANÁLISE & REVISÃO */}
          {activeTab === 'analyze' && (
            <div className="space-y-4">
              {!analysis ? (
                <div className="p-12 text-center space-y-3">
                  <Search className="h-10 w-10 text-muted-foreground mx-auto" />
                  <p className="text-sm font-bold text-foreground">
                    Nenhuma análise realizada ainda.
                  </p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Clique no botão abaixo para escanear a biblioteca e gerar as
                    recomendações detalhadas por arquivo.
                  </p>
                  <Button
                    onClick={() => analyzeVault(selectedProfile)}
                    disabled={isAnalyzing}
                    className="h-9 px-4 text-xs font-bold rounded-xl bg-primary text-primary-foreground gap-2"
                  >
                    <Search className="h-3.5 w-3.5" />
                    <span>Escanear Mídias Agora</span>
                  </Button>
                </div>
              ) : (
                <>
                  {/* Filter & Actions Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/20 p-3 rounded-2xl border border-border/50">
                    <div className="flex items-center gap-3">
                      <Input
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        placeholder="Filtrar por curso ou aula..."
                        className="h-8 text-xs bg-background w-64 rounded-xl"
                      />
                      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={allowSharedFiles}
                          onChange={(e) =>
                            setAllowSharedFiles(e.target.checked)
                          }
                          className="rounded border-border text-primary"
                        />
                        <span>
                          Autorizar otimização de arquivos compartilhados entre
                          Vaults
                        </span>
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={handleStartVaultOptimization}
                        className="h-8 px-4 text-xs font-bold rounded-xl bg-primary text-primary-foreground gap-1.5"
                      >
                        <Zap className="h-3.5 w-3.5" />
                        <span>
                          Otimizar Selecionados (
                          {
                            analysis.plans.filter(
                              (p) =>
                                !p.isAlreadyEfficient &&
                                !excludedLessons.has(p.lessonId)
                            ).length
                          }
                          )
                        </span>
                      </Button>
                    </div>
                  </div>

                  {/* Plans Table */}
                  <div className="border border-border/70 rounded-2xl overflow-hidden shadow-xs">
                    <div className="max-h-[50vh] overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-muted/40 text-muted-foreground sticky top-0 border-b border-border z-10">
                          <tr>
                            <th className="p-3 w-10">
                              <input
                                type="checkbox"
                                checked={excludedLessons.size === 0}
                                onChange={(e) => {
                                  if (e.target.checked)
                                    setExcludedLessons(new Set())
                                  else {
                                    setExcludedLessons(
                                      new Set(
                                        analysis.plans.map((p) => p.lessonId)
                                      )
                                    )
                                  }
                                }}
                                className="rounded"
                              />
                            </th>
                            <th className="p-3">Curso & Aula</th>
                            <th className="p-3">Original</th>
                            <th className="p-3">Proposta</th>
                            <th className="p-3">Economia Estimada</th>
                            <th className="p-3 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {analysis.plans
                            .filter(
                              (p) =>
                                !searchFilter ||
                                p.courseTitle
                                  .toLowerCase()
                                  .includes(searchFilter.toLowerCase()) ||
                                p.lessonTitle
                                  .toLowerCase()
                                  .includes(searchFilter.toLowerCase())
                            )
                            .map((plan) => {
                              const isExcluded = excludedLessons.has(
                                plan.lessonId
                              )

                              return (
                                <tr
                                  key={plan.lessonId}
                                  className={`hover:bg-muted/20 transition-colors ${
                                    plan.isAlreadyEfficient
                                      ? 'opacity-60 bg-muted/5'
                                      : ''
                                  }`}
                                >
                                  <td className="p-3">
                                    <input
                                      type="checkbox"
                                      disabled={plan.isAlreadyEfficient}
                                      checked={
                                        !isExcluded && !plan.isAlreadyEfficient
                                      }
                                      onChange={(e) => {
                                        const next = new Set(excludedLessons)
                                        if (e.target.checked)
                                          next.delete(plan.lessonId)
                                        else next.add(plan.lessonId)
                                        setExcludedLessons(next)
                                      }}
                                      className="rounded"
                                    />
                                  </td>

                                  <td className="p-3 max-w-xs">
                                    <div
                                      className="break-words whitespace-normal font-bold text-foreground leading-snug"
                                      title={plan.lessonTitle}
                                    >
                                      {plan.lessonTitle}
                                    </div>
                                    <div
                                      className="break-words whitespace-normal text-[11px] text-muted-foreground leading-snug"
                                      title={plan.courseTitle}
                                    >
                                      {plan.courseTitle}
                                    </div>
                                    {plan.warnings.map((w, i) => (
                                      <span
                                        key={i}
                                        className="inline-flex items-center gap-1 text-[10px] text-primary mt-0.5 mr-2"
                                      >
                                        <AlertTriangle className="h-2.5 w-2.5" />{' '}
                                        {w}
                                      </span>
                                    ))}
                                  </td>

                                  <td className="p-3 whitespace-nowrap">
                                    <div className="font-semibold text-foreground">
                                      {formatBytes(plan.sourceSize)}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground uppercase">
                                      {plan.sourceCodec} •{' '}
                                      {plan.sourceResolution}
                                    </div>
                                  </td>

                                  <td className="p-3 whitespace-nowrap">
                                    {plan.isAlreadyEfficient ? (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] text-muted-foreground"
                                      >
                                        Já Eficiente (Pular)
                                      </Badge>
                                    ) : (
                                      <>
                                        <div className="font-bold text-emerald-400">
                                          ~
                                          {formatBytes(
                                            plan.estimatedTargetSize
                                          )}
                                        </div>
                                        <div className="text-[11px] text-primary uppercase">
                                          HEVC • {plan.targetResolution}
                                        </div>
                                      </>
                                    )}
                                  </td>

                                  <td className="p-3 whitespace-nowrap">
                                    {plan.isAlreadyEfficient ? (
                                      <span className="text-muted-foreground text-xs">
                                        —
                                      </span>
                                    ) : (
                                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                                        -{plan.estimatedSavingsPercent}% (~
                                        {formatBytes(
                                          plan.estimatedSavingsBytes
                                        )}
                                        )
                                      </Badge>
                                    )}
                                  </td>

                                  <td className="p-3 text-right whitespace-nowrap">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        generateVisualComparison(
                                          plan.lessonId,
                                          selectedProfile
                                        )
                                      }
                                      className="h-7 px-2.5 text-xs text-primary hover:bg-primary/10 rounded-lg gap-1"
                                      title="Comparar amostras de vídeo lado a lado com zoom"
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                      <span>Comparar</span>
                                    </Button>
                                  </td>
                                </tr>
                              )
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 3: FILA DE OTIMIZAÇÃO */}
          {activeTab === 'queue' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-muted/20 p-3 rounded-2xl border border-border/50">
                <span className="text-xs font-bold text-foreground">
                  Fila de Processamento ({queue.length} itens)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={pauseAll}
                    className="h-7 text-xs rounded-xl gap-1"
                  >
                    <Pause className="h-3 w-3" /> Pausar Todos
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={resumeAll}
                    className="h-7 text-xs rounded-xl gap-1"
                  >
                    <Play className="h-3 w-3" /> Retomar Todos
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={clearCompletedQueue}
                    className="h-7 text-xs rounded-xl gap-1 text-muted-foreground"
                  >
                    <Trash2 className="h-3 w-3" /> Limpar Concluídos
                  </Button>
                </div>
              </div>

              {queue.length === 0 ? (
                <div className="p-12 text-center text-xs text-muted-foreground">
                  Nenhum trabalho na fila de otimização no momento.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[50vh] overflow-y-auto">
                  {queue.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-2xl border border-border/70 bg-card shadow-xs space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="block break-words whitespace-normal text-xs font-bold text-foreground leading-snug">
                            {getBasename(item.sourcePath)}
                          </span>
                          <span className="block break-words whitespace-normal text-[11px] text-muted-foreground leading-snug">
                            {item.sourcePath}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {getStatusBadge(item.status)}

                          {item.status === 'paused' ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => resumeJob(item.id)}
                              className="h-7 w-7 rounded-lg"
                            >
                              <Play className="h-3.5 w-3.5 text-primary" />
                            </Button>
                          ) : item.status === 'queued' ||
                            item.status === 'ready' ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => pauseJob(item.id)}
                              className="h-7 w-7 rounded-lg"
                            >
                              <Pause className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          ) : item.status === 'failed' ||
                            item.status === 'requires_review' ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => retryJob(item.id)}
                              className="h-7 w-7 rounded-lg"
                              title="Tentar novamente"
                            >
                              <RotateCcw className="h-3.5 w-3.5 text-primary" />
                            </Button>
                          ) : null}

                          {item.status !== 'completed' && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => cancelJob(item.id)}
                              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-red-400"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Progress Bar & Telemetry */}
                      {item.status === 'encoding' && (
                        <div className="space-y-1 pt-1">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>
                              Progresso:{' '}
                              <strong className="text-primary font-mono">
                                {item.progressPercent.toFixed(1)}%
                              </strong>
                            </span>
                            <div className="flex items-center gap-3 font-mono">
                              {item.currentSpeed && (
                                <span>Velocidade: {item.currentSpeed}</span>
                              )}
                              {item.currentFps && (
                                <span>{item.currentFps} FPS</span>
                              )}
                              {item.etaSeconds && (
                                <span>ETA: {formatTime(item.etaSeconds)}</span>
                              )}
                            </div>
                          </div>
                          <Progress
                            value={item.progressPercent}
                            className="h-2 rounded-full"
                          />
                        </div>
                      )}

                      {item.errorMessage && (
                        <p className="text-[11px] text-red-400 bg-red-500/10 p-2 rounded-lg border border-red-500/20">
                          {item.errorMessage}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: HISTÓRICO & RESTAURAÇÃO */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="bg-muted/20 p-3 rounded-2xl border border-border/50 flex items-center justify-between text-xs">
                <span className="font-bold text-foreground">
                  Registro de Mídias Otimizadas & Proveniência
                </span>
                <span className="text-muted-foreground">
                  {records.length} registros
                </span>
              </div>

              {records.length === 0 ? (
                <div className="p-12 text-center text-xs text-muted-foreground">
                  Nenhum registro histórico de otimização encontrado neste
                  Vault.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[50vh] overflow-y-auto">
                  {records.map((r) => (
                    <div
                      key={r.id}
                      className="p-3.5 rounded-2xl border border-border/70 bg-card shadow-xs flex items-start justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <span className="block break-words whitespace-normal text-xs font-bold text-foreground leading-snug">
                          {getBasename(r.optimizedPath)}
                        </span>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>
                            Original: {formatBytes(r.originalSize)} (
                            {r.originalCodec})
                          </span>
                          <ArrowRight className="h-3 w-3" />
                          <span className="text-emerald-400 font-semibold">
                            Otimizado: {formatBytes(r.optimizedSize)} (
                            {r.optimizedCodec})
                          </span>
                          <span>
                            • Economia:{' '}
                            <strong className="text-emerald-400">
                              {formatBytes(r.actualSavingsBytes)}
                            </strong>
                          </span>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          if (
                            confirm(
                              `Restaurar o arquivo original (${formatBytes(r.originalSize)})?`
                            )
                          ) {
                            await restoreOriginal(r.id)
                          }
                        }}
                        className="h-8 px-3 text-xs font-semibold rounded-xl gap-1.5 shrink-0"
                      >
                        <RotateCcw className="h-3.5 w-3.5 text-primary" />
                        <span>Restaurar Original</span>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: CONFIGURAÇÕES */}
          {activeTab === 'settings' && (
            <div className="space-y-5 max-w-2xl">
              <div className="p-4 rounded-2xl border border-border/70 bg-card space-y-4">
                <h4 className="text-xs font-bold text-foreground">
                  Automação de Mídias
                </h4>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-foreground">
                      Otimizar automaticamente novos vídeos importados
                    </label>
                    <p className="text-[11px] text-muted-foreground">
                      Analisa e agenda otimização logo após a importação de um
                      novo curso.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(settings?.autoOptimizeNewMedia)}
                    onChange={(e) =>
                      updateSettings({ autoOptimizeNewMedia: e.target.checked })
                    }
                    className="h-4 w-4 rounded text-primary"
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <div>
                    <label className="text-xs font-semibold text-foreground">
                      Economia mínima para auto-otimizar
                    </label>
                    <p className="text-[11px] text-muted-foreground">
                      Só agenda se a economia esperada for igual ou maior que a
                      porcentagem.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-primary font-mono">
                    {settings?.autoOptimizeMinSavingsPercent || 20}%
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-2xl border border-border/70 bg-card space-y-4">
                <h4 className="text-xs font-bold text-foreground">
                  Gerenciamento de Recursos do Sistema
                </h4>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-foreground">
                      Pausar enquanto estiver assistindo a uma aula
                    </label>
                    <p className="text-[11px] text-muted-foreground">
                      Prioridade total para o player de vídeo, garantindo zero
                      travamentos.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings?.pauseWhileWatching ?? true}
                    onChange={(e) =>
                      updateSettings({ pauseWhileWatching: e.target.checked })
                    }
                    className="h-4 w-4 rounded text-primary"
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <div>
                    <label className="text-xs font-semibold text-foreground">
                      Pausar quando estiver na bateria
                    </label>
                    <p className="text-[11px] text-muted-foreground">
                      Economiza energia quando o notebook não estiver conectado
                      na tomada.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings?.pauseOnBattery ?? true}
                    onChange={(e) =>
                      updateSettings({ pauseOnBattery: e.target.checked })
                    }
                    className="h-4 w-4 rounded text-primary"
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <div>
                    <label className="text-xs font-semibold text-foreground">
                      Continuar otimizando em segundo plano com a janela fechada
                    </label>
                    <p className="text-[11px] text-muted-foreground">
                      Permite que a fila de compressão termine mesmo se você
                      fechar a janela do app.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings?.continueWhenWindowClosed ?? true}
                    onChange={(e) =>
                      updateSettings({
                        continueWhenWindowClosed: e.target.checked
                      })
                    }
                    className="h-4 w-4 rounded text-primary"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 border-t border-border/50 bg-muted/20 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            A integridade física dos seus vídeos é a prioridade número um do
            Orbia.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOptimizerModalOpen(false)}
            className="rounded-xl text-xs"
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
