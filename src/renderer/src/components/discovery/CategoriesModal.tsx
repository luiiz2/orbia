import React, { useEffect } from 'react'
import { LayoutGrid, ChevronRight } from 'lucide-react'
import { useDiscoveryStore } from '../../stores/useDiscoveryStore'
import { useNavigationStore } from '../../stores/useNavigationStore'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '../ui'

export function CategoriesModal(): React.JSX.Element | null {
  const {
    isCategoriesModalOpen,
    setCategoriesModalOpen,
    categories,
    fetchCategories
  } = useDiscoveryStore()
  const { navigateToCourse } = useNavigationStore()

  useEffect(() => {
    if (isCategoriesModalOpen) {
      fetchCategories()
    }
  }, [isCategoriesModalOpen, fetchCategories])

  return (
    <Dialog open={isCategoriesModalOpen} onOpenChange={setCategoriesModalOpen}>
      <DialogContent className="max-w-3xl max-h-[85vh] p-0 overflow-hidden flex flex-col rounded-3xl border border-border/80 shadow-2xl">
        {/* Header */}
        <DialogHeader className="p-6 border-b border-border/60 flex flex-row items-center gap-3 bg-secondary/30 text-left">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <div>
            <DialogTitle className="text-xl font-bold text-foreground">
              Explorar Categorias
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Navegue pelos tópicos e áreas de estudo da sua biblioteca
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Categories Grid */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {categories.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Nenhuma categoria encontrada. Adicione tags aos cursos no Library
              Studio para categorizar.
            </div>
          ) : (
            categories.map((cat) => (
              <div key={cat.category} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-foreground">
                      {cat.category}
                    </span>
                    <span className="text-xs text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full">
                      {cat.courseCount} cursos • {cat.totalDurationHours}h
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {cat.courses.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCategoriesModalOpen(false)
                        navigateToCourse(c.id)
                      }}
                      className="p-3 bg-secondary/20 hover:bg-secondary/60 border border-border/40 hover:border-border rounded-xl text-left transition-all group flex flex-col justify-between cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    >
                      <div className="mb-2 break-words whitespace-normal text-xs font-bold text-foreground leading-snug group-hover:text-primary transition-colors">
                        {c.title}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{c.lessonCount} aulas</span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-primary" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
