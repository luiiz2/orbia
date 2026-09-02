import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  BookOpen,
  Code2,
  ExternalLink,
  FileText,
  Film,
  GitBranch,
  Layers,
  Loader2,
  Search,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
  X
} from 'lucide-react'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input
} from '../ui'
import { CodeViewerModal } from '../documents/CodeViewerModal'
import {
  PdfViewerModal,
  type DocumentResource
} from '../documents/PdfViewerModal'
import { useLibrarySearchStore } from '../../stores/useLibrarySearchStore'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { cn } from '../../lib/utils'
import type {
  AttachedResource,
  ContentResource,
  Course,
  Lesson,
  LibrarySearchGroup,
  LibrarySearchGroupType,
  LibrarySearchNavigation,
  LibrarySearchResult,
  LibrarySearchResultType,
  Module
} from '@shared'

type SearchResource = AttachedResource | ContentResource

interface ResourcePreview {
  kind: 'pdf' | 'code'
  resource: DocumentResource
  page?: number
  line?: number
}

const CONTENT_TYPE_FILTERS: Array<{
  type: LibrarySearchResultType
  label: string
}> = [
  { type: 'course', label: 'Cursos' },
  { type: 'module', label: 'Módulos' },
  { type: 'lesson', label: 'Aulas' },
  { type: 'transcript', label: 'Transcrições' },
  { type: 'materials', label: 'Materiais' },
  { type: 'pdf', label: 'PDFs' },
  { type: 'code', label: 'Código' },
  { type: 'note', label: 'Notas' }
]

const GROUP_LABELS: Record<LibrarySearchGroupType, string> = {
  courses: 'Cursos',
  modules: 'Módulos',
  lessons: 'Aulas',
  transcripts: 'Transcrições',
  materials: 'Materiais',
  pdfs: 'PDFs',
  code: 'Código',
  notes: 'Notas'
}

