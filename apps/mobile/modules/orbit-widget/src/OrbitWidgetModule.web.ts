import type { OrbitWidgetModuleType } from './OrbitWidget.types'

const OrbitWidgetWebModule: OrbitWidgetModuleType = {
  async saveToken() {},
  async clearToken() {},
  async syncTheme() {},
  async syncWidgetData() {},
  async postPersistentReminder() {},
  async cancelPersistentReminder() {},
}

export default OrbitWidgetWebModule
