import type { ChecklistItem } from '../types/habit'
import type { ChecklistTemplate } from '../types/checklist-template'

export const CHECKLIST_TEMPLATE_STORAGE_KEY = 'orbit-checklist-templates'
export const LEGACY_CHECKLIST_TEMPLATE_STORAGE_KEY = 'orbit:checklist-templates'

export function parseChecklistTemplates(raw: string | null): ChecklistTemplate[] {
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as ChecklistTemplate[]) : []
  } catch {
    return []
  }
}

export function resolveChecklistTemplates(
  currentRaw: string | null,
  legacyRaw: string | null,
): {
  templates: ChecklistTemplate[]
  shouldMigrateLegacy: boolean
} {
  const currentTemplates = parseChecklistTemplates(currentRaw)
  const legacyTemplates = parseChecklistTemplates(legacyRaw)
  const templates = currentTemplates.length > 0 ? currentTemplates : legacyTemplates

  return {
    templates,
    shouldMigrateLegacy: !currentRaw && templates.length > 0,
  }
}

export function createChecklistTemplate(
  name: string,
  items: ChecklistItem[],
  createId: () => string,
): ChecklistTemplate | null {
  const trimmedName = name.trim()
  if (!trimmedName || items.length === 0) return null

  return {
    id: createId(),
    name: trimmedName,
    items: items.map((item) => item.text),
  }
}

export function applyChecklistTemplate(
  template: ChecklistTemplate,
): ChecklistItem[] {
  return template.items.map((text) => ({ text, isChecked: false }))
}

export function deleteChecklistTemplate(
  templates: ChecklistTemplate[],
  templateId: string,
): ChecklistTemplate[] {
  return templates.filter((template) => template.id !== templateId)
}
