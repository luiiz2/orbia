import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useSelectionStore } from '../../stores/useSelectionStore'
import { useStudioStore } from '../../stores/useStudioStore'
import type { BulkRenameOptions, BulkRenamePreviewItem } from '@shared'

export function BulkRenameDialog(): React.JSX.Element | null {
  const { isRenameModalOpen, setRenameModalOpen, fetchAppearances } =
    useStudioStore()
  const { getSelectedArray, clearSelection } = useSelectionStore()

  const [pattern, setPattern] = useState('{number:02} — {title}')
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [addPrefix, setAddPrefix] = useState('')
  const [addSuffix, setAddSuffix] = useState('')
  const [caseTransform, setCaseTransform] = useState<
    'none' | 'lowercase' | 'uppercase' | 'titlecase' | 'sentencecase'
  >('none')
  const [cleanTags, setCleanTags] = useState(false)
  const [cleanCodecs, setCleanCodecs] = useState(false)
  const [replaceUnderscores, setReplaceUnderscores] = useState(true)
  const [startNumber, setStartNumber] = useState(1)
  const [zeroPadding, setZeroPadding] = useState(2)

  const [previewList, setPreviewList] = useState<BulkRenamePreviewItem[]>([])
  const [isApplying, setIsApplying] = useState(false)

  const selected = getSelectedArray()

  // Generate live preview on options change
  useEffect(() => {
    if (!isRenameModalOpen || selected.length === 0) return

    const options: BulkRenameOptions = {
      pattern: pattern.trim() || undefined,
      findText: findText || undefined,
      replaceText,
      addPrefix: addPrefix || undefined,
      addSuffix: addSuffix || undefined,
      caseTransform,
      cleanTags,
      cleanCodecs,
      replaceUnderscores,
      startNumber,
      zeroPadding
    }

    const ids = selected.map((s) => s.appearanceId)
    window.api.studio
      .renamePreview(ids, options)
      .then(setPreviewList)
      .catch(console.warn)
  }, [
    isRenameModalOpen,
    selected,
    pattern,
    findText,
    replaceText,
    addPrefix,
    addSuffix,
    caseTransform,
    cleanTags,
    cleanCodecs,
    replaceUnderscores,
    startNumber,
    zeroPadding
  ])

  const handleApply = async (): Promise<void> => {
    setIsApplying(true)
    try {
      const items = previewList.map((p) => ({
        appearanceId: p.appearanceId,
        newTitle: p.newTitle
      }))
      await window.api.studio.renameApply(items)
      await fetchAppearances()
      clearSelection()
      setRenameModalOpen(false)
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <Dialog open={isRenameModalOpen} onOpenChange={setRenameModalOpen}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Renomeação em Massa Avançada</DialogTitle>
          <DialogDescription>
            Defina padrões de títulos, numeração e formatação para os{' '}
            {selected.length} itens selecionados. Os arquivos no disco NÃO serão
            modificados.
          </DialogDescription>
        </DialogHeader>

        {/* Options Grid */}
        <div className="grid grid-cols-2 gap-4 py-3 border-y border-border/50 text-xs">
          <div className="space-y-3">
            <div>
              <label className="font-semibold text-foreground">
                Template de Padrão:
              </label>
              <Input
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="{number:02} — {title}"
                className="mt-1 h-8 text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Use {'{number:02}'} e {'{title}'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-semibold text-foreground">
                  Localizar:
                </label>
                <Input
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  placeholder="Texto ou prefixo"
                  className="mt-1 h-8 text-xs"
                />
              </div>
              <div>
                <label className="font-semibold text-foreground">
                  Substituir por:
                </label>
                <Input
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  placeholder="Novo texto"
                  className="mt-1 h-8 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-semibold text-foreground">
                  Prefixo:
                </label>
                <Input
                  value={addPrefix}
                  onChange={(e) => setAddPrefix(e.target.value)}
                  placeholder="Adicionar no início"
                  className="mt-1 h-8 text-xs"
                />
              </div>
              <div>
                <label className="font-semibold text-foreground">Sufixo:</label>
                <Input
                  value={addSuffix}
                  onChange={(e) => setAddSuffix(e.target.value)}
                  placeholder="Adicionar no final"
                  className="mt-1 h-8 text-xs"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-semibold text-foreground">
                  Número Inicial:
                </label>
                <Input
                  type="number"
                  value={startNumber}
                  onChange={(e) =>
                    setStartNumber(parseInt(e.target.value, 10) || 1)
                  }
                  className="mt-1 h-8 text-xs font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-foreground">
                  Dígitos Zero (Padding):
                </label>
                <Input
                  type="number"
                  value={zeroPadding}
                  onChange={(e) =>
                    setZeroPadding(parseInt(e.target.value, 10) || 2)
                  }
                  className="mt-1 h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-foreground">
                Formatação de Caixa:
              </label>
              <select
                value={caseTransform}
                onChange={(e) =>
                  setCaseTransform(
                    e.target.value as unknown as typeof caseTransform
                  )
                }
                className="mt-1 flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="none">Manter original</option>
                <option value="titlecase">
                  Primeira Letra Em Maiúsculo (Title Case)
                </option>
                <option value="sentencecase">
                  Apenas primeira palavra (Sentence case)
                </option>
                <option value="lowercase">minúsculas</option>
                <option value="uppercase">MAIÚSCULAS</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={replaceUnderscores}
                  onChange={(e) => setReplaceUnderscores(e.target.checked)}
                  className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5"
                />
                <span>Substituir underlines (_) por espaços</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={cleanTags}
                  onChange={(e) => setCleanTags(e.target.checked)}
                  className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5"
                />
                <span>Remover tags entre colchetes [ex: site]</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={cleanCodecs}
                  onChange={(e) => setCleanCodecs(e.target.checked)}
                  className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5"
                />
                <span>Remover resoluções e codecs (1080p, x264, etc.)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Live Preview Table */}
        <div className="flex-1 overflow-y-auto min-h-[160px] max-h-[260px] rounded-lg border border-border/40 bg-muted/20 p-2 text-xs">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Prévia ao Vivo ({previewList.length} itens):
          </div>
          <div className="space-y-1.5 font-mono">
            {previewList.map((p) => (
              <div
                key={p.appearanceId}
                className="flex items-center justify-between gap-4 p-1.5 rounded bg-background/50 border border-border/30"
              >
                <span className="min-w-0 flex-1 break-words whitespace-normal text-muted-foreground leading-snug">
                  {p.originalTitle || '(Sem título)'}
                </span>
                <span className="text-muted-foreground">➔</span>
                <span className="min-w-0 flex-1 break-words whitespace-normal text-primary font-semibold leading-snug">
                  {p.newTitle}
                </span>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRenameModalOpen(false)}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleApply}
            disabled={isApplying || previewList.length === 0}
          >
            {isApplying
              ? 'Aplicando...'
              : `Aplicar em ${previewList.length} Itens`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
