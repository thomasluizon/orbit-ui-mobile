import { expect, it } from 'vitest'
import { proactiveOffers } from '../proactive-offers.mjs'
import { preview } from './fixtures/producer.mjs'

const owned = '22222222-2222-4222-8222-222222222222'
const unknown = '33333333-3333-4333-8333-333333333333'
const reminderFields = ['reminder_enabled', 'reminder_times', 'scheduled_reminders', 'relative_reminders', 'repeat_reminder']
const cases = [
  ['repeat', { frequency_quantity: [1, 'requested'], repeat_reminder: [{ interval_minutes: 120 }, 'suggested'] },
    (fields) => { fields[1].proposedValue = {} }],
  ['fixed-medication', { scheduled_reminders: [[{ time: '08:00', when: 'same_day' }, { time: '20:00', when: 'same_day' }], 'requested'] },
    (fields) => { fields[0].proposedValue[1].time = '21:00' }],
  ['ordinary-reading', { title: ['Read a book', 'requested'] }, (fields) => { fields.push(field('repeat_reminder', { interval_minutes: 120 }, 'suggested')) }],
  ['unsupported-schedule', { frequency_unit: ['Week', 'requested'] }, (fields) => { fields.push(field('repeat_reminder', { interval_minutes: 120 }, 'suggested')) }],
  ['dated-reminder', { due_date: ['2031-06-12', 'requested'], reminder_enabled: [true, 'suggested'] }, (fields) => { fields.pop() }],
  ['parent', { parent_habit_id: [owned, 'suggested'] }, (fields) => { fields[0].proposedValue = unknown }],
  ['root', { title: ['Journal', 'requested'] }, (fields) => { fields.push(field('parent_habit_id', owned, 'suggested')) }],
  ['goal-link', { goal_ids: [[owned], 'suggested'] }, (fields) => { fields[0].proposedValue = [unknown] }],
  ['metadata', { emoji: ['🎨', 'suggested'], tag_names: [['Art'], 'suggested'] }, (fields) => { fields.splice(0) }],
  ['bounded', { start_date: ['2031-06-11', 'requested'], end_date: ['2031-06-17', 'requested'] }, (fields) => { fields[1].proposedValue = '2031-06-16' }],
]

function field(name, value, provenance) {
  const base = preview().items[0].fields[0]
  return { ...base, field: name, proposedValue: value, provenance,
    ...(provenance === 'suggested' ? { removal: { offerKey: `preview:${name}`, field: name, fields: [name] } } : {}) }
}

it.each(cases)('accepts the typed %s proposal and rejects a deliberately wrong field', (family, supplied, breakField) => {
  const pending = preview('Draft')
  pending.items[0].fields = Object.entries(supplied).map(([name, [value, provenance]]) => field(name, value, provenance))
  const suggestedReminders = pending.items[0].fields.filter((entry) => entry.provenance === 'suggested' && reminderFields.includes(entry.field))
  for (const entry of suggestedReminders) entry.removal.fields = suggestedReminders.map((entry) => entry.field)
  const output = { composition: { parts: [], pendingOperations: [pending] }, trace: { calls: [] } }
  const vars = { offerFamily: family, clientContext: { supportsProactiveOffers: true }, composition: { mode: 'preview' },
    offerStartDate: '2031-06-11', offerEndDate: '2031-06-17', fixtureEvidence: { habits: [{ id: owned }], goals: [{ id: owned }] } }
  expect(proactiveOffers(output, { vars }).pass).toBe(true)
  breakField(pending.items[0].fields)
  expect(proactiveOffers(output, { vars }).pass).toBe(false)
})

it.each(['emoji', 'tag_names'])('accepts a relevant removable %s suggestion without requiring both metadata kinds', (name) => {
  const pending = preview('Watercolor')
  pending.items[0].fields = [field(name, name === 'emoji' ? '🎨' : ['Art'], 'suggested')]
  const vars = { offerFamily: 'metadata', clientContext: { supportsProactiveOffers: true }, composition: { mode: 'preview' } }
  const output = { composition: { parts: [], pendingOperations: [pending] }, trace: { calls: [] } }
  expect(proactiveOffers(output, { vars }).pass).toBe(true)
  pending.items[0].fields = []
  expect(proactiveOffers(output, { vars }).pass).toBe(false)
})

it.each([undefined, null, '', '  ', false])('rejects a preview aim action without a typed requested aim: %s', (requestedAim) => {
  const pending = preview('Read a book')
  pending.nextAction = { offerKey: 'aim:account', kind: 'continueChat', label: 'Plan this goal',
    prompt: 'Suggest a goal for what is in this preview.' }
  const output = { composition: { parts: [], pendingOperations: [pending] }, trace: { calls: [] } }
  const vars = { offerFamily: 'ordinary-reading', requestedAim, input: 'Create Read a book daily.',
    clientContext: { supportsProactiveOffers: true }, composition: { mode: 'preview' } }
  expect(proactiveOffers(output, { vars }).pass).toBe(false)
  vars.requestedAim = 'Read twelve books'
  expect(proactiveOffers(output, { vars }).pass).toBe(true)
  delete pending.nextAction
  delete vars.requestedAim
  expect(proactiveOffers(output, { vars }).pass).toBe(true)
})
