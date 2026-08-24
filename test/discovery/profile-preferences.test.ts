import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { AppConfigService } from '../../src/main/services/app-config.service'

describe('Profile Discovery Preferences', () => {
  let appConfig: AppConfigService
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-prof-disc-test-'))
    appConfig = new AppConfigService(path.join(tmpDir, 'config.db'))
    appConfig.init()
  })

  afterEach(() => {
    appConfig.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('saves and retrieves profile discovery preferences', () => {
    const profileId = 'prof_study'
    const defaultPrefs = appConfig.getProfileDiscoveryPreferences(profileId)
    expect(defaultPrefs.discoveryMode).toBe('balanced')
    expect(defaultPrefs.preferredCategories).toEqual([])

    const updated = appConfig.saveProfileDiscoveryPreferences({
      profileId,
      preferredCategories: ['Programação', 'DevOps'],
      excludedCategories: ['Marketing'],
      preferredTags: ['Docker', 'Kubernetes'],
      discoveryMode: 'explore',
      preferShortContent: true,
      updatedAt: Date.now()
    })
    expect(updated).toBe(true)

    const saved = appConfig.getProfileDiscoveryPreferences(profileId)
    expect(saved.discoveryMode).toBe('explore')
    expect(saved.preferShortContent).toBe(true)
    expect(saved.preferredCategories).toContain('DevOps')
    expect(saved.excludedCategories).toContain('Marketing')
  })
})
