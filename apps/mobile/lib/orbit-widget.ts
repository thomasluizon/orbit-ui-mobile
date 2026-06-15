import { Platform } from 'react-native'
import { API } from '@orbit/shared/api'
import type {
  OrbitWidgetModuleType,
  WidgetThemeColors,
} from '../modules/orbit-widget/src/OrbitWidget.types'
import type { AppTokensV2 } from './theme'

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

const RGB_PATTERN = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/

function flattenColor(color: string, baseHex: string): string {
  const match = RGB_PATTERN.exec(color)
  if (!match) return color

  const overlay = [match[1], match[2], match[3]].map(channel =>
    Number.parseInt(channel ?? '0', 10),
  )
  const alphaGroup = match[4]
  const overlayAlpha = alphaGroup === undefined ? 1 : Number.parseFloat(alphaGroup)
  const base = baseHex.replace('#', '')
  const blend = (index: number) => {
    const baseChannel = Number.parseInt(base.slice(index * 2, index * 2 + 2), 16)
    const merged = Math.round(
      (overlay[index] ?? 0) * overlayAlpha + baseChannel * (1 - overlayAlpha),
    )
    return merged.toString(16).padStart(2, '0')
  }

  return `#${blend(0)}${blend(1)}${blend(2)}`
}

export function toWidgetColors(tokens: AppTokensV2): WidgetThemeColors {
  return {
    primary: tokens.primary,
    background: tokens.bg,
    surface: flattenColor(tokens.bgElev, tokens.bg),
    surfaceGround: flattenColor(tokens.bgSunk, tokens.bg),
    textPrimary: tokens.fg1,
    textMuted: tokens.fg3,
    border: flattenColor(tokens.hairline, tokens.bg),
    borderMuted: flattenColor(tokens.hairlineStrong, tokens.bg),
    overdue: tokens.statusOverdue,
    streak: tokens.statusOverdue,
    statusEmpty: flattenColor(tokens.statusEmpty, tokens.bg),
  }
}

export async function syncWidgetTheme(tokens: AppTokensV2): Promise<void> {
  await getOrbitWidgetModule()?.syncTheme(toWidgetColors(tokens))
}

/**
 * Fetches today's widget habits through the authenticated API client and pushes
 * them into the native widget cache, so the home-screen widget renders from
 * app-fed data instead of relying on its own background network fetch. No-ops
 * when signed out or off Android.
 */
export async function syncWidgetData(): Promise<void> {
  const widgetModule = getOrbitWidgetModule()
  if (!widgetModule) return

  const { getToken } = await import('./secure-store')
  const token = await getToken()
  if (!token) return

  const { apiClient } = await import('./api-client')
  const data = await apiClient<unknown>(API.habits.widget)
  await widgetModule.syncWidgetData(JSON.stringify(data))
}
