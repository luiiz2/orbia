import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { ThemePreset, ThemePackageManifest } from '../../../types/theme'
import { appConfigService } from '../app-config.service'

export class ThemePackageService {
  /**
   * Exports a theme preset into a portable JSON representation (.orbia-theme).
   * Strips all user private data (only theme configuration is saved).
   */
  public async exportTheme(
    presetId: string,
    targetPath?: string
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      const presets = appConfigService.listThemePresets()
      const preset = presets.find((p) => p.id === presetId)
      if (!preset) {
        return { success: false, error: 'Preset não encontrado' }
      }

      const manifest: ThemePackageManifest = {
        formatVersion: '1.0.0',
        name: preset.name,
        minOrbiaVersion: '0.5.0',
        createdAt: Date.now()
      }

      const packageContent = JSON.stringify(
        {
          manifest,
          preset: {
            name: preset.name,
            config: preset.config
          }
        },
        null,
        2
      )

      const outputPath =
        targetPath ||
        path.join(
          os.homedir(),
          'Downloads',
          `${preset.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.orbia-theme`
        )
      await fs.promises.writeFile(outputPath, packageContent, 'utf-8')

      return { success: true, filePath: outputPath }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  }

  /**
   * Imports and validates a .orbia-theme package, falling back safely on unsupported properties.
   */
  public async importTheme(
    filePath: string
  ): Promise<{ success: boolean; preset?: ThemePreset; error?: string }> {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'Arquivo de tema não encontrado' }
      }

      const raw = await fs.promises.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(raw) as {
        manifest?: ThemePackageManifest
        preset?: {
          name: string
          config: import('../../../types/theme').ThemeConfig
        }
      }

      if (!parsed.preset || !parsed.preset.name || !parsed.preset.config) {
        return {
          success: false,
          error: 'Formato de tema inválido ou corrompido'
        }
      }

      // Sanitize and save preset
      const saved = appConfigService.saveThemePreset({
        name: parsed.preset.name,
        isBuiltin: false,
        config: parsed.preset.config
      })

      return { success: true, preset: saved }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  }
}

export const themePackageService = new ThemePackageService()
