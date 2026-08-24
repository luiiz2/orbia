import React, { useState, useEffect, useMemo } from 'react'
import {
  Search,
  Eye,
  EyeOff,
  CheckCircle2,
  History
} from 'lucide-react'
import { useStudioStore } from '../../stores/useStudioStore'
import { useSelectionStore } from '../../stores/useSelectionStore'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import type { LibraryAppearance, StudioEntityType } from '@shared'

export function LibrarySpreadsheet(): React.JSX.Element {
  const {
    appearances,
    fetchAppearances,
    addDraftChange,
    draftChanges,
    setDraftModalOpen,
    setHistoryModalOpen,
    includeHidden,
    toggleIncludeHidden
  } = useStudioStore()

  const { selectedMap, toggleSelect, selectRange, clearSelection } = useSelectionStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<StudioEntityType | 'all'>('all')

  useEffect(() => {
    fetchAppearances().catch(console.warn)
  }, [fetchAppearances])

  const filteredAppearances = useMemo(() => {
    return appearances.filter((app) => {
      if (filterType !== 'all' && app.entityType !== filterType) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = (app.customTitle || '').toLowerCase().includes(q)
        const matchEntity = app.entityId.toLowerCase().includes(q)
        if (!matchTitle && !matchEntity) return false
      }
      return true
    })
  }, [appearances, filterType, searchQuery])

  const handleTitleBlur = (app: LibraryAppearance, newTitle: string): void => {
    if (newTitle !== (app.customTitle || '')) {
      addDraftChange({
        appearanceId: app.id,
        entityId: app.entityId,
        entityType: app.entityType,
        field: 'customTitle',
        oldValue: app.customTitle || '',
        newValue: newTitle
      })
    }
  }

  const handleOrderBlur = (app: LibraryAppearance, newOrderStr: string): void => {
    const newOrder = parseInt(newOrderStr, 10)
    if (!isNaN(newOrder) && newOrder !== app.displayOrder) {
      addDraftChange({
        appearanceId: app.id,
        entityId: app.entityId,
        entityType: app.entityType,
        field: 'displayOrder',
        oldValue: app.displayOrder,
        newValue: newOrder
      })
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-background select-none p-4 space-y-3">
      {/* Top Header & Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">Library Studio — Editor de Biblioteca</h2>
          <p className="text-xs text-muted-foreground">
            Edição em massa, numeração, metadados e organização lógica da biblioteca sem alterar arquivos em disco.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Ocultos Toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={toggleIncludeHidden}
            className={`h-8 text-xs rounded-lg flex items-center gap-1.5 cursor-pointer ${
              includeHidden ? 'border-purple-500/50 bg-purple-500/10 text-purple-400' : ''
            }`}
          >
            {includeHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            <span>{includeHidden ? 'Exibindo Ocultos' : 'Mostrar Ocultos'}</span>
          </Button>

          {/* Histórico / Rollback */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHistoryModalOpen(true)}
            className="h-8 text-xs rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <History className="h-3.5 w-3.5 text-blue-400" />
            <span>Histórico</span>
          </Button>

          {/* Draft Changes Button */}
          {draftChanges.length > 0 && (
            <Button
              size="sm"
              onClick={() => setDraftModalOpen(true)}
              className="h-8 text-xs rounded-lg bg-primary text-primary-foreground flex items-center gap-1.5 font-bold shadow-md shadow-primary/20 animate-pulse cursor-pointer"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Revisar {draftChanges.length} Alterações</span>
            </Button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center gap-3 py-2 border-y border-border/40">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar por título ou ID..."
            className="pl-8 h-8 text-xs bg-muted/20"
          />
        </div>

        <div className="flex items-center gap-1.5">
          {(['all', 'course', 'module', 'lesson'] as const).map((t) => (
            <Button
              key={t}
              variant={filterType === t ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFilterType(t)}
              className="h-7 px-2.5 text-xs rounded-lg capitalize cursor-pointer"
            >
              {t === 'all' ? 'Todos' : t === 'course' ? 'Cursos' : t === 'module' ? 'Módulos' : 'Aulas'}
            </Button>
          ))}
        </div>

        <div className="text-xs text-muted-foreground ml-auto font-mono">
          {filteredAppearances.length} item(ns)
        </div>
      </div>

      {/* Spreadsheet Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-border/50 bg-card shadow-sm">
        <table className="w-full text-left text-xs border-collapse font-sans">
          <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px] font-mono sticky top-0 z-10 border-b border-border/40 backdrop-blur">
            <tr>
              <th className="p-2.5 w-8 text-center">
                <input
                  type="checkbox"
                  checked={
                    filteredAppearances.length > 0 &&
                    filteredAppearances.every((a) => selectedMap.has(a.id))
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      selectRange(
                        filteredAppearances.map((a) => ({
                          id: a.entityId,
                          appearanceId: a.id,
                          type: a.entityType,
                          title: a.customTitle || a.entityId
                        }))
                      )
                    } else {
                      clearSelection()
                    }
                  }}
                  className="rounded border-input text-primary h-3.5 w-3.5"
                />
              </th>
              <th className="p-2.5 w-20">Tipo</th>
              <th className="p-2.5 w-20">Ordem</th>
              <th className="p-2.5">Título Visual (Clique para editar)</th>
              <th className="p-2.5 w-32">Tags</th>
              <th className="p-2.5 w-24">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20 font-mono">
            {filteredAppearances.map((app) => {
              const isSelected = selectedMap.has(app.id)
              const hasDraft = draftChanges.some((d) => d.appearanceId === app.id)

              return (
                <tr
                  key={app.id}
                  className={`hover:bg-muted/20 transition-colors ${
                    isSelected ? 'bg-primary/10' : hasDraft ? 'bg-amber-500/10' : ''
                  }`}
                >
                  <td className="p-2 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() =>
                        toggleSelect({
                          id: app.entityId,
                          appearanceId: app.id,
                          type: app.entityType,
                          title: app.customTitle || app.entityId
                        })
                      }
                      className="rounded border-input text-primary h-3.5 w-3.5 cursor-pointer"
                    />
                  </td>

                  <td className="p-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                      app.entityType === 'course'
                        ? 'bg-orange-500/15 text-orange-400'
                        : app.entityType === 'module'
                        ? 'bg-amber-500/15 text-amber-400'
                        : 'bg-blue-500/15 text-blue-400'
                    }`}>
                      {app.entityType}
                    </span>
                  </td>

                  <td className="p-2">
                    <input
                      defaultValue={app.displayOrder}
                      onBlur={(e) => handleOrderBlur(app, e.target.value)}
                      className="w-12 h-6 px-1 rounded bg-transparent border border-transparent hover:border-border focus:border-primary focus:bg-background text-xs font-mono text-foreground"
                    />
                  </td>

                  <td className="p-2">
                    <input
                      defaultValue={app.customTitle || ''}
                      placeholder="(Título Padrão)"
                      onBlur={(e) => handleTitleBlur(app, e.target.value)}
                      className="w-full h-6 px-1.5 rounded bg-transparent border border-transparent hover:border-border focus:border-primary focus:bg-background text-xs text-foreground font-sans truncate"
                    />
                  </td>

                  <td className="p-2">
                    <span className="text-[11px] text-muted-foreground truncate block max-w-[120px]">
                      {app.tags?.length > 0 ? app.tags.join(', ') : '-'}
                    </span>
                  </td>

                  <td className="p-2">
                    {app.isHidden ? (
                      <span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 text-[10px]">
                        Oculto
                      </span>
                    ) : app.isReference ? (
                      <span className="px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-400 text-[10px]">
                        Atalho
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-[10px]">Ativo</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
