import { Platform } from 'react-native'
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

function toWidgetColors(tokens: AppTokensV2): WidgetThemeColors {
  return {
    primary: tokens.primary,
    primaryScale400: tokens.primaryPressed,
    background: tokens.bg,
    surface: tokens.bgElev,
    surfaceGround: tokens.bgSunk,
    textPrimary: tokens.fg1,
    textMuted: tokens.fg3,
    border: tokens.hairline,
    borderMuted: tokens.hairlineStrong,
    overdue: tokens.statusOverdue,
    streak: tokens.statusBad,
  }
}

export async function syncWidgetTheme(tokens: AppTokensV2): Promise<void> {
  await getOrbitWidgetModule()?.syncTheme(toWidgetColors(tokens))
}

export async function refreshWidget(): Promise<void> {
  await getOrbitWidgetModule()?.refresh()
}
