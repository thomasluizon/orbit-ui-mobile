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
  slip_alert_enabled: 'slipAlertEnabled', interval_weeks: 'intervalWeeks' }

export async function approveOfferTask(api, pending, vars, step) {
  if (pending.items.length !== 1 || pending.items[0].entityName !== step) throw new Error('Offered task differs from the selected step.')
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
  for (const field of pending.items[0].fields) {
    const key = persistedFields[field.field]
    if (!key) throw new Error(`Offer approval lacks a verified readback mapping: ${field.field}`)
    const expected = field.field === 'frequency_unit' && field.proposedValue === 'OneTime' ? null
      : field.field === 'frequency_quantity' && detail.frequencyUnit === null ? null : field.proposedValue
    const actual = detail[key]
    const equal = ['due_time', 'due_end_time'].includes(field.field) && typeof expected === 'string'
      ? actual?.slice(0, 5) === expected.slice(0, 5) : isDeepStrictEqual(actual, expected)
    if (!equal) throw new Error('Approved field differs from independent persisted readback.')
  }
  return { approved: true, title: additions[0].title }
}
