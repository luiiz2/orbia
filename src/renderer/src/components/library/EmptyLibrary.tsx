import React from 'react'
import { useTranslation } from 'react-i18next'
import { FolderPlus, Library } from 'lucide-react'
import { EmptyState } from '../ui/EmptyState'

interface EmptyLibraryProps {
  onImportClick: () => void
}

export function EmptyLibrary({
  onImportClick
}: EmptyLibraryProps): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <div className="py-16 px-4">
      <div className="mx-auto max-w-lg rounded-3xl border border-dashed border-border/80 bg-secondary/20 p-8 text-center backdrop-blur-xs">
        <EmptyState
          icon={Library}
          title={t('home.emptyTitle', 'Sua Biblioteca está Vazia')}
          description={t(
            'home.emptySubtitle',
            'Organize seus cursos, vídeos e materiais locais em um ambiente imersivo de aprendizado.'
          )}
          actionLabel={t(
            'home.importFirstCourse',
            'Importar Meu Primeiro Curso'
          )}
          actionIcon={FolderPlus}
          onAction={onImportClick}
          className="p-0"
        />
      </div>
    </div>
  )
}
