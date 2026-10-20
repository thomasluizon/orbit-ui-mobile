import { describe, expect, it } from 'vitest'
import {
  applyPendingOperationRevisionPreview, changePendingOperationRevisionDraft,
  changePendingOperationListRow, addPendingOperationListRow, removePendingOperationListRow,
  createPendingOperationRevisionState, isPendingOperationEditableField,
  pendingOperationDraft, pendingOperationEdits, reconcilePendingOperationRevisionState,
  selectPendingOperationRevisionItem,
} from '../hooks/pending-operation-revision-core'
import { makePendingAgentOperation } from '../test-support/chat-fixtures'
import type { PendingOperationItem } from '../types/ai'
import { createPendingOperationAuthorizationState, reconcilePendingOperationAuthorizationState } from '../hooks/pending-operation-card-core'

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

  it('round trips the full typed checklist rather than its display summary', () => {
    const typedItem: PendingOperationItem = { ...item, fields: [{
      ...item.fields[2]!, newValue: 'one item and more',
      proposedValue: [{ text: 'one item', is_checked: false }, { text: 'more', is_checked: true }],
      isEditable: true,
    }] }
    const draft = pendingOperationDraft(typedItem)
    expect(JSON.parse(draft.checklist_items!)).toEqual([
      { text: 'one item', is_checked: false }, { text: 'more', is_checked: true },
    ])
    expect(pendingOperationEdits(typedItem, {
      ...draft, checklist_items: JSON.stringify([{ text: 'changed', is_checked: false }, { text: 'more', is_checked: true }]),
    })).toEqual({ checklist_items: [{ text: 'changed', is_checked: false }, { text: 'more', is_checked: true }] })
  })

  it('withholds edit controls for a field the server marks non-editable', () => {
    expect(isPendingOperationEditableField({ ...item.fields[0]!, isEditable: false })).toBe(false)
  })

  it('keeps complete typed reminder arrays across edits', () => {
    const reminderTimes = [15, 30]
    const scheduledReminders = [{ when: 'same_day', time: '08:00' }, { when: 'day_before', time: '19:00' }]
    const withLists: PendingOperationItem = { ...item, fields: [
      { ...item.fields[0]!, field: 'reminder_times', newValue: '15 and more', proposedValue: reminderTimes, isEditable: true },
      { ...item.fields[0]!, field: 'scheduled_reminders', newValue: '2 reminders', proposedValue: scheduledReminders, isEditable: true },
    ] }
    const draft = pendingOperationDraft(withLists)
    const changedTimes = changePendingOperationListRow(draft.reminder_times!, 0, 'value', '20')
    const changedSchedule = changePendingOperationListRow(draft.scheduled_reminders!, 1, 'time', '20:00')
    expect(pendingOperationEdits(withLists, { reminder_times: changedTimes, scheduled_reminders: changedSchedule })).toEqual({
      reminder_times: [20, 30],
      scheduled_reminders: [{ when: 'same_day', time: '08:00' }, { when: 'day_before', time: '20:00' }],
    })
    expect(JSON.parse(removePendingOperationListRow(addPendingOperationListRow(draft.reminder_times!, 'reminder_times'), 1)))
      .toEqual([15, ''])
  })

  it('rejects an incomplete numeric reminder offset on save', () => {
    const withOffsets: PendingOperationItem = { ...item, fields: [
      { ...item.fields[0]!, field: 'reminder_times', proposedValue: [15, 30], isEditable: true },
    ] }
    expect(() => pendingOperationEdits(withOffsets, { reminder_times: '["",30]' })).toThrow('Invalid reminder offset')
  })

  it('starts scalar drafts from typed values', () => {
    const withBoolean: PendingOperationItem = { ...item, fields: [
      { ...item.fields[0]!, newValue: 'True', proposedValue: true, isEditable: true },
    ] }
    expect(pendingOperationDraft(withBoolean)).toEqual({ reminder_enabled: 'true' })
    expect(pendingOperationEdits(withBoolean, { reminder_enabled: 'false' })).toEqual({ reminder_enabled: false })
  })

  it('keeps drafts by item and replaces them when a different server fingerprint arrives', () => {
    const second = { ...item, itemId: 'habit-2', entityId: 'habit-2', entityName: 'Read' }
    const operation = makePendingAgentOperation({ previewFingerprint: 'preview-1', items: [item, second] })
    let state = createPendingOperationRevisionState(operation)
    state = selectPendingOperationRevisionItem(state, item.itemId)
    state = changePendingOperationRevisionDraft(state, 'days', 'Friday')
    state = selectPendingOperationRevisionItem(state, second.itemId)
    state = selectPendingOperationRevisionItem(state, item.itemId)
    expect(state.drafts[item.itemId]?.days).toBe('Friday')

    const replacement = { ...operation, previewFingerprint: 'preview-other', items: [second] }
    state = reconcilePendingOperationRevisionState(state, replacement)
    expect(state.operation.items).toEqual([second])
    expect(state.editingItemId).toBeUndefined()
    expect(state.drafts).toEqual({})
  })

  it('keeps an edited marker when the parent echoes a revised preview', () => {
    const operation = makePendingAgentOperation({ previewFingerprint: 'preview-1', items: [item] })
    const revised = { changes: [], changeTargetCount: 1, items: [item], previewFingerprint: 'preview-2' }
    const state = applyPendingOperationRevisionPreview(createPendingOperationRevisionState(operation), revised, item.itemId)
    expect(state.editedItemIds).toEqual([item.itemId])
    expect(reconcilePendingOperationRevisionState(state, { ...operation, ...revised }).editedItemIds).toEqual([item.itemId])
    expect(reconcilePendingOperationRevisionState(state, { ...operation, previewFingerprint: 'preview-other' }).editedItemIds).toEqual([])
  })
})

describe('pending operation authorization', () => {
  it('discards an open confirmation and prepared identity check on a new fingerprint', () => {
    const current = {
      ...createPendingOperationAuthorizationState('pending-1', 'preview-1'),
      confirmOpen: true,
      preparedStepUp: { challengeId: 'challenge-1', confirmationToken: 'confirmation-1' },
    }
    expect(reconcilePendingOperationAuthorizationState(current, 'pending-1', 'preview-1')).toBe(current)
    expect(reconcilePendingOperationAuthorizationState(current, 'pending-1', 'preview-2')).toEqual({
      ...createPendingOperationAuthorizationState('pending-1', 'preview-2'),
      closingStepUp: current.preparedStepUp,
    })
  })
})
