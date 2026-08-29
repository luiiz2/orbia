import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  GitMerge,
  Loader2,
  Sparkles,
  Wand2
} from 'lucide-react'
import type { AutoOrganizeResult, Course, MergePreview } from '@shared'
import { useLibraryStore } from '../../stores/useLibraryStore'
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
import { cn } from '../../lib/utils'
import { ManualMergeScreen, type ManualMergeGroup } from './ManualMergeScreen'

export interface MergeCoursesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialSelectedCourseIds?: readonly string[]
  initialScreen?: 'options' | 'manual'
}

export function MergeCoursesModal({
  open,
  onOpenChange,
  initialSelectedCourseIds,
  initialScreen
}: MergeCoursesModalProps): React.JSX.Element {
  const { t } = useTranslation()
  const { courses, autoOrganizeLibrary } = useLibraryStore()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<MergePreview | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [isMerging, setIsMerging] = useState(false)
  const [isAutoOrganizing, setIsAutoOrganizing] = useState(false)
  const [autoResult, setAutoResult] = useState<AutoOrganizeResult | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [screen, setScreen] = useState<'options' | 'manual'>('options')
  const initialIdsKey = (initialSelectedCourseIds ?? []).join('\u0000')

  const duplicateGroups = useMemo(() => findDuplicateGroups(courses), [courses])

  useEffect(() => {
    if (!open) return

    const initialIds = initialIdsKey ? initialIdsKey.split('\u0000') : []
    setSelectedIds(new Set(initialIds))
    setPreview(null)
    setPreviewError(null)
    setAutoResult(null)
    setScreen(initialScreen ?? 'options')
  }, [initialIdsKey, initialScreen, open])

  const handleAutoOrganize = async (): Promise<void> => {
    setIsAutoOrganizing(true)
    setPreviewError(null)
    setAutoResult(null)
    try {
      const res = await autoOrganizeLibrary()
      setAutoResult(res)
    } catch (err) {
      setPreviewError(
        err instanceof Error ? err.message : 'Falha ao organizar biblioteca.'
      )
    } finally {
      setIsAutoOrganizing(false)
    }
  }

  const requestPreview = useCallback(
    async (courseIds: string[]): Promise<void> => {
      const uniqueIds = [...new Set(courseIds)]
      if (uniqueIds.length < 2) return

      setIsLoadingPreview(true)
      setPreviewError(null)
      setPreview(null)

      try {
        const result = await window.api.courses.getMergePreview(uniqueIds)
        if (!result.success) {
          setPreviewError(t('merge.previewError'))
          return
        }

        setPreview(result.preview)
        setSelectedIds(new Set(result.preview.selectedCourseIds))
      } catch {
        setPreviewError(t('merge.previewError'))
      } finally {
        setIsLoadingPreview(false)
      }
    },
    [t]
  )

  const handleApplyMerge = async (): Promise<void> => {
    if (!preview || selectedIds.size < 2) return
    setIsMerging(true)
    setPreviewError(null)
    try {
      const result = await window.api.courses.mergeCourses([...selectedIds])
      if (!result.success) {
        setPreviewError(
          result.error || t('merge.mergeError', 'Falha ao mesclar cursos.')
        )
        return
      }
      await useLibraryStore.getState().fetchCourses()
      handleOpenChange(false)
      if (result.canonicalCourseId) {
        useLibraryStore.getState().fetchCourseById(result.canonicalCourseId)
      }
    } catch (err) {
      setPreviewError(
        err instanceof Error
          ? err.message
          : t('merge.mergeError', 'Falha ao mesclar cursos.')
      )
    } finally {
      setIsMerging(false)
    }
  }

  const toggleCourse = (courseId: string): void => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(courseId)) {
        next.delete(courseId)
      } else {
        next.add(courseId)
      }
      return next
    })
    setPreview(null)
    setPreviewError(null)
  }

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      setSelectedIds(new Set())
      setPreview(null)
      setPreviewError(null)
      setAutoResult(null)
      setScreen('options')
    }
    onOpenChange(nextOpen)
  }

  const handleOpenManual = (): void => {
    setPreview(null)
    setPreviewError(null)
    setScreen('manual')
  }

  const handleBackToOptions = (): void => {
    setPreview(null)
    setPreviewError(null)
    setScreen('options')
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          'flex max-h-[90vh] flex-col rounded-2xl border-border/80 bg-card p-6 shadow-2xl',
          screen === 'manual' ? 'sm:max-w-3xl' : 'sm:max-w-xl'
        )}
      >
        {screen === 'manual' ? (
          <ManualMergeScreen
            courses={courses}
            duplicateGroups={duplicateGroups}
            selectedIds={selectedIds}
            preview={preview}
            isLoadingPreview={isLoadingPreview}
            isMerging={isMerging}
            previewError={previewError}
            onRequestPreview={(courseIds) => void requestPreview(courseIds)}
            onToggleCourse={toggleCourse}
            onApplyMerge={() => void handleApplyMerge()}
            onBack={handleBackToOptions}
          />
        ) : (
          <>
            <DialogHeader className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary shadow-sm">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-foreground">
                    {t(
                      'merge.autoOrganizeTitle',
                      'Organizar e Unir Biblioteca'
                    )}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    {t(
                      'merge.autoOrganizeDesc',
                      'Separa cursos misturados por engano, unifica módulos duplicados e junta partes do mesmo curso automaticamente.'
                    )}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="my-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              {previewError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{previewError}</span>
                </div>
              )}

              {/* One-Click Automatic Organization Card */}
              <div className="space-y-3.5 rounded-2xl border border-primary/30 bg-card p-4.5 shadow-sm">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Wand2 className="h-4 w-4 text-primary" />
                    <h3 className="text-xs font-bold text-foreground">
                      Organização Inteligente Automática
                    </h3>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    O Orbia analisa toda a biblioteca, separa cursos com pastas
                    de origem distintas (ex:{' '}
                    <span className="font-semibold text-zinc-300">
                      curso.dec
                    </span>{' '}
                    e{' '}
                    <span className="font-semibold text-zinc-300">
                      voss academy
                    </span>
                    ), funde módulos com mesmo nome e reordena todas as aulas
                    sem você precisar selecionar nada manualmente.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="default"
                  disabled={isAutoOrganizing}
                  onClick={handleAutoOrganize}
                  className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary text-xs font-bold text-primary-foreground shadow-md shadow-primary/15 hover:opacity-95"
                >
                  {isAutoOrganizing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" />
                      <span>
                        {t('merge.autoOrganizing', 'Organizando biblioteca...')}
                      </span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 text-primary-foreground" />
                      <span>
                        {t(
                          'merge.autoOrganizeBtn',
                          'Organizar e Unir Tudo Automaticamente'
                        )}
                      </span>
                    </>
                  )}
                </Button>

                {/* Results Feedback Banner */}
                {autoResult && (
                  <div className="animate-in fade-in space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 duration-200">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>
                        {t(
                          'merge.autoOrganizeSuccess',
                          'Biblioteca organizada com sucesso!'
                        )}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                      {autoResult.separatedCoursesCount > 0 && (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                        >
                          {autoResult.separatedCoursesCount} curso(s) separados
                        </Badge>
                      )}
                      {autoResult.deduplicatedModulesCount > 0 && (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                        >
                          {autoResult.deduplicatedModulesCount} módulo(s)
                          duplicados unificados
                        </Badge>
                      )}
                      {autoResult.mergedGroupsCount > 0 && (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                        >
                          {autoResult.mergedGroupsCount} parte(s) unificadas
                        </Badge>
                      )}
                      {autoResult.separatedCoursesCount === 0 &&
                        autoResult.deduplicatedModulesCount === 0 &&
                        autoResult.mergedGroupsCount === 0 && (
                          <span className="text-[11px] text-zinc-300">
                            Tudo já estava organizado e separado corretamente!
                          </span>
                        )}
                    </div>

                    {autoResult.details.length > 0 && (
                      <div className="mt-2 max-h-32 space-y-1 overflow-y-auto pr-1">
                        {autoResult.details.map((d, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-1.5 text-[10px] text-zinc-300"
                          >
                            <span className="font-bold text-emerald-400">
                              •
                            </span>
                            <span>{d.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleOpenManual}
                className="group w-full cursor-pointer rounded-2xl border border-primary/45 bg-primary/5 p-4 text-left shadow-sm transition-all hover:border-primary/75 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              >
                <span className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/35 bg-primary/15 text-primary transition-transform group-hover:scale-105">
                    <GitMerge className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block text-sm font-bold text-foreground">
                      {t(
                        'merge.manualTitle',
                        'Organizar manualmente e unir cursos'
                      )}
                    </span>
                    <span className="block text-[11px] leading-relaxed text-muted-foreground">
                      {t(
                        'merge.manualDesc',
                        'Escolha os cursos que deseja juntar, revise a prévia e confirme cada alteração.'
                      )}
                    </span>
                  </span>
                  <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-primary transition-transform group-hover:translate-x-1" />
                </span>
                <span className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-primary">
                  {t('merge.manualAction', 'Abrir organização manual')}
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </button>
            </div>

            <DialogFooter className="flex items-center justify-between gap-2 border-t border-border/50 pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleOpenChange(false)}
              >
                {t('common.close', 'Fechar')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function findDuplicateGroups(courses: Course[]): ManualMergeGroup[] {
  const groups = new Map<string, ManualMergeGroup>()

  for (const course of courses) {
    const normalizedTitle = normalizeTitle(course.title)
    if (!normalizedTitle) continue
    const group = groups.get(normalizedTitle)
    if (group) {
      group.courses.push(course)
    } else {
      groups.set(normalizedTitle, { title: course.title, courses: [course] })
    }
  }

  return [...groups.values()].filter((group) => group.courses.length > 1)
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
