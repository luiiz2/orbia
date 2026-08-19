import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FolderSearch,
  FolderArchive,
  Loader2,
  AlertCircle,
  FileArchive,
  Sparkles,
  FolderOpen
} from 'lucide-react'
import type { ProposedCourseStructure } from '@shared'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button
} from '../ui'
import { useLibraryStore, useNavigationStore } from '../../stores'
import { ImportPreview } from './ImportPreview'

interface ImportWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImportWizard({ open, onOpenChange }: ImportWizardProps): React.JSX.Element {
  const { t } = useTranslation()
  const { importCourse, isLoading } = useLibraryStore()
  const { navigateToCourse } = useNavigationStore()

  const [step, setStep] = useState<'select' | 'extracting' | 'scanning' | 'preview'>('select')
  const [scannedProposal, setScannedProposal] = useState<ProposedCourseStructure | null>(null)
  const [isExternal, setIsExternal] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Extraction Progress State
  const [extractProgress, setExtractProgress] = useState<{ percent: number; currentFile: string }>({
    percent: 0,
    currentFile: ''
  })
  const [isDragging, setIsDragging] = useState(false)

  // Register extraction progress listener
  useEffect(() => {
    if (!window.api?.courses?.onExtractProgress) return

    const unsubscribe = window.api.courses.onExtractProgress((progress) => {
      setExtractProgress(progress)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const processSourcePath = async (filePath: string, isZip: boolean): Promise<void> => {
    setError(null)
    let pathToScan = filePath

    if (isZip) {
      setStep('extracting')
      setExtractProgress({ percent: 0, currentFile: 'Preparing extraction...' })

      try {
        const extractRes = await window.api.courses.extractZip(filePath)
        if (!extractRes.success || !extractRes.extractedPath) {
          throw new Error(extractRes.error || 'Failed to extract .zip archive.')
        }
        pathToScan = extractRes.extractedPath
        // Since it is extracted inside the Vault's Inbox, default to local-vault
        setIsExternal(false)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error extracting .zip archive')
        setStep('select')
        return
      }
    }

    setStep('scanning')
    try {
      const result = await window.api.courses.scanFolder(pathToScan)
      if (result.success && result.proposal) {
        setScannedProposal(result.proposal)
        setStep('preview')
      } else {
        setError(result.error || 'Failed to analyze course directory structure.')
        setStep('select')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error scanning folder')
      setStep('select')
    }
  }

  const handleSelectSource = async (): Promise<void> => {
    setError(null)
    const source = await window.api.courses.selectSource()
    if (!source) return

    await processSourcePath(source.path, source.isZip)
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>): Promise<void> => {
    e.preventDefault()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      // In Electron, File objects have a .path property
      const filePath = (file as unknown as { path?: string }).path || file.name
      const isZip = filePath.toLowerCase().endsWith('.zip')
      await processSourcePath(filePath, isZip)
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (): void => {
    setIsDragging(false)
  }

  const handleConfirmImport = async (): Promise<void> => {
    if (!scannedProposal) return

    setError(null)
    const result = await importCourse(scannedProposal, isExternal)
    if (result.success && result.course) {
      onOpenChange(false)
      setStep('select')
      setScannedProposal(null)
      // Navigate to the newly imported course
      navigateToCourse(result.course.id)
    } else {
      setError(result.error || 'Failed to import course into library.')
    }
  }

  const handleCancel = (): void => {
    onOpenChange(false)
    setStep('select')
    setScannedProposal(null)
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] flex flex-col bg-card border-border text-foreground rounded-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <FolderArchive className="w-5 h-5" />
            <DialogTitle className="text-lg font-bold">{t('import.title')}</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {step === 'preview'
              ? t('import.previewSubtitle')
              : step === 'extracting'
                ? t('import.extracting')
                : t('import.selectFolderSubtitle')}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 text-xs bg-destructive/15 border border-destructive/30 rounded-xl text-destructive flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-2">
          {step === 'select' && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`py-10 px-4 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center space-y-4 transition-all duration-200 cursor-pointer ${
                isDragging
                  ? 'border-primary bg-primary/10 scale-[1.01]'
                  : 'border-border/80 bg-secondary/20 hover:border-primary/50 hover:bg-secondary/40'
              }`}
              onClick={handleSelectSource}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shadow-lg shadow-orange-500/10">
                  <FolderOpen className="w-6 h-6" />
                </div>
                <div className="w-12 h-12 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-lg shadow-purple-500/10">
                  <FileArchive className="w-6 h-6" />
                </div>
              </div>

              <div className="space-y-1.5 max-w-md">
                <h4 className="text-sm font-bold text-foreground">
                  {t('import.dropZone')}
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t('import.selectFolderSubtitle')}
                </p>
              </div>

              <Button
                type="button"
                variant="default"
                size="sm"
                className="mt-2 font-semibold shadow-lg shadow-orange-500/20 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-white rounded-xl"
                onClick={(e) => {
                  e.stopPropagation()
                  handleSelectSource()
                }}
              >
                <FolderSearch className="w-4 h-4 mr-2" />
                {t('vault.browse')}
              </Button>
            </div>
          )}

          {step === 'extracting' && (
            <div className="py-12 px-6 flex flex-col items-center justify-center text-center space-y-5">
              <div className="relative flex items-center justify-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shadow-xl shadow-orange-500/10">
                  <FileArchive className="w-8 h-8 animate-bounce" />
                </div>
              </div>

              <div className="space-y-2 w-full max-w-sm">
                <h4 className="text-sm font-bold text-foreground flex items-center justify-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-primary" />
                  {t('import.extracting')}
                </h4>

                {/* Animated Progress Bar */}
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden border border-border/60">
                  <div
                    className="h-full bg-gradient-to-r from-orange-500 via-amber-500 to-purple-600 transition-all duration-200 rounded-full"
                    style={{ width: `${Math.max(5, extractProgress.percent)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                  <span className="truncate max-w-[240px]" title={extractProgress.currentFile}>
                    {extractProgress.currentFile || 'Extracting files...'}
                  </span>
                  <span className="font-bold text-primary">{extractProgress.percent}%</span>
                </div>
              </div>
            </div>
          )}

          {step === 'scanning' && (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-4">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-foreground">
                  {t('import.scanning')}
                </h4>
                <p className="text-xs text-muted-foreground">
                  Detecting modules, video lessons, natural sort order, and materials...
                </p>
              </div>
            </div>
          )}

          {step === 'preview' && scannedProposal && (
            <ImportPreview
              proposal={scannedProposal}
              onUpdateProposal={setScannedProposal}
              isExternal={isExternal}
              onToggleExternal={setIsExternal}
            />
          )}
        </div>

        <DialogFooter className="border-t border-border pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            disabled={isLoading}
            className="rounded-xl text-xs"
          >
            {t('common.cancel')}
          </Button>

          {step === 'preview' && (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleConfirmImport}
              disabled={isLoading || !scannedProposal}
              className="font-semibold shadow-lg shadow-orange-500/20 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-white rounded-xl"
            >
              {isLoading && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              {t('import.confirmImport')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
