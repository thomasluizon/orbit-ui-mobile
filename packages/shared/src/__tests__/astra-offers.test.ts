import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { buildPendingOperationCardLabels } from '../chat/pending-operation-card'
import { buildChatClientContext } from '../chat/client-context'
import { astraOfferDestination, canShowAstraOffer } from '../chat/astra-offer'
import { readBlockMetadataSchema } from '../types/chat'
import { pendingAgentOperationSchema, revisePendingOperationRequestSchema } from '../types/ai'
import { astraOfferFixture, makeOfferedPreview, offeredReadFixture, offerConversationId } from '../test-support/astra-offer-fixtures'
import { pendingOperationDraft, pendingOperationEdits, pendingOperationRevisionRequest } from '../hooks/pending-operation-revision-core'
import { changePreviewFieldInput, previewFieldInputs, previewFieldInputLabel } from '../hooks/preview-field-core'
const { PostApiChatOffersDismissBody } = await vi.importActual<{ PostApiChatOffersDismissBody: z.ZodObject }>('../types/__generated__/api.generated')
import { dismissConversationOffersRequestSchema } from '../types/astra-offer'

describe('negotiated Astra offers', () => {
  it.each(['web', 'mobile'] as const)('requires the capability and a conversation on %s', platform => {
    const legacy = buildChatClientContext({ platform, locale: 'en' })
    expect(legacy.supportsProactiveOffers).toBeUndefined()
    expect(canShowAstraOffer(astraOfferFixture, legacy, [])).toBe(false)
    const enabled = buildChatClientContext({ platform, locale: 'pt-BR', conversationId: offerConversationId })
    expect(enabled.supportsProactiveOffers).toBe(true)
    expect(canShowAstraOffer(astraOfferFixture, enabled, [])).toBe(true)
    expect(canShowAstraOffer(astraOfferFixture, { ...enabled, supportsProactiveOffers: false }, [])).toBe(false)
    expect(canShowAstraOffer(astraOfferFixture, enabled, [astraOfferFixture.offerKey])).toBe(false)
  })
  it('retains legacy reads and ignores a malformed optional action', () => {
    const { nextAction: _action, ...legacy } = offeredReadFixture.read
    expect(readBlockMetadataSchema.parse(legacy).nextAction).toBeUndefined()
    expect(readBlockMetadataSchema.parse({ ...legacy, nextAction: { kind: 'invented' } }).nextAction).toBeNull()
  })
  it('uses only known surface routes', () => {
    expect(astraOfferDestination({ ...astraOfferFixture, kind: 'openSurface', surface: 'calendar-sync' })).toBe('/calendar?import=1')
    expect(astraOfferDestination({ ...astraOfferFixture, kind: 'openSurface', surface: 'https://outside.invalid' })).toBeUndefined()
  })
  it('matches the pinned dismissal producer without reading a response body', () => {
    const request = { conversationId: offerConversationId, offerKeys: [astraOfferFixture.offerKey] }
    expect(dismissConversationOffersRequestSchema.parse(PostApiChatOffersDismissBody.parse(request))).toEqual(request)
  })
  it('keeps exact nested paths and grouped removal in a preview revision', () => {
    const operation = makeOfferedPreview()
    const item = operation.items![0]!
    const removal = item.fields[2]!.removal!
    const request = pendingOperationRevisionRequest(operation.previewFingerprint!, [item], undefined, undefined, { itemId: item.itemId, fields: removal.fields! })
    expect(revisePendingOperationRequestSchema.parse(request).items).toEqual([{ itemId: '0', removeSuggestedFields: ['reminder_enabled', 'repeat_reminder'] }])
    expect(pendingAgentOperationSchema.parse(operation).items![0]!.fields[2]!.provenance).toBe('suggested')
  })
  it('edits repeat reminder controls as an object and retains the other settings', () => {
    const item = makeOfferedPreview().items![0]!
    const draft = pendingOperationDraft(item)
    const input = previewFieldInputs(draft.repeat_reminder!, 'repeat_reminder').find(entry => entry.name === 'interval_minutes')!
    const next = changePreviewFieldInput(draft.repeat_reminder!, input, '180')
    expect(pendingOperationEdits(item, { ...draft, repeat_reminder: next })).toEqual({ repeat_reminder: { interval_minutes: 180, active_start: '08:00', active_end: '22:00' } })
  })
  it('retains the exact slash path when editing a nested offered reminder', () => {
    const item = makeOfferedPreview().items![0]!
    const field = { ...item.fields[2]!, field: 'sub_habits/0/repeat_reminder' }
    const nested = { ...item, fields: [field] }
    const draft = pendingOperationDraft(nested)
    const inputs = previewFieldInputs(draft[field.field]!, field.field)
    const interval = inputs.find(input => input.name === 'interval_minutes')!
    const changed = changePreviewFieldInput(draft[field.field]!, interval, '180')
    expect(pendingOperationEdits(nested, { [field.field]: changed })).toEqual({
      'sub_habits/0/repeat_reminder': { interval_minutes: 180, active_start: '08:00', active_end: '22:00' },
    })
  })
  it('preserves the boolean type of an offered slip alert', () => {
    const item = makeOfferedPreview().items![0]!
    const alert = { ...item, fields: [{ ...item.fields[1]!, field: 'slip_alert_enabled' }] }
    expect(pendingOperationEdits(alert, { slip_alert_enabled: 'false' })).toEqual({ slip_alert_enabled: false })
  })
  it('retains numeric identity while a relative reminder is cleared and retyped', () => {
    const proposed = [{ minutes_before: 15 }]
    const value = JSON.stringify(proposed)
    const input = previewFieldInputs(value, 'relative_reminders', proposed)[0]!
    const cleared = changePreviewFieldInput(value, input, '')
    const intermediate = previewFieldInputs(cleared, 'relative_reminders', proposed)[0]!
    expect(intermediate.kind).toBe('number')
    expect(JSON.parse(changePreviewFieldInput(cleared, intermediate, '30'))).toEqual([{ minutes_before: 30 }])
  })
})

