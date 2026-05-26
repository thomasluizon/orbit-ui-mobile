import { Platform } from 'react-native'
import type { OrbitWidgetModuleType } from '../modules/orbit-widget/src/OrbitWidget.types'

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

export async function syncWidgetTheme(
  colorScheme: string,
  themeMode: 'dark' | 'light' = 'dark',
): Promise<void> {
  await getOrbitWidgetModule()?.syncTheme(colorScheme, themeMode)
}

export async function refreshWidget(): Promise<void> {
  await getOrbitWidgetModule()?.refresh()
}
