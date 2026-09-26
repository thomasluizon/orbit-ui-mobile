import { describe, expect, it } from 'vitest'
import { isPendingOperationEditableField, pendingOperationDraft, pendingOperationEdits } from '../hooks/pending-operation-revision-core'
import type { PendingOperationItem } from '../types/ai'

const item: PendingOperationItem = {
  itemId: 'habit-1', entityId: 'habit-1', entityName: 'Run', stateFingerprint: 'state-1',
  fields: [
    { entityId: 'habit-1', entityName: 'Run', field: 'reminder_enabled', oldValue: 'false', newValue: 'true', valueType: 'boolean' },
    { entityId: 'habit-1', entityName: 'Run', field: 'days', oldValue: 'Monday', newValue: 'Monday, Tuesday', valueType: 'text' },
    { entityId: 'habit-1', entityName: 'Run', field: 'checklist_items', oldValue: 'old item', newValue: 'new item', valueType: 'text' },
  ],
}

describe('pending operation edits', () => {
  it('sends the API boolean and day array types from an edited preview', () => {
    const draft = pendingOperationDraft(item)
    expect(draft).toEqual({ reminder_enabled: 'true', days: 'Monday, Tuesday' })
    expect(pendingOperationEdits(item, { ...draft, reminder_enabled: 'false', days: 'Tuesday, Friday' }))
      .toEqual({ reminder_enabled: false, days: ['Tuesday', 'Friday'] })
  })

  it('keeps summary-only list fields out of the editor', () => {
    expect(isPendingOperationEditableField(item.fields[2]!)).toBe(false)
  })
})
