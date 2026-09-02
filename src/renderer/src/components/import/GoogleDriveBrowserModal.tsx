import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  Cloud,
  Download,
  ExternalLink,
  Eye,
  File,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  Loader2,
  Lock,
  LogOut,
  RefreshCw
} from 'lucide-react'
import type {
  GoogleDriveBrowseRoot,
  GoogleDriveConnectionStatus,
  GoogleDriveEntry,
  GoogleDriveFolderListing,
  GoogleDrivePlayback,
  GoogleDrivePlaybackInput
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
import { formatFileSize } from '../../lib/formatters'

interface GoogleDriveBrowserModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type FolderCrumbKind = GoogleDriveBrowseRoot | 'folder'

interface FolderCrumb {
  id: string
  name: string
  kind: FolderCrumbKind
  driveId?: string
}

const MY_DRIVE_ROOT: FolderCrumb = {
  id: 'root',
  name: 'Meu Drive',
  kind: 'my-drive'
}

const SHARED_WITH_ME_ROOT: FolderCrumb = {
  id: 'shared-with-me',
  name: 'Compartilhados comigo',
  kind: 'shared-with-me'
}

export function GoogleDriveBrowserModal({
  open,
  onOpenChange
}: GoogleDriveBrowserModalProps): React.JSX.Element {
  const { t } = useTranslation()
  const [status, setStatus] = useState<GoogleDriveConnectionStatus | null>(null)
  const [listing, setListing] = useState<GoogleDriveFolderListing | null>(null)
  const [browseRoot, setBrowseRoot] = useState<GoogleDriveBrowseRoot>('my-drive')
  const [crumbs, setCrumbs] = useState<FolderCrumb[]>([MY_DRIVE_ROOT])
  const [preview, setPreview] = useState<GoogleDrivePlayback | null>(null)
  const [previewInput, setPreviewInput] =
    useState<GoogleDrivePlaybackInput | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isOpening, setIsOpening] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const loadListing = useCallback(
    async (
      crumb: FolderCrumb,
      options: { pageToken?: string } = {},
      append = false
    ): Promise<void> => {
      const requestId = ++requestIdRef.current
      setIsLoading(true)
      setErrorMessage(null)
      setFeedbackMessage(null)
      if (!append) setListing(null)

      try {
        const next =
          crumb.kind === 'shared-with-me'
            ? await window.api.sources.googleDrive.listSharedWithMe(options)
            : await window.api.sources.googleDrive.listFolder(crumb.id, {
                ...(crumb.driveId ? { driveId: crumb.driveId } : {}),
                ...options
              })
        if (requestId !== requestIdRef.current) return
        setListing((current) =>
          append && current?.folderId === next.folderId
            ? {
                ...next,
                entries: [...current.entries, ...next.entries]
              }
            : next
        )
      } catch (error: unknown) {
        if (requestId !== requestIdRef.current) return
        setErrorMessage(
          error instanceof Error
            ? error.message
            : t('import.googleDriveUnavailable', 'Google Drive indisponível')
        )
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false)
      }
    },
    [t]
  )

  const resetToRoot = useCallback(
    (root: GoogleDriveBrowseRoot): FolderCrumb => {
      requestIdRef.current += 1
      const rootCrumb = root === 'my-drive' ? MY_DRIVE_ROOT : SHARED_WITH_ME_ROOT
      setBrowseRoot(root)
      setCrumbs([rootCrumb])
      setPreview(null)
      setPreviewInput(null)
      return rootCrumb
    },
    []
  )

  const loadConnection = useCallback(async (): Promise<void> => {
    setErrorMessage(null)
    setFeedbackMessage(null)
    try {
      const nextStatus = await window.api.sources.googleDrive.getStatus()
      setStatus(nextStatus)
      if (nextStatus.connected) {
        const root = resetToRoot('my-drive')
        await loadListing(root)
      } else {
        setListing(null)
      }
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t('import.googleDriveUnavailable', 'Google Drive indisponível')
      )
    }
  }, [loadListing, resetToRoot, t])

  useEffect(() => {
    if (!open) return
    void loadConnection()
  }, [loadConnection, open])

  const handleConnect = async (): Promise<void> => {
    setIsConnecting(true)
    setErrorMessage(null)
    setFeedbackMessage(null)
    try {
      const nextStatus = await window.api.sources.googleDrive.connect()
      setStatus(nextStatus)
      const root = resetToRoot('my-drive')
      await loadListing(root)
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t(
              'import.googleDriveConnectionFailed',
              'Não foi possível conectar ao Google Drive'
            )
      )
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async (): Promise<void> => {
    try {
      await window.api.sources.googleDrive.disconnect()
      setStatus({
        configured: status?.configured ?? true,
        connected: false
      })
      resetToRoot('my-drive')
      setListing(null)
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t('import.googleDriveUnavailable', 'Google Drive indisponível')
      )
    }
  }

  const handleSelectRoot = async (root: GoogleDriveBrowseRoot): Promise<void> => {
    if (isLoading) return
    const isAtSelectedRoot =
      browseRoot === root &&
      crumbs.length === 1 &&
      crumbs[0]?.kind === root
    if (isAtSelectedRoot) return
    const rootCrumb = resetToRoot(root)
    await loadListing(rootCrumb)
  }

  const handleOpenFolder = async (entry: GoogleDriveEntry): Promise<void> => {
    const crumb: FolderCrumb = {
      id: entry.itemId,
      name: entry.name,
      kind: 'folder',
      ...(entry.driveId ? { driveId: entry.driveId } : {})
    }
    setCrumbs((current) => [...current, crumb])
    setPreview(null)
    setPreviewInput(null)
    await loadListing(crumb)
  }

  const toInput = (entry: GoogleDriveEntry): GoogleDrivePlaybackInput => ({
    itemId: entry.itemId,
    ...(entry.driveId ? { driveId: entry.driveId } : {})
  })

  const handleOpenFile = async (entry: GoogleDriveEntry): Promise<void> => {
    if (!entry.canPreview) return
    setIsOpening(true)
    setErrorMessage(null)
    setFeedbackMessage(null)
    try {
      const input = toInput(entry)
      const nextPreview = await window.api.sources.googleDrive.preparePlayback(
        input
      )
      setPreview(nextPreview)
      setPreviewInput(input)
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t(
              'import.googleDrivePreviewFailed',
              'Não foi possível visualizar este arquivo'
            )
      )
    } finally {
      setIsOpening(false)
    }
  }

  const handleOpenExternal = async (
    entry: GoogleDriveEntry | null,
    input?: GoogleDrivePlaybackInput
  ): Promise<void> => {
    const nextInput = input ?? (entry ? toInput(entry) : previewInput)
    if (!nextInput) return
    setIsOpening(true)
    setErrorMessage(null)
    setFeedbackMessage(null)
    try {
      await window.api.sources.googleDrive.openExternal(nextInput)
      setFeedbackMessage(
        t('import.googleDriveOpenedExternal', 'Arquivo aberto no Google Drive.')
      )
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t(
              'import.googleDriveExternalOpenFailed',
              'Não foi possível abrir o arquivo no Google Drive'
            )
      )
    } finally {
      setIsOpening(false)
    }
  }

  const handleDownload = async (
    entry: GoogleDriveEntry | null,
    input?: GoogleDrivePlaybackInput,
    suggestedName?: string
  ): Promise<void> => {
    const nextInput = input ?? (entry ? toInput(entry) : previewInput)
    if (!nextInput) return
    if (entry && !entry.canDownload) return
    if (!entry && preview && !preview.canDownload) return

    setDownloadingId(nextInput.itemId)
    setErrorMessage(null)
    setFeedbackMessage(null)
    try {
      const result = await window.api.sources.googleDrive.download({
        ...nextInput,
        ...(suggestedName || entry?.name || preview?.name
          ? { suggestedName: suggestedName || entry?.name || preview?.name }
          : {})
      })
      if (result.success) {
        setFeedbackMessage(
          t('import.googleDriveDownloadComplete', 'Download concluído: {{name}}', {
            name: result.fileName
          })
        )
      }
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t(
              'import.googleDriveDownloadFailed',
              'Não foi possível baixar este arquivo'
            )
      )
    } finally {
      setDownloadingId(null)
    }
  }

  const handleCrumb = async (index: number): Promise<void> => {
    const nextCrumbs = crumbs.slice(0, index + 1)
    const target = nextCrumbs[nextCrumbs.length - 1]
    if (!target) return
    setCrumbs(nextCrumbs)
    if (target.kind === 'my-drive' || target.kind === 'shared-with-me') {
      setBrowseRoot(target.kind)
    }
    setPreview(null)
    setPreviewInput(null)
    await loadListing(target)
  }

  const handleBack = async (): Promise<void> => {
    if (preview) {
      setPreview(null)
      setPreviewInput(null)
      return
    }
    if (crumbs.length > 1) await handleCrumb(crumbs.length - 2)
  }

  const currentFolder = crumbs[crumbs.length - 1] ?? MY_DRIVE_ROOT
  const accountLabel = status?.account?.email || status?.account?.displayName
  const currentDownloadId = downloadingId

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(88vh,760px)] max-h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-0 overflow-hidden rounded-2xl border-border bg-card p-0 text-foreground shadow-2xl">
        <DialogHeader className="shrink-0 border-b border-border/80 bg-card px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 pr-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/15 text-primary">
                <Cloud className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-bold">
                  {t('import.googleDriveOnlineTitle', 'Navegar no Google Drive')}
                </DialogTitle>
                <DialogDescription className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
                  {preview
                    ? t(
                        'import.googleDriveStreaming',
                        'Visualização remota — o arquivo é transmitido conforme necessário.'
                      )
                    : t(
                        'import.googleDriveOnlineDescription',
                        'Conecte-se pela internet para ver arquivos sem instalar o Drive para computador ou baixar a pasta inteira.'
                      )}
                </DialogDescription>
              </div>
            </div>
            {status?.connected && !preview && (
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {accountLabel && (
                  <Badge
                    variant="secondary"
                    className="max-w-full break-all text-[10px]"
                  >
                    {accountLabel}
                  </Badge>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleDisconnect()}
                  className="h-8 gap-1.5 rounded-lg text-xs"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {t('import.googleDriveDisconnect', 'Desconectar')}
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        {errorMessage && (
          <div className="mx-4 mt-4 flex shrink-0 items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive sm:mx-5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-words">{errorMessage}</span>
          </div>
        )}
        {feedbackMessage && !errorMessage && (
          <div className="mx-4 mt-4 flex shrink-0 items-start gap-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-foreground sm:mx-5">
            <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="break-words">{feedbackMessage}</span>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-hidden">
          {!status?.connected && !preview ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center sm:px-8">
              <Cloud className="mb-4 h-12 w-12 text-primary" />
              <h3 className="text-base font-bold text-foreground">
                {t('import.googleDriveConnectHeading', 'Conecte sua conta Google')}
              </h3>
              <p className="mt-2 max-w-md break-words text-xs leading-relaxed text-muted-foreground">
                {status?.configured
                  ? t(
                      'import.googleDriveConnectDescription',
                      'A autorização abre no navegador padrão. Depois, o Orbia lista e transmite os arquivos diretamente do Drive.'
                    )
                  : t(
                      'import.googleDriveNotConfigured',
                      'Configure ORBIA_GOOGLE_DRIVE_CLIENT_ID no ambiente do Orbia para habilitar a conexão com o Google Drive.'
                    )}
              </p>
              <Button
                type="button"
                onClick={() => void handleConnect()}
                disabled={!status?.configured || isConnecting}
                className="mt-5 min-h-9 whitespace-normal gap-2 rounded-xl px-4 py-2 text-center font-semibold"
              >
                {isConnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Cloud className="h-4 w-4" />
                )}
                {isConnecting
                  ? t('import.googleDriveConnecting', 'Abrindo autorização...')
                  : t('import.connectGoogleDrive', 'Conectar Google Drive')}
              </Button>
            </div>
          ) : preview ? (
            <div className="flex h-full min-h-0 flex-col bg-black/20">
              <div className="flex shrink-0 flex-wrap items-start gap-3 border-b border-border/70 px-4 py-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleBack()}
                  className="h-8 shrink-0 gap-1.5 rounded-lg text-xs"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {t('import.googleDriveBack', 'Voltar')}
                </Button>
                <div className="min-w-0 flex-1 break-words text-sm font-semibold text-foreground">
                  {preview.name}
                </div>
                {preview.size !== undefined && (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatFileSize(preview.size)}
                  </span>
                )}
                <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                  {preview.canDownload && previewInput && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={currentDownloadId === previewInput.itemId}
                      onClick={() => void handleDownload(null)}
                      className="min-h-8 whitespace-normal gap-1.5 text-xs"
                    >
                      {currentDownloadId === previewInput.itemId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      {t('import.googleDriveDownload', 'Baixar')}
                    </Button>
                  )}
                  {previewInput && preview.webViewUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isOpening}
                      onClick={() => void handleOpenExternal(null)}
                      className="min-h-8 whitespace-normal gap-1.5 text-xs"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {t(
                        'import.googleDriveOpenExternal',
                        'Abrir no Google Drive'
                      )}
                    </Button>
                  )}
                </div>
              </div>
              <RemotePreview preview={preview} />
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex shrink-0 flex-col gap-2 border-b border-border/60 px-4 py-3">
                <div
                  aria-label={t('import.googleDriveRoots', 'Localizações do Drive')}
                  className="flex flex-wrap gap-2"
                  role="tablist"
                >
                  <Button
                    type="button"
                    role="tab"
                    aria-selected={browseRoot === 'my-drive'}
                    variant={browseRoot === 'my-drive' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => void handleSelectRoot('my-drive')}
                    disabled={isLoading}
                    className="min-h-8 whitespace-normal text-left text-xs"
                  >
                    <Folder className="h-3.5 w-3.5" />
                    {t('import.googleDriveMyDrive', 'Meu Drive')}
                  </Button>
                  <Button
                    type="button"
                    role="tab"
                    aria-selected={browseRoot === 'shared-with-me'}
                    variant={
                      browseRoot === 'shared-with-me' ? 'secondary' : 'ghost'
                    }
                    size="sm"
                    onClick={() => void handleSelectRoot('shared-with-me')}
                    disabled={isLoading}
                    className="min-h-8 whitespace-normal text-left text-xs"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    {t(
                      'import.googleDriveSharedWithMe',
                      'Compartilhados comigo'
                    )}
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleBack()}
                    disabled={crumbs.length <= 1 || isLoading}
                    className="h-8 shrink-0 gap-1.5 rounded-lg text-xs"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    {t('import.googleDriveBack', 'Voltar')}
                  </Button>
                  <nav
                    aria-label={t('import.googleDriveBreadcrumbs', 'Caminho atual')}
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-xs"
                  >
                    {crumbs.map((crumb, index) => (
                      <React.Fragment key={`${crumb.id}-${index}`}>
                        {index > 0 && (
                          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                        )}
                        <button
                          type="button"
                          onClick={() => void handleCrumb(index)}
                          className={`min-h-7 max-w-full rounded-md px-1.5 py-1 text-left font-medium whitespace-normal break-words transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${index === crumbs.length - 1 ? 'text-foreground' : 'text-muted-foreground'}`}
                          aria-current={
                            index === crumbs.length - 1 ? 'location' : undefined
                          }
                        >
                          {crumb.name}
                        </button>
                      </React.Fragment>
                    ))}
                  </nav>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void loadListing(currentFolder)}
                    disabled={isLoading}
                    className="h-8 w-8 shrink-0 rounded-lg p-0"
                    title={t('import.googleDriveRefresh', 'Atualizar')}
                    aria-label={t('import.googleDriveRefresh', 'Atualizar')}
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}
                    />
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
                {isLoading && !listing ? (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
                    {t('import.googleDriveLoading', 'Carregando conteúdo...')}
                  </div>
                ) : listing?.entries.length ? (
                  <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                    {listing.entries.map((entry) => (
                      <DriveEntryRow
                        key={entry.itemId}
                        entry={entry}
                        disabled={isOpening || isLoading}
                        downloading={currentDownloadId === entry.itemId}
                        onOpenFolder={handleOpenFolder}
                        onOpenFile={handleOpenFile}
                        onDownload={handleDownload}
                        onOpenExternal={handleOpenExternal}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
                    {t('import.googleDriveEmpty', 'Esta pasta está vazia.')}
                  </div>
                )}
                {listing?.nextPageToken && (
                  <div className="mt-4 flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void loadListing(
                          currentFolder,
                          { pageToken: listing.nextPageToken },
                          true
                        )
                      }
                      disabled={isLoading}
                      className="min-h-8 whitespace-normal rounded-xl text-xs"
                    >
                      {isLoading && (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      )}
                      {t('import.googleDriveLoadMore', 'Carregar mais')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/70 px-4 py-3 sm:px-5">
          <p className="mr-auto min-w-0 break-words text-[11px] text-muted-foreground">
            {t(
              'import.googleDriveDownloadNote',
              'A visualização é remota. O arquivo só é salvo no disco quando você clicar em “Baixar”.'
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="min-h-8 whitespace-normal rounded-xl"
          >
            {t('import.cancel', 'Fechar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DriveEntryRow({
  entry,
  disabled,
  downloading,
  onOpenFolder,
  onOpenFile,
  onDownload,
  onOpenExternal
}: {
  entry: GoogleDriveEntry
  disabled: boolean
  downloading: boolean
  onOpenFolder: (entry: GoogleDriveEntry) => Promise<void>
  onOpenFile: (entry: GoogleDriveEntry) => Promise<void>
  onDownload: (
    entry: GoogleDriveEntry,
    input?: GoogleDrivePlaybackInput,
    suggestedName?: string
  ) => Promise<void>
  onOpenExternal: (entry: GoogleDriveEntry) => Promise<void>
}): React.JSX.Element {
  const { t } = useTranslation()

  const icon = entry.isFolder ? (
    <Folder className="h-5 w-5 text-primary" />
  ) : entry.mimeType.startsWith('video/') ? (
    <FileVideo className="h-5 w-5 text-accent" />
  ) : entry.mimeType.startsWith('text/') ||
    entry.mimeType === 'application/pdf' ? (
    <FileText className="h-5 w-5 text-accent" />
  ) : (
    <File className="h-5 w-5 text-muted-foreground" />
  )

  return (
    <div className="group flex min-w-0 flex-col gap-3 rounded-xl border border-border/70 bg-card/80 p-3 transition-colors hover:border-primary/40 hover:bg-secondary/60">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary/80">
          {icon}
        </div>
        {entry.isFolder ? (
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <span className="min-w-0 flex-1 break-words text-xs font-semibold text-foreground">
              {entry.name}
            </span>
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="break-words text-xs font-semibold text-foreground">
              {entry.name}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-muted-foreground">
              <span className="break-all">
                {entry.size !== undefined
                  ? formatFileSize(entry.size)
                  : entry.mimeType}
              </span>
              {!entry.canDownload && <Lock className="h-3 w-3 shrink-0" />}
            </div>
          </div>
        )}
      </div>

      {entry.isFolder ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => void onOpenFolder(entry)}
          className="min-h-8 w-full justify-start whitespace-normal gap-1.5 text-xs sm:w-fit"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {t('import.googleDriveOpenFolder', 'Abrir pasta')}
        </Button>
      ) : (
        <div className="flex flex-wrap gap-2 border-t border-border/50 pt-3">
          {entry.canPreview && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => void onOpenFile(entry)}
              className="min-h-8 whitespace-normal gap-1.5 text-xs"
            >
              {disabled ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              {t('import.googleDrivePreview', 'Visualizar')}
            </Button>
          )}
          {entry.canDownload && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || downloading}
              onClick={() => void onDownload(entry)}
              className="min-h-8 whitespace-normal gap-1.5 text-xs"
            >
              {downloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {t('import.googleDriveDownload', 'Baixar')}
            </Button>
          )}
          {!entry.canPreview && entry.webViewUrl && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => void onOpenExternal(entry)}
              className="min-h-8 whitespace-normal gap-1.5 text-xs"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t('import.googleDriveOpenExternal', 'Abrir no Google Drive')}
            </Button>
          )}
          {!entry.canPreview && !entry.canDownload && !entry.webViewUrl && (
            <span className="basis-full break-words text-[11px] text-muted-foreground">
              {t(
                'import.googleDriveNoAvailableAction',
                'Este arquivo não pode ser visualizado ou baixado com esta conta.'
              )}
            </span>
          )}
          {!entry.canPreview && entry.canDownload && (
            <span className="basis-full break-words text-[11px] text-muted-foreground">
              {t(
                'import.googleDrivePreviewUnavailable',
                'A prévia não está disponível; use “Baixar” para salvar o arquivo.'
              )}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function RemotePreview({
  preview
}: {
  preview: GoogleDrivePlayback
}): React.JSX.Element {
  const { t } = useTranslation()

  if (preview.mimeType.startsWith('video/')) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-3">
        <video
          className="max-h-full max-w-full"
          controls
          autoPlay
          src={preview.url}
        />
      </div>
    )
  }
  if (preview.mimeType.startsWith('audio/')) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-black/40 p-8">
        <audio
          className="w-full max-w-xl"
          controls
          autoPlay
          src={preview.url}
        />
      </div>
    )
  }
  if (preview.mimeType.startsWith('image/')) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black/40 p-4">
        <img
          src={preview.url}
          alt={preview.name}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    )
  }
  if (
    preview.mimeType === 'application/pdf' ||
    preview.mimeType === 'text/plain' ||
    preview.mimeType === 'text/markdown' ||
    preview.mimeType === 'text/csv'
  ) {
    const isText = preview.mimeType !== 'application/pdf'
    return (
      <iframe
        src={preview.url}
        title={preview.name}
        sandbox={isText ? '' : undefined}
        className="h-full w-full border-0 bg-white"
      />
    )
  }
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-xs text-muted-foreground">
      {t(
        'import.googleDrivePreviewUnavailable',
        'Visualização indisponível para este tipo de arquivo.'
      )}
    </div>
  )
}
