import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  CHECKLIST_TEMPLATE_STORAGE_KEY,
  LEGACY_CHECKLIST_TEMPLATE_STORAGE_KEY,
} from '@orbit/shared/utils'

export async function clearChecklistTemplates(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(CHECKLIST_TEMPLATE_STORAGE_KEY),
    AsyncStorage.removeItem(LEGACY_CHECKLIST_TEMPLATE_STORAGE_KEY),
  ])
}
