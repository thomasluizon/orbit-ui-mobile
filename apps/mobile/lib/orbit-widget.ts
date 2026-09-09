import { Platform } from 'react-native'
import { API } from '@orbit/shared/api'
import type { ColorScheme } from '@orbit/shared/theme'
import type { ThemeMode } from '@orbit/shared/types/profile'
import type {
  OrbitWidgetModuleType,
  WidgetThemeColors,
  WidgetThemePreferences,
} from '../modules/orbit-widget/src/OrbitWidget.types'
import { refreshPersistentReminder } from './persistent-reminder'
import { createTokensV2, type AppTokensV2 } from './theme'
import { widgetColorPalette } from './widget-colors.generated'

declare const require: (id: string) => unknown

let cachedModule: OrbitWidgetModuleType | null | undefined

function isOrbitWidgetModule(value: unknown): value is { default: OrbitWidgetModuleType } {
  if (typeof value !== 'object' || value === null) return false
  const candidate = (value as { default?: unknown }).default
  return typeof candidate === 'object' && candidate !== null
}

function getOrbitWidgetModule(): OrbitWidgetModuleType | null {
  if (Platform.OS !== 'android') {
    return null
  }

  if (cachedModule !== undefined) {
    return cachedModule
  }

  try {
    const loaded = require('../modules/orbit-widget')
    cachedModule = isOrbitWidgetModule(loaded) ? loaded.default : null
  } catch {
    cachedModule = null
  }

  return cachedModule
}

export async function saveWidgetToken(token: string): Promise<void> {
  await getOrbitWidgetModule()?.saveToken(token)
}

export async function clearWidgetToken(): Promise<void> {
  await getOrbitWidgetModule()?.clearToken()
}

export function toWidgetColors(
  tokens: AppTokensV2,
  mode: ThemeMode,
): WidgetThemeColors {
  const generated = widgetColorPalette[mode]
  return {
    background: generated.card,
    surface: generated.well,
    surfaceGround: tokens.bg,
    textPrimary: tokens.fg1,
    textSecondary: tokens.fg2,
    textMuted: tokens.fg3,
    border: generated.hairline,
    borderMuted: generated.hairline,
    overdue: tokens.statusOverdue,
    streak: tokens.primary,
    streakText: tokens.fg1,
    statusEmpty: tokens.fg4,
  }
}

export function toWidgetThemePreferences(
  colorScheme: ColorScheme,
): WidgetThemePreferences {
  const modes: ThemeMode[] = ['dark', 'light']
  const preferences = {} as WidgetThemePreferences
  for (const mode of modes) {
    const colors = toWidgetColors(createTokensV2(colorScheme, mode), mode)
    for (const key of Object.keys(colors) as (keyof WidgetThemeColors)[]) {
      preferences[`${mode}_${key}`] = colors[key]
    }
  }
  return preferences
}

export async function syncWidgetTheme(colorScheme: ColorScheme): Promise<void> {
  await getOrbitWidgetModule()?.syncTheme(toWidgetThemePreferences(colorScheme))
}

/**
 * Fetches today's widget habits through the authenticated API client and pushes
 * them into the native widget cache, so the home-screen widget renders from
 * app-fed data instead of relying on its own background network fetch. No-ops
 * when signed out or off Android.
 *
 * The token the API ACCEPTED for this response is handed to the native writer, which tags the
 * payload with the account it names. The pre-request token is not that token: `apiClient` reads the
 * store again at request time and retries a 401 under a rotated or refreshed one, so a body can
 * come back authorised by a different account than the caller last saw. Tagging with the caller's
 * token would then label one account's habits with another's, and the widget must never read one
 * account's habits back under another account's session.
 */
export async function syncWidgetData(): Promise<void> {
  const widgetModule = getOrbitWidgetModule()
  if (!widgetModule) return

  const { getToken } = await import('./secure-store')
  const token = await getToken()
  if (!token) {
    await refreshPersistentReminder(null)
    return
  }

  const { apiClientWithAuthorizingToken } = await import('./api-client')
  const { data, authorizingToken } = await apiClientWithAuthorizingToken<unknown>(API.habits.widget)
  if (authorizingToken) {
    await widgetModule.syncWidgetData(JSON.stringify(data), authorizingToken)
  }
  await refreshPersistentReminder(data)
}
