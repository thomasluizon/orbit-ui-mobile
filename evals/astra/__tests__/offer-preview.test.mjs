import { expect, it } from 'vitest'
import { preview } from './fixtures/producer.mjs'
import { preservesOfferFields, removeOfferGroup, rejectOfferPreview, approveOfferTask } from '../offer-preview.mjs'
import { proactiveOffers } from '../proactive-offers.mjs'

function proposal() {
  const pending = preview('Water')
  const item = pending.items[0]
  item.fields = [
    { ...item.fields[0], field: 'title', proposedValue: 'Water', provenance: 'requested' },
    { ...item.fields[0], field: 'emoji', proposedValue: '💧', provenance: 'stored' },
    ...['reminder_enabled', 'repeat_reminder'].map((field) => ({ ...item.fields[0], field,
      proposedValue: field === 'reminder_enabled' ? true : { interval_minutes: 120, active_start: '08:00', active_end: '20:00' },
      provenance: 'suggested', removal: { offerKey: `preview:${field}`, field, fields: ['reminder_enabled', 'repeat_reminder'] } })),
  ]
  return pending
}
const vars = { offerFamily: 'repeat', clientContext: { supportsProactiveOffers: true }, composition: { mode: 'preview' } }
const grade = (pending) => proactiveOffers({ composition: { parts: [], pendingOperations: [pending] }, trace: { calls: [] } }, { vars })

it('requires typed provenance and the complete reminder removal group', () => {
  expect(grade(proposal()).pass).toBe(true)
  for (const patch of [{ provenance: 'invented' }, { provenance: undefined }, { isEditable: false },
    { removal: null }, { removal: { offerKey: 'key', field: 'repeat_reminder', fields: ['repeat_reminder'] } },
    { removal: { offerKey: 'key', field: 'repeat_reminder', fields: ['title', 'repeat_reminder'] } }]) {
    const pending = proposal()
    Object.assign(pending.items[0].fields[3], patch)
    expect(grade(pending).pass).toBe(false)
  }
  for (const index of [0, 1]) {
    const pending = proposal()
    pending.items[0].fields[index].removal = { offerKey: 'wrong', field: pending.items[0].fields[index].field, fields: [] }
    expect(grade(pending).pass).toBe(false)
  }
})

it.each([false, true])('removes the offered group through the revision endpoint; wrong=%s', async (wrong) => {
  const pending = proposal()
  const api = async (method, path, body) => {
    expect(method).toBe('POST')
    expect(path).toBe(`ai/pending-operations/${pending.id}/revise`)
    expect(body.previewFingerprint).toBe(pending.previewFingerprint)
    expect(body.items[0].removeSuggestedFields).toEqual(['reminder_enabled'])
    const revised = structuredClone(pending)
    revised.items[0].fields = revised.items[0].fields.filter((field) => field.provenance !== 'suggested')
    if (wrong) revised.items[0].fields[0].proposedValue = 'Wrong title'
    return { payload: { isSuccess: true, error: null, pendingOperationId: pending.id,
      preview: { items: revised.items, changes: null, changeTargetCount: 1, previewFingerprint: 'revised' }, cancelled: false } }
  }
  if (wrong) await expect(removeOfferGroup(api, pending, vars.clientContext)).rejects.toThrow('requested field')
  else expect((await removeOfferGroup(api, pending, vars.clientContext)).removed)
    .toEqual(['exam:reminder_enabled', 'exam:repeat_reminder'])
})

it('preserves requested fields, stored values and sibling identities on removal', () => {
  const before = proposal()
  before.items.push({ ...structuredClone(before.items[0]), itemId: 'sibling' })
  const after = structuredClone(before)
  after.items[0].fields = after.items[0].fields.slice(0, 2)
  const removed = ['exam:reminder_enabled', 'exam:repeat_reminder']
  expect(preservesOfferFields(before, after, removed)).toBe(true)
  for (const index of [0, 1]) {
    const broken = structuredClone(after)
    broken.items[0].fields[index].proposedValue = 'wrong'
    expect(preservesOfferFields(before, broken, removed)).toBe(false)
  }
  after.items[1].itemId = 'wrong-sibling'
  expect(preservesOfferFields(before, after, removed)).toBe(false)
})

it('removes slash-separated child groups without changing siblings or their requested cadence', () => {
  const before = proposal()
  const item = before.items[0]
  item.fields = [
    { ...item.fields[0], field: 'sub_habits', proposedValue: [
      { title: 'Mobility', frequency_unit: 'Day', emoji: '🧘' }, { title: 'Read', frequency_unit: 'Day' },
    ] },
    { ...item.fields[1], field: 'sub_habits/0/emoji', proposedValue: '🧘', provenance: 'suggested',
      removal: { offerKey: 'preview:child:emoji', field: 'sub_habits/0/emoji', fields: ['sub_habits/0/emoji'] } },
  ]
  const after = structuredClone(before)
  after.items[0].fields.pop()
  delete after.items[0].fields[0].proposedValue[0].emoji
  expect(preservesOfferFields(before, after, ['exam:sub_habits/0/emoji'])).toBe(true)
  after.items[0].fields[0].proposedValue[1].title = 'Wrong sibling'
  expect(preservesOfferFields(before, after, ['exam:sub_habits/0/emoji'])).toBe(false)
})

