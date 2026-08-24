import React, { useState } from 'react'
import {
  X,
  Edit3,
  EyeOff,
  FolderPlus,
  BookmarkPlus,
  Trash2
} from 'lucide-react'
import { useSelectionStore } from '../../stores/useSelectionStore'
import { useStudioStore } from '../../stores/useStudioStore'
import { Button } from '../ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import { BulkRenameDialog } from './BulkRenameDialog'
import { CreateCourseFromSelectionModal } from './CreateCourseFromSelectionModal'

export function BulkActionBar(): React.JSX.Element | null {
  const { isSelectionMode, selectedMap, getSelectedArray, getCountsByType, clearSelection } = useSelectionStore()
  const { setRenameModalOpen } = useStudioStore()
  const [isCreateCourseModalOpen, setIsCreateCourseModalOpen] = useState(false)

  if (!isSelectionMode || selectedMap.size === 0) {
    return null
  }

  const selectedItems = getSelectedArray()
  const counts = getCountsByType()
  const totalCount = selectedItems.length

  const handleHideSelected = async (): Promise<void> => {
    const ids = selectedItems.map((i) => i.appearanceId)
    await window.api.studio.setHidden(ids, true)
    clearSelection()
  }

  const handleDeleteSelected = async (): Promise<void> => {
    if (!window.confirm(`Tem certeza que deseja remover ${totalCount} item(ns) da biblioteca lógica? (Os arquivos em disco NÃO serão apagados)`)) {
      return
    }
    for (const item of selectedItems) {
      await window.api.studio.deleteAppearance(item.appearanceId)
    }
    clearSelection()
  }

  return (
    <>
      <div
        role="toolbar"
        aria-label="Barra de ações em lote"
        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-black/90 text-white border border-white/20 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-6 select-none max-w-4xl w-auto"
      >
        {/* Count Badge & Dismiss */}
        <div className="flex items-center gap-2 pr-3 border-r border-white/15">
          <span className="flex items-center justify-center px-2.5 py-0.5 rounded-full bg-primary font-mono font-bold text-xs text-primary-foreground shadow-sm">
            {totalCount}
          </span>
          <span className="text-xs text-slate-300 font-medium whitespace-nowrap">selecionado(s)</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={clearSelection}
            className="h-6 w-6 rounded-full hover:bg-white/20 text-slate-300 hover:text-white"
            aria-label="Limpar seleção"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          {/* Renomear em Massa */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRenameModalOpen(true)}
                className="h-8 px-2.5 text-xs text-slate-200 hover:text-white hover:bg-white/15 rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5 text-orange-400" />
                <span>Renomear</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Renomeação com padrões e numeração</TooltipContent>
          </Tooltip>

          {/* Criar Curso a partir da Seleção */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsCreateCourseModalOpen(true)}
                className="h-8 px-2.5 text-xs text-slate-200 hover:text-white hover:bg-white/15 rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <FolderPlus className="h-3.5 w-3.5 text-amber-400" />
                <span>Criar Curso</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Criar novo curso a partir dos itens selecionados</TooltipContent>
          </Tooltip>

          {/* Adicionar à Fila de Estudos (se contiver aulas) */}
          {counts.lesson > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    for (const item of selectedItems.filter((i) => i.type === 'lesson')) {
                      await window.api.studyQueue.add('lesson', item.id)
                    }
                    clearSelection()
                  }}
                  className="h-8 px-2.5 text-xs text-slate-200 hover:text-white hover:bg-white/15 rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <BookmarkPlus className="h-3.5 w-3.5 text-blue-400" />
                  <span>Estudar Depois</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Adicionar aulas selecionadas à fila de estudos</TooltipContent>
            </Tooltip>
          )}

          {/* Ocultar Itens */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleHideSelected}
                className="h-8 px-2.5 text-xs text-slate-200 hover:text-white hover:bg-white/15 rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <EyeOff className="h-3.5 w-3.5 text-purple-400" />
                <span>Ocultar</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Ocultar da Home e da navegação normal</TooltipContent>
          </Tooltip>

          {/* Excluir da Biblioteca (Lógico) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeleteSelected}
                className="h-8 px-2.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Remover</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Remover apenas da biblioteca (arquivos no disco permanecem intocados)</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Modais acionados pela barra */}
      <BulkRenameDialog />
      <CreateCourseFromSelectionModal
        open={isCreateCourseModalOpen}
        onOpenChange={setIsCreateCourseModalOpen}
      />
    </>
  )
}
