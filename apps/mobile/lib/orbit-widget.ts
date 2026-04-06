import { Platform } from 'react-native'
import type { OrbitWidgetModuleType } from '../modules/orbit-widget/src/OrbitWidget.types'

let cachedModule: OrbitWidgetModuleType | null | undefined

function getOrbitWidgetModule(): OrbitWidgetModuleType | null {
  if (Platform.OS !== 'android') {
    return null
  }

  if (cachedModule !== undefined) {
    return cachedModule
  }

  try {
    cachedModule = require('../modules/orbit-widget').default as OrbitWidgetModuleType
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
