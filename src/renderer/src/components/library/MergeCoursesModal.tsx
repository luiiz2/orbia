import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  GitMerge,
  Layers,
  Loader2,
  Plus,
  ShieldCheck,
  Sparkles,
  Square,
  Wand2
} from 'lucide-react'
import type { AutoOrganizeResult, MergePreview } from '@shared'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui'
import { cn } from '../../lib/utils'

export interface MergeCoursesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface DuplicateGroup {
  title: string
  courses: ReturnType<typeof useLibraryStore.getState>['courses']
}

export function MergeCoursesModal({ open, onOpenChange }: MergeCoursesModalProps): React.JSX.Element {
  const { t } = useTranslation()
  const { courses, autoOrganizeLibrary } = useLibraryStore()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<MergePreview | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [isMerging, setIsMerging] = useState(false)
  const [isAutoOrganizing, setIsAutoOrganizing] = useState(false)
  const [autoResult, setAutoResult] = useState<AutoOrganizeResult | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [showAdvancedManual, setShowAdvancedManual] = useState(false)

  const duplicateGroups = useMemo(() => findDuplicateGroups(courses), [courses])

  const handleAutoOrganize = async (): Promise<void> => {
    setIsAutoOrganizing(true)
    setPreviewError(null)
    setAutoResult(null)
    try {
      const res = await autoOrganizeLibrary()
      setAutoResult(res)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Falha ao organizar biblioteca.')
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
        setPreviewError(result.error || t('merge.mergeError', 'Falha ao mesclar cursos.'))
        return
      }
      await useLibraryStore.getState().fetchCourses()
      handleOpenChange(false)
      if (result.canonicalCourseId) {
        useLibraryStore.getState().fetchCourseById(result.canonicalCourseId)
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : t('merge.mergeError', 'Falha ao mesclar cursos.'))
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
      setShowAdvancedManual(false)
    }
    onOpenChange(nextOpen)
  }

  const selectedCount = selectedIds.size

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col rounded-2xl border-border/80 bg-card p-6 shadow-2xl sm:max-w-xl">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/20 via-orange-500/20 to-purple-600/20 text-amber-400 shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                {t('merge.autoOrganizeTitle', 'Organizar e Unir Biblioteca')}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {t('merge.autoOrganizeDesc', 'Separa cursos misturados por engano, unifica módulos duplicados e junta partes do mesmo curso automaticamente.')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="my-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {previewError && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{previewError}</span>
            </div>
          )}

          {/* ⚡ One-Click Automatic Organization Card */}
          <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-background p-4.5 space-y-3.5 shadow-sm">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-amber-400" />
                <h3 className="text-xs font-bold text-foreground">Organização Inteligente Automática</h3>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                O Orbia analisa toda a biblioteca, separa cursos com pastas de origem distintas (ex: <span className="font-semibold text-zinc-300">curso.dec</span> e <span className="font-semibold text-zinc-300">voss academy</span>), funde módulos com mesmo nome e reordena todas as aulas sem você precisar selecionar nada manualmente.
              </p>
            </div>

            <Button
              type="button"
              variant="default"
              disabled={isAutoOrganizing}
              onClick={handleAutoOrganize}
              className="w-full h-10 text-xs font-bold rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-black hover:opacity-95 shadow-md shadow-orange-500/15 cursor-pointer flex items-center justify-center gap-2"
            >
              {isAutoOrganizing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-black" />
                  <span>{t('merge.autoOrganizing', 'Organizando biblioteca...')}</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-black" />
                  <span>{t('merge.autoOrganizeBtn', '⚡ Organizar e Unir Tudo Automaticamente')}</span>
                </>
              )}
            </Button>

            {/* Results Feedback Banner */}
            {autoResult && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2 animate-in fade-in duration-200">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{t('merge.autoOrganizeSuccess', 'Biblioteca organizada com sucesso!')}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  {autoResult.separatedCoursesCount > 0 && (
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 bg-emerald-500/15">
                      {autoResult.separatedCoursesCount} curso(s) separados
                    </Badge>
                  )}
                  {autoResult.deduplicatedModulesCount > 0 && (
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 bg-emerald-500/15">
                      {autoResult.deduplicatedModulesCount} módulo(s) duplicados unificados
                    </Badge>
                  )}
                  {autoResult.mergedGroupsCount > 0 && (
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 bg-emerald-500/15">
                      {autoResult.mergedGroupsCount} parte(s) unificadas
                    </Badge>
                  )}
                  {autoResult.separatedCoursesCount === 0 && autoResult.deduplicatedModulesCount === 0 && autoResult.mergedGroupsCount === 0 && (
                    <span className="text-[11px] text-zinc-300">
                      Tudo já estava organizado e separado corretamente!
                    </span>
                  )}
                </div>

                {autoResult.details.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-32 overflow-y-auto pr-1">
                    {autoResult.details.map((d, i) => (
                      <div key={i} className="text-[10px] text-zinc-300 flex items-start gap-1.5">
                        <span className="text-emerald-400 font-bold">•</span>
                        <span>{d.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Toggle for Advanced / Manual Merge */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvancedManual(!showAdvancedManual)}
              className="text-[11px] text-muted-foreground hover:text-foreground font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <GitMerge className="h-3.5 w-3.5 text-primary" />
              <span>{showAdvancedManual ? 'Ocultar opções manuais avançadas' : 'Opções avançadas: Mesclagem manual de cursos'}</span>
            </button>
          </div>

          {showAdvancedManual && (
            <div className="space-y-4 pt-2 border-t border-border/50 animate-in fade-in duration-150">
              {duplicateGroups.length > 0 && (
                <section aria-labelledby="merge-suggestions-title" className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 id="merge-suggestions-title" className="text-xs font-bold text-foreground">
                      {t('merge.suggestedGroups', { count: duplicateGroups.length })}
                    </h3>
                  </div>
                  <div className="space-y-1.5">
                    {duplicateGroups.map((group) => {
                      const courseIds = group.courses.map((course) => course.id)
                      const totalLessons = group.courses.reduce((total, course) => total + course.lessonCount, 0)
                      return (
                        <button
                          key={group.title}
                          type="button"
                          onClick={() => void requestPreview(courseIds)}
                          className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-secondary/40 p-2.5 text-left transition-colors hover:bg-secondary/70"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Layers className="h-3.5 w-3.5 shrink-0 text-primary" />
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-bold text-foreground">{group.title}</span>
                              <span className="block text-[10px] text-muted-foreground">
                                {t('merge.groupTotals', { courses: group.courses.length, lessons: totalLessons })}
                              </span>
                            </span>
                          </span>
                          <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}

              <section aria-labelledby="merge-selection-title" className="space-y-2">
                <div className="flex items-center gap-2">
                  <GitMerge className="h-4 w-4 shrink-0 text-primary" />
                  <h3 id="merge-selection-title" className="text-xs font-bold text-foreground">
                    {t('merge.reviewSelectionTitle')}
                  </h3>
                </div>

                <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                  {courses.map((course) => {
                    const selected = selectedIds.has(course.id)
                    return (
                      <button
                        key={course.id}
                        type="button"
                        onClick={() => toggleCourse(course.id)}
                        aria-pressed={selected}
                        aria-label={t('merge.selectCourse', { title: course.title })}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-lg border p-2 text-left transition-all',
                          selected
                            ? 'border-primary/50 bg-primary/10'
                            : 'border-border/60 bg-secondary/30 hover:bg-secondary/60'
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {selected ? (
                            <CheckSquare className="h-3.5 w-3.5 shrink-0 text-primary" />
                          ) : (
                            <Square className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <span className="truncate text-xs font-semibold text-foreground">{course.title}</span>
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {t('merge.courseCounts', { modules: course.moduleCount, lessons: course.lessonCount })}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void requestPreview([...selectedIds])}
                  disabled={isLoadingPreview || selectedCount < 2}
                  className="w-full text-xs h-8"
                >
                  {isLoadingPreview ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {t('merge.reviewSelected', { count: selectedCount })}
                </Button>
              </section>

              {preview && <MergePreviewPanel preview={preview} />}

              {preview && (
                <div className="pt-2">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    disabled={isMerging || selectedCount < 2}
                    onClick={() => void handleApplyMerge()}
                    className="w-full gap-2 bg-gradient-to-r from-orange-500 to-purple-600 text-white font-bold cursor-pointer hover:opacity-90"
                  >
                    {isMerging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitMerge className="h-3.5 w-3.5" />}
                    {t('merge.applyMerge', 'Mesclar Cursos Selecionados')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 border-t border-border/50 pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
            {t('common.close', 'Fechar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MergePreviewPanel({ preview }: { preview: MergePreview }): React.JSX.Element {
  const { t } = useTranslation()
  const mergeModules = preview.modules.filter((module) => module.action === 'merge')
  const createModules = preview.modules.filter((module) => module.action === 'create')

  return (
    <section aria-labelledby="merge-preview-title" className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-3.5">
      <div className="flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <h3 id="merge-preview-title" className="text-xs font-bold text-foreground">
            {t('merge.previewTitle')}
          </h3>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{t('merge.previewSafetyNotice')}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/70 p-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {t('merge.canonicalCourse')}
        </p>
        <p className="mt-1 truncate text-sm font-bold text-foreground">{preview.canonicalCourseTitle}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <PreviewMetric label={t('merge.selectedCourses')} value={preview.selectedCourseIds.length} />
        <PreviewMetric label={t('merge.totalLessons')} value={preview.totalLessons} />
        <PreviewMetric label={t('merge.totalMaterials')} value={preview.totalMaterials} />
        <PreviewMetric label={t('merge.duplicateCandidates')} value={preview.duplicateCandidates.length} />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {t('merge.modulesToMerge', { count: mergeModules.length })}
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            {t('merge.modulesToCreate', { count: createModules.length })}
          </Badge>
        </div>

        {preview.modules.length > 0 ? (
          <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
            {preview.modules.map((module) => (
              <div key={`${module.sourceCourseId}-${module.sourceModuleId}`} className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-card/60 p-2 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  {module.action === 'create' ? (
                    <Plus className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : (
                    <GitMerge className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                  <span className="truncate font-medium text-foreground">{module.title}</span>
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {t('merge.moduleCounts', { lessons: module.lessonCount, materials: module.materialCount })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">{t('merge.noModuleChanges')}</p>
        )}
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
        <p className="text-xs font-bold text-amber-300">{t('merge.duplicateCandidatesTitle')}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-amber-200/80">
          {t('merge.duplicateCandidatesNotice')}
        </p>
        {preview.duplicateCandidates.length > 0 && (
          <ul className="mt-2 space-y-1 text-[11px] text-amber-100/90">
            {preview.duplicateCandidates.map((candidate, index) => (
              <li key={`${candidate.sourceLessonId}-${candidate.targetLessonId}`}>
                {t('merge.duplicateCandidateReason', {
                  index: index + 1,
                  reason: t(`merge.duplicateReasons.${candidate.reason}`)
                })}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function PreviewMetric({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-2 text-center">
      <p className="text-sm font-bold text-foreground">{value}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}

function findDuplicateGroups(courses: ReturnType<typeof useLibraryStore.getState>['courses']): DuplicateGroup[] {
  const groups = new Map<string, DuplicateGroup>()

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