it.each(['scalar', 'nested'])('rejects a retained %s suggestion through the removal lifecycle', async (shape) => {
  const pending = proposal()
  if (shape === 'nested') {
    pending.items[0].fields = [
      { ...pending.items[0].fields[0], field: 'sub_habits', proposedValue: [
        { title: 'Mobility', frequency_unit: 'Day', emoji: '🧘' }, { title: 'Read', frequency_unit: 'Day' },
      ] },
      { ...pending.items[0].fields[1], field: 'sub_habits/0/emoji', proposedValue: '🧘', provenance: 'suggested',
        removal: { offerKey: 'preview:child:emoji', field: 'sub_habits/0/emoji', fields: ['sub_habits/0/emoji'] } },
    ]
  }
  const api = async (_method, _path, body) => {
    expect(body.items[0].removeSuggestedFields).toEqual([shape === 'nested' ? 'sub_habits/0/emoji' : 'reminder_enabled'])
    const revised = structuredClone(pending)
    revised.items[0].fields = revised.items[0].fields.flatMap((field) => {
      if (field.provenance !== 'suggested') return [field]
      return shape === 'scalar' ? [{ ...field, provenance: 'requested', removal: null }] : []
    })
    return { payload: { isSuccess: true, error: null, pendingOperationId: pending.id,
      preview: { items: revised.items, changes: null, changeTargetCount: 1, previewFingerprint: 'revised' }, cancelled: false } }
  }
  await expect(removeOfferGroup(api, pending, vars.clientContext)).rejects.toThrow('removal')
})

it('accepts unannotated requested-only previews but never partially annotated provenance', () => {
  const pending = preview('Read a book')
  const policy = { ...vars, offerFamily: 'ordinary-reading' }
  const check = () => proactiveOffers({ composition: { parts: [], pendingOperations: [pending] }, trace: { calls: [] } }, { vars: policy })
  expect(check().pass).toBe(true)
  pending.items[0].fields[0].provenance = 'requested'
  expect(check().pass).toBe(false)
})

it.each(['cancel', 'confirmable', 'changed', 'valid'])('independently verifies rejection: %s', async (fault) => {
  const baseline = { habits: [], goals: [], tags: [], checklistTemplates: [] }
  const api = async (_method, path) => path.endsWith('/revise')
    ? { payload: { isSuccess: true, cancelled: fault !== 'cancel' } }
    : path.endsWith('/confirm') ? { status: fault === 'confirmable' ? 200 : 404 }
      : { payload: { ...baseline, habits: fault === 'changed' ? [{ id: 'unapproved' }] : [] } }
  const promise = rejectOfferPreview(api, proposal(), { clientContext: vars.clientContext, offerBaseline: baseline })
  if (fault === 'valid') await expect(promise).resolves.toBeUndefined()
  else await expect(promise).rejects.toThrow()
})

it.each(['token', 'extra-write', 'wrong-field', 'valid'])('reads approved fields independently: %s', async (fault) => {
  const pending = preview('Take one breath')
  pending.items[0].fields = [{ ...pending.items[0].fields[1], field: 'title', proposedValue: 'Take one breath' }, pending.items[0].fields[1]]
  const baseline = { habits: [], goals: [], tags: [], checklistTemplates: [] }
  let executed = false
  const api = async (_method, path) => {
    if (path.includes('/confirm')) return { payload: { pendingOperationId: pending.id, confirmationToken: fault === 'token' ? null : 'private-confirmation' } }
    if (path.endsWith('/execute')) { executed = true; return { status: 200 } }
    if (path.startsWith('habits/')) return { payload: { id: 'saved', title: fault === 'wrong-field' ? 'Wrong' : 'Take one breath', frequencyUnit: null } }
    return { payload: { ...baseline, habits: executed ? [{ id: 'saved', title: 'Take one breath', frequencyUnit: null },
      ...(fault === 'extra-write' ? [{ id: 'unapproved', title: 'Extra' }] : [])] : [] } }
  }
  const promise = approveOfferTask(api, pending, { clientContext: vars.clientContext, offerBaseline: baseline }, 'Take one breath')
  if (fault === 'valid') await expect(promise).resolves.toMatchObject({ approved: true })
  else await expect(promise).rejects.toThrow()
})
