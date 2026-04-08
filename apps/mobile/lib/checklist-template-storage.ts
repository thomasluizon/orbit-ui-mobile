import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ChecklistTemplate } from '@orbit/shared/types/checklist-template'
import {
  CHECKLIST_TEMPLATE_STORAGE_KEY,
  LEGACY_CHECKLIST_TEMPLATE_STORAGE_KEY,
  resolveChecklistTemplates,
} from '@orbit/shared/utils'

export {
  CHECKLIST_TEMPLATE_STORAGE_KEY,
  LEGACY_CHECKLIST_TEMPLATE_STORAGE_KEY,
}

export async function loadChecklistTemplates(): Promise<ChecklistTemplate[]> {
  const [current, legacy] = await Promise.all([
    AsyncStorage.getItem(CHECKLIST_TEMPLATE_STORAGE_KEY),
    AsyncStorage.getItem(LEGACY_CHECKLIST_TEMPLATE_STORAGE_KEY),
  ])

  const { templates, shouldMigrateLegacy } = resolveChecklistTemplates(current, legacy)

  if (shouldMigrateLegacy) {
    await AsyncStorage.setItem(
      CHECKLIST_TEMPLATE_STORAGE_KEY,
      JSON.stringify(templates),
    )
    await AsyncStorage.removeItem(LEGACY_CHECKLIST_TEMPLATE_STORAGE_KEY)
  }

  return templates
}

export async function saveChecklistTemplates(
  templates: ChecklistTemplate[],
): Promise<void> {
  await AsyncStorage.setItem(
    CHECKLIST_TEMPLATE_STORAGE_KEY,
    JSON.stringify(templates),
  )
  await AsyncStorage.removeItem(LEGACY_CHECKLIST_TEMPLATE_STORAGE_KEY)
}

export async function clearChecklistTemplates(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(CHECKLIST_TEMPLATE_STORAGE_KEY),
    AsyncStorage.removeItem(LEGACY_CHECKLIST_TEMPLATE_STORAGE_KEY),
  ])
}
