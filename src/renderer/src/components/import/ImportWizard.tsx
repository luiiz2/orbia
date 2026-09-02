import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  Cloud,
  FileArchive,
  FolderArchive,
  FolderOpen,
  FolderSearch,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  XCircle
} from 'lucide-react'
import type {
  CommitImportSessionInput,
  ImportSourceCapability,
  ImportSessionPreparation,
  ImportSessionPreview,
  ImportSessionSourceKind,
  ImportSessionValidation,
  PrepareImportSourceInput
} from '@shared'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui'
import { useLibraryStore, useNavigationStore } from '../../stores'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { ImportPreview } from './ImportPreview'
import { GoogleDriveBrowserModal } from './GoogleDriveBrowserModal'

type ImportStep = 'select' | 'processing' | 'preview' | 'validation'
type BatchStatus =
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'validation-failed'
  | 'error'
  | 'committing'
  | 'committed'

interface BatchItem {
  id: string
  name: string
  sourceToken: string
  isZip: boolean
  sourceKind?: ImportSessionSourceKind
  sessionId?: string
  status: BatchStatus
  extractProgress: number
  currentExtractFile: string
  validation?: ImportSessionValidation
  preview?: ImportSessionPreview
  isExternal: boolean
  selected: boolean
  error: string | null
}

interface ImportWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Builds the only renderer-authored changes accepted by a secure import session. */
export function buildImportTitleEdits(
  preview: ImportSessionPreview
): NonNullable<CommitImportSessionInput['titleEdits']> {
  return {
    courseTitle: preview.suggestedTitle,
    modules: preview.modules.map((module) => ({
      id: module.id,
      title: module.title
    })),
    lessons: preview.modules.flatMap((module) =>
      module.lessons.map((lesson) => ({ id: lesson.id, title: lesson.title }))
    )
  }
}

/** The active wizard can prepare only a Main-issued source capability. */
export function buildSourcePreparationRequest(
  source: Pick<ImportSourceCapability, 'token'>
): PrepareImportSourceInput {
  return { token: source.token }
}

