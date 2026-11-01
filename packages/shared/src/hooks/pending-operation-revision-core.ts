import type {
  PendingAgentOperation,
  PendingOperationItem,
  PendingOperationChangePreview,
  PendingOperationRevisionResult,
  RevisePendingOperationRequest,
} from '../types/ai'
import type { PendingOperationPlacementEdit } from './pending-operation-placement-core'

export interface PendingOperationRevisionState {
  sourceId: string
  sourceFingerprint: string | null | undefined
  operation: PendingAgentOperation
  editingItemId: string | undefined
  drafts: Readonly<Record<string, Readonly<Record<string, string>>>>
  editedItemIds: readonly string[]
  originalItemIds: readonly string[]
  authorizationVersion: number
}

export function createPendingOperationRevisionState(operation: PendingAgentOperation): PendingOperationRevisionState {
  return {
    sourceId: operation.id, sourceFingerprint: operation.previewFingerprint,
    operation, editingItemId: undefined, drafts: {}, editedItemIds: [],
    originalItemIds: operation.items?.map(item => item.itemId) ?? [], authorizationVersion: 0,
  }
}

export function reconcilePendingOperationRevisionState(
  current: PendingOperationRevisionState,
  incoming: PendingAgentOperation,
): PendingOperationRevisionState {
  if (current.sourceId === incoming.id && current.sourceFingerprint === incoming.previewFingerprint) return current
  if (current.sourceId === incoming.id && current.operation.previewFingerprint === incoming.previewFingerprint) {
    return { ...current, sourceFingerprint: incoming.previewFingerprint, operation: incoming }
  }
  return createPendingOperationRevisionState(incoming)
}

export function selectPendingOperationRevisionItem(
  current: PendingOperationRevisionState,
  itemId: string,
): PendingOperationRevisionState {
  const item = current.operation.items?.find((entry) => entry.itemId === itemId)
  if (!item || !item.fields.some(isPendingOperationEditableField)) return current
  return {
    ...current,
    editingItemId: itemId,
    drafts: current.drafts[itemId] ? current.drafts : { ...current.drafts, [itemId]: pendingOperationDraft(item) },
  }
}

export function changePendingOperationRevisionDraft(
  current: PendingOperationRevisionState,
  field: string,
  value: string,
): PendingOperationRevisionState {
  const itemId = current.editingItemId
  if (!itemId) return current
  return { ...current, drafts: {
    ...current.drafts,
    [itemId]: { ...current.drafts[itemId], [field]: value },
  } }
}

function omitDraftPath(value: unknown, [key, ...rest]: readonly string[]): unknown {
  if (Array.isArray(value)) return value.map((entry: unknown, index) => String(index) === key ? omitDraftPath(entry, rest) : entry)
  if (typeof value !== 'object' || value === null) return value
  const record = { ...value } as Record<string, unknown>
  if (rest.length) record[key!] = omitDraftPath(record[key!], rest)
  else delete record[key!]
  return record
}

function rebaseRemovedDraftFields(draft: Readonly<Record<string, string>>, removed: readonly string[]): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(draft)
    .filter(([field]) => !removed.some(path => field === path || field.startsWith(`${path}/`)))
    .map(([field, value]) => {
      const nested = removed.filter(path => path.startsWith(`${field}/`))
      if (!nested.length) return [field, value]
      const parsed: unknown = JSON.parse(value)
      return [field, JSON.stringify(nested.reduce((current, path) => omitDraftPath(current, path.slice(field.length + 1).split('/')), parsed))]
    }))
}

export function applyPendingOperationRevisionPreview(
  current: PendingOperationRevisionState,
  preview: PendingOperationChangePreview,
  editedItemId?: string,
  selected: readonly PendingOperationItem[] = current.operation.items ?? [],
  removal?: { itemId: string; fields: readonly string[] },
): PendingOperationRevisionState {
  const items = preview.items ?? []
  const itemIds = new Set(items.map((item) => item.itemId))
  const selectedIds = new Set(selected.map(item => item.itemId))
  return {
    ...current,
    operation: { ...current.operation, ...preview, nextAction: null },
    authorizationVersion: current.authorizationVersion + 1,
    originalItemIds: (current.operation.items ?? []).flatMap((item, index) => selectedIds.has(item.itemId) ? [current.originalItemIds[index]!] : []),
    drafts: Object.fromEntries(Object.entries(current.drafts)
      .filter(([id]) => id !== editedItemId && itemIds.has(id))
      .map(([id, draft]) => [id, removal?.itemId === id ? rebaseRemovedDraftFields(draft, removal.fields) : draft])),
    editedItemIds: [...new Set([...current.editedItemIds, ...(editedItemId ? [editedItemId] : [])])]
      .filter((id) => itemIds.has(id)),
    editingItemId: editedItemId || !current.editingItemId || !itemIds.has(current.editingItemId)
      ? undefined : current.editingItemId,
  }
}

export type PendingOperationRevisionResponse =
  | { ok: true; result: PendingOperationRevisionResult }
  | { ok: false; error: string; stale?: boolean }

