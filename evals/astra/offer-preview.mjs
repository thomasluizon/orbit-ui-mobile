import { isDeepStrictEqual } from 'node:util'
import { readOfferState } from './fixtures/offers.mjs'

function withoutRemovedChildren(value, itemId, field, removed) {
  const normalized = structuredClone(value)
  for (const path of removed) {
    const prefix = `${itemId}:${field}/`
    if (!path.startsWith(prefix)) continue
    const segments = path.slice(prefix.length).split('/')
    let parent = normalized
    for (const segment of segments.slice(0, -1)) parent = parent?.[segment]
    if (parent && typeof parent === 'object') delete parent[segments.at(-1)]
  }
  return normalized
}

function removedValuesAbsent(item, removed) {
  return item.fields.every((field) => removed.every((path) => {
    const key = `${item.itemId}:${field.field}`
    if (path === key) return field.provenance !== 'suggested' && field.proposedValue == null
    if (!path.startsWith(`${key}/`)) return true
    const value = path.slice(key.length + 1).split('/').reduce((parent, segment) => parent?.[segment], field.proposedValue)
    return value == null
  }))
}

export function preservesOfferFields(before, after, removed = [], edited = []) {
  if (!Array.isArray(after?.items) || after.items.length !== before.items.length) return false
  return before.items.every((item) => {
    const next = after.items.find((candidate) => candidate.itemId === item.itemId && candidate.entityId === item.entityId)
    if (!next || !removedValuesAbsent(next, removed)) return false
    return item.fields.every((field) => {
      const updated = next.fields.find((candidate) => candidate.field === field.field)
      if (removed.includes(`${item.itemId}:${field.field}`)) return true
      if (edited.includes(`${item.itemId}:${field.field}`)) return Boolean(updated)
      return updated && isDeepStrictEqual(
        withoutRemovedChildren(updated.proposedValue, item.itemId, field.field, removed),
        withoutRemovedChildren(field.proposedValue, item.itemId, field.field, removed))
        && updated.provenance === field.provenance
    }) && next.fields.every((field) => item.fields.some((original) => original.field === field.field)
      || edited.includes(`${item.itemId}:${field.field}`))
  })
}

export async function reviseOfferPreview(api, pending, items, clientContext) {
  const { payload } = await api('POST', `ai/pending-operations/${pending.id}/revise`, {
    previewFingerprint: pending.previewFingerprint, items, clientContext,
  })
  if (payload?.isSuccess !== true || payload.pendingOperationId !== pending.id
    || !Array.isArray(payload.preview?.items) || typeof payload.preview.previewFingerprint !== 'string') {
    throw new Error('Offer revision did not return the same verifiable preview.')
  }
  for (const item of items) {
    const revised = payload.preview.items.find((candidate) => candidate.itemId === item.itemId)
    if (!revised || !Object.entries(item.edits ?? {}).every(([key, value]) =>
      revised.fields.some((field) => field.field === key && isDeepStrictEqual(field.proposedValue, value)))) {
      throw new Error('Offer revision did not apply the requested edit.')
    }
  }
  return { ...pending, ...payload.preview }
}

export async function rejectOfferPreview(api, pending, vars) {
  const { payload } = await api('POST', `ai/pending-operations/${pending.id}/revise`, {
    previewFingerprint: pending.previewFingerprint, items: [], clientContext: vars.clientContext,
  })
  if (payload?.isSuccess !== true || payload.cancelled !== true) throw new Error('Offer rejection did not cancel the preview.')
  const confirmation = await api('POST', `ai/pending-operations/${pending.id}/confirm`, undefined, [], [404])
  if (confirmation.status !== 404 || !isDeepStrictEqual(await readOfferState(api), vars.offerBaseline)) {
    throw new Error('Rejected offer changed stored fields or remains confirmable.')
  }
}

export async function removeOfferGroup(api, pending, clientContext) {
  const target = pending.items.flatMap((item) => item.fields.filter((field) => field.provenance === 'suggested')
    .map((field) => ({ item, field })))[0]
  if (!target) return { pending, removed: [] }
  const removed = target.field.removal.fields.map((field) => `${target.item.itemId}:${field}`)
  const revised = await reviseOfferPreview(api, pending, pending.items.map((item) => ({ itemId: item.itemId,
    ...(item.itemId === target.item.itemId ? { removeSuggestedFields: [target.field.field] } : {}),
  })), clientContext)
  if (!preservesOfferFields(pending, revised, removed)) throw new Error('Grouped removal retained a rejected value or changed a requested field or sibling.')
  return { pending: revised, removed }
}

const persistedFields = { title: 'title', description: 'description', emoji: 'emoji', due_date: 'dueDate',
  due_time: 'dueTime', due_end_time: 'dueEndTime', end_date: 'endDate', frequency_unit: 'frequencyUnit',
  frequency_quantity: 'frequencyQuantity', days: 'days', is_general: 'isGeneral', is_bad_habit: 'isBadHabit',
  is_flexible: 'isFlexible', reminder_enabled: 'reminderEnabled', reminder_times: 'reminderTimes',
  scheduled_reminders: 'scheduledReminders', relative_reminders: 'relativeReminders',
  slip_alert_enabled: 'slipAlertEnabled', interval_weeks: 'intervalWeeks', parent_habit_id: 'parentHabitId',
  start_date: 'startDate', checklist_items: 'checklistItems', repeat_reminder: 'repeatReminder',
  tag_ids: 'tags', tag_names: 'tags', goal_ids: 'linkedGoals', is_completed: 'isCompleted' }

