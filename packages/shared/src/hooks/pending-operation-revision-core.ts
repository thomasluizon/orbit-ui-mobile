import type {
  PendingOperationItem,
  PendingOperationRevisionResult,
  RevisePendingOperationRequest,
} from '../types/ai'

export type PendingOperationRevisionResponse =
  | { ok: true; result: PendingOperationRevisionResult }
  | { ok: false; error: string; stale?: boolean }

export type RevisePendingOperation = (
  id: string,
  request: RevisePendingOperationRequest,
) => Promise<PendingOperationRevisionResponse>

const structuredFields = new Set([
  'frequency_quantity', 'interval_weeks', 'days', 'is_bad_habit',
  'is_general', 'is_flexible', 'checklist_items', 'sub_habits',
  'reminder_times', 'scheduled_reminders',
])
const listFields = new Set(['checklist_items', 'sub_habits', 'reminder_times', 'scheduled_reminders'])

export function isPendingOperationEditableField(field: { field: string; valueType: string }): boolean {
  return field.valueType !== 'action' && !listFields.has(field.field)
}

function editedValue(field: string, value: string): unknown {
  if (field.startsWith('is_') || field === 'enabled' || field === 'reminder_enabled') {
    if (value !== 'true' && value !== 'false') throw new Error('Invalid boolean')
    return value === 'true'
  }
  if (field === 'days') return value.split(',').map((day) => day.trim()).filter(Boolean)
  if (structuredFields.has(field)) return JSON.parse(value)
  return value === '' && field !== 'title' ? null : value
}

export function pendingOperationDraft(item: PendingOperationItem): Record<string, string> {
  return Object.fromEntries(item.fields
    .filter(isPendingOperationEditableField)
    .map((field) => [field.field, field.newValue ?? '']))
}

export function pendingOperationEdits(
  item: PendingOperationItem,
  draft: Readonly<Record<string, string>>,
): Record<string, unknown> {
  return Object.fromEntries(item.fields
    .filter((field) => isPendingOperationEditableField(field)
      && draft[field.field] !== (field.newValue ?? ''))
    .map((field) => [field.field, editedValue(field.field, draft[field.field] ?? '')]))
}

export function pendingOperationRevisionRequest(
  previewFingerprint: string,
  selected: readonly PendingOperationItem[],
  edits?: { itemId: string; values: Record<string, unknown> },
): RevisePendingOperationRequest {
  return {
    previewFingerprint,
    items: selected.map((item) => ({
      itemId: item.itemId,
      ...(edits?.itemId === item.itemId ? { edits: edits.values } : {}),
    })),
  }
}
