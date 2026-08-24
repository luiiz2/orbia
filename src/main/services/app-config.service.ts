import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import type { Vault, AppSettings } from '../../types'

function getAppUserDataPath(): string {
  try {
    // Dynamic require so non-Electron test runtimes don't crash
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron')
    if (electron && electron.app && typeof electron.app.getPath === 'function') {
      return electron.app.getPath('userData')
    }
  } catch {
    // Not running inside active Electron process
  }
  const appData = process.env.APPDATA || process.env.HOME || '.'
  return path.join(appData, 'orbia')
}

export class AppConfigService {
  private db: Database.Database | null = null
  public dbPath: string

  constructor(customPath?: string) {
    if (customPath) {
      this.dbPath = customPath
    } else {
      this.dbPath = path.join(getAppUserDataPath(), 'config.db')
    }
  }

  public init(customPath?: string): void {
    if (customPath) {
      if (this.db) {
        this.close()
      }
      this.dbPath = customPath
    }

    if (this.db) return

    const dir = path.dirname(this.dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')

    this.runMigrations()
  }

  private runMigrations(): void {
    if (!this.db) throw new Error('AppConfig DB not initialized')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vaults (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        path        TEXT NOT NULL UNIQUE,
        created_at  INTEGER NOT NULL,
        last_opened INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_vaults_last_opened ON vaults(last_opened DESC);

      CREATE TABLE IF NOT EXISTS app_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS local_profiles (
        id                TEXT PRIMARY KEY,
        name              TEXT NOT NULL,
        avatar_path       TEXT,
        default_vault_path TEXT,
        created_at        INTEGER NOT NULL,
        updated_at        INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS theme_presets (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        is_builtin  INTEGER NOT NULL DEFAULT 0,
        config_json TEXT NOT NULL,
        created_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS appearance_overrides (
        scope_type      TEXT NOT NULL CHECK(scope_type IN ('profile', 'vault', 'course', 'section')),
        scope_id        TEXT NOT NULL,
        theme_preset_id TEXT,
        overrides_json  TEXT NOT NULL,
        updated_at      INTEGER NOT NULL,
        PRIMARY KEY (scope_type, scope_id)
      );

      CREATE TABLE IF NOT EXISTS profile_discovery_preferences (
        profile_id            TEXT PRIMARY KEY,
        preferred_categories  TEXT NOT NULL DEFAULT '[]',
        excluded_categories   TEXT NOT NULL DEFAULT '[]',
        preferred_tags        TEXT NOT NULL DEFAULT '[]',
        discovery_mode        TEXT NOT NULL DEFAULT 'balanced',
        prefer_short_content  INTEGER NOT NULL DEFAULT 0,
        updated_at            INTEGER NOT NULL
      );
    `)

    this.seedDefaultThemePresets()
    this.seedDefaultProfile()
  }

  private seedDefaultProfile(): void {
    const count = this.db!.prepare(`SELECT count(*) as cnt FROM local_profiles`).get() as { cnt: number }
    if (count.cnt === 0) {
      const now = Date.now()
      this.db!.prepare(`
        INSERT INTO local_profiles (id, name, avatar_path, default_vault_path, created_at, updated_at)
        VALUES ('default_profile', 'Principal', NULL, NULL, ?, ?)
      `).run(now, now)
    }
  }

  private seedDefaultThemePresets(): void {
    const presets = [
      {
        id: 'preset_streaming',
        name: 'Streaming',
        isBuiltin: 1,
        config: {
          name: 'Streaming',
          colorTokens: {
            background: '#07090e',
            foreground: '#f8fafc',
            primary: '#f97316',
            primaryForeground: '#ffffff',
            secondary: '#1e293b',
            secondaryForeground: '#f8fafc',
            accent: '#ea580c',
            card: '#0f172a',
            border: '#1e293b'
          },
          cardStyle: {
            aspectRatio: '16:9',
            borderRadius: 12,
            showProgress: true,
            showDuration: true,
            showBadges: true,
            titlePlacement: 'below',
            hoverEffect: 'zoom',
            sizeScale: 1.0
          },
          sections: {
            continueWatching: { mode: 'carousel' },
            myList: { mode: 'carousel' },
            library: { mode: 'grid' }
          },
          typography: { fontFamily: 'Inter, sans-serif', fontSizeScale: 1.0 }
        }
      },
      {
        id: 'preset_cinema',
        name: 'Cinema',
        isBuiltin: 1,
        config: {
          name: 'Cinema',
          colorTokens: {
            background: '#030712',
            foreground: '#f9fafb',
            primary: '#eab308',
            primaryForeground: '#000000',
            secondary: '#111827',
            secondaryForeground: '#f9fafb',
            accent: '#ca8a04',
            card: '#0b0f19',
            border: '#1f2937'
          },
          cardStyle: {
            aspectRatio: '2:3',
            borderRadius: 16,
            showProgress: true,
            showDuration: true,
            showBadges: true,
            titlePlacement: 'inside',
            hoverEffect: 'glow',
            sizeScale: 1.1
          },
          sections: {
            continueWatching: { mode: 'carousel' },
            myList: { mode: 'poster_wall' },
            library: { mode: 'grid' }
          },
          typography: { fontFamily: 'Cinzel, Georgia, serif', fontSizeScale: 1.05 }
        }
      },
      {
        id: 'preset_compact',
        name: 'Compact',
        isBuiltin: 1,
        config: {
          name: 'Compact',
          colorTokens: {
            background: '#090d16',
            foreground: '#e2e8f0',
            primary: '#3b82f6',
            primaryForeground: '#ffffff',
            secondary: '#1e293b',
            secondaryForeground: '#e2e8f0',
            accent: '#2563eb',
            card: '#0f172a',
            border: '#334155'
          },
          cardStyle: {
            aspectRatio: 'compact',
            borderRadius: 8,
            showProgress: true,
            showDuration: true,
            showBadges: true,
            titlePlacement: 'below',
            hoverEffect: 'lift',
            sizeScale: 0.9
          },
          sections: {
            continueWatching: { mode: 'carousel' },
            myList: { mode: 'list' },
            library: { mode: 'list' }
          },
          typography: { fontFamily: 'system-ui, sans-serif', fontSizeScale: 0.95 }
        }
      },
      {
        id: 'preset_minimal',
        name: 'Minimal',
        isBuiltin: 1,
        config: {
          name: 'Minimal',
          colorTokens: {
            background: '#0a0a0a',
            foreground: '#ededed',
            primary: '#ffffff',
            primaryForeground: '#000000',
            secondary: '#171717',
            secondaryForeground: '#ededed',
            accent: '#737373',
            card: '#121212',
            border: '#262626'
          },
          cardStyle: {
            aspectRatio: '16:9',
            borderRadius: 6,
            showProgress: true,
            showDuration: false,
            showBadges: false,
            titlePlacement: 'below',
            hoverEffect: 'none',
            sizeScale: 1.0
          },
          sections: {
            continueWatching: { mode: 'carousel' },
            myList: { mode: 'grid' },
            library: { mode: 'grid' }
          },
          typography: { fontFamily: 'system-ui, sans-serif', fontSizeScale: 1.0 }
        }
      }
    ]

    const insert = this.db!.prepare(`
      INSERT OR IGNORE INTO theme_presets (id, name, is_builtin, config_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `)

    const now = Date.now()
    for (const p of presets) {
      insert.run(p.id, p.name, p.isBuiltin, JSON.stringify(p.config), now)
    }
  }

  public registerVault(vault: Vault): void {
    this.ensureInitialized()
    const stmt = this.db!.prepare(`
      INSERT INTO vaults (id, name, path, created_at, last_opened)
      VALUES (@id, @name, @path, @createdAt, @lastOpened)
      ON CONFLICT(path) DO UPDATE SET
        name = excluded.name,
        last_opened = excluded.last_opened
    `)

    stmt.run({
      id: vault.id,
      name: vault.name,
      path: vault.path,
      createdAt: vault.createdAt,
      lastOpened: vault.lastOpened
    })
  }

  public updateVaultLastOpened(vaultPath: string): void {
    this.ensureInitialized()
    const now = Date.now()
    const stmt = this.db!.prepare(`
      UPDATE vaults SET last_opened = ? WHERE path = ?
    `)
    stmt.run(now, vaultPath)
  }

  public getRecentVaults(): Vault[] {
    this.ensureInitialized()
    const stmt = this.db!.prepare(`
      SELECT id, name, path, created_at as createdAt, last_opened as lastOpened
      FROM vaults
      ORDER BY last_opened DESC
    `)
    const rows = stmt.all() as { id: string; name: string; path: string; createdAt: number; lastOpened: number }[]
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      path: r.path,
      createdAt: r.createdAt,
      lastOpened: r.lastOpened
    }))
  }

  public getVaultByPath(vaultPath: string): Vault | null {
    this.ensureInitialized()
    const stmt = this.db!.prepare(`
      SELECT id, name, path, created_at as createdAt, last_opened as lastOpened
      FROM vaults
      WHERE path = ?
    `)
    const row = stmt.get(vaultPath) as { id: string; name: string; path: string; createdAt: number; lastOpened: number } | undefined
    if (!row) return null

    return {
      id: row.id,
      name: row.name,
      path: row.path,
      createdAt: row.createdAt,
      lastOpened: row.lastOpened
    }
  }

  public removeVault(vaultPath: string): void {
    this.ensureInitialized()
    const stmt = this.db!.prepare(`DELETE FROM vaults WHERE path = ?`)
    stmt.run(vaultPath)
  }

  public getSettings(): AppSettings {
    this.ensureInitialized()
    const defaultSettings: AppSettings = {
      language: 'en',
      theme: 'dark',
      defaultPlaybackSpeed: 1.0,
      autoPlayNext: true,
      completionThreshold: 0.90,
      deleteSourceZipAfterImport: false,
      dailyStudyGoalMinutes: 30,
      weeklyLessonsGoal: 10
    }

    const stmt = this.db!.prepare(`SELECT key, value FROM app_settings`)
    const rows = stmt.all() as { key: string; value: string }[]

    const settings: Record<string, unknown> = { ...defaultSettings }
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value)
      } catch {
        settings[row.key] = row.value
      }
    }

    return settings as unknown as AppSettings
  }

  public setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    this.ensureInitialized()
    const serialized = JSON.stringify(value)
    const stmt = this.db!.prepare(`
      INSERT INTO app_settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `)
    stmt.run(key, serialized)
  }

  // --- Local Profiles ---

  public listProfiles(): import('../../types/theme').LocalProfile[] {
    this.ensureInitialized()
    const stmt = this.db!.prepare(`
      SELECT id, name, avatar_path as avatarPath, default_vault_path as defaultVaultPath,
             created_at as createdAt, updated_at as updatedAt
      FROM local_profiles
      ORDER BY created_at ASC
    `)
    return stmt.all() as import('../../types/theme').LocalProfile[]
  }

  public createProfile(name: string, avatarPath?: string): import('../../types/theme').LocalProfile {
    this.ensureInitialized()
    const now = Date.now()
    const id = `profile_${crypto.randomUUID()}`
    const profile: import('../../types/theme').LocalProfile = {
      id,
      name,
      avatarPath: avatarPath || null,
      defaultVaultPath: null,
      createdAt: now,
      updatedAt: now
    }
    this.db!.prepare(`
      INSERT INTO local_profiles (id, name, avatar_path, default_vault_path, created_at, updated_at)
      VALUES (@id, @name, @avatarPath, @defaultVaultPath, @createdAt, @updatedAt)
    `).run(profile)
    return profile
  }

  public updateProfile(id: string, updates: Partial<import('../../types/theme').LocalProfile>): boolean {
    this.ensureInitialized()
    const fields: string[] = []
    const params: Record<string, unknown> = { id, updatedAt: Date.now() }

    if (updates.name !== undefined) {
      fields.push('name = @name')
      params.name = updates.name
    }
    if (updates.avatarPath !== undefined) {
      fields.push('avatar_path = @avatarPath')
      params.avatarPath = updates.avatarPath
    }
    if (updates.defaultVaultPath !== undefined) {
      fields.push('default_vault_path = @defaultVaultPath')
      params.defaultVaultPath = updates.defaultVaultPath
    }

    if (fields.length === 0) return true
    fields.push('updated_at = @updatedAt')

    const res = this.db!.prepare(`UPDATE local_profiles SET ${fields.join(', ')} WHERE id = @id`).run(params)
    return res.changes > 0
  }

  public deleteProfile(id: string): boolean {
    this.ensureInitialized()
    // Do not delete if only 1 profile exists
    const count = this.db!.prepare(`SELECT count(*) as cnt FROM local_profiles`).get() as { cnt: number }
    if (count.cnt <= 1) return false
    const res = this.db!.prepare(`DELETE FROM local_profiles WHERE id = ?`).run(id)
    return res.changes > 0
  }

  // --- Theme Presets ---

  public listThemePresets(): import('../../types/theme').ThemePreset[] {
    this.ensureInitialized()
    const stmt = this.db!.prepare(`
      SELECT id, name, is_builtin as isBuiltin, config_json as configJson, created_at as createdAt
      FROM theme_presets
      ORDER BY is_builtin DESC, name ASC
    `)
    const rows = stmt.all() as { id: string; name: string; isBuiltin: number; configJson: string; createdAt: number }[]
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      isBuiltin: Boolean(r.isBuiltin),
      config: JSON.parse(r.configJson),
      createdAt: r.createdAt
    }))
  }

  public saveThemePreset(preset: Omit<import('../../types/theme').ThemePreset, 'id' | 'createdAt'> & { id?: string }): import('../../types/theme').ThemePreset {
    this.ensureInitialized()
    const now = Date.now()
    const id = preset.id || `preset_${crypto.randomUUID()}`
    this.db!.prepare(`
      INSERT INTO theme_presets (id, name, is_builtin, config_json, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        config_json = excluded.config_json
    `).run(id, preset.name, preset.isBuiltin ? 1 : 0, JSON.stringify(preset.config), now)

    return {
      id,
      name: preset.name,
      isBuiltin: Boolean(preset.isBuiltin),
      config: preset.config,
      createdAt: now
    }
  }

  // --- Appearance Overrides & Resolution ---

  public saveAppearanceOverride(
    scopeType: import('../../types/theme').ThemeScope,
    scopeId: string,
    overrides: Partial<import('../../types/theme').ThemeConfig>,
    presetId?: string
  ): boolean {
    this.ensureInitialized()
    const now = Date.now()
    const stmt = this.db!.prepare(`
      INSERT INTO appearance_overrides (scope_type, scope_id, theme_preset_id, overrides_json, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(scope_type, scope_id) DO UPDATE SET
        theme_preset_id = excluded.theme_preset_id,
        overrides_json = excluded.overrides_json,
        updated_at = excluded.updated_at
    `)
    const res = stmt.run(scopeType, scopeId, presetId || null, JSON.stringify(overrides), now)
    return res.changes > 0
  }

  public resetAppearanceOverride(scopeType: import('../../types/theme').ThemeScope, scopeId: string, category?: string): boolean {
    this.ensureInitialized()
    if (!category) {
      const res = this.db!.prepare(`DELETE FROM appearance_overrides WHERE scope_type = ? AND scope_id = ?`).run(scopeType, scopeId)
      return res.changes > 0
    }

    const row = this.db!.prepare(`SELECT overrides_json FROM appearance_overrides WHERE scope_type = ? AND scope_id = ?`).get(scopeType, scopeId) as { overrides_json: string } | undefined
    if (!row) return true

    try {
      const current = JSON.parse(row.overrides_json)
      delete current[category]
      this.db!.prepare(`UPDATE appearance_overrides SET overrides_json = ?, updated_at = ? WHERE scope_type = ? AND scope_id = ?`).run(JSON.stringify(current), Date.now(), scopeType, scopeId)
      return true
    } catch {
      return false
    }
  }

  public getResolvedTheme(
    profileId: string = 'default_profile',
    vaultPath?: string,
    courseId?: string,
    sectionId?: string
  ): import('../../types/theme').ResolvedTheme {
    this.ensureInitialized()

    const defaultTheme = this.listThemePresets().find((p) => p.id === 'preset_streaming')?.config || {
      name: 'Default',
      colorTokens: {
        background: '#07090e',
        foreground: '#f8fafc',
        primary: '#f97316',
        primaryForeground: '#ffffff',
        secondary: '#1e293b',
        secondaryForeground: '#f8fafc',
        accent: '#ea580c',
        card: '#0f172a',
        border: '#1e293b'
      },
      cardStyle: {
        aspectRatio: '16:9',
        borderRadius: 12,
        showProgress: true,
        showDuration: true,
        showBadges: true,
        titlePlacement: 'below',
        hoverEffect: 'zoom',
        sizeScale: 1.0
      },
      sections: {},
      typography: { fontFamily: 'Inter, sans-serif', fontSizeScale: 1.0 }
    }

    const scopes: { scopeType: import('../../types/theme').ThemeScope; scopeId?: string }[] = [
      { scopeType: 'profile', scopeId: profileId },
      { scopeType: 'vault', scopeId: vaultPath },
      { scopeType: 'course', scopeId: courseId },
      { scopeType: 'section', scopeId: sectionId }
    ]

    let resolvedColor = { ...defaultTheme.colorTokens }
    let resolvedCard = { ...defaultTheme.cardStyle }
    let resolvedSections = { ...defaultTheme.sections }
    let resolvedWallpaper = defaultTheme.wallpaper
    let resolvedTypography = {
      fontFamily: defaultTheme.typography?.fontFamily || 'Inter, sans-serif',
      fontSizeScale: defaultTheme.typography?.fontSizeScale || 1.0
    }

    for (const s of scopes) {
      if (!s.scopeId) continue
      const row = this.db!.prepare(`
        SELECT theme_preset_id, overrides_json
        FROM appearance_overrides
        WHERE scope_type = ? AND scope_id = ?
      `).get(s.scopeType, s.scopeId) as { theme_preset_id?: string; overrides_json: string } | undefined

      if (row) {
        if (row.theme_preset_id) {
          const preset = this.listThemePresets().find((p) => p.id === row.theme_preset_id)
          if (preset) {
            resolvedColor = { ...resolvedColor, ...preset.config.colorTokens }
            resolvedCard = { ...resolvedCard, ...preset.config.cardStyle }
            resolvedSections = { ...resolvedSections, ...preset.config.sections }
            if (preset.config.wallpaper) resolvedWallpaper = preset.config.wallpaper
            if (preset.config.typography) resolvedTypography = { ...resolvedTypography, ...preset.config.typography }
          }
        }
        try {
          const overrides = JSON.parse(row.overrides_json) as Partial<import('../../types/theme').ThemeConfig>
          if (overrides.colorTokens) resolvedColor = { ...resolvedColor, ...overrides.colorTokens }
          if (overrides.cardStyle) resolvedCard = { ...resolvedCard, ...overrides.cardStyle }
          if (overrides.sections) resolvedSections = { ...resolvedSections, ...overrides.sections }
          if (overrides.wallpaper) resolvedWallpaper = overrides.wallpaper
          if (overrides.typography) resolvedTypography = { ...resolvedTypography, ...overrides.typography }
        } catch {
          // Ignored
        }
      }
    }

    return {
      colorTokens: {
        background: resolvedColor.background || '#07090e',
        foreground: resolvedColor.foreground || '#f8fafc',
        primary: resolvedColor.primary || '#f97316',
        primaryForeground: resolvedColor.primaryForeground || '#ffffff',
        secondary: resolvedColor.secondary || '#1e293b',
        secondaryForeground: resolvedColor.secondaryForeground || '#f8fafc',
        accent: resolvedColor.accent || '#ea580c',
        muted: resolvedColor.muted || '#334155',
        mutedForeground: resolvedColor.mutedForeground || '#94a3b8',
        border: resolvedColor.border || '#1e293b',
        card: resolvedColor.card || '#0f172a',
        cardForeground: resolvedColor.cardForeground || '#f8fafc',
        cardBorder: resolvedColor.cardBorder || '#1e293b',
        playerBackground: resolvedColor.playerBackground || '#000000',
        progressBarColor: resolvedColor.progressBarColor || '#f97316'
      },
      cardStyle: resolvedCard as import('../../types/theme').CardStyleConfig,
      sections: resolvedSections,
      wallpaper: resolvedWallpaper,
      typography: resolvedTypography
    }
  }

  public getProfileDiscoveryPreferences(profileId: string): import('../../types/discovery').ProfileDiscoveryPreferences {
    this.ensureInitialized()
    const row = this.db!.prepare(`
      SELECT profile_id, preferred_categories, excluded_categories, preferred_tags, discovery_mode, prefer_short_content, updated_at
      FROM profile_discovery_preferences
      WHERE profile_id = ?
    `).get(profileId) as {
      profile_id: string
      preferred_categories: string
      excluded_categories: string
      preferred_tags: string
      discovery_mode: string
      prefer_short_content: number
      updated_at: number
    } | undefined

    if (!row) {
      return {
        profileId,
        preferredCategories: [],
        excludedCategories: [],
        preferredTags: [],
        discoveryMode: 'balanced',
        preferShortContent: false,
        updatedAt: Date.now()
      }
    }

    let preferredCategories: string[] = []
    let excludedCategories: string[] = []
    let preferredTags: string[] = []
    try {
      preferredCategories = JSON.parse(row.preferred_categories)
    } catch {
      // Ignored
    }
    try {
      excludedCategories = JSON.parse(row.excluded_categories)
    } catch {
      // Ignored
    }
    try {
      preferredTags = JSON.parse(row.preferred_tags)
    } catch {
      // Ignored
    }

    return {
      profileId: row.profile_id,
      preferredCategories,
      excludedCategories,
      preferredTags,
      discoveryMode: (row.discovery_mode as import('../../types/discovery').DiscoveryBalanceMode) || 'balanced',
      preferShortContent: row.prefer_short_content === 1,
      updatedAt: row.updated_at
    }
  }

  public saveProfileDiscoveryPreferences(prefs: import('../../types/discovery').ProfileDiscoveryPreferences): boolean {
    this.ensureInitialized()
    const now = Date.now()
    this.db!.prepare(`
      INSERT INTO profile_discovery_preferences (
        profile_id, preferred_categories, excluded_categories, preferred_tags, discovery_mode, prefer_short_content, updated_at
      ) VALUES (
        @profileId, @preferredCategories, @excludedCategories, @preferredTags, @discoveryMode, @preferShortContent, @updatedAt
      )
      ON CONFLICT(profile_id) DO UPDATE SET
        preferred_categories = excluded.preferred_categories,
        excluded_categories = excluded.excluded_categories,
        preferred_tags = excluded.preferred_tags,
        discovery_mode = excluded.discovery_mode,
        prefer_short_content = excluded.prefer_short_content,
        updated_at = excluded.updated_at
    `).run({
      profileId: prefs.profileId,
      preferredCategories: JSON.stringify(prefs.preferredCategories || []),
      excludedCategories: JSON.stringify(prefs.excludedCategories || []),
      preferredTags: JSON.stringify(prefs.preferredTags || []),
      discoveryMode: prefs.discoveryMode || 'balanced',
      preferShortContent: prefs.preferShortContent ? 1 : 0,
      updatedAt: now
    })
    return true
  }

  public getOptimizationSettings(): import('../../types/optimizer').OptimizationSettings {
    this.ensureInitialized()
    const defaultSettings: import('../../types/optimizer').OptimizationSettings = {
      autoOptimizeNewMedia: false,
      autoOptimizeMinSavingsPercent: 20,
      defaultProfile: 'balanced',
      resourceMode: 'automatic',
      maxConcurrentJobs: 1,
      pauseWhileWatching: true,
      pauseOnBattery: true,
      continueWhenWindowClosed: true,
      backupRetentionDays: 7,
      customBackupDirectory: undefined
    }

    const stmt = this.db!.prepare(`SELECT key, value FROM app_settings WHERE key LIKE 'opt_%'`)
    const rows = stmt.all() as { key: string; value: string }[]

    const res = { ...defaultSettings }
    for (const row of rows) {
      const field = row.key.replace(/^opt_/, '')
      try {
        const parsed = JSON.parse(row.value)
        if (field in res) {
          ;(res as Record<string, unknown>)[field] = parsed
        }
      } catch {
        if (field in res) {
          ;(res as Record<string, unknown>)[field] = row.value
        }
      }
    }
    return res
  }

  public updateOptimizationSettings(updates: Partial<import('../../types/optimizer').OptimizationSettings>): boolean {
    this.ensureInitialized()
    const tx = this.db!.transaction((entries: [string, unknown][]) => {
      const upsert = this.db!.prepare(`
        INSERT INTO app_settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `)
      for (const [key, value] of entries) {
        upsert.run(`opt_${key}`, JSON.stringify(value))
      }
    })

    tx(Object.entries(updates))
    return true
  }

  public close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  private ensureInitialized(): void {
    if (!this.db) {
      this.init()
    }
  }
}

export const appConfigService = new AppConfigService()
