import { getSavedTheme } from '@/stores/theme-store'
import { mediaQueryMatches } from '@/lib/media-query'
import { fetchWithThrottle } from '@/lib/throttle-fetch'
import { API } from '@orbit/shared/api'
import type { Profile } from '@orbit/shared/types/profile'
import { resolveSupportedLocale } from '@orbit/shared/utils'
import { applyThemeTokensToDOM, normalizeColorScheme, resolveInitialTheme } from './theme-dom'

function setClientCookie(name: string, value: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=${encodeURIComponent(value)};max-age=${365 * 24 * 60 * 60};path=/;samesite=strict;secure`
}

export function applyProfilePresentation(profile: Pick<
  Profile,
  'colorScheme' | 'themePreference' | 'language'
>) {
  const colorScheme = normalizeColorScheme(profile.colorScheme)
  const explicitTheme = resolveInitialTheme(getSavedTheme(), profile.themePreference)
  const themeMode = explicitTheme ?? (mediaQueryMatches('(prefers-color-scheme: light)') ? 'light' : 'dark')
  const language = resolveSupportedLocale(profile.language)

  setClientCookie('orbit_color_scheme', colorScheme)
  if (explicitTheme) setClientCookie('orbit_theme_mode', explicitTheme)
  setClientCookie('i18n_locale', language)
  applyThemeTokensToDOM(colorScheme, themeMode, false)
}

export async function hydrateProfilePresentation(): Promise<Profile | null> {
  try {
    const response = await fetchWithThrottle(API.profile.get, { cache: 'no-store' })
    if (!response.ok) return null
    const profile = await response.json() as Profile
    applyProfilePresentation(profile)
    return profile
  } catch {
    return null
  }
}
