import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Cloud, KeyRound, RefreshCw, Save, Server, ShieldCheck } from 'lucide-react'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { useAiSettingsStore } from '../../stores/useAiSettingsStore'
import {
  AI_PRIVACY_MODES,
  AI_DATA_TYPES,
  AI_PROVIDER_IDS,
  AI_TASKS,
  type AiDataType,
  type AiModel,
  type AiProviderId,
  type AiSettingsSnapshot,
  type AiTask
} from '@shared'

interface ProviderDraft {
  baseUrl: string
  enabled: boolean
  apiKey: string
}

interface RouteDraft {
  primaryProvider: string
  primaryModel: string
  fallbackProvider: string
  fallbackModel: string
}

function createProviderDrafts(settings: AiSettingsSnapshot): Record<AiProviderId, ProviderDraft> {
  return Object.fromEntries(
    AI_PROVIDER_IDS.map((providerId) => {
      const provider = settings.providers[providerId]
      return [providerId, { baseUrl: provider.baseUrl, enabled: provider.enabled, apiKey: '' }]
    })
  ) as Record<AiProviderId, ProviderDraft>
}

function createRouteDrafts(settings: AiSettingsSnapshot): Record<AiTask, RouteDraft> {
  return Object.fromEntries(
    AI_TASKS.map((task) => {
      const route = settings.routes[task]
      return [task, {
        primaryProvider: route.primary?.providerId ?? '',
        primaryModel: route.primary?.modelId ?? '',
        fallbackProvider: route.fallback?.providerId ?? '',
        fallbackModel: route.fallback?.modelId ?? ''
      }]
    })
  ) as Record<AiTask, RouteDraft>
}

function requiredCapabilityForTask(task: AiTask): AiModel['capabilities'][number] {
  if (task === 'embeddings') return 'EMBEDDINGS'
  if (task === 'transcription') return 'TRANSCRIPTION'
  return 'CHAT'
}

function modelOptions(task: AiTask, providerId: string, models: Partial<Record<AiProviderId, AiModel[]>>, currentModel: string): AiModel[] {
  const discovered = providerId && models[providerId as AiProviderId] ? models[providerId as AiProviderId] ?? [] : []
  const required = requiredCapabilityForTask(task)
  const compatible = discovered.filter((model) => model.capabilities.includes(required))
  const current = currentModel ? discovered.find((model) => model.id === currentModel) : undefined
  if (current && !current.capabilities.includes(required)) {
    return [current, ...compatible]
  }
  if (currentModel && !discovered.some((model) => model.id === currentModel)) {
    return [{ id: currentModel, providerId: providerId as AiProviderId, capabilities: [] }, ...compatible]
  }
  return compatible
}

