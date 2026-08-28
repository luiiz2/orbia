import { Component, type ErrorInfo, type ReactNode } from 'react'
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  RefreshCw,
  Home
} from 'lucide-react'
import { Button } from './button'

interface SectionErrorBoundaryProps {
  children: ReactNode
  title?: string
  fallback?: ReactNode
  onReset?: () => void
  onNavigateHome?: () => void
}

interface SectionErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  showDetails: boolean
  copied: boolean
}

export class SectionErrorBoundary extends Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  public state: SectionErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
    copied: false
  }

  public static getDerivedStateFromError(
    error: Error
  ): Partial<SectionErrorBoundaryState> {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })
    console.error(
      '[SectionErrorBoundary] Intercepted component error:',
      error,
      errorInfo
    )
  }

  private handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      copied: false
    })
    this.props.onReset?.()
  }

  private handleCopyDiagnostics = async (): Promise<void> => {
    const { error, errorInfo } = this.state
    const diagnostics = [
      `[Orbia Error Report]`,
      `Timestamp: ${new Date().toISOString()}`,
      `Error: ${error?.name || 'Error'}: ${error?.message || 'Unknown error'}`,
      `Stack:\n${error?.stack || 'No stack trace'}`,
      `Component Stack:\n${errorInfo?.componentStack || 'No component stack'}`
    ].join('\n\n')

    try {
      await navigator.clipboard.writeText(diagnostics)
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 2000)
    } catch {
      // Fallback
    }
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      const { title, onNavigateHome } = this.props
      const { error, errorInfo, showDetails, copied } = this.state

      return (
        <div className="flex w-full flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl border border-border/80 bg-card/90 p-6 shadow-xl backdrop-blur-sm space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/10 text-destructive shadow-inner">
              <AlertCircle className="h-6 w-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-foreground">
                {title || 'Falha ao renderizar esta seção'}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Ocorreu uma falha no carregamento deste painel. Seus dados e
                progresso continuam intactos.
              </p>
            </div>

            {error && (
              <div className="space-y-2 text-left">
                <div className="rounded-lg border border-border/60 bg-secondary/30 p-2.5 font-mono text-[11px] text-destructive/90 select-all">
                  {error.message}
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() =>
                      this.setState((prev) => ({
                        showDetails: !prev.showDetails
                      }))
                    }
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showDetails ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                    {showDetails
                      ? 'Ocultar detalhes técnicos'
                      : 'Ver detalhes técnicos'}
                  </button>

                  <button
                    type="button"
                    onClick={this.handleCopyDiagnostics}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {copied ? 'Diagnóstico copiado!' : 'Copiar diagnóstico'}
                  </button>
                </div>

                {showDetails && (
                  <pre className="max-h-40 overflow-y-auto rounded-lg border border-border/40 bg-secondary/20 p-2 font-mono text-[10px] text-muted-foreground whitespace-pre-wrap leading-tight">
                    {error.stack}
                    {errorInfo?.componentStack}
                  </pre>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <Button
                variant="default"
                size="sm"
                onClick={this.handleReset}
                className="font-semibold shadow-md rounded-xl"
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Tentar Novamente
              </Button>

              {onNavigateHome && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onNavigateHome}
                  className="rounded-xl"
                >
                  <Home className="mr-1.5 h-3.5 w-3.5" />
                  Voltar ao Início
                </Button>
              )}
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
