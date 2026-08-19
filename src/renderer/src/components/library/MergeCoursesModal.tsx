import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Layers, CheckCircle2, RefreshCw } from 'lucide-react'
import { useLibraryStore } from '../../stores/useLibraryStore'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button
} from '../ui'
import type { MergeCoursesResult } from '@shared'

export interface MergeCoursesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MergeCoursesModal({ open, onOpenChange }: MergeCoursesModalProps): React.JSX.Element {
  const { t } = useTranslation()
  const { courses, mergeDuplicateCourses, fetchCourses } = useLibraryStore()

  const [isMerging, setIsMerging] = useState<boolean>(false)
  const [mergeResult, setMergeResult] = useState<MergeCoursesResult | null>(null)

  // Find duplicate course groups
  const duplicateGroups = useMemo(() => {
    const normalize = (str: string): string => {
      return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }

    const map = new Map<string, typeof courses>()
    for (const c of courses) {
      const key = normalize(c.title) || c.title.toLowerCase().trim()
      if (!map.has(key)) {
        map.set(key, [])
      }
      map.get(key)!.push(c)
    }

    const duplicates: Array<{ title: string; count: number; courses: typeof courses }> = []
    for (const [, list] of map.entries()) {
      if (list.length > 1) {
        duplicates.push({
          title: list[0].title,
          count: list.length,
          courses: list
        })
      }
    }
    return duplicates
  }, [courses])

  const handleMerge = async (): Promise<void> => {
    setIsMerging(true)
    setMergeResult(null)
    try {
      const result = await mergeDuplicateCourses()
      setMergeResult(result)
      await fetchCourses()
    } catch (err) {
      console.error('Failed to merge courses:', err)
    } finally {
      setIsMerging(false)
    }
  }

  const handleClose = (): void => {
    setMergeResult(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg border-border/80 bg-card p-6 shadow-2xl rounded-2xl animate-in zoom-in-95 duration-200">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/20 to-purple-600/20 border border-primary/30 text-primary shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                {t('merge.title', 'Organizar & Unir Cursos')}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {t('merge.subtitle', 'Detecte e una partes separadas do mesmo curso em um único card completo.')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="my-4 space-y-4">
          {mergeResult ? (
            /* Result View */
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3 animate-in fade-in duration-300">
              <div className="flex items-center gap-2.5 text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
                <h4 className="text-sm font-bold text-foreground">
                  {t('merge.successTitle', 'Biblioteca Organizada com Sucesso!')}
                </h4>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t(
                  'merge.successDesc',
                  `Foram unificados ${mergeResult.mergedGroupsCount} grupo(s) de cursos, removendo ${mergeResult.removedCoursesCount} card(s) duplicados e ${mergeResult.deduplicatedLessonsCount} aula(s) repetidas.`
                )}
              </p>
              {mergeResult.details.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border/40">
                  {mergeResult.details.map((detail, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-background/60 text-xs border border-border/50"
                    >
                      <div className="font-semibold text-foreground truncate max-w-[200px]">
                        {detail.title}
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                        <span>{detail.totalModules} módulos</span>
                        <span>•</span>
                        <span>{detail.totalLessons} aulas</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : duplicateGroups.length > 0 ? (
            /* Duplicate Groups Detected */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {duplicateGroups.length} {duplicateGroups.length === 1 ? 'curso com múltiplas partes' : 'cursos com múltiplas partes'}
                </span>
                <span className="text-primary font-semibold">
                  {duplicateGroups.reduce((acc, g) => acc + g.count, 0)} cards no total
                </span>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {duplicateGroups.map((group, idx) => {
                  const totalLessons = group.courses.reduce((acc, c) => acc + c.lessonCount, 0)
                  const totalModules = group.courses.reduce((acc, c) => acc + c.moduleCount, 0)

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-xl border border-border/70 bg-secondary/40 hover:bg-secondary/70 transition-colors"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Layers className="h-4 w-4 text-primary shrink-0" />
                          <span className="text-xs font-bold text-foreground truncate">
                            {group.title}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-2 pl-6">
                          <span>{group.count} partes separadas</span>
                          <span>•</span>
                          <span>~{totalModules} módulos</span>
                          <span>•</span>
                          <span>~{totalLessons} aulas</span>
                        </div>
                      </div>
                      <div className="shrink-0 pl-3">
                        <span className="px-2 py-1 rounded-md bg-primary/15 text-primary text-[10px] font-bold border border-primary/25">
                          {group.count}x
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {t(
                  'merge.infoNotice',
                  'Ao clicar em "Unir e Organizar", todos os módulos e aulas das partes acima serão reunidos no curso principal e aulas idênticas serão deduplicadas automaticamente.'
                )}
              </p>
            </div>
          ) : (
            /* No Duplicates Found */
            <div className="flex flex-col items-center justify-center p-6 text-center rounded-xl border border-border/60 bg-secondary/30 space-y-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <h4 className="text-xs font-bold text-foreground">
                {t('merge.cleanTitle', 'Sua biblioteca já está organizada!')}
              </h4>
              <p className="text-[11px] text-muted-foreground max-w-xs">
                {t('merge.cleanDesc', 'Nenhum curso com nome duplicado foi detectado no momento.')}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            {mergeResult ? t('common.close', 'Fechar') : t('common.cancel', 'Cancelar')}
          </Button>

          {!mergeResult && duplicateGroups.length > 0 && (
            <Button
              variant="default"
              size="sm"
              onClick={handleMerge}
              disabled={isMerging}
              className="gap-2 text-xs bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-white font-bold shadow-md shadow-orange-500/20 hover:opacity-95 active:scale-95 transition-all cursor-pointer min-h-[36px]"
            >
              {isMerging ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>{t('merge.merging', 'Unindo Cursos...')}</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{t('merge.action', 'Unir e Organizar Agora')}</span>
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