export function AiSettingsSection(): React.JSX.Element {
  const { t } = useTranslation()
  const {
    settings,
    models,
    health,
    isLoading,
    error,
    init,
    saveProvider,
    setRoute,
    setPrivacyMode,
    setAllowedCloudDataTypes,
    discoverModels,
    checkHealth,
    clearError
  } = useAiSettingsStore()
  const [providerDrafts, setProviderDrafts] = useState<Record<AiProviderId, ProviderDraft> | null>(null)
  const [routeDrafts, setRouteDrafts] = useState<Record<AiTask, RouteDraft> | null>(null)

  useEffect(() => {
    if (!settings) {
      void init()
      return
    }
    setProviderDrafts(createProviderDrafts(settings))
    setRouteDrafts(createRouteDrafts(settings))
  }, [init, settings])

  const availableProviders = useMemo(() => settings ? AI_PROVIDER_IDS.filter((providerId) => settings.providers[providerId]) : [], [settings])

  if (!settings || !providerDrafts || !routeDrafts) {
    return <Card><CardContent className="p-5 text-sm text-muted-foreground">{t('settings.ai.loading', 'Loading AI settings...')}</CardContent></Card>
  }

  const saveProviderDraft = async (providerId: AiProviderId): Promise<void> => {
    const draft = providerDrafts[providerId]
    await saveProvider({
      providerId,
      baseUrl: draft.baseUrl,
      enabled: draft.enabled,
      ...(draft.apiKey ? { apiKey: draft.apiKey } : {})
    })
    setProviderDrafts((current) => current ? { ...current, [providerId]: { ...current[providerId], apiKey: '' } } : current)
  }

  const refreshProvider = async (providerId: AiProviderId): Promise<void> => {
    await discoverModels(providerId)
    await checkHealth(providerId)
  }

  const saveRouteDraft = async (task: AiTask): Promise<void> => {
    const draft = routeDrafts[task]
    const buildAssignment = (providerId: string, modelId: string) => {
      if (!providerId || !modelId) return null
      const model = models[providerId as AiProviderId]?.find((candidate) => candidate.id === modelId)
      return {
        providerId: providerId as AiProviderId,
        modelId,
        ...(model?.capabilities.length ? { capabilities: model.capabilities } : {})
      }
    }
    await setRoute({
      task,
      route: {
        primary: buildAssignment(draft.primaryProvider, draft.primaryModel),
        fallback: buildAssignment(draft.fallbackProvider, draft.fallbackModel)
      }
    })
  }

  const toggleCloudDataType = (dataType: AiDataType, enabled: boolean): void => {
    const current = new Set(settings.allowedCloudDataTypes)
    if (enabled) current.add(dataType)
    else current.delete(dataType)
    void setAllowedCloudDataTypes([...current])
  }

  const dataTypeLabels: Record<AiDataType, string> = {
    transcript: t('settings.ai.dataTypes.transcript', 'Transcripts'),
    notes: t('settings.ai.dataTypes.notes', 'Notes'),
    pdf: t('settings.ai.dataTypes.pdf', 'PDFs'),
    materials: t('settings.ai.dataTypes.materials', 'Course materials'),
    course_name: t('settings.ai.dataTypes.courseName', 'Course names'),
    user_metadata: t('settings.ai.dataTypes.userMetadata', 'User metadata')
  }

  return (
    <Card className="rounded-2xl border border-border/80 bg-card shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <CardTitle className="text-base font-bold">{t('settings.ai.title', 'AI')}</CardTitle>
        </div>
        <CardDescription className="text-xs">{t('settings.ai.description', 'Configure optional local and cloud AI providers without changing Orbia offline behavior.')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-1">
        {error && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</span>
            <button type="button" className="underline" onClick={clearError}>{t('common.close')}</button>
          </div>
        )}

        <section className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{t('settings.ai.general', 'General')}</p>
            <p className="text-xs text-muted-foreground">{t('settings.ai.generalDesc', 'AI is optional and never runs without an explicit task route.')}</p>
          </div>
        </section>

        <section className="space-y-3 border-t border-border/40 pt-4">
          <div>
            <p className="text-sm font-semibold text-foreground">{t('settings.ai.privacySection', 'Privacy')}</p>
            <p className="text-xs text-muted-foreground">{t('settings.ai.privacyDesc', 'Cloud routes require explicit configuration and classified data requires explicit consent.')}</p>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-secondary/20 p-3 text-sm">
            <span>{t('settings.ai.privacy', 'Privacy mode')}</span>
            <select
              value={settings.privacyMode}
              onChange={(event) => void setPrivacyMode(event.target.value as typeof AI_PRIVACY_MODES[number])}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
              aria-label={t('settings.ai.privacy', 'Privacy mode')}
            >
              {AI_PRIVACY_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
            </select>
          </label>
          <div className="space-y-2 rounded-xl border border-border/60 bg-secondary/20 p-3">
            <p className="text-xs font-medium">{t('settings.ai.cloudDataTypes', 'Allow these data categories in cloud requests')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {AI_DATA_TYPES.map((dataType) => (
                <label key={dataType} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={settings.allowedCloudDataTypes.includes(dataType)}
                    onChange={(event) => toggleCloudDataType(dataType, event.target.checked)}
                  />
                  {dataTypeLabels[dataType]}
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-3 border-t border-border/40 pt-4">
          <div>
            <p className="text-sm font-semibold text-foreground">{t('settings.ai.providers', 'Providers')}</p>
            <p className="text-xs text-muted-foreground">{t('settings.ai.providersDesc', 'Provider calls stay in the Main process. API keys are stored encrypted and are never displayed.')}</p>
          </div>
          {availableProviders.map((providerId) => {
            const provider = settings.providers[providerId]
            const draft = providerDrafts[providerId]
            const providerHealth = health[providerId]
            return (
              <div key={providerId} className="space-y-3 rounded-xl border border-border/60 bg-secondary/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {provider.kind === 'cloud' ? <Cloud className="h-4 w-4 text-primary" /> : <Server className="h-4 w-4 text-primary" />}
                    <div>
                      <p className="text-sm font-semibold">{provider.displayName}</p>
                      <p className="text-[11px] text-muted-foreground">{provider.kind === 'cloud' ? t('settings.ai.cloud', 'Cloud') : t('settings.ai.local', 'Local')}</p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={(event) => setProviderDrafts((current) => current ? { ...current, [providerId]: { ...current[providerId], enabled: event.target.checked } } : current)}
                    />
                    {t('settings.ai.enabled', 'Enabled')}
                  </label>
                </div>
                <input
                  value={draft.baseUrl}
                  onChange={(event) => setProviderDrafts((current) => current ? { ...current, [providerId]: { ...current[providerId], baseUrl: event.target.value } } : current)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono"
                  aria-label={`${provider.displayName} URL`}
                />
                {(provider.kind === 'cloud' || providerId === 'openai-compatible') && (
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="password"
                      value={draft.apiKey}
                      onChange={(event) => setProviderDrafts((current) => current ? { ...current, [providerId]: { ...current[providerId], apiKey: event.target.value } } : current)}
                      placeholder={provider.apiKeyConfigured ? t('settings.ai.keyConfigured', 'Credential configured — leave blank to keep') : t('settings.ai.keyPlaceholder', 'Optional API key')}
                      autoComplete="off"
                      className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs"
                      aria-label={`${provider.displayName} API key`}
                    />
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {providerHealth?.status ?? (provider.apiKeyConfigured ? t('settings.ai.credentialConfigured', 'Credential configured') : t('settings.ai.notChecked', 'Not checked'))}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="xs" onClick={() => void refreshProvider(providerId)} disabled={isLoading} className="gap-1.5">
                      <RefreshCw className="h-3 w-3" />{t('settings.ai.refresh', 'Discover models')}
                    </Button>
                    <Button size="xs" onClick={() => void saveProviderDraft(providerId)} disabled={isLoading} className="gap-1.5">
                      <Save className="h-3 w-3" />{t('common.save')}
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </section>

        <section className="space-y-3 border-t border-border/40 pt-4">
          <div>
            <p className="text-sm font-semibold text-foreground">{t('settings.ai.models', 'Models')}</p>
            <p className="text-xs text-muted-foreground">{t('settings.ai.modelsDesc', 'Available models are discovered from each provider when requested.')}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {availableProviders.map((providerId) => (
              <div key={providerId} className="rounded-lg border border-border/50 p-2 text-xs">
                <p className="font-medium">{settings.providers[providerId].displayName}</p>
                <p className="mt-1 text-muted-foreground">{(models[providerId] ?? []).length} {t('settings.ai.modelsFound', 'models found')}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3 border-t border-border/40 pt-4">
          <div>
            <p className="text-sm font-semibold text-foreground">{t('settings.ai.routing', 'Task Routing')}</p>
            <p className="text-xs text-muted-foreground">{t('settings.ai.routingDesc', 'Choose a primary model and optional fallback for each future AI task.')}</p>
          </div>
          {AI_TASKS.map((task) => {
            const draft = routeDrafts[task]
            const primaryModels = modelOptions(task, draft.primaryProvider, models, draft.primaryModel)
            const fallbackModels = modelOptions(task, draft.fallbackProvider, models, draft.fallbackModel)
            const requiredCapability = requiredCapabilityForTask(task)
            return (
              <div key={task} className="grid gap-2 rounded-xl border border-border/60 bg-secondary/20 p-3 md:grid-cols-[auto_1fr_1fr_auto_1fr_1fr] md:items-center">
                <span className="text-xs font-semibold capitalize">{task}</span>
                <select value={draft.primaryProvider} onChange={(event) => setRouteDrafts((current) => current ? { ...current, [task]: { ...current[task], primaryProvider: event.target.value, primaryModel: '' } } : current)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs" aria-label={`${task} primary provider`}>
                  <option value="">{t('settings.ai.noProvider', 'No provider')}</option>
                  {availableProviders.map((providerId) => <option key={providerId} value={providerId}>{settings.providers[providerId].displayName}</option>)}
                </select>
                <select value={draft.primaryModel} onChange={(event) => setRouteDrafts((current) => current ? { ...current, [task]: { ...current[task], primaryModel: event.target.value } } : current)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs" aria-label={`${task} primary model`} disabled={!draft.primaryProvider}>
                  <option value="">{t('settings.ai.noModel', 'No model')}</option>
                  {primaryModels.map((model) => <option key={model.id} value={model.id} disabled={!model.capabilities.includes(requiredCapability)}>{model.id}</option>)}
                </select>
                <span className="hidden text-center text-[10px] uppercase text-muted-foreground md:block">{t('settings.ai.fallback', 'fallback')}</span>
                <select value={draft.fallbackProvider} onChange={(event) => setRouteDrafts((current) => current ? { ...current, [task]: { ...current[task], fallbackProvider: event.target.value, fallbackModel: '' } } : current)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs" aria-label={`${task} fallback provider`}>
                  <option value="">{t('settings.ai.noProvider', 'No provider')}</option>
                  {availableProviders.map((providerId) => <option key={providerId} value={providerId}>{settings.providers[providerId].displayName}</option>)}
                </select>
                <select value={draft.fallbackModel} onChange={(event) => setRouteDrafts((current) => current ? { ...current, [task]: { ...current[task], fallbackModel: event.target.value } } : current)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs" aria-label={`${task} fallback model`} disabled={!draft.fallbackProvider}>
                  <option value="">{t('settings.ai.noModel', 'No model')}</option>
                  {fallbackModels.map((model) => <option key={model.id} value={model.id} disabled={!model.capabilities.includes(requiredCapability)}>{model.id}</option>)}
                </select>
                <Button variant="outline" size="xs" onClick={() => void saveRouteDraft(task)} disabled={isLoading} className="gap-1.5 md:col-start-6">
                  <Save className="h-3 w-3" />{t('common.save')}
                </Button>
              </div>
            )
          })}
        </section>

        <section className="space-y-2 border-t border-border/40 pt-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5 text-primary" />
            <p className="text-sm font-semibold text-foreground">{t('settings.ai.usage', 'Usage')}</p>
          </div>
          <p className="text-xs text-muted-foreground">{t('settings.ai.usageDesc', 'Usage records are not collected in Phase 1.')}</p>
        </section>
      </CardContent>
    </Card>
  )
}