const nestedFields = { checklist_items: ['text', 'is_checked'], scheduled_reminders: ['when', 'time'],
  relative_reminders: ['minutes_before', 'when', 'time'],
  repeat_reminder: ['interval_minutes', 'active_start', 'active_end', 'start_at_utc'] }
const clock = (value) => typeof value === 'string' && /^\d{2}:\d{2}(?::00(?:\.0+)?)?$/u.test(value) ? value.slice(0, 5) : value
const instant = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : value

function requireReadbackFields(fields) {
  for (const { field, proposedValue } of fields) {
    if (!Object.hasOwn(persistedFields, field)) throw new Error(`Offer approval lacks a verified readback mapping: ${field}`)
    if (proposedValue === undefined) throw new Error(`Offer approval lacks a typed proposed value: ${field}`)
    if (!Object.hasOwn(nestedFields, field) || proposedValue === null) continue
    const values = field === 'repeat_reminder' ? [proposedValue] : proposedValue
    if (!Array.isArray(values) || values.some((value) => !value || typeof value !== 'object'
      || Array.isArray(value) || Object.keys(value).some((key) => !nestedFields[field].includes(key)))) {
      throw new Error(`Offer approval lacks a verified readback mapping: ${field} child field`)
    }
  }
}

function persistedValue(field, detail, proposedValue) {
  const actual = detail[persistedFields[field]]
  if (actual == null) return actual
  if (['due_time', 'due_end_time'].includes(field)) return clock(actual)
  if (field === 'checklist_items') return actual.map(({ text, isChecked }) => ({ text, is_checked: isChecked }))
  if (field === 'scheduled_reminders') return actual.map(({ when, time }) => ({ when, time: clock(time) }))
  if (field === 'relative_reminders') return actual.map(({ minutesBefore, when, time }) => minutesBefore != null
    ? { minutes_before: minutesBefore } : { when, time: clock(time) })
  if (field === 'repeat_reminder') return { interval_minutes: actual.intervalMinutes,
    ...(actual.activeStart != null || actual.activeEnd != null ? { active_start: clock(actual.activeStart), active_end: clock(actual.activeEnd) } : {}),
    ...(proposedValue?.start_at_utc != null ? { start_at_utc: instant(actual.startAtUtc) } : {}) }
  if (['tag_ids', 'goal_ids', 'tag_names'].includes(field)) return actual.map((item) => item[field === 'tag_names' ? 'name' : 'id']).sort()
  return actual
}

function matchesPersistedField(field, detail) {
  let expected = field.field === 'frequency_unit' && field.proposedValue === 'OneTime' ? null
    : field.field === 'frequency_quantity' && detail.frequencyUnit === null ? null : field.proposedValue
  if (['due_time', 'due_end_time'].includes(field.field)) expected = clock(expected)
  if (field.field === 'checklist_items' && Array.isArray(expected)) {
    expected = expected.map((item) => ({ ...item, is_checked: item.is_checked ?? false }))
  }
  if (['scheduled_reminders', 'relative_reminders'].includes(field.field) && Array.isArray(expected)) {
    expected = expected.map((reminder) => Object.hasOwn(reminder, 'time') ? { ...reminder, time: clock(reminder.time) } : reminder)
  }
  if (field.field === 'repeat_reminder' && expected != null) {
    expected = { ...expected, ...Object.fromEntries(Object.entries(expected)
      .filter(([key]) => ['active_start', 'active_end', 'start_at_utc'].includes(key))
      .map(([key, value]) => [key, key === 'start_at_utc' ? instant(value) : clock(value)])) }
  }
  const actual = persistedValue(field.field, detail, expected)
  return isDeepStrictEqual(actual, ['tag_ids', 'goal_ids', 'tag_names'].includes(field.field)
    && Array.isArray(expected) ? [...expected].sort() : expected)
}

export async function approveOfferTask(api, pending, vars, step) {
  if (pending.items.length !== 1 || pending.items[0].entityName !== step) throw new Error('Offered task differs from the selected step.')
  requireReadbackFields(pending.items[0].fields)
  if (!isDeepStrictEqual(await readOfferState(api), vars.offerBaseline)) throw new Error('Offer wrote before approval.')
  const path = `ai/pending-operations/${pending.id}`
  const { payload } = await api('POST', `${path}/confirm?clientContext=${encodeURIComponent(JSON.stringify(vars.clientContext))}`)
  if (payload?.pendingOperationId !== pending.id || typeof payload.confirmationToken !== 'string' || !payload.confirmationToken) throw new Error('Offer confirmation lacks its bound token.')
  await api('POST', `${path}/execute`, { confirmationToken: payload.confirmationToken, clientContext: vars.clientContext })
  const after = await readOfferState(api)
  const additions = after.habits.filter((habit) => !vars.offerBaseline.habits.some((original) => original.id === habit.id))
  if (additions.length !== 1 || additions[0].title !== step || additions[0].frequencyUnit !== null
    || !isDeepStrictEqual({ ...after, habits: after.habits.filter((habit) => habit.id !== additions[0].id) }, vars.offerBaseline)) {
    throw new Error('Approval duplicated the step or changed unrelated account fields.')
  }
  const { payload: detail } = await api('GET', `habits/${additions[0].id}`)
  if (detail?.id !== additions[0].id) throw new Error('Offer detail readback identity mismatch.')
  for (const field of pending.items[0].fields) {
    if (!matchesPersistedField(field, detail)) throw new Error('Approved field differs from independent persisted readback.')
  }
  return { approved: true, title: additions[0].title }
}