function formatTimestamp(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainingSeconds = safeSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function formatLocation(result: LibrarySearchResult): string | null {
  const timestamp =
    result.navigation.type === 'lesson'
      ? result.navigation.timestampSeconds
      : result.locator.startTime
  if (typeof timestamp === 'number') return formatTimestamp(timestamp)

  const page =
    result.navigation.type === 'resource'
      ? result.navigation.page
      : result.locator.page
  if (typeof page === 'number') return `Página ${page}`

  const startLine =
    result.navigation.type === 'resource'
      ? result.navigation.startLine
      : result.locator.startLine
  const endLine =
    result.navigation.type === 'resource'
      ? result.navigation.endLine
      : result.locator.endLine
  if (typeof startLine === 'number') {
    return typeof endLine === 'number' && endLine !== startLine
      ? `Linhas ${startLine}-${endLine}`
      : `Linha ${startLine}`
  }

  return result.locator.fileName || null
}

function getResultLabel(result: LibrarySearchResult): string {
  switch (result.type) {
    case 'course':
      return 'Curso'
    case 'module':
      return 'Módulo'
    case 'lesson':
      return 'Aula'
    case 'transcript':
      return 'Transcrição'
    case 'pdf':
      return 'PDF'
    case 'code':
      return 'Código'
    case 'note':
      return 'Nota'
    default:
      return 'Material'
  }
}

function getGroupIcon(type: LibrarySearchGroupType): React.JSX.Element {
  switch (type) {
    case 'courses':
      return <BookOpen className="h-4 w-4" aria-hidden="true" />
    case 'modules':
      return <Layers className="h-4 w-4" aria-hidden="true" />
    case 'lessons':
    case 'transcripts':
      return <Film className="h-4 w-4" aria-hidden="true" />
    case 'code':
      return <Code2 className="h-4 w-4" aria-hidden="true" />
    case 'notes':
      return <StickyNote className="h-4 w-4" aria-hidden="true" />
    default:
      return <FileText className="h-4 w-4" aria-hidden="true" />
  }
}

function getResultIcon(result: LibrarySearchResult): React.JSX.Element {
  if (result.type === 'course')
    return <BookOpen className="h-4 w-4" aria-hidden="true" />
  if (result.type === 'module')
    return <Layers className="h-4 w-4" aria-hidden="true" />
  if (result.type === 'lesson' || result.type === 'transcript') {
    return <Film className="h-4 w-4" aria-hidden="true" />
  }
  if (result.type === 'code')
    return <Code2 className="h-4 w-4" aria-hidden="true" />
  if (result.type === 'note')
    return <StickyNote className="h-4 w-4" aria-hidden="true" />
  return <FileText className="h-4 w-4" aria-hidden="true" />
}

function getFallbackGroups(
  results: LibrarySearchResult[]
): LibrarySearchGroup[] {
  const groups = new Map<LibrarySearchGroupType, LibrarySearchResult[]>()
  for (const result of results) {
    const groupType: LibrarySearchGroupType =
      result.type === 'course'
        ? 'courses'
        : result.type === 'module'
          ? 'modules'
          : result.type === 'lesson'
            ? 'lessons'
            : result.type === 'transcript'
              ? 'transcripts'
              : result.type === 'pdf'
                ? 'pdfs'
                : result.type === 'code'
                  ? 'code'
                  : result.type === 'note'
                    ? 'notes'
                    : 'materials'
    const group = groups.get(groupType) || []
    group.push(result)
    groups.set(groupType, group)
  }
  return Array.from(groups, ([type, groupedResults]) => ({
    type,
    results: groupedResults
  }))
}

function asDocumentResource(resource: SearchResource): DocumentResource {
  return {
    id: resource.id,
    name: resource.name,
    filePath: resource.filePath,
    fileExtension: resource.fileExtension,
    fileSize: resource.fileSize,
    type: resource.type
  }
}

function isPdfResource(
  resource: Pick<DocumentResource, 'type' | 'fileExtension'>
): boolean {
  return (
    resource.type === 'pdf' ||
    resource.fileExtension?.toLowerCase().replace('.', '') === 'pdf'
  )
}

function isCodeResource(
  resource: Pick<DocumentResource, 'type' | 'fileExtension'>
): boolean {
  const extension = resource.fileExtension?.toLowerCase().replace('.', '')
  return (
    resource.type === 'code' ||
    (typeof extension === 'string' &&
      new Set([
        'c',
        'cpp',
        'css',
        'csv',
        'go',
        'html',
        'java',
        'js',
        'json',
        'md',
        'py',
        'rs',
        'sh',
        'sql',
        'ts',
        'tsx',
        'txt',
        'xml',
        'yaml',
        'yml'
      ]).has(extension))
  )
}

type SearchHierarchy = {
  modules: Array<Module & { lessons: Lesson[] }>
}

function findResource(
  hierarchy: SearchHierarchy,
  resourceId: string
): SearchResource | null {
  for (const module of hierarchy.modules) {
    const moduleResource = module.resources?.find(
      (resource) => resource.id === resourceId
    )
    if (moduleResource) return moduleResource

    for (const lesson of module.lessons) {
      const lessonResource = (
        lesson.contentResources ??
        lesson.resources ??
        []
      ).find((resource) => resource.id === resourceId)
      if (lessonResource) return lessonResource
    }
  }
  return null
}

function findLesson(
  hierarchy: SearchHierarchy,
  lessonId: string
): Lesson | null {
  for (const module of hierarchy.modules) {
    const lesson = module.lessons.find((item) => item.id === lessonId)
    if (lesson) return lesson
  }
  return null
}

function lessonAsDocumentResource(lesson: Lesson): DocumentResource {
  return {
    id: lesson.id,
    name: lesson.fileName || lesson.title,
    filePath: lesson.filePath,
    fileExtension: lesson.fileExtension,
    fileSize: lesson.fileSize,
    type: lesson.mediaType
  }
}

interface SearchResultCardProps {
  result: LibrarySearchResult
  compact?: boolean
  isOpening: boolean
  onOpen: (result: LibrarySearchResult) => void
  onRelated?: (result: LibrarySearchResult) => void
}

function SearchResultCard({
  result,
  compact = false,
  isOpening,
  onOpen,
  onRelated
}: SearchResultCardProps): React.JSX.Element {
  const location = formatLocation(result)
  const breadcrumb = [
    result.courseTitle,
    result.moduleTitle,
    result.lessonTitle
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <article
      className={cn(
        'rounded-xl border border-border/70 bg-card/70 p-3 transition-colors hover:border-primary/40 hover:bg-card',
        compact && 'p-2.5'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {getResultIcon(result)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4
                className="break-words whitespace-normal text-sm font-semibold text-foreground leading-snug"
                title={result.title}
              >
                {result.title}
              </h4>
              <p
                className="mt-0.5 break-words whitespace-normal text-[11px] text-muted-foreground leading-snug"
                title={breadcrumb}
              >
                {breadcrumb || getResultLabel(result)}
              </p>
            </div>
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {getResultLabel(result)}
            </Badge>
          </div>

          {!compact && result.excerpt && (
            <p className="mt-2 break-words whitespace-normal text-xs leading-relaxed text-muted-foreground">
              {result.excerpt}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {location && (
              <span
                className="font-mono text-[11px] text-primary"
                aria-label={`Localização: ${location}`}
              >
                {location}
              </span>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              {onRelated && !result.id.startsWith('normal:') && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => onRelated(result)}
                  className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
                  aria-label={`Ver conteúdo relacionado a ${result.title}`}
                >
                  <GitBranch className="h-3 w-3" aria-hidden="true" />
                  <span className="hidden sm:inline">Related</span>
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => onOpen(result)}
                disabled={isOpening}
                className="h-7 gap-1 px-2 text-[11px]"
                aria-label={`${location ? `Abrir em ${location}` : 'Abrir'}: ${result.title}`}
              >
                {isOpening ? (
                  <Loader2
                    className="h-3 w-3 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                )}
                <span>
                  {location &&
                  (result.type === 'transcript' ||
                    result.type === 'pdf' ||
                    result.type === 'code')
                    ? `Abrir em ${location}`
                    : 'Abrir'}
                </span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

export function LibrarySearchDialog(): React.JSX.Element {
  const { t } = useTranslation()
  const {
    isOpen,
    query,
    mode,
    filters,
    response,
    relatedResponse,
    relatedAnchor,
    isLoading,
    isLoadingRelated,
    error,
    relatedError,
    close,
    setQuery,
    setMode,
    updateFilters,
    clearFilters,
    submit,
    loadRelated,
    clearRelated,
    resolveResult
  } = useLibrarySearchStore()
  const courses = useLibraryStore((state) => state.courses)
  const { navigateToCourse, navigateToPlayer } = useNavigationStore()
  const loadHierarchy = usePlayerStore((state) => state.loadHierarchy)
  const setCurrentTime = usePlayerStore((state) => state.setCurrentTime)

  const [openingResultId, setOpeningResultId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ResourcePreview | null>(null)

  const moduleOptions = useMemo(() => {
    const options = new Map<string, string>()
    for (const result of response?.results ?? []) {
      if (result.moduleId)
        options.set(result.moduleId, result.moduleTitle || result.moduleId)
    }
    if (filters.moduleId && !options.has(filters.moduleId)) {
      options.set(filters.moduleId, filters.moduleId)
    }
    return Array.from(options, ([id, title]) => ({ id, title }))
  }, [filters.moduleId, response?.results])

  const groups = response
    ? response.groups.length > 0
      ? response.groups
      : getFallbackGroups(response.results)
    : []
  const relatedGroups = relatedResponse?.groups ?? []
  const hasActiveFilters = Boolean(
    filters.courseId ||
    filters.moduleId ||
    filters.vaultId ||
    filters.includeNotes ||
    (filters.contentTypes && filters.contentTypes.length > 0)
  )
  const isIncomplete = Boolean(
    response && mode !== 'normal' && response.coverage.status !== 'completed'
  )

  const handleFilterType = (type: LibrarySearchResultType): void => {
    const selected = new Set(filters.contentTypes ?? [])
    if (selected.has(type)) selected.delete(type)
    else selected.add(type)
    const contentTypes = selected.size > 0 ? Array.from(selected) : undefined
    updateFilters({
      contentTypes,
      includeNotes: selected.has('note') || undefined
    })
  }

  const handleOpenResult = async (
    result: LibrarySearchResult
  ): Promise<void> => {
    if (openingResultId) return
    setOpeningResultId(result.id)
    setActionError(null)

    try {
      const resolved = result.id.startsWith('normal:')
        ? { status: 'ok' as const, target: result.navigation }
        : await resolveResult(result)
      if (resolved.status !== 'ok') {
        setActionError(resolved.reason)
        return
      }

      await openNavigationTarget(resolved.target, {
        close,
        navigateToCourse,
        navigateToPlayer,
        loadHierarchy,
        setCurrentTime,
        setPreview
      })
    } catch (error: unknown) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Não foi possível abrir este resultado.'
      )
    } finally {
      setOpeningResultId(null)
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
        <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden rounded-2xl border-border/80 bg-card p-0 shadow-2xl">
          <DialogHeader className="shrink-0 border-b border-border/70 bg-card/95 p-5 pb-4">
            <div className="flex items-start justify-between gap-4 pr-7">
              <div>
                <DialogTitle className="flex items-center gap-2 text-base font-bold">
                  <Search className="h-4 w-4 text-primary" aria-hidden="true" />
                  {t('search.libraryTitle', 'Pesquisar na biblioteca')}
                </DialogTitle>
                <DialogDescription className="mt-1 text-xs">
                  {t(
                    'search.libraryDescription',
                    'Pesquise cursos, aulas, transcrições e materiais da biblioteca local.'
                  )}
                </DialogDescription>
              </div>
              {response && (
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {response.results.length}{' '}
                  {response.results.length === 1 ? 'resultado' : 'resultados'}
                </Badge>
              )}
            </div>

            <form
              className="mt-4 flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault()
                void submit()
              }}
            >
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t(
                    'search.libraryPlaceholder',
                    'Ex.: dependency injection ou hooks condicionais'
                  )}
                  aria-label={t(
                    'search.libraryInputLabel',
                    'Pesquisar na biblioteca'
                  )}
                  className="h-10 pl-9 pr-9 text-sm"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label="Limpar busca"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
              <label className="sr-only" htmlFor="library-search-mode">
                Modo de busca
              </label>
              <select
                id="library-search-mode"
                value={mode}
                onChange={(event) => setMode(event.target.value as typeof mode)}
                className="h-10 rounded-lg border border-border bg-secondary/50 px-3 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
              >
                <option value="normal">Normal</option>
                <option value="semantic">Semântica</option>
                <option value="hybrid">Híbrida</option>
              </select>
              <Button
                type="submit"
                disabled={isLoading || !query.trim()}
                className="h-10 gap-2 px-4"
              >
                {isLoading ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Search className="h-4 w-4" aria-hidden="true" />
                )}
                Buscar
              </Button>
            </form>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
            <aside className="shrink-0 overflow-y-auto border-b border-border/70 bg-secondary/20 p-4 lg:w-64 lg:border-b-0 lg:border-r">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <SlidersHorizontal
                    className="h-3.5 w-3.5 text-primary"
                    aria-hidden="true"
                  />
                  Filtros
                </h3>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-[11px] text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    Limpar
                  </button>
                )}
              </div>

              <div className="space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Curso
                  </span>
                  <select
                    value={filters.courseId || ''}
                    onChange={(event) =>
                      updateFilters({
                        courseId: event.target.value || undefined
                      })
                    }
                    className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                    aria-label="Filtrar por curso"
                  >
                    <option value="">Todos os cursos</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.customTitle || course.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Módulo
                  </span>
                  <select
                    value={filters.moduleId || ''}
                    onChange={(event) =>
                      updateFilters({
                        moduleId: event.target.value || undefined
                      })
                    }
                    className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                    aria-label="Filtrar por módulo"
                  >
                    <option value="">Todos os módulos</option>
                    {moduleOptions.map((module) => (
                      <option key={module.id} value={module.id}>
                        {module.title}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Content Type
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {CONTENT_TYPE_FILTERS.map((option) => {
                      const active = Boolean(
                        filters.contentTypes?.includes(option.type)
                      )
                      return (
                        <button
                          key={option.type}
                          type="button"
                          aria-pressed={active}
                          onClick={() => handleFilterType(option.type)}
                          className={cn(
                            'rounded-md border px-2 py-1 text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                            active
                              ? 'border-primary/60 bg-primary/15 text-primary'
                              : 'border-border/70 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                          )}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={filters.vaultId === 'current'}
                    onChange={(event) =>
                      updateFilters({
                        vaultId: event.target.checked ? 'current' : undefined
                      })
                    }
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  Vault atual
                </label>
              </div>
            </aside>

            <section
              className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5"
              aria-live="polite"
            >
              {error && (
                <div
                  className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
                  role="alert"
                >
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{error}</span>
                </div>
              )}

              {actionError && (
                <div
                  className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
                  role="alert"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{actionError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActionError(null)}
                    aria-label="Fechar aviso"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}

              {response?.semanticUnavailable && (
                <div
                  className="mb-4 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-primary dark:text-primary"
                  role="status"
                >
                  <Sparkles
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span>
                    O provedor semântico está indisponível. Exibindo os
                    resultados locais disponíveis.
                  </span>
                </div>
              )}

              {isIncomplete && (
                <div
                  className="mb-4 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-primary"
                  role="status"
                >
                  <Loader2
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span>
                    O índice ainda está incompleto ({response?.coverage.status}
                    ). Alguns resultados podem não aparecer.
                  </span>
                </div>
              )}

              {isLoading ? (
                <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                  <Loader2
                    className="h-7 w-7 animate-spin text-primary"
                    aria-hidden="true"
                  />
                  <span>Buscando na biblioteca local…</span>
                </div>
              ) : !response ? (
                <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Search className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Encontre qualquer coisa na sua biblioteca
                    </p>
                    <p className="mt-1 text-xs">
                      Digite uma busca e pressione Enter ou Buscar.
                    </p>
                  </div>
                </div>
              ) : response.results.length === 0 ? (
                <div className="flex min-h-56 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                  <FileText
                    className="h-8 w-8 text-muted-foreground/40"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-semibold text-foreground">
                    Nenhum resultado encontrado
                  </p>
                  <p className="max-w-sm text-xs">
                    Tente outros termos ou remova algum filtro.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {groups.map((group) => (
                    <section
                      key={group.type}
                      aria-labelledby={`library-search-group-${group.type}`}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-primary">
                          {getGroupIcon(group.type)}
                        </span>
                        <h3
                          id={`library-search-group-${group.type}`}
                          className="text-xs font-bold uppercase tracking-wide text-foreground"
                        >
                          {GROUP_LABELS[group.type]}
                        </h3>
                        <span className="text-[10px] text-muted-foreground">
                          {group.results.length}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {group.results.map((result) => (
                          <SearchResultCard
                            key={`${group.type}-${result.id}`}
                            result={result}
                            isOpening={openingResultId === result.id}
                            onOpen={(item) => void handleOpenResult(item)}
                            onRelated={(item) => void loadRelated(item)}
                          />
                        ))}
                      </div>
                    </section>
                  ))}

                  {relatedAnchor && (
                    <section
                      className="rounded-xl border border-primary/25 bg-primary/5 p-3"
                      aria-labelledby="library-search-related-title"
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h3
                            id="library-search-related-title"
                            className="flex items-center gap-2 text-sm font-semibold text-foreground"
                          >
                            <GitBranch
                              className="h-4 w-4 text-primary"
                              aria-hidden="true"
                            />
                            Related Content
                          </h3>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            Relacionado a {relatedAnchor.title}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={clearRelated}
                          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          aria-label="Fechar conteúdo relacionado"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>

                      {isLoadingRelated ? (
                        <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                          <Loader2
                            className="h-4 w-4 animate-spin text-primary"
                            aria-hidden="true"
                          />
                          Carregando relacionados…
                        </div>
                      ) : relatedError ? (
                        <p
                          className="py-2 text-xs text-destructive"
                          role="alert"
                        >
                          {relatedError}
                        </p>
                      ) : relatedGroups.length === 0 ? (
                        <p className="py-2 text-xs text-muted-foreground">
                          Nenhum conteúdo relacionado encontrado.
                        </p>
                      ) : (
                        <div className="grid gap-3 xl:grid-cols-3">
                          {relatedGroups.map((group) => (
                            <div key={group.type}>
                              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {group.type === 'lessons'
                                  ? 'Related Lessons'
                                  : group.type === 'materials'
                                    ? 'Related Materials'
                                    : 'Related Courses'}
                              </p>
                              <div className="space-y-1.5">
                                {group.results.map((result) => (
                                  <SearchResultCard
                                    key={`related-${group.type}-${result.id}`}
                                    result={result}
                                    compact
                                    isOpening={openingResultId === result.id}
                                    onOpen={(item) =>
                                      void handleOpenResult(item)
                                    }
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  )}
                </div>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>

      <PdfViewerModal
        resource={preview?.kind === 'pdf' ? preview.resource : null}
        isOpen={preview?.kind === 'pdf'}
        initialPage={preview?.kind === 'pdf' ? preview.page : undefined}
        onClose={() => setPreview(null)}
      />
      <CodeViewerModal
        resource={preview?.kind === 'code' ? preview.resource : null}
        isOpen={preview?.kind === 'code'}
        initialLine={preview?.kind === 'code' ? preview.line : undefined}
        onClose={() => setPreview(null)}
      />
    </>
  )
}

interface OpenNavigationOptions {
  close: () => void
  navigateToCourse: (courseId: string) => void
  navigateToPlayer: (courseId?: string) => void
  loadHierarchy: (
    course: Course,
    modules: Array<Module & { lessons: Lesson[] }>,
    initialLessonId?: string
  ) => Promise<void>
  setCurrentTime: (currentTime: number) => void
  setPreview: React.Dispatch<React.SetStateAction<ResourcePreview | null>>
}

async function openNavigationTarget(
  target: LibrarySearchNavigation,
  options: OpenNavigationOptions
): Promise<void> {
  if (target.type === 'course') {
    options.navigateToCourse(target.courseId)
    options.close()
    return
  }

  if (target.type === 'module') {
    options.navigateToCourse(target.courseId)
    options.close()
    return
  }

  const hierarchy = await window.api.courses.getById(target.courseId)
  if (!hierarchy)
    throw new Error('O curso deste resultado não está mais disponível.')

  if (target.type === 'lesson') {
    await options.loadHierarchy(
      hierarchy.course,
      hierarchy.modules,
      target.lessonId
    )
    if (typeof target.timestampSeconds === 'number') {
      options.setCurrentTime(Math.max(0, target.timestampSeconds))
    }
    options.navigateToPlayer(target.courseId)
    options.close()
    return
  }

  const resource = target.resourceId
    ? findResource(hierarchy, target.resourceId)
    : null
  const lesson = target.lessonId ? findLesson(hierarchy, target.lessonId) : null
  const documentResource = resource
    ? asDocumentResource(resource)
    : lesson
      ? lessonAsDocumentResource(lesson)
      : null
  if (!documentResource)
    throw new Error('O material deste resultado não está mais disponível.')

  if (target.sourceKind === 'pdf' || isPdfResource(documentResource)) {
    options.setPreview({
      kind: 'pdf',
      resource: documentResource,
      page:
        typeof target.page === 'number' && target.page > 0
          ? target.page
          : undefined
    })
    options.close()
    return
  }

  if (target.sourceKind === 'code' || isCodeResource(documentResource)) {
    options.setPreview({
      kind: 'code',
      resource: documentResource,
      line:
        typeof target.startLine === 'number' && target.startLine > 0
          ? target.startLine
          : undefined
    })
    options.close()
    return
  }

  if (resource) {
    await window.api.system.openPath(resource.filePath)
    options.close()
    return
  }

  if (lesson) {
    await options.loadHierarchy(hierarchy.course, hierarchy.modules, lesson.id)
    options.navigateToPlayer(target.courseId)
    options.close()
  }
}
