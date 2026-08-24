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
import { useStudioStore } from '../../stores/useStudioStore'
import { Sliders, Plus, Trash2 } from 'lucide-react'
import type { CustomFieldType } from '@shared'

export function CustomFieldsModal(): React.JSX.Element | null {
  const {
    customFields,
    isCustomFieldsModalOpen,
    setCustomFieldsModalOpen,
    fetchCustomFields
  } = useStudioStore()

  const [name, setName] = useState('')
  const [fieldType, setFieldType] = useState<CustomFieldType>('text')
  const [optionsStr, setOptionsStr] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    if (isCustomFieldsModalOpen) {
      fetchCustomFields().catch(console.warn)
    }
  }, [isCustomFieldsModalOpen, fetchCustomFields])

  const handleCreate = async (): Promise<void> => {
    if (!name.trim()) return
    setIsCreating(true)
    try {
      const options = fieldType === 'select' ? optionsStr.split(',').map((s) => s.trim()).filter(Boolean) : undefined
      await window.api.studio.createCustomFieldDefinition(name.trim(), fieldType, options)
      setName('')
      setOptionsStr('')
      await fetchCustomFields()
    } finally {
      setIsCreating(false)
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    await window.api.studio.deleteCustomFieldDefinition(id)
    await fetchCustomFields()
  }

  return (
    <Dialog open={isCustomFieldsModalOpen} onOpenChange={setCustomFieldsModalOpen}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-primary" />
            <span>Gerenciar Metadados e Campos Customizados</span>
          </DialogTitle>
          <DialogDescription>
            Crie campos personalizados para associar a cursos, módulos ou aulas (ex: Professor, Nível, Prioridade).
          </DialogDescription>
        </DialogHeader>

        {/* Creation Form */}
        <div className="p-3 rounded-xl border border-border/50 bg-muted/20 space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-foreground">Nome do Campo:</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Professor, Dificuldade"
                className="mt-1 h-8 text-xs"
              />
            </div>
            <div>
              <label className="font-semibold text-foreground">Tipo de Dado:</label>
              <select
                value={fieldType}
                onChange={(e) => setFieldType(e.target.value as CustomFieldType)}
                className="mt-1 flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="text">Texto</option>
                <option value="number">Número</option>
                <option value="date">Data</option>
                <option value="boolean">Verdadeiro / Falso</option>
                <option value="select">Seleção (Múltiplas opções)</option>
                <option value="rating">Avaliação (Estrelas)</option>
                <option value="color">Cor</option>
                <option value="tag">Etiqueta (Tag)</option>
                <option value="url">Link / URL</option>
              </select>
            </div>
          </div>

          {fieldType === 'select' && (
            <div>
              <label className="font-semibold text-foreground">Opções (separadas por vírgula):</label>
              <Input
                value={optionsStr}
                onChange={(e) => setOptionsStr(e.target.value)}
                placeholder="Iniciante, Intermediário, Avançado"
                className="mt-1 h-8 text-xs"
              />
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" onClick={handleCreate} disabled={isCreating || !name.trim()} className="h-8 text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" />
              <span>Adicionar Campo</span>
            </Button>
          </div>
        </div>

        {/* Existing Fields List */}
        <div className="flex-1 overflow-y-auto min-h-[160px] max-h-[260px] space-y-1.5 p-1 text-xs">
          <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Campos Ativos ({customFields.length}):
          </h4>
          {customFields.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between p-2 rounded-lg bg-card border border-border/40"
            >
              <div>
                <span className="font-semibold text-foreground mr-2">{f.name}</span>
                <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] uppercase font-mono">
                  {f.fieldType}
                </span>
                {f.options && (
                  <span className="text-[11px] text-muted-foreground ml-2">
                    ({f.options.join(', ')})
                  </span>
                )}
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(f.id)}
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                aria-label="Excluir campo"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" size="sm" onClick={() => setCustomFieldsModalOpen(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