export function ImportWizard({
  open,
  onOpenChange
}: ImportWizardProps): React.JSX.Element {
  const { t } = useTranslation()
  const { fetchCourses } = useLibraryStore()
  const { navigateToCourse } = useNavigationStore()
  const { settings, updateSetting } = useSettingsStore()
  const deleteSourceZip = settings.deleteSourceZipAfterImport ?? false

  const [step, setStep] = useState<ImportStep>('select')
  const [batchItems, setBatchItems] = useState<BatchItem[]>([])
  const [activeItemIndex, setActiveItemIndex] = useState(0)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [isCommitting, setIsCommitting] = useState(false)
  const [isSavingZipPreference, setIsSavingZipPreference] = useState(false)
  const [googleDriveOpen, setGoogleDriveOpen] = useState(false)

  const batchItemsRef = useRef<BatchItem[]>([])
  const preparationRunRef = useRef(0)
  const wasOpenRef = useRef(open)
  const closingRef = useRef(false)
  const savingZipPreferenceRef = useRef(false)
  const committingRef = useRef(false)

  const replaceBatchItems = useCallback((next: BatchItem[]): void => {
    batchItemsRef.current = next
    setBatchItems(next)
  }, [])

  const updateBatchItems = useCallback(
    (updater: (current: BatchItem[]) => BatchItem[]): void => {
      setBatchItems((current) => {
        const next = updater(current)
        batchItemsRef.current = next
        return next
      })
    },
    []
  )

  const resetWizard = useCallback((): void => {
    replaceBatchItems([])
    setStep('select')
    setActiveItemIndex(0)
    setGlobalError(null)
  }, [replaceBatchItems])

  const cancelPendingSessions = useCallback(
    async (items: BatchItem[]): Promise<void> => {
      await Promise.all(
        items.flatMap((item) => {
          if (
            !item.sessionId ||
            item.status === 'committing' ||
            item.status === 'committed'
          )
            return []
          return [
            window.api.courses
              .cancelImportSession(item.sessionId)
              .catch(() => undefined)
          ]
        })
      )
    },
    []
  )

  const discardPreparations = useCallback(async (): Promise<void> => {
    preparationRunRef.current += 1
    const pendingItems = batchItemsRef.current
    await cancelPendingSessions(pendingItems)
    resetWizard()
  }, [cancelPendingSessions, resetWizard])

  useEffect(() => {
    if (!window.api?.courses?.onExtractProgress) return

    return window.api.courses.onExtractProgress((progress) => {
      updateBatchItems((items) =>
        items.map((item) =>
          item.status === 'preparing'
            ? {
                ...item,
                extractProgress: progress.percent,
                currentExtractFile: displayFileName(progress.currentFile)
              }
            : item
        )
      )
    })
  }, [updateBatchItems])

  useEffect(() => {
    if (wasOpenRef.current && !open) {
      preparationRunRef.current += 1
      const pendingItems = batchItemsRef.current
      resetWizard()
      void cancelPendingSessions(pendingItems)
    }
    wasOpenRef.current = open
  }, [cancelPendingSessions, open, resetWizard])

  useEffect(() => {
    return () => {
      preparationRunRef.current += 1
      void cancelPendingSessions(batchItemsRef.current)
    }
  }, [cancelPendingSessions])

  const startBatchProcessing = async (
    sources: ImportSourceCapability[]
  ): Promise<void> => {
    if (sources.length === 0) return

    preparationRunRef.current += 1
    const runId = preparationRunRef.current
    const priorItems = batchItemsRef.current
    if (priorItems.length > 0) await cancelPendingSessions(priorItems)
    if (runId !== preparationRunRef.current) return

    const queue = sources.map(createBatchItem)
    replaceBatchItems(queue)
    setStep('processing')
    setGlobalError(null)

    for (let index = 0; index < queue.length; index += 1) {
      if (runId !== preparationRunRef.current) return

      const item = queue[index]
      item.status = 'preparing'
      item.extractProgress = 0
      item.currentExtractFile = ''
      replaceBatchItems([...queue])

      try {
        const preparation = item.isZip
          ? await window.api.courses.prepareZipImport(
              buildSourcePreparationRequest({ token: item.sourceToken })
            )
          : await window.api.courses.prepareFolderImport(
              buildSourcePreparationRequest({ token: item.sourceToken })
            )

        if (runId !== preparationRunRef.current) {
          if (preparation.success) {
            await window.api.courses
              .cancelImportSession(preparation.sessionId)
              .catch(() => undefined)
          }
          return
        }

        if (!preparation.success) {
          item.status = 'error'
          item.error = t('import.prepareFailed')
          replaceBatchItems([...queue])
          continue
        }

        item.sessionId = preparation.sessionId
        item.sourceKind = preparation.sourceKind
        item.isExternal =
          preparation.sourceKind === 'zip' ? false : item.isExternal
        item.validation = preparation.validation

        if (!preparation.validation.verificationOk || !preparation.preview) {
          item.status = 'validation-failed'
          item.preview = undefined
          item.selected = false
          item.error = t('import.validationFailed')
        } else {
          item.status = 'ready'
          item.preview = preparation.preview
          item.error = null
        }
      } catch {
        if (runId !== preparationRunRef.current) return
        item.status = 'error'
        item.error = t('import.prepareFailed')
      }

      replaceBatchItems([...queue])
    }

    if (runId !== preparationRunRef.current) return

    const firstReadyIndex = queue.findIndex(
      (item) => item.status === 'ready' && item.preview
    )
    setActiveItemIndex(firstReadyIndex >= 0 ? firstReadyIndex : 0)
    if (firstReadyIndex >= 0) {
      setStep('preview')
    } else {
      setGlobalError(t('import.noValidSources'))
      setStep('validation')
    }
  }

  const handleSelectZip = async (): Promise<void> => {
    setGlobalError(null)
    const sources = await window.api.courses.selectZip()
    if (sources && sources.length > 0) await startBatchProcessing(sources)
  }

  const handleSelectFolder = async (): Promise<void> => {
    setGlobalError(null)
    const sources = await window.api.courses.selectFolder()
    if (sources && sources.length > 0) await startBatchProcessing(sources)
  }

  const handleSelectMultiCourseRoot = async (): Promise<void> => {
    setGlobalError(null)
    const selected = await window.api.courses.selectMultiCourseFolder()
    if (!selected) return

    setStep('processing')
    try {
      const scanResult = await window.api.courses.scanMultiCourseFolder(
        buildSourcePreparationRequest(selected)
      )
      if (
        !scanResult.success ||
        !scanResult.preparations ||
        scanResult.preparations.length === 0
      ) {
        setGlobalError(
          scanResult.error ||
            t(
              'import.noCoursesFoundInRoot',
              'Nenhum curso identificado nesta pasta.'
            )
        )
        setStep('select')
        return
      }

      const queue: BatchItem[] = scanResult.preparations.map(
        (preparation: ImportSessionPreparation, idx) => {
          const ready =
            preparation.validation.verificationOk &&
            Boolean(preparation.preview)
          return {
            id: `multi-${Date.now()}-${idx}`,
            name: preparation.suggestedTitle,
            sourceToken: '',
            isZip: false,
            sourceKind: preparation.sourceKind,
            sessionId: preparation.sessionId,
            status: ready ? ('ready' as const) : ('validation-failed' as const),
            extractProgress: 100,
            currentExtractFile: '',
            isExternal: true,
            selected: ready,
            error: ready ? null : t('import.validationFailed'),
            validation: preparation.validation,
            preview: preparation.preview
          }
        }
      )

      replaceBatchItems(queue)
      setActiveItemIndex(0)
      setStep('preview')
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : String(err))
      setStep('select')
    }
  }

  const handleReselectSources = async (isZip: boolean): Promise<void> => {
    if (isCommitting) return
    const sources = isZip
      ? await window.api.courses.selectZip()
      : await window.api.courses.selectFolder()
    if (!sources || sources.length === 0) return
    await discardPreparations()
    await startBatchProcessing(sources)
  }

  const updateActivePreview = (preview: ImportSessionPreview): void => {
    const activeItem = batchItemsRef.current[activeItemIndex]
    if (!activeItem) return
    updateBatchItems((items) =>
      items.map((item) =>
        item.id === activeItem.id ? { ...item, preview } : item
      )
    )
  }

  const toggleActiveExternal = (isExternal: boolean): void => {
    const activeItem = batchItemsRef.current[activeItemIndex]
    if (!activeItem || activeItem.sourceKind === 'zip') return
    updateBatchItems((items) =>
      items.map((item) =>
        item.id === activeItem.id ? { ...item, isExternal } : item
      )
    )
  }

  const toggleItemSelection = (itemId: string): void => {
    updateBatchItems((items) =>
      items.map((item) =>
        item.id === itemId ? { ...item, selected: !item.selected } : item
      )
    )
  }

  const handleConfirmImport = async (): Promise<void> => {
    if (savingZipPreferenceRef.current || committingRef.current) return

    const selectedItems = batchItemsRef.current.filter(
      (item) => item.status === 'ready' && item.selected && item.preview
    )

    if (selectedItems.length === 0) {
      setGlobalError(t('import.selectAtLeastOne'))
      return
    }

    setGlobalError(null)
    committingRef.current = true
    setIsCommitting(true)
    const importedCourseIds: string[] = []

    try {
      // 1. Process session-backed items (zip / single folder)
      const sessionItems = selectedItems.filter((item) => item.sessionId)
      for (const item of sessionItems) {
        if (!item.sessionId || !item.preview) continue
        const sessionId = item.sessionId
        const preview = item.preview

        updateBatchItems((items) =>
          items.map((current) =>
            current.id === item.id
              ? { ...current, status: 'committing', error: null }
              : current
          )
        )

        const result = await window.api.courses.commitImportSession({
          sessionId,
          isExternal: item.sourceKind === 'zip' ? false : item.isExternal,
          titleEdits: buildImportTitleEdits(preview)
        })

        if (!result.success || !result.course) {
          updateBatchItems((items) =>
            items.map((current) =>
              current.id === item.id
                ? {
                    ...current,
                    status: 'ready',
                    error: t('import.importFailed')
                  }
                : current
            )
          )
          setGlobalError(t('import.importFailed'))
          return
        }

        importedCourseIds.push(result.course.id)
        updateBatchItems((items) =>
          items.map((current) =>
            current.id === item.id
              ? {
                  ...current,
                  status: 'committed',
                  sessionId: undefined,
                  error: null
                }
              : current
          )
        )
      }

      await fetchCourses()
      const remainingSessions = batchItemsRef.current
      await cancelPendingSessions(remainingSessions)
      resetWizard()
      onOpenChange(false)
      if (importedCourseIds[0]) navigateToCourse(importedCourseIds[0])
    } catch {
      setGlobalError(t('import.importFailed'))
    } finally {
      committingRef.current = false
      setIsCommitting(false)
    }
  }

  const handleClose = async (): Promise<void> => {
    if (committingRef.current || closingRef.current) return
    closingRef.current = true
    await discardPreparations()
    onOpenChange(false)
    closingRef.current = false
  }

  const handleDeleteZipPreferenceChange = async (
    checked: boolean
  ): Promise<void> => {
    savingZipPreferenceRef.current = true
    setIsSavingZipPreference(true)
    try {
      await updateSetting('deleteSourceZipAfterImport', checked)
    } finally {
      savingZipPreferenceRef.current = false
      setIsSavingZipPreference(false)
    }
  }

  const activeItem = batchItems[activeItemIndex]
  const readySelectedCount = batchItems.filter(
    (item) =>
      item.status === 'ready' && item.selected && item.preview && item.sessionId
  ).length
  const attentionItems = batchItems.filter(
    (item) => item.status === 'validation-failed' || item.status === 'error'
  )
  const isBusy = isCommitting

  return (
    <>
      <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) void handleClose()
      }}
    >
      <DialogContent
        className="flex max-h-[90vh] flex-col rounded-2xl border-border bg-card text-foreground sm:max-w-[760px]"
        onEscapeKeyDown={(event) => {
          if (isBusy) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (isBusy) event.preventDefault()
        }}
      >
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <FolderArchive className="h-5 w-5" />
            <DialogTitle className="text-lg font-bold">
              {t('import.title')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {step === 'preview'
              ? t('import.queueCourses', { count: readySelectedCount })
              : step === 'processing'
                ? t('import.processingDescription')
                : step === 'validation'
                  ? t('import.validationDescription')
                  : t('import.multiSourceDescription')}
          </DialogDescription>
        </DialogHeader>

        {globalError && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{globalError}</span>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {step === 'select' && (
            <div className="space-y-4">
              <div className="rounded-2xl border-2 border-dashed border-border/80 bg-secondary/20 p-8 text-center">
                <FolderSearch className="mx-auto mb-3 h-9 w-9 text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  {t('import.multiSourceHeading')}
                </h3>
                <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                  {t('import.multiSourceDescription')}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleSelectZip()}
                  >
                    <FileArchive className="h-3.5 w-3.5" />
                    {t('import.selectZipMultiple')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleSelectFolder()}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    {t('import.selectFolderMultiple')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleSelectMultiCourseRoot()}
                  >
                    <FolderSearch className="h-3.5 w-3.5 text-primary" />
                    {t(
                      'import.selectMultiCourseRoot',
                      'Pasta com Vários Cursos'
                    )}
                  </Button>
                </div>
                <p className="mx-auto mt-3 max-w-lg text-[11px] leading-relaxed text-muted-foreground">
                  {t('import.googleDriveFolderHint')}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false)
                    setGoogleDriveOpen(true)
                  }}
                  className="mt-2 border-primary/40 text-primary hover:bg-primary/10"
                >
                  <Cloud className="h-3.5 w-3.5" />
                  {t('import.selectGoogleDriveFolder')}
                </Button>
              </div>

              <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border/70 bg-card p-3 text-xs">
                <input
                  type="checkbox"
                  checked={deleteSourceZip}
                  onChange={(event) =>
                    void handleDeleteZipPreferenceChange(event.target.checked)
                  }
                  disabled={isSavingZipPreference}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span>
                  <span className="block font-medium text-foreground">
                    {t('import.deleteZipAfterImport')}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    {t('import.zipTransferNotice')}
                  </span>
                </span>
              </label>
            </div>
          )}

          {step === 'processing' && <ProcessingQueue items={batchItems} />}

          {step === 'validation' && (
            <ValidationAttention
              items={attentionItems}
              disabled={isBusy}
              onDiscard={() => void discardPreparations()}
              onReplace={(isZip) => void handleReselectSources(isZip)}
            />
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {batchItems.map((item, index) => {
                  if (item.status !== 'ready' || !item.preview) return null
                  const active = index === activeItemIndex
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveItemIndex(index)}
                      className={`flex min-w-[150px] items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                        active
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-card text-muted-foreground hover:bg-secondary/60'
                      }`}
                    >
                      <FileArchive className="h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 break-words whitespace-normal font-medium leading-snug">
                        {item.preview.suggestedTitle}
                      </span>
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => toggleItemSelection(item.id)}
                        aria-label={t('import.selectCourse', {
                          name: item.preview.suggestedTitle
                        })}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                    </button>
                  )
                })}
              </div>

              {activeItem?.preview && activeItem.status === 'ready' && (
                <ImportPreview
                  preview={activeItem.preview}
                  onUpdatePreview={updateActivePreview}
                  isExternal={
                    activeItem.sourceKind === 'zip'
                      ? false
                      : activeItem.isExternal
                  }
                  onToggleExternal={toggleActiveExternal}
                  sourceKind={
                    activeItem.sourceKind ??
                    (activeItem.isZip ? 'zip' : 'folder')
                  }
                />
              )}

              {activeItem?.error && activeItem.status === 'ready' && (
                <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{activeItem.error}</span>
                </div>
              )}

              {attentionItems.length > 0 && (
                <ValidationAttention
                  items={attentionItems}
                  disabled={isBusy}
                  onDiscard={() => void discardPreparations()}
                  onReplace={(isZip) => void handleReselectSources(isZip)}
                />
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void handleClose()}
            disabled={isBusy}
          >
            {t('common.cancel')}
          </Button>

          {step === 'preview' && (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => void handleConfirmImport()}
              disabled={
                isBusy || isSavingZipPreference || readySelectedCount === 0
              }
              className="rounded-xl bg-primary font-semibold shadow-lg shadow-primary/20"
            >
              {isBusy ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              {t('import.importSelected', { count: readySelectedCount })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
      </Dialog>
      <GoogleDriveBrowserModal
        open={googleDriveOpen}
        onOpenChange={setGoogleDriveOpen}
      />
    </>
  )
}

function ProcessingQueue({ items }: { items: BatchItem[] }): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        {t('import.processingQueue', { count: items.length })}
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-border/70 bg-card p-3"
          >
            <div className="flex items-start justify-between gap-3 text-xs">
              <div className="flex min-w-0 items-start gap-2">
                {item.isZip ? (
                  <FileArchive className="h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
                )}
                <span className="min-w-0 flex-1 break-words whitespace-normal font-medium text-foreground leading-snug">
                  {item.name}
                </span>
              </div>
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {t(statusKey(item.status))}
              </Badge>
            </div>
            {item.status === 'preparing' && (
              <>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.max(4, item.extractProgress)}%` }}
                  />
                </div>
                <p className="mt-1.5 break-words whitespace-normal text-[11px] text-muted-foreground leading-snug">
                  {item.currentExtractFile || t('import.preparing')}
                </p>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ValidationAttention({
  items,
  disabled,
  onDiscard,
  onReplace
}: {
  items: BatchItem[]
  disabled: boolean
  onDiscard: () => void
  onReplace: (isZip: boolean) => void
}): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <div className="space-y-3 rounded-2xl border border-primary/40 bg-primary/10 p-3.5">
      <div className="flex items-start gap-2.5">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <p className="text-xs font-bold text-primary">
            {t('import.validationTitle')}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-primary/80">
            {t('import.validationDescription')}
          </p>
        </div>
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-xl border border-primary/30 bg-card/50 p-3"
        >
          <div className="flex items-start gap-2 text-xs font-semibold text-foreground">
            <XCircle className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 break-words whitespace-normal leading-snug">
              {item.name}
            </span>
          </div>
          {item.validation?.failedEntries &&
          item.validation.failedEntries.length > 0 ? (
            <>
              <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                {t('import.failedFiles')}
              </p>
              <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto text-[11px] text-muted-foreground">
                {item.validation.failedEntries.slice(0, 12).map((entry) => (
                  <li
                    key={entry}
                    className="break-words whitespace-normal leading-snug"
                  >
                    {entry}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {item.error || t('import.validationNoDetails')}
            </p>
          )}
          {item.validation?.warnings && item.validation.warnings.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
              {item.validation.warnings.slice(0, 3).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="mt-3"
            onClick={() => onReplace(item.isZip)}
            disabled={disabled}
          >
            <RefreshCw className="h-3 w-3" />
            {t('import.replaceSource')}
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDiscard}
        disabled={disabled}
      >
        <Trash2 className="h-3.5 w-3.5" />
        {t('import.discardPreparation')}
      </Button>
    </div>
  )
}

function createBatchItem(source: ImportSourceCapability): BatchItem {
  return {
    id: `import-${crypto.randomUUID()}`,
    name: source.name,
    sourceToken: source.token,
    isZip: source.isZip,
    status: 'pending',
    extractProgress: 0,
    currentExtractFile: '',
    isExternal: !source.isZip,
    selected: true,
    error: null
  }
}

function displayFileName(value: string): string {
  const parts = value.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || value
}

function statusKey(status: BatchStatus): string {
  switch (status) {
    case 'pending':
      return 'import.pending'
    case 'preparing':
      return 'import.preparing'
    case 'ready':
      return 'import.ready'
    case 'validation-failed':
      return 'import.validationFailed'
    case 'committing':
      return 'import.committing'
    case 'committed':
      return 'import.committed'
    default:
      return 'import.error'
  }
}
