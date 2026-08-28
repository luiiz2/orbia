import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FolderSearch,
  Folder,
  FileVideo,
  CheckCircle2,
  AlertCircle,
  Loader2,
  BookOpen
} from 'lucide-react'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { useLibraryStore } from '../../stores/useLibraryStore'
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
import type { ProposedCourseStructure } from '@shared'

export function ImportModal(): React.JSX.Element {
  const { t } = useTranslation()
  const { isImportModalOpen, setImportModalOpen, navigateToCourse } =
    useNavigationStore()
  const { importCourse } = useLibraryStore()

  const [step, setStep] = useState<'select' | 'scanning' | 'preview'>('select')
  const [selectedPath, setSelectedPath] = useState<string>('')
  const [proposal, setProposal] = useState<ProposedCourseStructure | null>(null)
  const [courseTitle, setCourseTitle] = useState<string>('')
  const [isExternal, setIsExternal] = useState<boolean>(true)
  const [isImporting, setIsImporting] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSelectFolder = async (): Promise<void> => {
    try {
      setErrorMessage(null)
      const folderPath = await window.api.vault.selectDirectory()
      if (!folderPath) return

      setSelectedPath(folderPath)
      setStep('scanning')

      const res = await window.api.courses.scanFolder(folderPath)
      if (res.success && res.proposal) {
        setProposal(res.proposal)
        setCourseTitle(res.proposal.suggestedTitle)
        setStep('preview')
      } else {
        setErrorMessage(res.error || 'Failed to scan course directory')
        setStep('select')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMessage(msg)
      setStep('select')
    }
  }

  const handleConfirmImport = async (): Promise<void> => {
    if (!proposal) return

    setIsImporting(true)
    setErrorMessage(null)

    try {
      const updatedProposal: ProposedCourseStructure = {
        ...proposal,
        suggestedTitle: courseTitle.trim() || proposal.suggestedTitle
      }

      const res = await importCourse(updatedProposal, isExternal)
      if (res.success && res.course) {
        handleClose()
        navigateToCourse(res.course.id)
      } else {
        setErrorMessage(res.error || 'Import failed')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMessage(msg)
    } finally {
      setIsImporting(false)
    }
  }

  const handleClose = (): void => {
    setImportModalOpen(false)
    setStep('select')
    setSelectedPath('')
    setProposal(null)
    setCourseTitle('')
    setErrorMessage(null)
    setIsImporting(false)
  }

  return (
    <Dialog
      open={isImportModalOpen}
      onOpenChange={(open) => !open && handleClose()}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <DialogTitle>{t('import.title')}</DialogTitle>
          </div>
          <DialogDescription>
            {step === 'preview'
              ? t('import.previewSubtitle')
              : 'Add local course files to your study library'}
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/15 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Step 1: Select Folder */}
        {step === 'select' && (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center space-y-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/80 text-muted-foreground">
              <FolderSearch className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Select a course directory on disk
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                Orbia will scan and organize video files and modules
                automatically.
              </p>
            </div>
            <Button
              onClick={handleSelectFolder}
              size="lg"
              className="gap-2 shadow"
            >
              <Folder className="h-4 w-4" />
              <span>{t('import.selectFolder')}</span>
            </Button>
          </div>
        )}

        {/* Step 2: Scanning */}
        {step === 'scanning' && (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <p className="text-sm font-medium text-foreground">
              {t('import.scanning')}
            </p>
            <p className="text-xs font-mono text-muted-foreground truncate max-w-md">
              {selectedPath}
            </p>
          </div>
        )}

        {/* Step 3: Preview Structure */}
        {step === 'preview' && proposal && (
          <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
            {/* Title Editing */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {t('import.courseTitle')}
              </label>
              <Input
                value={courseTitle}
                onChange={(e) => setCourseTitle(e.target.value)}
                placeholder="Course Title"
                className="h-9 font-medium"
              />
            </div>

            {/* Storage Mode Selection */}
            <div className="rounded-xl border border-border/80 bg-secondary/20 p-3 space-y-2">
              <span className="text-xs font-semibold text-foreground">
                Storage Mode
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setIsExternal(true)}
                  className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                    isExternal
                      ? 'border-primary bg-primary/10 text-foreground font-semibold'
                      : 'border-border/60 bg-card text-muted-foreground hover:bg-secondary/40'
                  }`}
                >
                  <p className="font-semibold text-foreground">
                    {t('import.referenceExternal')}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Leave original files in their current directory.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setIsExternal(false)}
                  className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                    !isExternal
                      ? 'border-primary bg-primary/10 text-foreground font-semibold'
                      : 'border-border/60 bg-card text-muted-foreground hover:bg-secondary/40'
                  }`}
                >
                  <p className="font-semibold text-foreground">
                    {t('import.saveToVault')}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Copy or manage course inside your active Study Folder.
                  </p>
                </button>
              </div>
            </div>

            {/* Modules & Lessons Detected List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                <span>
                  Detected Curriculum ({proposal.modules.length} modules,{' '}
                  {proposal.totalLessons} lessons)
                </span>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2 rounded-xl border border-border/60 bg-card/60 p-2">
                {proposal.modules.map((mod, idx) => (
                  <div
                    key={mod.id || idx}
                    className="rounded-lg border border-border/40 bg-secondary/20 p-2 text-xs"
                  >
                    <div className="flex items-center gap-2 font-semibold text-foreground mb-1">
                      <Folder className="h-3.5 w-3.5 text-primary" />
                      <span>{mod.title}</span>
                      <span className="text-[10px] text-muted-foreground font-normal">
                        ({mod.lessons.length} lessons)
                      </span>
                    </div>

                    <div className="pl-5 space-y-1">
                      {mod.lessons.slice(0, 4).map((lesson, lIdx) => (
                        <div
                          key={lesson.id || lIdx}
                          className="flex items-center gap-1.5 text-muted-foreground truncate text-[11px]"
                        >
                          <FileVideo className="h-3 w-3 shrink-0" />
                          <span className="truncate">{lesson.title}</span>
                        </div>
                      ))}
                      {mod.lessons.length > 4 && (
                        <p className="text-[10px] text-muted-foreground italic">
                          + {mod.lessons.length - 4} more lessons
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t border-border">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isImporting}
          >
            {t('common.cancel')}
          </Button>

          {step === 'preview' && (
            <Button
              onClick={handleConfirmImport}
              disabled={isImporting}
              className="gap-1.5 shadow"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t('common.loading')}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{t('import.confirmImport')}</span>
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