const offeredPreviewFields = [
  'description', 'emoji', 'frequency_unit', 'frequency_quantity', 'interval_weeks', 'days',
  'due_date', 'start_date', 'due_time', 'due_end_time', 'end_date', 'reminder_enabled',
  'reminder_times', 'scheduled_reminders', 'relative_reminders', 'repeat_reminder', 'slip_alert_enabled',
  'parent_habit_id', 'tag_ids', 'tag_names', 'goal_ids', 'checklist_items', 'sub_habits',
  'target_value', 'unit', 'deadline', 'habit_ids', 'items', 'is_general', 'is_flexible',
  'title', 'habit_id', 'text', 'is_checked', 'minutes_before', 'when', 'time',
  'interval_minutes', 'active_start', 'active_end', 'start_at_utc',
]

it.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }])('labels every offered producer field with the existing form vocabulary in $locale', ({ locale, messages }) => {
  const labels = buildPendingOperationCardLabels(makeOfferedPreview(), key => {
    const message = key.split('.').reduce<unknown>((current, part) => (current as Record<string, unknown>)[part], messages)
    return String(message)
  }, value => value, locale)
  for (const field of offeredPreviewFields) {
    expect(labels.fieldLabels[field], field).toBeTruthy()
    expect(labels.fieldLabels[field], field).not.toMatch(/_|\./)
  }
  expect(labels.fieldLabels).toMatchObject({
    tag_ids: messages.habits.form.tags, tag_names: messages.habits.form.tags,
    target_value: messages.goals.form.targetValue, active_start: messages.habits.form.repeatActiveStart,
    active_end: messages.habits.form.repeatActiveEnd, start_date: messages.habits.form.startDate,
    relative_reminders: messages.habits.form.reminder, minutes_before: messages.habits.form.reminderMinutes,
  })
})

it('uses one item position for repeated inputs without exposing field paths', () => {
  const proposed = [{ relative_reminders: [{ minutes_before: 15 }, { minutes_before: 30 }] }]
  const inputs = previewFieldInputs(JSON.stringify(proposed), 'sub_habits', proposed)
  expect(inputs.map(input => previewFieldInputLabel(input, { minutes_before: en.habits.form.reminderMinutes }))).toEqual(['min before 1', 'min before 2'])
  const tags = previewFieldInputs('["Water","Read"]', 'tag_names')
  expect(tags.map(input => previewFieldInputLabel(input, { tag_names: en.habits.form.tags }))).toEqual(['Tags 1', 'Tags 2'])
  const repeat = previewFieldInputs('{"interval_minutes":120}', 'repeat_reminder')
  expect(previewFieldInputLabel(repeat.find(input => input.name === 'interval_minutes')!, { interval_minutes: en.chat.operation.field.interval_minutes })).toBe(en.chat.operation.field.interval_minutes)
})

it('retains nested boolean and nullable draft values while editing only the selected path', () => {
  const proposed = [{ text: 'Read', is_checked: false, relative_reminders: [{ when: null, time: '08:00' }] }]
  const value = JSON.stringify(proposed)
  const inputs = previewFieldInputs(value, 'sub_habits', proposed)
  const checked = inputs.find(input => input.name === 'is_checked')!
  expect(JSON.parse(changePreviewFieldInput(value, checked, true))).toEqual([{ ...proposed[0], is_checked: true }])
  expect(inputs.find(input => input.name === 'when')).toMatchObject({ value: '', kind: 'text' })
  expect(inputs.find(input => input.name === 'time')).toMatchObject({ value: '08:00', kind: 'time' })
  expect(() => changePreviewFieldInput('null', checked, true)).toThrow('Invalid preview path')
})
