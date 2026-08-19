import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FolderSearch,
  FolderArchive,
  Loader2,
  AlertCircle,
  FileArchive,
  Sparkles,
  FolderOpen,
  CheckCircle2,
  XCircle,
  Image as ImageIcon
} from 'lucide-react'
import type { ProposedCourseStructure, SelectedCourseSource } from '@shared'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Badge
} from '../ui'
import { useLibraryStore, useNavigationStore } from '../../stores'
import { ImportPreview } from './ImportPreview'

interface BatchItem {
  id: string
  name: string
  sourcePath: string
  isZip: boolean
  status: 'pending' | 'extracting' | 'scanning' | 'ready' | 'error'
  extractProgress: number
  currentExtractFile: string
  proposal: ProposedCourseStructure | null
  isExternal: boolean
  selected: boolean
  error: string | null
}

interface ImportWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImportWizard({ open, onOpenChange }: ImportWizardProps): React.JSX.Element {
  const { t } = useTranslation()
  const { importBatch, importCourse, isLoading } = useLibraryStore()
  const { navigateToCourse } = useNavigationStore()

  const [step, setStep] = useState<'select' | 'processing' | 'preview'>('select')
  const [batchItems, setBatchItems] = useState<BatchItem[]>([])
  const [activeItemIndex, setActiveItemIndex] = useState(0)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Register extraction progress listener
  useEffect(() => {
    if (!window.api?.courses?.onExtractProgress) return

    const unsubscribe = window.api.courses.onExtractProgress((payload) => {
      const anyPayload = payload as { percent: number; currentFile: string; zipPath?: string }
      setBatchItems((prev) =>
        prev.map((item) => {
          if (item.status === 'extracting') {
            return {
              ...item,
              extractProgress: anyPayload.percent,
              currentExtractFile: anyPayload.currentFile
            }
          }
          return item
        })
      )
    })

    return () => {
      unsubscribe()
    }
  }, [])