export type RevisePendingOperation = (
  id: string,
  request: RevisePendingOperationRequest,
) => Promise<PendingOperationRevisionResponse>
export type RefreshPendingOperation = (id: string) => Promise<PendingOperationRevisionResponse>

const structuredFields = new Set([
  'frequency_quantity', 'interval_weeks', 'days', 'is_bad_habit',
  'is_general', 'is_flexible', 'checklist_items', 'sub_habits',
  'reminder_times', 'scheduled_reminders',
])
const listFields = new Set(['checklist_items', 'sub_habits', 'reminder_times', 'scheduled_reminders'])

export function isPendingOperationEditableField(field: { field: string; valueType: string; isEditable?: boolean; proposedValue?: unknown }): boolean {
  const name = field.field.split('/').at(-1)!
  if (field.isEditable === true) return field.valueType !== 'action' && (!listFields.has(name) || Array.isArray(field.proposedValue))
  return field.isEditable !== false && field.valueType !== 'action'
    && !listFields.has(name)
}

export function pendingOperationListRows(value: string): readonly unknown[] {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed)) throw new Error('Invalid preview list')
  return parsed
}

export function changePendingOperationListRow(
  value: string, index: number, key: string, next: string | boolean,
): string {
  const rows = [...pendingOperationListRows(value)]
  const row = rows[index]
  rows[index] = typeof row !== 'object' || row === null ? next : { ...row, [key]: next }
  return JSON.stringify(rows)
}

export function removePendingOperationListRow(value: string, index: number): string {
  return JSON.stringify(pendingOperationListRows(value).filter((_, rowIndex) => rowIndex !== index))
}

export function addPendingOperationListRow(value: string, field: string): string {
  const row = field === 'checklist_items' ? { text: '', is_checked: false }
    : field === 'scheduled_reminders' ? { when: 'same_day', time: '' } : ''
  return JSON.stringify([...pendingOperationListRows(value), row])
}

function editedValue(change: PendingOperationItem['fields'][number], value: string): unknown {
  const field = change.field.split('/').at(-1)!
  if (typeof change.proposedValue === 'boolean' || field.startsWith('is_') || field === 'enabled' || field === 'reminder_enabled') {
    if (value !== 'true' && value !== 'false') throw new Error('Invalid boolean')
    return value === 'true'
  }
  if (field === 'days') return value.split(',').map((day) => day.trim()).filter(Boolean)
  if (field === 'reminder_times') return pendingOperationListRows(value).map((row) => {
    if (row === '' || !Number.isInteger(Number(row))) throw new Error('Invalid reminder offset')
    return Number(row)
  })
  if (structuredFields.has(field) || typeof change.proposedValue === 'object' && change.proposedValue !== null) return JSON.parse(value)
  if (typeof change.proposedValue === 'number') {
    if (!value.trim() || !Number.isFinite(Number(value))) throw new Error('Invalid number')
    return Number(value)
  }
  return value === '' && field !== 'title' ? null : value
}

export function pendingOperationDraft(item: PendingOperationItem): Record<string, string> {
  return Object.fromEntries(item.fields
    .filter(isPendingOperationEditableField)
    .map((field) => [field.field, pendingOperationFieldDraft(field)]))
}

function pendingOperationFieldDraft(field: PendingOperationItem['fields'][number]): string {
  if (Array.isArray(field.proposedValue)) return field.field.split('/').at(-1) === 'days'
    ? field.proposedValue.join(', ') : JSON.stringify(field.proposedValue)
  if (field.proposedValue === null) return ''
  if (typeof field.proposedValue === 'boolean' || typeof field.proposedValue === 'number')
    return String(field.proposedValue)
  if (typeof field.proposedValue === 'string') return field.proposedValue
  if (typeof field.proposedValue === 'object') return JSON.stringify(field.proposedValue)
  return field.newValue ?? ''
}

export function pendingOperationEdits(
  item: PendingOperationItem,
  draft: Readonly<Record<string, string>>,
): Record<string, unknown> {
  return Object.fromEntries(item.fields
    .filter((field) => isPendingOperationEditableField(field)
      && draft[field.field] !== pendingOperationFieldDraft(field))
    .map((field) => [field.field, editedValue(field, draft[field.field] ?? '')]))
}

export function pendingOperationRevisionRequest(
  previewFingerprint: string,
  selected: readonly PendingOperationItem[],
  edits?: { itemId: string; values: Record<string, unknown> },
  placement?: PendingOperationPlacementEdit,
  removal?: { itemId: string; fields: readonly string[] },
): RevisePendingOperationRequest {
  return {
    previewFingerprint,
    items: selected.map((item) => ({
      itemId: item.itemId,
      ...(edits?.itemId === item.itemId ? { edits: edits.values } : {}),
      ...(placement?.itemId === item.itemId ? { placement: placement.value } : {}),
      ...(removal?.itemId === item.itemId ? { removeSuggestedFields: [...removal.fields] } : {}),
    })),
  }
}
