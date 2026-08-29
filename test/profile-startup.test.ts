import { describe, expect, it } from 'vitest'
import { resolveProfileStartupMode } from '../src/renderer/src/lib/profile-startup'

describe('resolveProfileStartupMode', () => {
  const placeholder = {
    id: 'default_profile',
    name: 'Principal',
    avatarPath: null
  }

  it('opens onboarding when no profile exists', () => {
    expect(resolveProfileStartupMode([], false)).toBe('onboarding')
  })

  it('opens onboarding for the untouched seeded profile', () => {
    expect(resolveProfileStartupMode([placeholder], false)).toBe('onboarding')
  })

  it('opens profile selection after onboarding is complete', () => {
    expect(resolveProfileStartupMode([placeholder], true)).toBe('select')
  })

  it('opens profile selection when a configured profile exists without the flag', () => {
    expect(
      resolveProfileStartupMode([{ ...placeholder, name: 'Luiz' }], false)
    ).toBe('select')
  })
})
