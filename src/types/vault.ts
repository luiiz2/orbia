/**
 * Vault domain model
 */
export interface Vault {
  id: string // UUID
  name: string // Display name
  path: string // Absolute path to vault folder
  createdAt: number // Unix timestamp ms
  lastOpened: number // Unix timestamp ms
  isExternalOnly?: boolean
}

export interface VaultStats {
  courseCount: number
  moduleCount: number
  lessonCount: number
  totalDuration: number // seconds
  completedLessons: number
  totalWatchedTime: number // seconds
}

export interface AppSettings {
  language: 'en' | 'pt-BR'
  theme: 'dark' | 'light' | 'system'
  lastVaultPath?: string
  defaultPlaybackSpeed: number
  autoPlayNext: boolean
  completionThreshold: number // Default 0.90 (90%)
  /** Always delete the source .zip after importing it (persistent choice) */
  deleteSourceZipAfterImport?: boolean
  /** Daily study goal in minutes (default 30) */
  dailyStudyGoalMinutes?: number
  /** Weekly completed lessons goal (default 10) */
  weeklyLessonsGoal?: number
}
