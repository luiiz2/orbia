import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Settings,
  Palette,
  PlaySquare,
  Database,
  Info,
  Check,
  ShieldCheck,
  FolderOpen,
  Trash2
} from 'lucide-react'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useVaultStore } from '../stores/useVaultStore'
import { useNavigationStore } from '../stores/useNavigationStore'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Slider } from '../components/ui/slider'
import { DeleteVaultModal } from '../components/vault/DeleteVaultModal'
import appLogo from '../assets/icon.png'

export function SettingsView(): React.JSX.Element {
  const { t } = useTranslation()
  const { settings, setLanguage, setTheme, updateSetting } = useSettingsStore()
  const { currentVault } = useVaultStore()
  const { setVaultModalOpen } = useNavigationStore()
  const [deleteVaultModalOpen, setDeleteVaultModalOpen] = useState<boolean>(false)

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
          <p className="text-xs text-muted-foreground">{t('settings.subtitle')}</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Language & Appearance Card */}
        <Card className="rounded-2xl border border-border/80 bg-card shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-bold">{t('settings.general')}</CardTitle>
            </div>
            <CardDescription className="text-xs">
              {t('settings.generalDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-1">
            {/* Language */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-border/40">
              <div>
                <p className="text-sm font-semibold text-foreground">{t('settings.language')}</p>
                <p className="text-xs text-muted-foreground">{t('settings.languageDesc')}</p>
              </div>
              <div className="flex items-center gap-2">
                {languages.map((lang) => (
                  <Button
                    key={lang.code}
                    variant={settings.language === lang.code ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setLanguage(lang.code)}
                    className="text-xs h-8 rounded-xl font-medium"
                  >
                    {settings.language === lang.code && <Check className="h-3.5 w-3.5 mr-1" />}
                    {lang.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Theme */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{t('settings.theme')}</p>
                <p className="text-xs text-muted-foreground">{t('settings.themeDesc')}</p>
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
                    {settings.theme === th.id && <Check className="h-3.5 w-3.5 mr-1" />}
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
              <CardTitle className="text-base font-bold">{t('settings.playback')}</CardTitle>
            </div>
            <CardDescription className="text-xs">
              {t('settings.playbackDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-1">
            {/* Default Playback Speed */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-border/40">
              <div>
                <p className="text-sm font-semibold text-foreground">{t('settings.defaultSpeed')}</p>
                <p className="text-xs text-muted-foreground">{t('settings.defaultSpeedDesc')}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {speeds.map((spd) => (
                  <Button
                    key={spd}
                    variant={settings.defaultPlaybackSpeed === spd ? 'default' : 'outline'}
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
                <p className="text-sm font-semibold text-foreground">{t('settings.autoPlayNext')}</p>
                <p className="text-xs text-muted-foreground">{t('settings.autoPlayNextDesc')}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.autoPlayNext}
                onClick={() => updateSetting('autoPlayNext', !settings.autoPlayNext)}
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
                onValueChange={(vals) => updateSetting('completionThreshold', vals[0] / 100)}
                className="py-2"
              />
            </div>
          </CardContent>
        </Card>

        {/* Vault Settings Card */}
        <Card className="rounded-2xl border border-border/80 bg-card shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-bold">{t('settings.currentVault')}</CardTitle>
            </div>
            <CardDescription className="text-xs">{t('settings.vaultDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border/70 bg-secondary/30 p-3.5">
              <div className="space-y-0.5 overflow-hidden">
                <p className="text-sm font-bold text-foreground truncate">
                  {currentVault?.name || t('settings.noVault')}
                </p>
                <p className="text-xs font-mono text-muted-foreground truncate">
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
                    <span>{t('vault.unlinkOrDelete', 'Desvincular / Excluir')}</span>
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* About Card */}
        <Card className="rounded-2xl border border-border/80 bg-card shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-bold">{t('settings.about')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-1">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl p-1 bg-gradient-to-br from-orange-500/20 via-purple-600/15 to-blue-600/10 border border-border shadow-sm flex items-center justify-center">
                <img src={appLogo} alt="Orbia" className="h-full w-full object-contain" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-foreground text-sm">Orbia Desktop</span>
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.2 rounded-full bg-primary/20 text-primary">
                    v0.1-MVP
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{t('app.tagline')}</p>
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
    </div>
  )
}

