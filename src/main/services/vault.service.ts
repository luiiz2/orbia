import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { Vault, VaultStats } from '../../types'
import { appConfigService } from './app-config.service'
import { databaseService } from './database.service'
import { sourceWatchService } from './sources/source-watch.service'

export class VaultService {
  private currentVault: Vault | null = null
  private vaultChangeQueue: Promise<void> = Promise.resolve()

  public constructor(
    private readonly onVaultOpened: () => void = () => undefined,
    private readonly beforeVaultChange: () => Promise<void> = async () =>
      undefined
  ) {}

  /**
   * Creates a new Vault on disk and initializes its SQLite database.
   */
  public createVault(vaultPath: string, name: string): Promise<Vault> {
    return this.enqueueVaultChange(() => this.createVaultNow(vaultPath, name))
  }

  private async createVaultNow(
    vaultPath: string,
    name: string
  ): Promise<Vault> {
    const trimmedPath = vaultPath.trim()
    const trimmedName =
      name.trim() || path.basename(trimmedPath) || 'Study Vault'

    // 1. Create main vault directory if missing
    if (!fs.existsSync(trimmedPath)) {
      await fs.promises.mkdir(trimmedPath, { recursive: true })
    }

    // 2. Create standard Orbia directory architecture
    const inboxPath = path.join(trimmedPath, 'Inbox')
    const coursesPath = path.join(trimmedPath, 'Courses')
    const orbiaPath = path.join(trimmedPath, '.orbia')
    const coversPath = path.join(orbiaPath, 'covers')

    await fs.promises.mkdir(inboxPath, { recursive: true })
    await fs.promises.mkdir(coursesPath, { recursive: true })
    await fs.promises.mkdir(coversPath, { recursive: true })

    // Create .gitignore inside .orbia
    const gitignorePath = path.join(orbiaPath, '.gitignore')
    if (!fs.existsSync(gitignorePath)) {
      await fs.promises.writeFile(
        gitignorePath,
        '# Orbia local cache\n*.log\n*.tmp\n'
      )
    }

    // 3. Finish source work for the previous Vault before switching databases
    await this.beforeVaultChange()

    // 4. Connect and initialize library.db
    databaseService.connect(trimmedPath)

    // 5. Construct Vault domain entity
    const now = Date.now()
    const vault: Vault = {
      id: crypto.randomUUID(),
      name: trimmedName,
      path: trimmedPath,
      createdAt: now,
      lastOpened: now
    }

    // 6. Register in App Config DB
    appConfigService.registerVault(vault)
    appConfigService.setSetting('lastVaultPath', trimmedPath)
    this.currentVault = vault
    this.onVaultOpened()

    return vault
  }

  /**
   * Opens an existing Vault directory and connects to its library.db.
   */
  public openVault(vaultPath: string): Promise<Vault> {
    return this.enqueueVaultChange(() => this.openVaultNow(vaultPath))
  }

  private async openVaultNow(vaultPath: string): Promise<Vault> {
    const trimmedPath = vaultPath.trim()

    if (!fs.existsSync(trimmedPath)) {
      throw new Error(`Directory does not exist: "${trimmedPath}"`)
    }

    const stat = await fs.promises.stat(trimmedPath)
    if (!stat.isDirectory()) {
      throw new Error(`The path "${trimmedPath}" is not a valid folder.`)
    }

    // Ensure .orbia structure exists
    const orbiaPath = path.join(trimmedPath, '.orbia')
    const inboxPath = path.join(trimmedPath, 'Inbox')
    const coursesPath = path.join(trimmedPath, 'Courses')

    if (!fs.existsSync(orbiaPath)) {
      await fs.promises.mkdir(orbiaPath, { recursive: true })
    }
    if (!fs.existsSync(inboxPath)) {
      await fs.promises.mkdir(inboxPath, { recursive: true })
    }
    if (!fs.existsSync(coursesPath)) {
      await fs.promises.mkdir(coursesPath, { recursive: true })
    }

    await this.beforeVaultChange()

    // Connect DB
    databaseService.connect(trimmedPath)

    // Check if known in AppConfig, or register as new
    let vault = appConfigService.getVaultByPath(trimmedPath)
    const now = Date.now()

    if (!vault) {
      vault = {
        id: crypto.randomUUID(),
        name: path.basename(trimmedPath) || 'Study Vault',
        path: trimmedPath,
        createdAt: now,
        lastOpened: now
      }
      appConfigService.registerVault(vault)
    } else {
      appConfigService.updateVaultLastOpened(trimmedPath)
      vault.lastOpened = now
    }

    appConfigService.setSetting('lastVaultPath', trimmedPath)
    this.currentVault = vault
    this.onVaultOpened()

    return vault
  }

  /**
   * Returns currently active Vault, or null if none is open.
   */
  public getCurrentVault(): Vault | null {
    return this.currentVault
  }

  /**
   * Returns list of recent vaults.
   */
  public getRecentVaults(): Vault[] {
    return appConfigService.getRecentVaults()
  }

  /**
   * Aggregates stats for the active vault.
   */
  public getVaultStats(): VaultStats {
    if (!this.currentVault) {
      return {
        courseCount: 0,
        moduleCount: 0,
        lessonCount: 0,
        totalDuration: 0,
        completedLessons: 0,
        totalWatchedTime: 0
      }
    }
    return databaseService.getVaultStats()
  }

  /**
   * Checks if a directory is a valid Orbia vault.
   */
  public isValidVault(folderPath: string): boolean {
    if (!fs.existsSync(folderPath)) return false
    const orbiaDb = path.join(folderPath, '.orbia', 'library.db')
    return fs.existsSync(orbiaDb)
  }

  /**
   * Removes a vault from registry, and optionally deletes physical files from disk.
   */
  public deleteVault(
    vaultPath: string,
    deleteFiles: boolean
  ): Promise<boolean> {
    return this.enqueueVaultChange(() =>
      this.deleteVaultNow(vaultPath, deleteFiles)
    )
  }

  private async deleteVaultNow(
    vaultPath: string,
    deleteFiles: boolean
  ): Promise<boolean> {
    const trimmedPath = vaultPath.trim()

    // 1. If currently connected to this vault, close the DB connection
    if (
      this.currentVault?.path === trimmedPath ||
      databaseService.getCurrentVaultPath() === trimmedPath
    ) {
      await this.beforeVaultChange()
      databaseService.close()
      this.currentVault = null
      appConfigService.setSetting('lastVaultPath', '')
    }

    // 2. Remove from AppConfig registry
    appConfigService.removeVault(trimmedPath)

    // 3. If deleteFiles is true, delete the folder from disk
    if (deleteFiles && fs.existsSync(trimmedPath)) {
      await fs.promises.rm(trimmedPath, { recursive: true, force: true })
    }

    return true
  }

  private async enqueueVaultChange<T>(operation: () => Promise<T>): Promise<T> {
    const previousChange = this.vaultChangeQueue
    let releaseChange!: () => void
    this.vaultChangeQueue = new Promise<void>((resolve) => {
      releaseChange = resolve
    })

    await previousChange
    try {
      return await operation()
    } finally {
      releaseChange()
    }
  }
}

export const vaultService = new VaultService(
  () => sourceWatchService.restart(),
  () => sourceWatchService.stopAndWait()
)
