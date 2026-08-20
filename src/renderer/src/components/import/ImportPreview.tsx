import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Edit2,
  FileArchive,
  FileQuestion,
  FileText,
  Folder,
  HardDrive,
  Layers,
  Link,
  Music,
  Video
} from 'lucide-react'
import type { ImportSessionPreview, ImportSessionResourcePreview, ImportSessionSourceKind } from '@shared'
import { Badge, Button, Input } from '../ui'

interface ImportPreviewProps {
  preview: ImportSessionPreview
  onUpdatePreview: (updated: ImportSessionPreview) => void
  isExternal: boolean
  onToggleExternal: (isExternal: boolean) => void
  sourceKind: ImportSessionSourceKind
}

export function ImportPreview({
  preview,
  onUpdatePreview,
  isExternal,
  onToggleExternal,
  sourceKind
}: ImportPreviewProps): React.JSX.Element {
  const { t } = useTranslation()
  const [collapsedModules, setCollapsedModules] = useState<Record<string, boolean>>({})
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null)
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null)

  const toggleModuleCollapse = (moduleId: string): void => {
    setCollapsedModules((current) => ({ ...current, [moduleId]: !current[moduleId] }))
  }

  const updateCourseTitle = (title: string): void => {
    onUpdatePreview({ ...preview, suggestedTitle: title })
  }

  const updateModuleTitle = (moduleId: string, title: string): void => {
    onUpdatePreview({
      ...preview,
      modules: preview.modules.map((module) =>
        module.id === moduleId ? { ...module, title } : module
      )
    })
  }

  const updateLessonTitle = (moduleId: string, lessonId: string, title: string): void => {
    onUpdatePreview({
      ...preview,
      modules: preview.modules.map((module) =>
        module.id === moduleId
          ? {
              ...module,
              lessons: module.lessons.map((lesson) =>
                lesson.id === lessonId ? { ...lesson, title } : lesson
              )
            }
          : module
      )
    })
  }

  const totalMaterials = preview.modules.reduce(
    (total, module) =>
      total + module.resources.length + module.lessons.reduce((lessonTotal, lesson) => lessonTotal + lesson.contentResources.length, 0),
    0
  )

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="rounded-2xl border border-border/80 bg-card p-3.5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {t('import.courseTitle')}
          </span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Layers className="h-3.5 w-3.5 text-primary" />
              {t('import.modulesCount', { count: preview.modules.length })}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Video className="h-3.5 w-3.5 text-primary" />
              {t('import.lessonsCount', { count: preview.totalLessons })}
            </span>
            {totalMaterials > 0 && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  {t('import.materialsCount', { count: totalMaterials })}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          {editingTitle ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Input
                value={preview.suggestedTitle}
                onChange={(event) => updateCourseTitle(event.target.value)}
                className="min-w-0 text-sm font-bold"
                autoFocus
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditingTitle(false)}
                aria-label={t('import.confirmTitleEdit')}
              >
                <Check className="h-4 w-4 text-emerald-400" />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingTitle(true)}
              className="group flex min-w-0 flex-1 items-center justify-between gap-2 text-left hover:text-primary"
            >
              <span className="truncate text-base font-bold text-foreground">{preview.suggestedTitle}</span>
              <Edit2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
        </div>

        <p className="mt-2 text-[11px] text-muted-foreground">{t('import.pathsStayPrivate')}</p>
      </div>

      {preview.duplicates && preview.duplicates.length > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 shadow-sm">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-amber-300">
                {t('import.duplicatesWarning', { count: preview.duplicates.length })}
              </p>
              <p className="mt-0.5 text-[11px] text-amber-200/70">{t('import.duplicatesExcluded')}</p>
              <ul className="mt-1.5 max-h-24 space-y-0.5 overflow-y-auto">
                {preview.duplicates.slice(0, 12).map((duplicate) => (
                  <li
                    key={`${duplicate.fileName}::${duplicate.fileSize}`}
                    className="truncate text-[11px] font-mono text-amber-200/80"
                  >
                    {duplicate.fileName} ×{duplicate.count}
                  </li>
                ))}
                {preview.duplicates.length > 12 && (
                  <li className="text-[11px] font-medium text-amber-200/50">
                    +{preview.duplicates.length - 12} {t('import.duplicatesMore')}
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {sourceKind === 'zip' ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs">
          <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="font-semibold text-foreground">{t('import.zipManagedOnly')}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              {t('import.zipManagedOnlyDescription')}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => onToggleExternal(true)}
            className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all ${
              isExternal
                ? 'border-primary bg-primary/10 font-semibold text-foreground shadow-sm'
                : 'border-border/80 bg-card text-muted-foreground hover:bg-secondary/40'
            }`}
          >
            <Link className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              <span className="block font-semibold text-foreground">{t('import.referenceExternal')}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                {t('import.referenceExternalDescription')}
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => onToggleExternal(false)}
            className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all ${
              !isExternal
                ? 'border-primary bg-primary/10 font-semibold text-foreground shadow-sm'
                : 'border-border/80 bg-card text-muted-foreground hover:bg-secondary/40'
            }`}
          >
            <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
            <span>
              <span className="block font-semibold text-foreground">{t('import.saveToVault')}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                {t('import.saveToVaultDescription')}
              </span>
            </span>
          </button>
        </div>
      )}

      <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
        {preview.modules.map((module, moduleIndex) => {
          const collapsed = collapsedModules[module.id]
          const editingModule = editingModuleId === module.id

          return (
            <div key={module.id} className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-secondary/40 p-2.5 px-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleModuleCollapse(module.id)}
                    aria-label={t(collapsed ? 'import.expandModule' : 'import.collapseModule')}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    {collapsed ? (
                      <ChevronRight className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <Folder className="h-4 w-4 shrink-0 text-primary" />
                  {editingModule ? (
                    <Input
                      value={module.title}
                      onChange={(event) => updateModuleTitle(module.id, event.target.value)}
                      className="h-7 min-w-0 max-w-sm py-1 text-xs"
                      autoFocus
                    />
                  ) : (
                    <span className="truncate text-xs font-bold text-foreground">
                      {moduleIndex + 1}. {module.title}
                    </span>
                  )}
                </div>

                <div className="ml-2 flex shrink-0 items-center gap-2">
                  <Badge variant="secondary" className="h-5 px-2 py-0 text-[10px] font-mono">
                    {t('import.lessonsCount', { count: module.lessons.length })}
                  </Badge>
                  {module.resources.length > 0 && (
                    <Badge variant="secondary" className="h-5 px-2 py-0 text-[10px] font-mono">
                      {t('import.materialsCount', { count: module.resources.length })}
                    </Badge>
                  )}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => setEditingModuleId(editingModule ? null : module.id)}
                    aria-label={t(editingModule ? 'import.confirmTitleEdit' : 'import.editTitle')}
                  >
                    {editingModule ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Edit2 className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>

              {!collapsed && (
                <div className="divide-y divide-border/30 bg-card/60">
                  {module.resources.length > 0 && (
                    <ResourcePreviewList
                      resources={module.resources}
                      title={t('import.moduleMaterials', { count: module.resources.length })}
                      className="mx-3 my-2"
                    />
                  )}
                  {module.lessons.length === 0 ? (
                    <p className="px-6 py-3 text-xs text-muted-foreground">{t('import.noLessonsDetected')}</p>
                  ) : (
                    module.lessons.map((lesson, lessonIndex) => {
                      const editingLesson = editingLessonId === lesson.id
                      return (
                        <div key={lesson.id} className="group px-3 py-2 pl-6 text-xs transition-colors hover:bg-secondary/40">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 flex-1 items-center gap-2.5">
                              {mediaIcon(lesson.mediaType)}
                              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                                {String(lessonIndex + 1).padStart(2, '0')}
                              </span>
                              {editingLesson ? (
                                <Input
                                  value={lesson.title}
                                  onChange={(event) =>
                                    updateLessonTitle(module.id, lesson.id, event.target.value)
                                  }
                                  className="h-6 min-w-0 max-w-sm py-0.5 text-xs"
                                  autoFocus
                                />
                              ) : (
                                <span className="truncate font-medium text-foreground">{lesson.title}</span>
                              )}
                            </div>

                            <div className="ml-2 flex shrink-0 items-center gap-1.5">
                              <span className="rounded border border-border/40 bg-secondary/50 px-1.5 py-0.5 text-[10px] font-mono uppercase text-muted-foreground">
                                .{lesson.fileExtension}
                              </span>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-5 w-5 opacity-0 group-hover:opacity-100"
                                onClick={() => setEditingLessonId(editingLesson ? null : lesson.id)}
                                aria-label={t(editingLesson ? 'import.confirmTitleEdit' : 'import.editTitle')}
                              >
                                {editingLesson ? (
                                  <Check className="h-3 w-3 text-emerald-400" />
                                ) : (
                                  <Edit2 className="h-2.5 w-2.5" />
                                )}
                              </Button>
                            </div>
                          </div>
                          {lesson.contentResources.length > 0 && (
                            <ResourcePreviewList
                              resources={lesson.contentResources}
                              title={t('import.lessonMaterials', { count: lesson.contentResources.length })}
                              className="mt-2 ml-6"
                            />
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface ResourcePreviewListProps {
  resources: ImportSessionResourcePreview[]
  title: string
  className?: string
}

function ResourcePreviewList({ resources, title, className = '' }: ResourcePreviewListProps): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <section aria-label={title} className={`rounded-lg border border-border/50 bg-secondary/20 p-2 ${className}`}>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="max-h-28 space-y-1 overflow-y-auto pr-1">
        {resources.map((resource) => (
          <li key={resource.id} className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            {mediaIcon(resource.type)}
            <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={resource.name}>
              {resource.name}
            </span>
            <span className="shrink-0 rounded border border-border/40 bg-card/60 px-1 py-0.5 font-mono uppercase">
              {resource.fileExtension}
            </span>
            <span className="shrink-0 rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary">
              {t(`import.materialTypes.${resource.type}`)}
            </span>
            <span className="shrink-0 rounded bg-secondary px-1 py-0.5 text-[10px]">
              {t(`import.materialRoles.${resource.role}`)}
            </span>
            {resource.language && (
              <span className="shrink-0 rounded bg-sky-500/10 px-1 py-0.5 text-[10px] text-sky-300">
                {resource.language}
              </span>
            )}
            <span className="shrink-0 font-mono text-[10px]">{formatFileSize(resource.fileSize)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const fileSizeUnits = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const

function formatFileSize(fileSize: number): string {
  let value = Number.isFinite(fileSize) && fileSize > 0 ? fileSize : 0
  let unitIndex = 0
  while (value >= 1024 && unitIndex < fileSizeUnits.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return new Intl.NumberFormat(undefined, {
    style: 'unit',
    unit: fileSizeUnits[unitIndex],
    unitDisplay: 'narrow',
    maximumFractionDigits: unitIndex === 0 || value >= 10 ? 0 : 1
  }).format(value)
}

function mediaIcon(mediaType: string): React.JSX.Element {
  switch (mediaType) {
    case 'video':
      return <Video className="h-3.5 w-3.5 shrink-0 text-primary" />
    case 'audio':
      return <Music className="h-3.5 w-3.5 shrink-0 text-sky-400" />
    case 'pdf':
    case 'document':
      return <FileText className="h-3.5 w-3.5 shrink-0 text-purple-400" />
    case 'archive':
      return <FileArchive className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
    default:
      return <FileQuestion className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
  }
}
