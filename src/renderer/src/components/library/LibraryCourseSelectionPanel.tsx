import React from 'react'
import { Check, Circle, GitMerge, X } from 'lucide-react'
import type { Course } from '@shared'
import { CourseCover } from '../ui/CourseCover'
import { Badge, Button } from '../ui'

interface LibraryCourseSelectionPanelProps {
  courses: Course[]
  onRemove: (courseId: string) => void
  onClear: () => void
  onOpenMerge: () => void
}

export function LibraryCourseSelectionPanel({
  courses,
  onRemove,
  onClear,
  onOpenMerge
}: LibraryCourseSelectionPanelProps): React.JSX.Element {
  const canMerge = courses.length >= 2

  return (
    <aside
      aria-label="Cursos selecionados para organização"
      className="min-w-0 rounded-2xl border border-primary/30 bg-card/80 shadow-sm lg:sticky lg:top-20"
    >
      <div className="border-b border-border/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
              <GitMerge className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-foreground">
                Cursos escolhidos
              </h3>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                Revise antes de abrir a prévia segura.
              </p>
            </div>
          </div>
          {courses.length > 0 && (
            <Badge
              variant="outline"
              className="shrink-0 border-primary/30 text-[10px] font-mono text-primary"
            >
              {courses.length}
            </Badge>
          )}
        </div>
      </div>

      <div className="max-h-[calc(100vh-18rem)] space-y-2 overflow-y-auto p-3">
        {courses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 bg-muted/10 p-4 text-center">
            <Circle className="mx-auto h-6 w-6 text-muted-foreground/60" />
            <p className="mt-2 text-xs font-semibold text-foreground">
              Nenhum curso selecionado
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Clique nos cards da Biblioteca para montar sua seleção.
            </p>
          </div>
        ) : (
          courses.map((course, index) => {
            const title = course.customTitle || course.title
            return (
              <div
                key={course.id}
                className="flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 p-2.5"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                  {index + 1}
                </span>
                <div className="h-10 w-16 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-black/40">
                  <CourseCover
                    src={course.coverPath}
                    title={title}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-foreground">
                    {title}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {course.moduleCount} módulos · {course.lessonCount} aulas
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(course.id)}
                  aria-label={`Remover ${title} da seleção`}
                  title={`Remover ${title} da seleção`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })
        )}
      </div>

      <div className="border-t border-border/60 p-3">
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={!canMerge}
          onClick={onOpenMerge}
          className="h-9 w-full gap-2 rounded-xl bg-primary text-xs font-bold text-primary-foreground shadow-sm hover:opacity-95"
        >
          <GitMerge className="h-3.5 w-3.5" />
          Unir cursos
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={courses.length === 0}
          onClick={onClear}
          className="mt-1 h-8 w-full rounded-xl text-xs text-muted-foreground hover:text-foreground"
        >
          Limpar seleção
        </Button>
      </div>
    </aside>
  )
}

interface LibraryCourseSelectionBarProps {
  selectedCount: number
  onClear: () => void
  onOpenMerge: () => void
}

export function LibraryCourseSelectionBar({
  selectedCount,
  onClear,
  onOpenMerge
}: LibraryCourseSelectionBarProps): React.JSX.Element {
  const courseLabel =
    selectedCount === 1 ? 'curso selecionado' : 'cursos selecionados'

  return (
    <div className="fixed inset-x-3 bottom-4 z-40 mx-auto max-w-xl rounded-2xl border border-primary/35 bg-card/95 px-4 py-3 shadow-[0_-8px_28px_rgba(0,0,0,0.2)] backdrop-blur-xl sm:flex sm:items-center sm:justify-between sm:gap-4">
      <p className="text-sm font-semibold text-foreground">
        <span className="text-primary">{selectedCount}</span> {courseLabel}
        <span className="mx-2 text-muted-foreground" aria-hidden="true">
          →
        </span>
        <span className="text-primary">Unir cursos</span>
      </p>

      <div className="mt-2 flex items-center justify-end gap-2 sm:mt-0">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-9 rounded-xl text-xs text-muted-foreground hover:text-foreground"
        >
          Limpar
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={selectedCount < 2}
          onClick={onOpenMerge}
          className="h-9 gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground shadow-md shadow-primary/15 hover:opacity-95"
        >
          <Check className="h-3.5 w-3.5" />
          Unir cursos
        </Button>
      </div>
    </div>
  )
}
