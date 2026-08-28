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
import { Zap, Plus, Play, Trash2 } from 'lucide-react'

export function AutomationRulesModal(): React.JSX.Element | null {
  const {
    automationRules,
    isAutomationModalOpen,
    setAutomationModalOpen,
    fetchAutomationRules
  } = useStudioStore()

  const [ruleName, setRuleName] = useState('')
  const [priority, setPriority] = useState(10)
  const [isCreating, setIsCreating] = useState(false)
  const [isExecuting, setIsExecuting] = useState<string | null>(null)

  useEffect(() => {
    if (isAutomationModalOpen) {
      fetchAutomationRules().catch(console.warn)
    }
  }, [isAutomationModalOpen, fetchAutomationRules])

  const handleCreateSampleRule = async (): Promise<void> => {
    if (!ruleName.trim()) return
    setIsCreating(true)
    try {
      await window.api.studio.saveAutomationRule({
        name: ruleName.trim(),
        priority,
        isActive: true,
        executionMode: 'manual',
        triggerEvent: 'onManualTrigger',
        conditions: [
          { field: 'entity_type', operator: 'equals', value: 'lesson' }
        ],
        actions: [{ actionType: 'add_tag', params: { tag: 'Revisado' } }]
      })
      setRuleName('')
      await fetchAutomationRules()
    } finally {
      setIsCreating(false)
    }
  }

  const handleExecute = async (ruleId: string): Promise<void> => {
    setIsExecuting(ruleId)
    try {
      const res = await window.api.studio.executeAutomationRule(ruleId)
      if (res.success) {
        alert(
          `Regra executada com sucesso! ${res.affectedCount} item(ns) afetado(s).`
        )
      }
    } finally {
      setIsExecuting(null)
    }
  }

  const handleDelete = async (ruleId: string): Promise<void> => {
    await window.api.studio.deleteAutomationRule(ruleId)
    await fetchAutomationRules()
  }

  return (
    <Dialog open={isAutomationModalOpen} onOpenChange={setAutomationModalOpen}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <span>Motor de Automações Locais (Regras Determinísticas)</span>
          </DialogTitle>
          <DialogDescription>
            Crie regras de automação local baseadas em condições (IF ➔ THEN).
            Sem IA e sem dependência de serviços externos.
          </DialogDescription>
        </DialogHeader>

        {/* Quick Rule Creator */}
        <div className="p-3 rounded-xl border border-border/50 bg-muted/20 space-y-3 text-xs">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="font-semibold text-foreground">
                Nome da Regra:
              </label>
              <Input
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder="Ex: Marcar aulas de Python como Revisadas"
                className="mt-1 h-8 text-xs"
              />
            </div>
            <div>
              <label className="font-semibold text-foreground">
                Prioridade (Numérica):
              </label>
              <Input
                type="number"
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
                className="mt-1 h-8 text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleCreateSampleRule}
              disabled={isCreating || !ruleName.trim()}
              className="h-8 text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              <span>Salvar Regra</span>
            </Button>
          </div>
        </div>

        {/* Rules List */}
        <div className="flex-1 overflow-y-auto min-h-[180px] max-h-[300px] space-y-2 p-1 text-xs">
          <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Regras de Automação ({automationRules.length}):
          </h4>
          {automationRules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/40 shadow-sm"
            >
              <div className="space-y-1 min-w-0 flex-1 pr-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground truncate">
                    {rule.name}
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-primary/10 text-primary font-mono text-[10px] font-bold">
                    P{rule.priority}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase font-mono">
                    [{rule.executionMode}]
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Condições: {rule.conditions.length} | Ações:{' '}
                  {rule.actions.length}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExecute(rule.id)}
                  disabled={isExecuting === rule.id}
                  className="h-7 text-xs rounded-lg flex items-center gap-1 cursor-pointer"
                >
                  <Play className="h-3 w-3 text-emerald-500" />
                  <span>
                    {isExecuting === rule.id ? 'Executando...' : 'Executar'}
                  </span>
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(rule.id)}
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  aria-label="Excluir regra"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutomationModalOpen(false)}
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
