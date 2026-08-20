import React from 'react'
import { useTranslation } from 'react-i18next'
import { FolderPlus, BookOpen } from 'lucide-react'
import { Button } from '../ui'

interface EmptyLibraryProps {
  onImportClick: () => void
}

export function EmptyLibrary({ onImportClick }: EmptyLibraryProps): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <div className="py-20 px-4 flex flex-col items-center justify-center text-center space-y-5 max-w-md mx-auto animate-in fade-in duration-300">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/20 via-purple-600/15 to-blue-600/10 border border-border flex items-center justify-center text-primary shadow-xl shadow-orange-500/10">
        <BookOpen className="w-8 h-8 opacity-90" />
      </div>

      <div className="space-y-1.5">
        <h3 className="text-lg font-bold text-foreground">{t('home.emptyTitle')}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('home.emptySubtitle')}
        </p>
      </div>

      <Button
        onClick={onImportClick}
        variant="default"
        size="sm"
        className="font-semibold shadow-lg shadow-orange-500/20 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-primary-foreground rounded-xl"
      >
        <FolderPlus className="w-4 h-4 mr-2" />
        {t('home.importFirstCourse')}
      </Button>
    </div>
  )
}

