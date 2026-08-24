export interface LocalProfile {
  id: string
  name: string
  avatarPath?: string | null
  defaultVaultPath?: string | null
  createdAt: number
  updatedAt: number
}

export type ThemeScope = 'profile' | 'vault' | 'course' | 'section'

export interface CardStyleConfig {
  aspectRatio: '2:3' | '16:9' | '1:1' | 'compact' | 'custom'
  borderRadius: number
  showProgress: boolean
  showDuration: boolean
  showBadges: boolean
  titlePlacement: 'inside' | 'below'
  hoverEffect: 'zoom' | 'glow' | 'lift' | 'none'
  sizeScale: number
}

export interface SectionDisplayConfig {
  mode: 'carousel' | 'grid' | 'list' | 'poster_wall' | 'compact'
  cardStyle?: Partial<CardStyleConfig>
  maxItems?: number
}

export interface ColorTokens {
  background?: string
  foreground?: string
  primary?: string
  primaryForeground?: string
  secondary?: string
  secondaryForeground?: string
  accent?: string
  muted?: string
  mutedForeground?: string
  border?: string
  card?: string
  cardForeground?: string
  cardBorder?: string
  playerBackground?: string
  progressBarColor?: string
}

export interface WallpaperConfig {
  imagePath?: string | null
  blur: number
  opacity: number
  darkening: number
  saturation: number
  zoom: number
  targetScreens: ('home' | 'library' | 'all')[]
}

export interface ThemeConfig {
  name: string
  colorTokens: ColorTokens
  cardStyle: CardStyleConfig
  sections: Record<string, SectionDisplayConfig>
  wallpaper?: WallpaperConfig
  typography?: {
    fontFamily?: string
    fontSizeScale?: number
  }
}

export interface ThemePreset {
  id: string
  name: string
  isBuiltin: boolean
  config: ThemeConfig
  createdAt: number
}

export interface AppearanceOverride {
  scopeType: ThemeScope
  scopeId: string
  themePresetId?: string | null
  overrides: Partial<ThemeConfig>
  updatedAt: number
}

export interface ResolvedTheme {
  colorTokens: Required<ColorTokens>
  cardStyle: CardStyleConfig
  sections: Record<string, SectionDisplayConfig>
  wallpaper?: WallpaperConfig
  typography: {
    fontFamily: string
    fontSizeScale: number
  }
}

export interface ThemePackageManifest {
  formatVersion: string
  name: string
  author?: string
  description?: string
  minOrbiaVersion: string
  createdAt: number
}
