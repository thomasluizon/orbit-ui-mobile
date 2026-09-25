import { Platform } from 'react-native'
import { requireNativeModule } from 'expo'
import type { OrbitWidgetModuleType } from './OrbitWidget.types'

const noopModule: OrbitWidgetModuleType = {
  async saveToken() {},
  async clearToken() {},
  async syncTheme() {},
  async syncWidgetData() {},
  async postPersistentReminder() {},
  async cancelPersistentReminder() {},
}

let orbitWidgetModule: OrbitWidgetModuleType | null = null

if (Platform.OS === 'android') {
  try {
    orbitWidgetModule = requireNativeModule<OrbitWidgetModuleType>('OrbitWidget')
  } catch {
    orbitWidgetModule = null
  }
}

export const nativeOrbitWidgetModule = orbitWidgetModule
export default orbitWidgetModule ?? noopModule
