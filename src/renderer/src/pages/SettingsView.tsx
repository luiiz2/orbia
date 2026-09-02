import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Settings,
  Palette,
  PlaySquare,
  Target,
  Database,
  Info,
  Check,
  ShieldCheck,
  FolderOpen,
  Trash2,
  PackageCheck,
  Download,
  AlertCircle,
  FileText
} from 'lucide-react'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useVaultStore } from '../stores/useVaultStore'
import { useNavigationStore } from '../stores/useNavigationStore'
import { useLibraryStore } from '../stores/useLibraryStore'
import { Button } from '../components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '../components/ui/card'
import { Slider } from '../components/ui/slider'
import { DeleteVaultModal } from '../components/vault/DeleteVaultModal'
import { BackupPreviewModal } from '../components/vault/BackupPreviewModal'
import { AiSettingsSection } from '../components/settings/AiSettingsSection'
import type { BackupPreview } from '@shared'
import appLogo from '../assets/icon.png'

export function SettingsView(): React.JSX.Element {
  const { t } = useTranslation()
  const { settings, setLanguage, setTheme, updateSetting } = useSettingsStore()
  const { currentVault } = useVaultStore()
  const { setVaultModalOpen } = useNavigationStore()
  const { fetchCourses } = useLibraryStore()
  const [deleteVaultModalOpen, setDeleteVaultModalOpen] =
    useState<boolean>(false)

  // Backup & Portability state (v0.3)
  const [isCreatingBackup, setIsCreatingBackup] = useState(false)
  const [backupStatusMessage, setBackupStatusMessage] = useState<string | null>(
    null
  )
  const [backupErrorMessage, setBackupErrorMessage] = useState<string | null>(
    null
  )
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null)
  const [selectedBackupPath, setSelectedBackupPath] = useState<string | null>(
    null
  )
  const [isBackupPreviewModalOpen, setIsBackupPreviewModalOpen] =
    useState(false)
  const [isRestoringBackup, setIsRestoringBackup] = useState(false)
  const [autoTranscribeNewLessons, setAutoTranscribeNewLessons] =
    useState(false)
  const [isSavingTranscriptionSettings, setIsSavingTranscriptionSettings] =
    useState(false)

  useEffect(() => {
    let active = true
    if (!currentVault) {
      setAutoTranscribeNewLessons(false)
      return () => {
        active = false
      }
    }

    window.api.transcription
      .getSettings()
      .then((transcriptionSettings) => {
        if (active)
          setAutoTranscribeNewLessons(
            transcriptionSettings.autoTranscribeNewLessons
          )
      })
      .catch((error: unknown) =>
        console.warn('Failed to load transcription settings:', error)
      )

    return () => {
      active = false
    }
  }, [currentVault?.path])

  const handleAutoTranscribeToggle = async (): Promise<void> => {
    const nextValue = !autoTranscribeNewLessons
    setAutoTranscribeNewLessons(nextValue)
    setIsSavingTranscriptionSettings(true)
    try {
      const saved = await window.api.transcription.updateSettings({
        autoTranscribeNewLessons: nextValue
      })
      if (!saved) setAutoTranscribeNewLessons(!nextValue)
    } catch (error: unknown) {
      setAutoTranscribeNewLessons(!nextValue)
      console.warn('Failed to update transcription settings:', error)
    } finally {
      setIsSavingTranscriptionSettings(false)
    }
  }

  const handleCreateBackup = async (): Promise<void> => {
    setIsCreatingBackup(true)
    setBackupStatusMessage(null)
    setBackupErrorMessage(null)
    try {
      const defaultName = `OrbiaBackup-${new Date().toISOString().split('T')[0]}.orbia`
      const savePath = await window.api.backup.selectSaveBackupPath(defaultName)
      if (!savePath) {
        setIsCreatingBackup(false)
        return
      }
      const res = await window.api.backup.create(savePath, currentVault?.name)
      if (res.success) {
        setBackupStatusMessage(`Backup salvo com sucesso em: ${res.filePath}`)
      } else {
        setBackupErrorMessage(res.error || 'Erro ao criar backup.')
      }
    } catch (err: unknown) {
      setBackupErrorMessage(
        err instanceof Error ? err.message : 'Falha na criação do backup.'
      )
    } finally {
      setIsCreatingBackup(false)
    }
  }

  const handleSelectBackupForRestore = async (): Promise<void> => {
    setBackupStatusMessage(null)
    setBackupErrorMessage(null)
    try {
      const filePath = await window.api.backup.selectBackupFile()
      if (!filePath) return

      const inspectRes = await window.api.backup.inspect(filePath)
      if (inspectRes.valid && inspectRes.manifest) {
        setBackupPreview(inspectRes)
        setSelectedBackupPath(filePath)
        setIsBackupPreviewModalOpen(true)
      } else {
        setBackupErrorMessage(
          inspectRes.error || 'Arquivo de backup inválido ou corrompido.'
        )
      }
    } catch (err: unknown) {
      setBackupErrorMessage(
        err instanceof Error ? err.message : 'Erro ao inspecionar backup.'
      )
    }
  }

  const handleConfirmRestore = async (): Promise<void> => {
    if (!selectedBackupPath) return
    setIsRestoringBackup(true)
    try {
      const res = await window.api.backup.restore(selectedBackupPath)
      if (res.success) {
        setIsBackupPreviewModalOpen(false)
        setBackupPreview(null)
        setSelectedBackupPath(null)
        setBackupStatusMessage(
          'Vault restaurado com sucesso! Os cursos e dados foram recarregados.'
        )
        await fetchCourses()
      } else {
        setBackupErrorMessage(
          res.error ||
            'Falha ao restaurar backup. O banco anterior foi preservado.'
        )
      }
    } catch (err: unknown) {
      setBackupErrorMessage(
        err instanceof Error ? err.message : 'Falha durante restauração.'
      )
    } finally {
      setIsRestoringBackup(false)
    }
  }

  const handleExportNotes = async (): Promise<void> => {
    try {
      const md = await window.api.exports.notesMarkdown()
      const res = await window.api.exports.saveExportToFile(
        `Orbia-Anotacoes-${new Date().toISOString().split('T')[0]}.md`,
        md
      )
      if (res.success) {
        setBackupStatusMessage('Anotações exportadas com sucesso em Markdown!')
      }
    } catch (err: unknown) {
      setBackupErrorMessage(
        err instanceof Error ? err.message : 'Erro ao exportar anotações.'
      )
    }
  }

  const handleExportBookmarks = async (): Promise<void> => {
    try {
      const md = await window.api.exports.bookmarksMarkdown()
      const res = await window.api.exports.saveExportToFile(
        `Orbia-Marcadores-${new Date().toISOString().split('T')[0]}.md`,
        md
      )
      if (res.success) {
        setBackupStatusMessage('Marcadores exportados com sucesso em Markdown!')
      }
    } catch (err: unknown) {
      setBackupErrorMessage(
        err instanceof Error ? err.message : 'Erro ao exportar marcadores.'
      )
    }
  }

  const handleExportFlashcardsCsv = async (): Promise<void> => {
    try {
      const csv = await window.api.exports.flashcardsCsv()
      const res = await window.api.exports.saveExportToFile(
        `Orbia-Flashcards-${new Date().toISOString().split('T')[0]}.csv`,
        csv
      )
      if (res.success) {
        setBackupStatusMessage('Flashcards exportados com sucesso em CSV!')
      }
    } catch (err: unknown) {
      setBackupErrorMessage(
        err instanceof Error ? err.message : 'Erro ao exportar flashcards.'
      )
    }
  }

  const languages = [
    { code: 'en' as const, label: 'English (US)' },
    { code: 'pt-BR' as const, label: 'Português (Brasil)' }
  ]

  const themes = [
    { id: 'dark' as const, label: t('settings.themeDark') },
    { id: 'light' as const, label: t('settings.themeLight') },
    { id: 'system' as const, label: t('settings.themeSystem') }
  ]

  const speeds = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0]
  const dailyGoalPresets = [15, 30, 45, 60, 90, 120]
  const weeklyLessonPresets = [5, 10, 15, 20, 30]

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 sm:px-6 space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
          <Settings className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {t('settings.title')}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t('settings.subtitle')}
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Language & Appearance Card */}
        <Card className="rounded-2xl border border-border/80 bg-card shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-bold">
                {t('settings.general')}
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              {t('settings.generalDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-1">
            {/* Language */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-border/40">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t('settings.language')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('settings.languageDesc')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {languages.map((lang) => (
                  <Button
                    key={lang.code}
                    variant={
                      settings.language === lang.code ? 'default' : 'outline'
                    }
                    size="sm"
                    onClick={() => setLanguage(lang.code)}
                    className="text-xs h-8 rounded-xl font-medium"
                  >
                    {settings.language === lang.code && (
                      <Check className="h-3.5 w-3.5 mr-1" />
                    )}
                    {lang.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Theme */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t('settings.theme')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('settings.themeDesc')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {themes.map((th) => (
                  <Button
                    key={th.id}
                    variant={settings.theme === th.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTheme(th.id)}
                    className="text-xs h-8 rounded-xl font-medium"
                  >
                    {settings.theme === th.id && (
                      <Check className="h-3.5 w-3.5 mr-1" />
                    )}
                    {th.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Playback Settings Card */}
        <Card className="rounded-2xl border border-border/80 bg-card shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <PlaySquare className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-bold">
                {t('settings.playback')}
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              {t('settings.playbackDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-1">
            {/* Default Playback Speed */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-border/40">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t('settings.defaultSpeed')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('settings.defaultSpeedDesc')}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {speeds.map((spd) => (
                  <Button
                    key={spd}
                    variant={
                      settings.defaultPlaybackSpeed === spd
                        ? 'default'
                        : 'outline'
                    }
                    size="xs"
                    onClick={() => updateSetting('defaultPlaybackSpeed', spd)}
                    className="text-xs h-7.5 px-3 rounded-lg font-mono font-semibold"
                  >
                    {spd}x
                  </Button>
                ))}
              </div>
            </div>

            {/* Auto Play Next Lesson Toggle */}
            <div className="flex items-center justify-between gap-3 pb-3.5 border-b border-border/40">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t('settings.autoPlayNext')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('settings.autoPlayNextDesc')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.autoPlayNext}
                onClick={() =>
                  updateSetting('autoPlayNext', !settings.autoPlayNext)
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  settings.autoPlayNext ? 'bg-primary' : 'bg-secondary'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    settings.autoPlayNext ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Completion Threshold */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {t('settings.completionThreshold')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.completionThresholdDesc')}
                  </p>
                </div>
                <span className="font-mono text-sm font-bold text-primary px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/20">
                  {Math.round((settings.completionThreshold || 0.9) * 100)}%
                </span>
              </div>
              <Slider
                value={[(settings.completionThreshold || 0.9) * 100]}
                min={50}
                max={100}
                step={5}
                onValueChange={(vals) =>
                  updateSetting('completionThreshold', vals[0] / 100)
                }
                className="py-2"
              />
            </div>
          </CardContent>
        </Card>

        <AiSettingsSection />

        {/* Transcription Settings Card */}
        <Card className="rounded-2xl border border-border/80 bg-card shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-bold">
                {t('settings.transcription')}
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              {t('settings.transcriptionDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t('settings.autoTranscribeNewLessons')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('settings.autoTranscribeNewLessonsDesc')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoTranscribeNewLessons}
                aria-label={t('settings.autoTranscribeNewLessons')}
                disabled={!currentVault || isSavingTranscriptionSettings}
                onClick={() => void handleAutoTranscribeToggle()}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ${
                  autoTranscribeNewLessons ? 'bg-primary' : 'bg-secondary'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    autoTranscribeNewLessons ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Study Goals & Habits Card */}
        <Card className="rounded-2xl border border-border/80 bg-card shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-bold">
                {t('settings.studyGoals')}
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              {t('settings.studyGoalsDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-1">
            {/* Daily Study Time Goal */}
            <div className="space-y-3 pb-4 border-b border-border/40">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {t('settings.dailyStudyGoal')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.dailyStudyGoalDesc')}
                  </p>
                </div>
                <span className="font-mono text-sm font-bold text-accent px-2.5 py-1 rounded-lg bg-accent/10 border border-accent/20">
                  {settings.dailyStudyGoalMinutes || 30}{' '}
                  {t('settings.minPerDay')}
                </span>
              </div>

              {/* Preset Chips */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {dailyGoalPresets.map((mins) => (
                  <Button
                    key={mins}
                    variant={
                      (settings.dailyStudyGoalMinutes || 30) === mins
                        ? 'default'
                        : 'outline'
                    }
                    size="xs"
                    onClick={() => updateSetting('dailyStudyGoalMinutes', mins)}
                    className="text-xs h-7.5 px-3 rounded-lg font-medium"
                  >
                    {mins} min
                  </Button>
                ))}
              </div>

              {/* Fine-tuning Slider */}
              <Slider
                value={[settings.dailyStudyGoalMinutes || 30]}
                min={5}
                max={180}
                step={5}
                onValueChange={(vals) =>
                  updateSetting('dailyStudyGoalMinutes', vals[0])
                }
                className="py-1"
              />
            </div>

            {/* Weekly Lessons Goal */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {t('settings.weeklyLessonsGoal')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.weeklyLessonsGoalDesc')}
                  </p>
                </div>
                <span className="font-mono text-sm font-bold text-emerald-400 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  {settings.weeklyLessonsGoal || 10}{' '}
                  {t('settings.lessonsPerWeek')}
                </span>
              </div>

              {/* Preset Chips */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {weeklyLessonPresets.map((cnt) => (
                  <Button
                    key={cnt}
                    variant={
                      (settings.weeklyLessonsGoal || 10) === cnt
                        ? 'default'
                        : 'outline'
                    }
                    size="xs"
                    onClick={() => updateSetting('weeklyLessonsGoal', cnt)}
                    className="text-xs h-7.5 px-3 rounded-lg font-medium"
                  >
                    {cnt} aulas
                  </Button>
                ))}
              </div>

              {/* Fine-tuning Slider */}
              <Slider
                value={[settings.weeklyLessonsGoal || 10]}
                min={1}
                max={50}
                step={1}
                onValueChange={(vals) =>
                  updateSetting('weeklyLessonsGoal', vals[0])
                }
                className="py-1"
              />
            </div>
          </CardContent>
        </Card>

        {/* Vault Settings Card */}
        <Card className="rounded-2xl border border-border/80 bg-card shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-bold">
                {t('settings.currentVault')}
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              {t('settings.vaultDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border/70 bg-secondary/30 p-3.5">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="break-words whitespace-normal text-sm font-bold text-foreground leading-snug">
                  {currentVault?.name || t('settings.noVault')}
                </p>
                <p className="break-words whitespace-normal text-xs font-mono text-muted-foreground leading-snug">
                  {currentVault?.path || t('settings.notAvailable')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVaultModalOpen(true)}
                  className="text-xs rounded-xl gap-1.5 cursor-pointer"
                >
                  <FolderOpen className="h-3.5 w-3.5 text-primary" />
                  <span>{t('nav.changeVault')}</span>
                </Button>
                {currentVault && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteVaultModalOpen(true)}
                    className="text-xs rounded-xl gap-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>
                      {t('vault.unlinkOrDelete', 'Desvincular / Excluir')}
                    </span>
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Backup & Portability Card (v0.3) */}
        <Card className="rounded-2xl border border-border/80 bg-card shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <PackageCheck className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-bold">
                {t('backup.sectionTitle', 'Backup & Portabilidade')}
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              {t(
                'backup.sectionDesc',
                'Proteja seu progresso, histórico, anotações, flashcards e marcadores em um arquivo compacto (.orbia).'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-1">
            {/* Status alerts */}
            {backupStatusMessage && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between animate-in fade-in">
                <span>{backupStatusMessage}</span>
                <button
                  type="button"
                  onClick={() => setBackupStatusMessage(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {backupErrorMessage && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center justify-between animate-in fade-in">
                <span>{backupErrorMessage}</span>
                <button
                  type="button"
                  onClick={() => setBackupErrorMessage(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Backup & Restore Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-border/70 bg-secondary/20">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t('backup.vaultBackup', 'Backup do Vault')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(
                    'backup.vaultBackupDesc',
                    'Gere uma cópia leve de segurança ou migre para outro computador.'
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="default"
                  size="sm"
                  disabled={isCreatingBackup || !currentVault}
                  onClick={handleCreateBackup}
                  className="text-xs rounded-xl gap-1.5 font-semibold"
                >
                  <PackageCheck className="h-3.5 w-3.5" />
                  <span>
                    {isCreatingBackup
                      ? t('backup.creating', 'Criando...')
                      : t('backup.create', 'Criar Backup (.orbia)')}
                  </span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={!currentVault}
                  onClick={handleSelectBackupForRestore}
                  className="text-xs rounded-xl gap-1.5 border-border/80 hover:border-primary"
                >
                  <Download className="h-3.5 w-3.5 text-primary" />
                  <span>{t('backup.restore', 'Restaurar Backup')}</span>
                </Button>
              </div>
            </div>

            {/* Portable Data Exports */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-border/40">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t('backup.dataExport', 'Exportação Portátil')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(
                    'backup.dataExportDesc',
                    'Exporte suas anotações e marcadores para Markdown e flashcards para Anki (CSV).'
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={handleExportNotes}
                  className="text-xs h-8 px-2.5 rounded-xl gap-1"
                >
                  <Download className="h-3 w-3" />
                  <span>Notas (.md)</span>
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={handleExportBookmarks}
                  className="text-xs h-8 px-2.5 rounded-xl gap-1"
                >
                  <Download className="h-3 w-3" />
                  <span>Marcadores (.md)</span>
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={handleExportFlashcardsCsv}
                  className="text-xs h-8 px-2.5 rounded-xl gap-1"
                >
                  <Download className="h-3 w-3" />
                  <span>Flashcards (.csv)</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* About Card */}
        <Card className="rounded-2xl border border-border/80 bg-card shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-bold">
                {t('settings.about')}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-1">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl p-1 bg-primary/10 border border-primary/30 shadow-sm flex items-center justify-center">
                <img
                  src={appLogo}
                  alt="Orbia"
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-foreground text-sm">
                    Orbia Desktop
                  </span>
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.2 rounded-full bg-primary/20 text-primary">
                    v0.1-MVP
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('app.tagline')}
                </p>
              </div>
            </div>

            <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border/40">
              <p className="flex items-center gap-1.5 text-foreground font-medium">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>{t('settings.offlineFirst')}</span>
              </p>
              <p>{t('settings.license')}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <DeleteVaultModal
        vault={currentVault}
        open={deleteVaultModalOpen}
        onOpenChange={setDeleteVaultModalOpen}
      />

      <BackupPreviewModal
        open={isBackupPreviewModalOpen}
        onClose={() => setIsBackupPreviewModalOpen(false)}
        preview={backupPreview}
        onConfirmRestore={handleConfirmRestore}
        isRestoring={isRestoringBackup}
      />
    </div>
  )
}
