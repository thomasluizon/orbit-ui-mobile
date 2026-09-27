import { resolveAccessibleColorScheme } from '@orbit/shared/utils'
import type { ColorScheme } from '@orbit/shared/theme'
import type { Profile } from '@orbit/shared/types/profile'

/**
 * Resolve the stored profile value to the granted accent. Returns null before
 * the profile loads so the caller keeps its default.
 */
export function resolveActiveScheme(
  profile: Pick<Profile, 'colorScheme' | 'hasProAccess'> | null | undefined,
): ColorScheme | null {
  if (profile) return resolveAccessibleColorScheme(profile.colorScheme, profile.hasProAccess)
  return null
}
