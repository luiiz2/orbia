import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Folder,
  Video,
  FileText,
  FileQuestion,
  ChevronDown,
  ChevronRight,
  Edit2,
  Check,
  HardDrive,
  Link,
  Layers,
  Image as ImageIcon,
  Upload
} from 'lucide-react'
import type { ProposedCourseStructure } from '@shared'
import { Input, Badge, Button } from '../ui'

interface ImportPreviewProps {
  proposal: ProposedCourseStructure
  onUpdateProposal: (updated: ProposedCourseStructure) => void
  isExternal: boolean
  onToggleExternal: (isExternal: boolean) => void
}

export function ImportPreview({
  proposal,
  onUpdateProposal,
  isExternal,
  onToggleExternal
}: ImportPreviewProps): React.JSX.Element {
  const { t } = useTranslation()

  // Track collapsed state per module
  const [collapsedModules, setCollapsedModules] = useState<Record<string, boolean>>({})
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null)
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null)

  const toggleModuleCollapse = (moduleId: string): void => {
    setCollapsedModules((prev) => ({
      ...prev,
      [moduleId]: !prev[moduleId]
    }))
  }

  const handleUpdateCourseTitle = (newTitle: string): void => {
    onUpdateProposal({
      ...proposal,
      suggestedTitle: newTitle
    })
  }

  const handleSelectCourseCover = async (): Promise<void> => {
    try {
      const selectedImg = await window.api.courses.selectCoverImage()
      if (selectedImg) {
        onUpdateProposal({
          ...proposal,
          coverPath: selectedImg
        })
      }
    } catch (err) {
      console.error('Failed to select course cover:', err)
    }
  }

  const handleSelectLessonCover = async (moduleId: string, lessonId: string): Promise<void> => {
    try {
      const selectedImg = await window.api.courses.selectCoverImage()
      if (selectedImg) {
        const updatedModules = proposal.modules.map((m) => {
          if (m.id !== moduleId) return m
          const updatedLessons = m.lessons.map((l) =>
            l.id === lessonId ? { ...l, coverPath: selectedImg } : l
          )
          return { ...m, lessons: updatedLessons }
        })
        onUpdateProposal({
          ...proposal,
          modules: updatedModules
        })
      }
    } catch (err) {
      console.error('Failed to select lesson thumbnail:', err)
    }
  }

  const handleUpdateModuleTitle = (moduleId: string, newTitle: string): void => {
    const updatedModules = proposal.modules.map((m) =>
      m.id === moduleId ? { ...m, title: newTitle } : m
    )
    onUpdateProposal({
      ...proposal,
      modules: updatedModules
    })
  }

  const handleUpdateLessonTitle = (moduleId: string, lessonId: string, newTitle: string): void => {
    const updatedModules = proposal.modules.map((m) => {
      if (m.id !== moduleId) return m
      const updatedLessons = m.lessons.map((l) =>
        l.id === lessonId ? { ...l, title: newTitle } : l
      )
      return { ...m, lessons: updatedLessons }
    })
    onUpdateProposal({
      ...proposal,
      modules: updatedModules
    })
  }

  const getMediaIcon = (mediaType: string): React.JSX.Element => {
    switch (mediaType) {
      case 'video':
        return <Video className="w-3.5 h-3.5 text-primary shrink-0" />
      case 'pdf':
      case 'document':
        return <FileText className="w-3.5 h-3.5 text-purple-400 shrink-0" />
      default:
        return <FileQuestion className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
    }
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Course Title & Cover Header Card */}
      <div className="p-3.5 rounded-2xl bg-card border border-border/80 space-y-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {t('import.courseTitle')}
          </span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-primary" />
              {proposal.modules.length} {t('course.modules')}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Video className="w-3.5 h-3.5 text-primary" />
              {proposal.totalLessons} {t('course.lessons')}
            </span>
          </div>
        </div>

        {/* Title and Cover preview row */}
        <div className="flex gap-3 items-start">
          {/* Cover Preview & Change Button */}
          <div className="relative aspect-video w-24 shrink-0 rounded-xl overflow-hidden bg-secondary border border-border/80 group">
            {proposal.coverPath ? (
              <img
                src={`media://${encodeURI(proposal.coverPath.replace(/\\/g, '/'))}`}
                alt={proposal.suggestedTitle}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/60 p-1 text-center bg-gradient-to-br from-secondary to-card">
                <ImageIcon className="w-5 h-5 mb-0.5 opacity-50" />
                <span className="text-[9px] font-medium leading-none">Sem Capa</span>
              </div>
            )}
            <button
              type="button"
              onClick={handleSelectCourseCover}
              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white cursor-pointer"
              title="Trocar Capa do Curso"
            >
              <Upload className="w-3.5 h-3.5 mb-0.5" />
              <span className="text-[9px] font-semibold">Trocar Capa</span>
            </button>
          </div>

          <div className="flex-1 min-w-0 space-y-1.5">
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <Input
                  value={proposal.suggestedTitle}
                  onChange={(e) => handleUpdateCourseTitle(e.target.value)}
                  className="text-sm font-bold text-foreground bg-background rounded-xl"
                  autoFocus
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingTitle(false)}
                  className="shrink-0 rounded-xl"
                >
                  <Check className="w-4 h-4 text-emerald-400" />
                </Button>
              </div>
            ) : (
              <div
                className="flex items-center justify-between group cursor-pointer hover:text-primary transition-colors"
                onClick={() => setEditingTitle(true)}
              >
                <h3 className="text-base font-bold text-foreground truncate">
                  {proposal.suggestedTitle}
                </h3>
                <Edit2 className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] text-muted-foreground truncate font-mono bg-secondary/30 px-2 py-0.5 rounded-lg border border-border/40 flex-1">
                {proposal.rootPath}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={handleSelectCourseCover}
                className="text-[11px] h-6 px-2 text-primary hover:bg-primary/10 rounded-lg shrink-0 gap-1"
              >
                <ImageIcon className="w-3 h-3" />
                <span>{proposal.coverPath ? 'Alterar Capa' : 'Adicionar Capa'}</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Storage Mode Selector */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <button
          type="button"
          onClick={() => onToggleExternal(true)}
          className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 cursor-pointer ${
            isExternal
              ? 'bg-primary/10 border-primary text-foreground font-semibold shadow-sm'
              : 'bg-card border-border/80 text-muted-foreground hover:bg-secondary/40'
          }`}
        >
          <Link className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-foreground">{t('import.referenceExternal')}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Keep original files where they are on disk.
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onToggleExternal(false)}
          className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 cursor-pointer ${
            !isExternal
              ? 'bg-primary/10 border-primary text-foreground font-semibold shadow-sm'
              : 'bg-card border-border/80 text-muted-foreground hover:bg-secondary/40'
          }`}
        >
          <HardDrive className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-foreground">{t('import.saveToVault')}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Managed inside Vault Courses storage.
            </div>
          </div>
        </button>
      </div>

      {/* Modules & Lessons Hierarchy Tree */}
      <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
        {proposal.modules.map((mod, modIdx) => {
          const isCollapsed = collapsedModules[mod.id]
          const isEditingMod = editingModuleId === mod.id

          return (
            <div
              key={mod.id}
              className="rounded-2xl bg-card border border-border/80 overflow-hidden shadow-sm"
            >
              {/* Module Header */}
              <div className="p-2.5 px-3 flex items-center justify-between bg-secondary/40 border-b border-border/60 hover:bg-secondary/60 transition-colors">
                <div
                  className="flex items-center gap-2 min-w-0 cursor-pointer flex-1"
                  onClick={() => toggleModuleCollapse(mod.id)}
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  )}
                  <Folder className="w-4 h-4 text-primary shrink-0" />

                  {isEditingMod ? (
                    <Input
                      value={mod.title}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleUpdateModuleTitle(mod.id, e.target.value)}
                      className="text-xs py-1 h-7 bg-background max-w-sm rounded-lg"
                      autoFocus
                    />
                  ) : (
                    <span className="text-xs font-bold text-foreground truncate">
                      {modIdx + 1}. {mod.title}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <Badge variant="secondary" className="text-[10px] py-0 px-2 h-5 font-mono">
                    {mod.lessons.length} {t('course.lessons')}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground rounded-lg"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingModuleId(isEditingMod ? null : mod.id)
                    }}
                  >
                    {isEditingMod ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Edit2 className="w-3 h-3" />}
                  </Button>
                </div>
              </div>

              {/* Lesson Items */}
              {!isCollapsed && (
                <div className="divide-y divide-border/30 bg-card/60">
                  {mod.lessons.map((lesson, lessonIdx) => {
                    const isEditingLesson = editingLessonId === lesson.id

                    return (
                      <div
                        key={lesson.id}
                        className="py-2 px-3 pl-6 flex items-center justify-between text-xs hover:bg-secondary/40 group transition-colors"
                      >
                        {/* Lesson Thumbnail & Title */}
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {/* Mini Thumbnail */}
                          <div
                            onClick={() => handleSelectLessonCover(mod.id, lesson.id)}
                            className="relative aspect-video w-12 shrink-0 rounded-md overflow-hidden bg-secondary border border-border/70 group/thumb cursor-pointer"
                            title="Trocar capa/miniatura da aula"
                          >
                            {lesson.coverPath ? (
                              <img
                                src={`media://${encodeURI(lesson.coverPath.replace(/\\/g, '/'))}`}
                                alt={lesson.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-secondary/80 text-muted-foreground/60">
                                {getMediaIcon(lesson.mediaType)}
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center text-white">
                              <ImageIcon className="w-3 h-3" />
                            </div>
                          </div>

                          <span className="text-muted-foreground font-mono text-[11px] shrink-0">
                            {String(lessonIdx + 1).padStart(2, '0')}
                          </span>

                          {isEditingLesson ? (
                            <Input
                              value={lesson.title}
                              onChange={(e) =>
                                handleUpdateLessonTitle(mod.id, lesson.id, e.target.value)
                              }
                              className="text-xs py-0.5 h-6 bg-background max-w-sm rounded-lg"
                              autoFocus
                            />
                          ) : (
                            <span className="text-foreground truncate font-medium">
                              {lesson.title}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <span className="text-[10px] text-muted-foreground uppercase font-mono px-1.5 py-0.2 rounded bg-secondary/50 border border-border/40">
                            .{lesson.fileExtension}
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground rounded cursor-pointer"
                            onClick={() =>
                              setEditingLessonId(isEditingLesson ? null : lesson.id)
                            }
                          >
                            {isEditingLesson ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Edit2 className="w-2.5 h-2.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
