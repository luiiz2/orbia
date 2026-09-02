import React, { useEffect, useState } from 'react'
import { GitFork, Plus, Trash2, ArrowRight } from 'lucide-react'
import { useDiscoveryStore } from '../../stores/useDiscoveryStore'
import { useLibraryStore } from '../../stores/useLibraryStore'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '../ui'
import type { CourseRelationshipType } from '../../../../types/discovery'

export function CourseRelationshipsModal(): React.JSX.Element | null {
  const {
    isRelationshipsModalOpen,
    setRelationshipsModalOpen,
    relationships,
    loadRelationships,
    addRelationship,
    deleteRelationship
  } = useDiscoveryStore()
  const { courses, fetchCourses } = useLibraryStore()

  const [sourceId, setSourceId] = useState<string>('')
  const [targetId, setTargetId] = useState<string>('')
  const [relType, setRelType] = useState<CourseRelationshipType>('sequel')

  useEffect(() => {
    if (isRelationshipsModalOpen) {
      loadRelationships()
      fetchCourses()
    }
  }, [isRelationshipsModalOpen, loadRelationships, fetchCourses])

  const handleAdd = async () => {
    if (!sourceId || !targetId || sourceId === targetId) return
    await addRelationship(sourceId, targetId, relType)
    setSourceId('')
    setTargetId('')
  }

  const getCourseTitle = (id: string) => {
    const c = courses.find((x) => x.id === id)
    return c?.title || id
  }

  return (
    <Dialog
      open={isRelationshipsModalOpen}
      onOpenChange={setRelationshipsModalOpen}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden flex flex-col rounded-3xl border border-border/80 shadow-2xl">
        {/* Header */}
        <DialogHeader className="p-6 border-b border-border/60 flex flex-row items-center gap-3 bg-secondary/30 text-left">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <GitFork className="w-5 h-5" />
          </div>
          <div>
            <DialogTitle className="text-xl font-bold text-foreground">
              Jornadas e Relacionamentos
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Conecte cursos em sequências de estudo (ex: Básico ➔ Avançado)
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Add Form */}
          <div className="p-4 bg-secondary/30 border border-border/60 rounded-2xl space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-foreground">
              Novo Relacionamento
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">
                  Curso de Origem
                </label>
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Selecione o curso...</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">
                  Curso Alvo / Próximo
                </label>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Selecione o próximo curso...</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Tipo:
                </label>
                <select
                  value={relType}
                  onChange={(e) =>
                    setRelType(e.target.value as CourseRelationshipType)
                  }
                  className="bg-background border border-border rounded-lg px-2.5 py-1 text-xs text-foreground"
                >
                  <option value="sequel">Sequência (Próxima Temporada)</option>
                  <option value="prerequisite">Pré-requisito</option>
                  <option value="same_journey">Mesma Jornada</option>
                  <option value="related">Relacionado</option>
                </select>
              </div>

              <Button
                onClick={handleAdd}
                size="sm"
                disabled={!sourceId || !targetId || sourceId === targetId}
                className="gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Criar Conexão
              </Button>
            </div>
          </div>

          {/* Relationships List */}
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Conexões Ativas
            </div>
            {relationships.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Nenhum relacionamento criado ainda. Conecte cursos para
                habilitar a trilha &ldquo;Continue Sua Jornada&rdquo;.
              </div>
            ) : (
              relationships.map((rel) => (
                <div
                  key={rel.id}
                  className="flex items-start justify-between gap-2 p-3 bg-secondary/20 border border-border/40 rounded-xl text-xs"
                >
                  <div className="flex min-w-0 flex-1 flex-wrap items-start gap-3 pr-2">
                    <span className="min-w-0 break-words whitespace-normal font-semibold text-foreground leading-snug">
                      {getCourseTitle(rel.sourceCourseId)}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="min-w-0 break-words whitespace-normal font-semibold text-foreground leading-snug">
                      {getCourseTitle(rel.targetCourseId)}
                    </span>
                    <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                      {rel.relationshipType}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => deleteRelationship(rel.id)}
                    className="p-1.5 text-muted-foreground hover:text-rose-500 rounded-lg hover:bg-secondary transition-colors cursor-pointer"
                    aria-label="Excluir relacionamento"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
