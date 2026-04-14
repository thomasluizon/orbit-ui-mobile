import { API } from '@orbit/shared/api'
import type { Profile, ThemeMode } from '@orbit/shared/types/profile'
import { resolveSupportedLocale } from '@orbit/shared/utils'
import { applyThemeTokensToDOM, normalizeColorScheme } from './theme-dom'

function setClientCookie(name: string, value: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=${encodeURIComponent(value)};max-age=${365 * 24 * 60 * 60};path=/;samesite=strict;secure`
}

function resolveThemeMode(themePreference: string | null | undefined): ThemeMode {
  if (themePreference === 'light' || themePreference === 'dark') {
    return themePreference
  }

  const matchMedia = globalThis.window?.matchMedia
  if (matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light'
  }

  return 'dark'
}

export function applyProfilePresentation(profile: Pick<
  Profile,
  'colorScheme' | 'themePreference' | 'language'
>) {
  const colorScheme = normalizeColorScheme(profile.colorScheme)
  const themeMode = resolveThemeMode(profile.themePreference)
  const language = resolveSupportedLocale(profile.language)

  setClientCookie('orbit_color_scheme', colorScheme)
  setClientCookie('orbit_theme_mode', themeMode)
  setClientCookie('i18n_locale', language)
  applyThemeTokensToDOM(colorScheme, themeMode, false)
}

export async function hydrateProfilePresentation(): Promise<Profile | null> {
  try {
    const response = await fetch(API.profile.get, { cache: 'no-store' })
    if (!response.ok) return null
    const profile = await response.json() as Profile
    applyProfilePresentation(profile)
    return profile
  } catch {
    return null
  }
}
