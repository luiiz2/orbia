import React from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, ExternalLink, Download } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { formatFileSize } from '../../lib/formatters'
import type { AttachedResource } from '@shared'

export interface DocumentResource {
  id?: string
  name: string
  filePath: string
  fileExtension?: string
  fileSize?: number
  type?: 'pdf' | 'code' | 'archive' | 'document' | string
}

interface PdfViewerModalProps {
  resource: AttachedResource | DocumentResource | null
  isOpen: boolean
  onClose: () => void
}

export function PdfViewerModal({
  resource,
  isOpen,
  onClose
}: PdfViewerModalProps): React.JSX.Element | null {
  const { t } = useTranslation()

  if (!resource) return null

  const mediaUrl = `media://${encodeURI(resource.filePath.replace(/\\/g, '/'))}`
  const isPdf =
    resource.fileExtension?.toLowerCase().includes('pdf') ||
    resource.name.toLowerCase().endsWith('.pdf') ||
    resource.type === 'pdf'

  const handleOpenExternal = (): void => {
    window.open(mediaUrl, '_blank')
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl w-[94vw] h-[90vh] p-0 overflow-hidden rounded-2xl flex flex-col gap-0 border-border/80 bg-card shadow-2xl">
        {/* Header Bar */}
        <DialogHeader className="px-5 py-3.5 border-b border-border/80 bg-card flex flex-row items-center justify-between space-y-0 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden mr-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/15 text-primary border border-primary/20">
              <FileText className="h-5 w-5" />
            </div>
            <div className="flex flex-col overflow-hidden min-w-0">
              <DialogTitle className="text-sm sm:text-base font-bold text-foreground truncate" title={resource.name}>
                {resource.name}
              </DialogTitle>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                {resource.fileExtension && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 uppercase font-mono font-bold">
                    {resource.fileExtension.replace('.', '')}
                  </Badge>
                )}
                {resource.fileSize ? <span>{formatFileSize(resource.fileSize)}</span> : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 pr-6">
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenExternal}
              className="gap-1.5 text-xs rounded-xl border-border/80 hover:bg-secondary hover:text-foreground cursor-pointer h-8"
              title={t('documents.openExternal', 'Abrir em nova janela')}
            >
              <ExternalLink className="h-3.5 w-3.5 text-primary" />
              <span className="hidden sm:inline">{t('documents.openExternal', 'Abrir em Nova Janela')}</span>
            </Button>
          </div>
        </DialogHeader>

        {/* Viewer Body */}
        <div className="flex-1 w-full h-full overflow-hidden bg-secondary/30 relative flex flex-col items-center justify-center">
          {isPdf ? (
            <iframe
              src={mediaUrl}
              className="w-full h-full border-0 rounded-b-2xl bg-white dark:bg-zinc-900"
              title={resource.name}
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 max-w-md">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-md">
                <FileText className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-foreground">{resource.name}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t('documents.nonPdfHint', 'Este formato de documento pode ser visualizado abrindo no seu visualizador externo padrão.')}
                </p>
              </div>
              <Button
                onClick={handleOpenExternal}
                className="gap-2 shadow-lg shadow-orange-500/20 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-white font-semibold rounded-xl"
              >
                <Download className="h-4 w-4" />
                <span>{t('documents.openExternal', 'Abrir Documento')}</span>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
