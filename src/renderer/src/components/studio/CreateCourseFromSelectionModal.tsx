import React, { useState } from 'react'
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
import { useLibraryStore } from '../../stores/useLibraryStore'
import { useNavigationStore } from '../../stores/useNavigationStore'

export interface CreateCourseFromSelectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateCourseFromSelectionModal({
  open,
  onOpenChange
}: CreateCourseFromSelectionModalProps): React.JSX.Element | null {
  const { getSelectedArray, clearSelection } = useSelectionStore()
  const { fetchCourses } = useLibraryStore()
  const { navigateToCourse } = useNavigationStore()

  const [title, setTitle] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = getSelectedArray()

  const handleCreate = async (): Promise<void> => {
    if (!title.trim()) {
      setError('Por favor, informe o título do novo curso.')
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      const ids = selected.map((s) => s.appearanceId)
      const res = await window.api.studio.createCourseFromSelection(ids, title.trim())
      if (res.success && res.newCourse) {
        await fetchCourses()
        clearSelection()
        onOpenChange(false)
        navigateToCourse(res.newCourse.id)
      } else {
        setError(res.error || 'Falha ao criar o curso a partir da seleção.')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Criar Curso a partir da Seleção</DialogTitle>
          <DialogDescription>
            Cria uma nova estrutura de curso reunindo os {selected.length} itens selecionados. Os arquivos físicos no disco permanecerão intactos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs font-semibold text-foreground">Título do Novo Curso:</label>
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setError(null)
              }}
              placeholder="Ex: Formação Full Stack Completa"
              className="mt-1"
              autoFocus
            />
          </div>

          {error && <p className="text-xs text-destructive font-medium">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={isCreating || !title.trim()}>
            {isCreating ? 'Criando...' : 'Criar Curso'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