  // Process the queue of batch items
  const startBatchProcessing = async (sources: SelectedCourseSource[]): Promise<void> => {
    if (sources.length === 0) return

    const initialItems: BatchItem[] = sources.map((s, idx) => ({
      id: `item-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      name: s.name,
      sourcePath: s.path,
      isZip: s.isZip,
      status: 'pending',
      extractProgress: 0,
      currentExtractFile: '',
      proposal: null,
      isExternal: !s.isZip, // default external for folders, vault-managed for extracted zips
      selected: true,
      error: null
    }))

    setBatchItems(initialItems)
    setStep('processing')
    setGlobalError(null)

    const updatedItems = [...initialItems]

    for (let i = 0; i < updatedItems.length; i++) {
      const item = updatedItems[i]
      let pathToScan = item.sourcePath

      if (item.isZip) {
        item.status = 'extracting'
        item.extractProgress = 0
        item.currentExtractFile = 'Preparando extração...'
        setBatchItems([...updatedItems])

        try {
          const extractRes = await window.api.courses.extractZip(item.sourcePath)
          if (!extractRes.success || !extractRes.extractedPath) {
            throw new Error(extractRes.error || 'Falha ao extrair arquivo .zip.')
          }
          pathToScan = extractRes.extractedPath
          item.isExternal = false
        } catch (err: unknown) {
          item.status = 'error'
          item.error = err instanceof Error ? err.message : 'Erro na extração'
          setBatchItems([...updatedItems])
          continue
        }
      }

      item.status = 'scanning'
      setBatchItems([...updatedItems])

      try {
        const scanRes = await window.api.courses.scanFolder(pathToScan)
        if (scanRes.success && scanRes.proposal) {
          item.proposal = scanRes.proposal
          item.status = 'ready'
        } else {
          item.status = 'error'
          item.error = scanRes.error || 'Falha ao analisar estrutura do curso.'
        }
      } catch (err: unknown) {
        item.status = 'error'
        item.error = err instanceof Error ? err.message : 'Erro no escaneamento'
      }

      setBatchItems([...updatedItems])
    }

    // Set first ready item as active
    const firstReadyIdx = updatedItems.findIndex((it) => it.status === 'ready')
    setActiveItemIndex(firstReadyIdx >= 0 ? firstReadyIdx : 0)

    const hasAnyReady = updatedItems.some((it) => it.status === 'ready')
    if (hasAnyReady) {
      setStep('preview')
    } else {
      setGlobalError('Nenhum curso válido pôde ser importado dos arquivos selecionados.')
    }
  }

  const handleSelectZip = async (): Promise<void> => {
    setGlobalError(null)
    const sources = await window.api.courses.selectZip()
    if (!sources || sources.length === 0) return
    await startBatchProcessing(sources)
  }

  const handleSelectFolder = async (): Promise<void> => {
    setGlobalError(null)
    const sources = await window.api.courses.selectFolder()
    if (!sources || sources.length === 0) return
    await startBatchProcessing(sources)
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>): Promise<void> => {
    e.preventDefault()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const sources: SelectedCourseSource[] = []

      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i]
        const filePath = (file as unknown as { path?: string }).path || file.name
        const isZip = filePath.toLowerCase().endsWith('.zip')
        const name = file.name.replace(/\.[^/.]+$/, '')

        sources.push({
          path: filePath,
          name,
          isZip
        })
      }

      if (sources.length > 0) {
        await startBatchProcessing(sources)
      }
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (): void => {
    setIsDragging(false)
  }

  const handleUpdateActiveProposal = (updated: ProposedCourseStructure): void => {
    setBatchItems((prev) =>
      prev.map((item, idx) => (idx === activeItemIndex ? { ...item, proposal: updated } : item))
    )
  }

  const handleToggleActiveExternal = (isExternal: boolean): void => {
    setBatchItems((prev) =>
      prev.map((item, idx) => (idx === activeItemIndex ? { ...item, isExternal } : item))
    )
  }

  const handleToggleItemSelection = (index: number): void => {
    setBatchItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, selected: !item.selected } : item))
    )
  }

  const handleConfirmImport = async (): Promise<void> => {
    const readyAndSelected = batchItems.filter(
      (it) => it.status === 'ready' && it.proposal && it.selected
    )

    if (readyAndSelected.length === 0) {
      setGlobalError('Selecione ao menos um curso para importar.')
      return
    }

    setGlobalError(null)

    if (readyAndSelected.length === 1) {
      const item = readyAndSelected[0]
      const result = await importCourse(item.proposal!, item.isExternal)
      if (result.success && result.course) {
        onOpenChange(false)
        resetWizard()
        navigateToCourse(result.course.id)
      } else {
        setGlobalError(result.error || 'Falha ao importar curso.')
      }
    } else {
      const importPayload = readyAndSelected.map((item) => ({
        proposal: item.proposal!,
        isExternal: item.isExternal
      }))

      const result = await importBatch(importPayload)
      if (result.success && result.courses && result.courses.length > 0) {
        onOpenChange(false)
        resetWizard()
        navigateToCourse(result.courses[0].id)
      } else {
        setGlobalError(result.error || 'Falha ao importar lote de cursos.')
      }
    }
  }

  const resetWizard = (): void => {
    setStep('select')
    setBatchItems([])
    setActiveItemIndex(0)
    setGlobalError(null)
  }

  const handleCancel = (): void => {
    onOpenChange(false)
    resetWizard()
  }

  const activeItem = batchItems[activeItemIndex]
  const readySelectedCount = batchItems.filter(
    (it) => it.status === 'ready' && it.proposal && it.selected
  ).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px] max-h-[90vh] flex flex-col bg-card border-border text-foreground rounded-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <FolderArchive className="w-5 h-5" />
            <DialogTitle className="text-lg font-bold">{t('import.title')}</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {step === 'preview'
              ? `Revise os cursos detectados (${readySelectedCount} selecionados para importação).`
              : step === 'processing'
                ? 'Processando fila de arquivos e pastas selecionados...'
                : 'Selecione ou arraste quantos cursos desejar (.zip ou pastas) de uma vez só.'}
          </DialogDescription>
        </DialogHeader>

        {globalError && (
          <div className="p-3 text-xs bg-destructive/15 border border-destructive/30 rounded-xl text-destructive flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{globalError}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-2 space-y-4">
          {/* STEP 1: SELECT FILES / FOLDERS / DRAG & DROP */}
          {step === 'select' && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`py-12 px-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center space-y-4 transition-all duration-200 ${
                isDragging
                  ? 'border-primary bg-primary/10 scale-[1.01]'
                  : 'border-border/80 bg-secondary/20 hover:border-primary/50 hover:bg-secondary/40'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-lg shadow-purple-500/10">
                  <FileArchive className="w-6 h-6" />
                </div>
                <div className="w-12 h-12 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shadow-lg shadow-orange-500/10">
                  <FolderOpen className="w-6 h-6" />
                </div>
              </div>

              <div className="space-y-1.5 max-w-md">
                <h4 className="text-sm font-bold text-foreground">
                  Arraste e Solte Múltiplos Cursos (.zip ou Pastas)
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Você pode selecionar quantos cursos quiser de uma só vez para importação simultânea.
                </p>
              </div>

              {/* Action Buttons: Multi-selection zip or folder picker */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="font-semibold shadow-lg shadow-orange-500/20 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-white rounded-xl cursor-pointer"
                  onClick={handleSelectZip}
                >
                  <FileArchive className="w-4 h-4 mr-2" />
                  Selecionar Arquivos .zip (Múltiplos)
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="font-semibold border-border/80 hover:bg-secondary rounded-xl cursor-pointer"
                  onClick={handleSelectFolder}
                >
                  <FolderSearch className="w-4 h-4 mr-2 text-primary" />
                  Selecionar Pastas de Cursos
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: PROCESSING QUEUE */}
          {step === 'processing' && (
            <div className="py-8 px-4 space-y-4">
              <div className="text-center space-y-1">
                <h4 className="text-sm font-bold text-foreground flex items-center justify-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary animate-spin" />
                  Processando Fila de Cursos ({batchItems.length} itens)
                </h4>
                <p className="text-xs text-muted-foreground">
                  Extraindo arquivos compactados e detectando módulos automaticamente...
                </p>
              </div>

              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {batchItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-card border border-border/80 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {item.status === 'ready' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : item.status === 'error' ? (
                        <XCircle className="w-4 h-4 text-destructive shrink-0" />
                      ) : (
                        <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-foreground truncate">{item.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate font-mono">
                          {item.status === 'extracting'
                            ? item.currentExtractFile || 'Extraindo...'
                            : item.status === 'scanning'
                              ? 'Analisando hierarquia...'
                              : item.status === 'ready'
                                ? `${item.proposal?.totalLessons || 0} aulas detectadas`
                                : item.error || 'Pendente...'}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {item.status === 'extracting' && (
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {item.extractProgress}%
                        </Badge>
                      )}
                      {item.status === 'ready' && (
                        <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 text-[10px]">
                          Pronto
                        </Badge>
                      )}
                      {item.status === 'error' && (
                        <Badge variant="destructive" className="text-[10px]">
                          Erro
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW & REVIEW (Single or Multi-Course Tabs) */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* If multiple courses were queued, render a compact selector bar */}
              {batchItems.length > 1 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-1">
                    <span>Cursos na Fila ({batchItems.length})</span>
                    <span>Selecione para revisar ou alternar</span>
                  </div>

                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                    {batchItems.map((item, idx) => {
                      const isActive = idx === activeItemIndex
                      const isReady = item.status === 'ready'

                      return (
                        <div
                          key={item.id}
                          onClick={() => isReady && setActiveItemIndex(idx)}
                          className={`p-2.5 rounded-xl border flex items-center gap-2.5 min-w-[200px] max-w-[240px] shrink-0 transition-all cursor-pointer select-none ${
                            isActive
                              ? 'bg-primary/10 border-primary shadow-sm ring-1 ring-primary/40'
                              : 'bg-card border-border/80 hover:bg-secondary/40'
                          } ${!isReady ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={item.selected && isReady}
                            disabled={!isReady}
                            onChange={(e) => {
                              e.stopPropagation()
                              handleToggleItemSelection(idx)
                            }}
                            className="w-3.5 h-3.5 rounded text-primary focus:ring-0 cursor-pointer"
                          />

                          {/* Mini Cover or Icon */}
                          <div className="w-8 h-8 rounded-lg overflow-hidden bg-secondary border border-border shrink-0 flex items-center justify-center">
                            {item.proposal?.coverPath ? (
                              <img
                                src={`media://${encodeURI(item.proposal.coverPath.replace(/\\/g, '/'))}`}
                                alt={item.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="w-4 h-4 text-muted-foreground opacity-50" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-xs text-foreground truncate">
                              {item.proposal?.suggestedTitle || item.name}
                            </div>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                              <span>{item.proposal?.modules.length || 0} mods</span>
                              <span>•</span>
                              <span>{item.proposal?.totalLessons || 0} aulas</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Active Course Preview View */}
              {activeItem && activeItem.proposal && (
                <ImportPreview
                  proposal={activeItem.proposal}
                  onUpdateProposal={handleUpdateActiveProposal}
                  isExternal={activeItem.isExternal}
                  onToggleExternal={handleToggleActiveExternal}
                />
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border pt-3 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            disabled={isLoading}
            className="rounded-xl text-xs cursor-pointer"
          >
            {t('common.cancel')}
          </Button>

          {step === 'preview' && (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleConfirmImport}
              disabled={isLoading || readySelectedCount === 0}
              className="font-semibold shadow-lg shadow-orange-500/20 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-white rounded-xl cursor-pointer"
            >
              {isLoading && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              {readySelectedCount > 1
                ? `Importar ${readySelectedCount} Cursos Selecionados`
                : t('import.confirmImport')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
