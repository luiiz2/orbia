import type { LocalProfile } from '@shared'

export type ProfileStartupMode = 'onboarding' | 'select'

/**
 * The app seeds a placeholder profile so the first-run form can personalize
 * it. Any configured profile, or a completed onboarding flag, should instead
 * enter the profile-selection flow.
 */
export function resolveProfileStartupMode(
  profiles: readonly Pick<LocalProfile, 'id' | 'name' | 'avatarPath'>[],
  hasCompletedOnboarding: boolean
): ProfileStartupMode {
  if (profiles.length === 0) return 'onboarding'
  if (hasCompletedOnboarding) return 'select'

  const hasConfiguredProfile = profiles.some(
    (profile) =>
      profile.id !== 'default_profile' ||
      profile.name.trim() !== 'Principal' ||
      Boolean(profile.avatarPath)
  )

  return hasConfiguredProfile ? 'select' : 'onboarding'
}
