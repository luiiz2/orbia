import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Code2,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  FileCode
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { formatFileSize } from '../../lib/formatters'
import { mediaUrl } from '../../lib/utils'
import type { AttachedResource } from '@shared'
import type { DocumentResource } from './PdfViewerModal'

interface CodeViewerModalProps {
  resource: AttachedResource | DocumentResource | null
  isOpen: boolean
  onClose: () => void
  initialLine?: number
}

export function CodeViewerModal({
  resource,
  isOpen,
  onClose,
  initialLine
}: CodeViewerModalProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const [content, setContent] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [isCopied, setIsCopied] = useState<boolean>(false)
  const lineRefs = useRef<Record<number, HTMLTableRowElement | null>>({})

  useEffect(() => {
    if (!isOpen || !resource) {
      setContent('')
      setIsLoading(true)
      setError(null)
      lineRefs.current = {}
      return
    }

    let isMounted = true
    setIsLoading(true)
    setError(null)
    lineRefs.current = {}

    const fetchCode = async (): Promise<void> => {
      try {
        const url = mediaUrl(resource.filePath)
        const res = await fetch(url)
        if (!res.ok) {
          throw new Error(`Failed to load file (${res.status})`)
        }
        const text = await res.text()
        if (isMounted) {
          setContent(text)
          setIsLoading(false)
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : 'Error loading file content'
          )
          setIsLoading(false)
        }
      }
    }

    void fetchCode()

    return () => {
      isMounted = false
    }
  }, [isOpen, resource])

  useEffect(() => {
    if (isLoading || !initialLine || initialLine < 1) return
    lineRefs.current[initialLine]?.scrollIntoView({ block: 'center' })
  }, [content, initialLine, isLoading])

  if (!resource) return null

  const handleCopy = async (): Promise<void> => {
    if (!content) return
    try {
      await navigator.clipboard.writeText(content)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch {
      // Ignore clipboard write error
    }
  }

  const handleOpenExternal = (): void => {
    void window.api.system.openPath(resource.filePath)
  }

  const lines = content.split('\n')
  const ext = (resource.fileExtension || '').replace('.', '').toUpperCase()

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl w-[94vw] h-[90vh] p-0 overflow-hidden rounded-2xl flex flex-col gap-0 border-border/80 bg-card shadow-2xl">
        {/* Header Bar */}
        <DialogHeader className="px-5 py-3.5 border-b border-border/80 bg-card flex flex-row items-center justify-between space-y-0 shrink-0">
          <div className="flex min-w-0 items-start gap-3 mr-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent border border-accent/20">
              <Code2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle
                className="break-words whitespace-normal text-sm sm:text-base font-bold text-foreground leading-snug"
                title={resource.name}
              >
                {resource.name}
              </DialogTitle>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                {ext && (
                  <Badge
                    variant="outline"
                    className="text-[10px] py-0 px-1.5 font-mono font-bold text-accent border-accent/30"
                  >
                    {ext}
                  </Badge>
                )}
                {resource.fileSize ? (
                  <span>{formatFileSize(resource.fileSize)}</span>
                ) : null}
                {!isLoading && !error && (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {lines.length} {lines.length === 1 ? 'linha' : 'linhas'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 pr-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleCopy()}
              disabled={isLoading || Boolean(error)}
              className="gap-1.5 text-xs rounded-xl border-border/80 hover:bg-secondary hover:text-foreground cursor-pointer h-8"
              title={t('documents.copyCode', 'Copiar código')}
            >
              {isCopied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="hidden sm:inline text-emerald-400 font-semibold">
                    {t('documents.copied', 'Copiado!')}
                  </span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="hidden sm:inline">
                    {t('documents.copyCode', 'Copiar Código')}
                  </span>
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenExternal}
              className="gap-1.5 text-xs rounded-xl border-border/80 hover:bg-secondary hover:text-foreground cursor-pointer h-8"
              title={t('documents.openInEditor', 'Abrir no editor padrão')}
            >
              <ExternalLink className="h-3.5 w-3.5 text-primary" />
              <span className="hidden sm:inline">
                {t('documents.openInEditor', 'Abrir no Editor')}
              </span>
            </Button>
          </div>
        </DialogHeader>

        {/* Code Content Canvas */}
        <div className="flex-1 w-full h-full overflow-hidden bg-[#101312] relative flex flex-col font-mono text-xs">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-accent" />
              <span className="text-xs">Carregando código...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center flex-1 text-center p-6 space-y-3">
              <FileCode className="h-10 w-10 text-muted-foreground/60" />
              <p className="text-sm font-semibold text-rose-400">{error}</p>
              <Button variant="outline" size="sm" onClick={handleOpenExternal}>
                Abrir com aplicativo padrão
              </Button>
            </div>
          ) : (
            <div className="flex-1 overflow-auto p-4 select-text">
              <table className="w-full border-collapse">
                <tbody>
                  {lines.map((line, idx) => {
                    const lineNumber = idx + 1
                    const isInitialLine = lineNumber === initialLine
                    return (
                      <tr
                        key={idx}
                        ref={(element) => {
                          lineRefs.current[lineNumber] = element
                        }}
                        className={`hover:bg-white/[0.04] transition-colors leading-relaxed ${isInitialLine ? 'bg-accent/15' : ''}`}
                      >
                        <td className="pr-4 py-0.5 text-right select-none text-zinc-600 font-mono text-[11px] w-12 shrink-0 border-r border-zinc-800">
                          {lineNumber}
                        </td>
                        <td className="pl-4 py-0.5 text-zinc-200 font-mono text-xs whitespace-pre break-all">
                          {line || ' '}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
