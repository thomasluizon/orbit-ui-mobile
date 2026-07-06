import { resolveAccessibleColorScheme } from '@orbit/shared/utils'
import type { ColorScheme } from '@orbit/shared/theme'
import type { Profile } from '@orbit/shared/types/profile'

/**
 * The color scheme that should drive the live theme: the authenticated profile's
 * when signed in, otherwise the pre-auth onboarding draft's — so the onboarding
 * scheme picker updates the theme immediately, before signup. Returns null when
 * neither source has a scheme, so the caller keeps its default.
 */
export function resolveActiveScheme(
  profile: Pick<Profile, 'colorScheme' | 'hasProAccess'> | null | undefined,
  draftColorScheme: string | null,
): ColorScheme | null {
  if (profile) return resolveAccessibleColorScheme(profile.colorScheme, profile.hasProAccess)
  if (draftColorScheme) return resolveAccessibleColorScheme(draftColorScheme, true)
  return null
}
