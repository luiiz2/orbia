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
    `)
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
      completionThreshold: 0.90
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
