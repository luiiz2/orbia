import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  ArrowLeft,
  CheckSquare,
  GitMerge,
  Layers,
  Loader2,
  Plus,
  ShieldCheck,
  Sparkles,
  Square
} from 'lucide-react'
import type { Course, MergePreview } from '@shared'
import {
  Badge,
  Button,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui'
import { cn } from '../../lib/utils'

export interface ManualMergeGroup {
  title: string
  courses: Course[]
}

interface ManualMergeScreenProps {
  courses: Course[]
  duplicateGroups: ManualMergeGroup[]
  selectedIds: Set<string>
  preview: MergePreview | null
  isLoadingPreview: boolean
  isMerging: boolean
  previewError: string | null
  onRequestPreview: (courseIds: string[]) => void
  onToggleCourse: (courseId: string) => void
  onApplyMerge: () => void
  onBack: () => void
}

export function ManualMergeScreen({
  courses,
  duplicateGroups,
  selectedIds,
  preview,
  isLoadingPreview,
  isMerging,
  previewError,
  onRequestPreview,
  onToggleCourse,
  onApplyMerge,
  onBack
}: ManualMergeScreenProps): React.JSX.Element {
  const { t } = useTranslation()
  const selectedCount = selectedIds.size

  return (
    <>
      <DialogHeader className="space-y-2">
        <div className="flex items-start gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onBack}
            aria-label={t('merge.manualBack', 'Voltar às opções')}
            title={t('merge.manualBack', 'Voltar às opções')}
            className="mt-0.5 h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary shadow-sm">
              <GitMerge className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-bold text-foreground">
                {t('merge.manualScreenTitle', 'Organização manual')}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {t(
                  'merge.manualScreenDesc',
                  'Escolha os cursos, revise a prévia e confirme a mesclagem quando tudo estiver correto.'
                )}
              </DialogDescription>
            </div>
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

        <div className="flex items-start gap-2.5 rounded-2xl border border-primary/30 bg-primary/10 p-3.5 text-xs text-foreground">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p className="leading-relaxed">
            <span className="font-bold text-primary">
              {t('merge.previewOnly', 'Prévia segura')}:{' '}
            </span>
            {t(
              'merge.manualSafetyNotice',
              'nada muda na biblioteca até você revisar a proposta e confirmar a mesclagem.'
            )}
          </p>
        </div>

        {duplicateGroups.length > 0 && (
          <section
            aria-labelledby="merge-suggestions-title"
            className="space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <h3
                id="merge-suggestions-title"
                className="text-sm font-bold text-foreground"
              >
                {t('merge.suggestedGroups', {
                  count: duplicateGroups.length
                })}
              </h3>
              <span className="text-[10px] text-muted-foreground">
                {t('merge.suggestedGroupsHint', 'Clique para revisar')}
              </span>
            </div>
            <div className="space-y-1.5">
              {duplicateGroups.map((group) => {
                const courseIds = group.courses.map((course) => course.id)
                const totalLessons = group.courses.reduce(
                  (total, course) => total + course.lessonCount,
                  0
                )
                return (
                  <button
                    key={group.title}
                    type="button"
                    onClick={() => onRequestPreview(courseIds)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-secondary/40 p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Layers className="h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-bold text-foreground">
                          {group.title}
                        </span>
                        <span className="block text-[10px] text-muted-foreground">
                          {t('merge.groupTotals', {
                            courses: group.courses.length,
                            lessons: totalLessons
                          })}
                        </span>
                      </span>
                    </span>
                    <Sparkles
                      className="h-4 w-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                  </button>
                )
              })}
            </div>
          </section>
        )}

        <section
          aria-labelledby="merge-selection-title"
          className="space-y-2 rounded-2xl border border-border/70 bg-card/70 p-3.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <GitMerge className="h-4 w-4 shrink-0 text-primary" />
              <h3
                id="merge-selection-title"
                className="text-sm font-bold text-foreground"
              >
                {t('merge.reviewSelectionTitle')}
              </h3>
            </div>
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {selectedCount} {t('merge.selectedLabel', 'selecionado(s)')}
            </Badge>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t('merge.reviewSelectionDescription')}
          </p>

          <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {courses.map((course) => {
              const selected = selectedIds.has(course.id)
              return (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => onToggleCourse(course.id)}
                  aria-pressed={selected}
                  aria-label={t('merge.selectCourse', {
                    title: course.title
                  })}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-xl border p-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                    selected
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border/60 bg-secondary/30 hover:border-primary/40 hover:bg-secondary/60'
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {selected ? (
                      <CheckSquare className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <Square className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate text-xs font-semibold text-foreground">
                      {course.title}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {t('merge.courseCounts', {
                      modules: course.moduleCount,
                      lessons: course.lessonCount
                    })}
                  </span>
                </button>
              )
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onRequestPreview([...selectedIds])}
            disabled={isLoadingPreview || selectedCount < 2}
            className="h-9 w-full gap-2 border-primary/30 text-xs hover:border-primary/60 hover:bg-primary/5"
          >
            {isLoadingPreview ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {t('merge.reviewSelected', { count: selectedCount })}
          </Button>
        </section>

        {preview && <MergePreviewPanel preview={preview} />}
      </div>

      <DialogFooter className="flex items-center justify-between gap-2 border-t border-border/50 pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="gap-1.5 rounded-xl text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('merge.manualBack', 'Voltar às opções')}
        </Button>

        {preview && (
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={isMerging || selectedCount < 2}
            onClick={onApplyMerge}
            className="gap-2 rounded-xl bg-primary text-xs font-bold text-primary-foreground shadow-md shadow-primary/15 hover:opacity-95"
          >
            {isMerging ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <GitMerge className="h-3.5 w-3.5" />
            )}
            {isMerging
              ? t('merge.merging', 'Mesclando cursos...')
              : t('merge.applyMerge', 'Mesclar Cursos')}
          </Button>
        )}
      </DialogFooter>
    </>
  )
}

function MergePreviewPanel({
  preview
}: {
  preview: MergePreview
}): React.JSX.Element {
  const { t } = useTranslation()
  const mergeModules = preview.modules.filter(
    (module) => module.action === 'merge'
  )
  const createModules = preview.modules.filter(
    (module) => module.action === 'create'
  )

  return (
    <section
      aria-labelledby="merge-preview-title"
      className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-3.5"
    >
      <div className="flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <h3
            id="merge-preview-title"
            className="text-xs font-bold text-foreground"
          >
            {t('merge.previewTitle')}
          </h3>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {t('merge.previewSafetyNotice')}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/70 p-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {t('merge.canonicalCourse')}
        </p>
        <p className="mt-1 truncate text-sm font-bold text-foreground">
          {preview.canonicalCourseTitle}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <PreviewMetric
          label={t('merge.selectedCourses')}
          value={preview.selectedCourseIds.length}
        />
        <PreviewMetric
          label={t('merge.totalLessons')}
          value={preview.totalLessons}
        />
        <PreviewMetric
          label={t('merge.totalMaterials')}
          value={preview.totalMaterials}
        />
        <PreviewMetric
          label={t('merge.duplicateCandidates')}
          value={preview.duplicateCandidates.length}
        />
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
              <div
                key={`${module.sourceCourseId}-${module.sourceModuleId}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-card/60 p-2 text-xs"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {module.action === 'create' ? (
                    <Plus className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : (
                    <GitMerge className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                  <span className="truncate font-medium text-foreground">
                    {module.title}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {t('merge.moduleCounts', {
                    lessons: module.lessonCount,
                    materials: module.materialCount
                  })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {t('merge.noModuleChanges')}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-primary/30 bg-primary/10 p-3">
        <p className="text-xs font-bold text-primary">
          {t('merge.duplicateCandidatesTitle')}
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-primary/80">
          {t('merge.duplicateCandidatesNotice')}
        </p>
        {preview.duplicateCandidates.length > 0 && (
          <ul className="mt-2 space-y-1 text-[11px] text-primary/90">
            {preview.duplicateCandidates.map((candidate, index) => (
              <li
                key={`${candidate.sourceLessonId}-${candidate.targetLessonId}`}
              >
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

function PreviewMetric({
  label,
  value
}: {
  label: string
  value: number
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-2 text-center">
      <p className="text-sm font-bold text-foreground">{value}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}
