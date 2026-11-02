import { expect, it } from 'vitest'
import { approveOfferTask } from '../offer-preview.mjs'
import { preview } from './fixtures/producer.mjs'

const title = 'Take one breath'
const savedId = '44444444-4444-4444-8444-444444444444'
const baseline = { habits: [], goals: [], tags: [], checklistTemplates: [] }

// Producer: PendingOperationChangePreviewer.CreationFields and AddCreationParent; HabitDetailResponse.
function task() {
  const pending = preview(title)
  Object.assign(pending.items[0], { habitType: 'Task', removesData: false, entityEmoji: '🌿' })
  pending.items[0].fields = Object.entries({ title, description: 'One short pause.', emoji: '🌿',
    frequency_unit: 'OneTime', frequency_quantity: 1, days: [], due_date: '2031-06-10', due_time: '08:00',
    is_general: false, is_bad_habit: false, is_flexible: false, reminder_enabled: false,
    reminder_times: [], scheduled_reminders: [], relative_reminders: [], slip_alert_enabled: false,
    parent_habit_id: null,
  }).map(([field, proposedValue]) => ({ ...pending.items[0].fields[0], field, proposedValue,
    valueType: typeof proposedValue === 'boolean' ? 'boolean' : typeof proposedValue === 'number' ? 'number'
      : field === 'emoji' ? 'emoji' : field.endsWith('_date') ? 'date' : field.endsWith('_time') ? 'time' : 'text',
    newValue: field === 'parent_habit_id' ? 'No parent' : typeof proposedValue === 'object' ? JSON.stringify(proposedValue) : String(proposedValue),
    entityEmoji: '🌿' }))
  const detail = { id: savedId, title, description: 'One short pause.', emoji: '🌿', frequencyUnit: null,
    frequencyQuantity: null, days: [], dueDate: '2031-06-10', dueTime: '08:00:00', isGeneral: false,
    isBadHabit: false, isFlexible: false, reminderEnabled: false, reminderTimes: [], scheduledReminders: [],
    relativeReminders: [], slipAlertEnabled: false, parentHabitId: null }
  return { pending, detail }
}

function lifecycle(detail) {
  const requests = []
  let executed = false
  const api = async (method, path) => {
    requests.push({ method, path })
    if (path.includes('/confirm')) return { payload: { pendingOperationId: '11111111-1111-4111-8111-111111111111', confirmationToken: 'offline-confirmation' } }
    if (path.endsWith('/execute')) { executed = true; return { status: 200 } }
    if (path.startsWith('habits/')) return { payload: detail }
    expect(path).toBe('profile/export')
    return { payload: { ...baseline, habits: executed ? [detail] : [] } }
  }
  return { api, requests }
}

const vars = { clientContext: { supportsParts: true }, offerBaseline: baseline }

it('approves a complete root-task preview and verifies the producer-added null parent', async () => {
  const { pending, detail } = task()
  const { api, requests } = lifecycle(detail)
  await expect(approveOfferTask(api, pending, vars, title)).resolves.toEqual({ approved: true, title })
  expect(requests.filter(({ method }) => method === 'POST')).toHaveLength(2)
  expect(requests.at(-1)).toEqual({ method: 'GET', path: `habits/${savedId}` })
})

it('rejects a wrong persisted parent after an otherwise successful approval', async () => {
  const { pending, detail } = task()
  detail.parentHabitId = '22222222-2222-4222-8222-222222222222'
  const { api, requests } = lifecycle(detail)
  await expect(approveOfferTask(api, pending, vars, title)).rejects.toThrow('Approved field differs')
  expect(requests.some(({ path }) => path.endsWith('/execute'))).toBe(true)
})

it.each(['unknown_field', 'constructor', 'toString', 'sub_habits', 'habit_id'])(
  'rejects an unsupported %s preview field before confirming or executing', async (field) => {
    const { pending, detail } = task()
    pending.items[0].fields = [{ ...pending.items[0].fields[0], field, proposedValue: [] }]
    const { api, requests } = lifecycle(detail)
    await expect(approveOfferTask(api, pending, vars, title)).rejects.toThrow(`readback mapping: ${field}`)
    expect(requests.some(({ method }) => method === 'POST')).toBe(false)
  },
)

it.each([
  ['start_date', '2031-06-10', 'startDate', '2031-06-10'],
  ['checklist_items', [{ text: 'Breathe', is_checked: false }], 'checklistItems', [{ text: 'Breathe', isChecked: false }]],
  ['checklist_items', [{ text: 'Breathe' }], 'checklistItems', [{ text: 'Breathe', isChecked: false }]],
  ['scheduled_reminders', [{ when: 'same_day', time: '08:00' }], 'scheduledReminders', [{ when: 'same_day', time: '08:00:00' }]],
  ['relative_reminders', [{ minutes_before: 30 }], 'relativeReminders', [{ minutesBefore: 30, when: null, time: null }]],
  ['relative_reminders', [{ when: 'day_before', time: '20:00' }], 'relativeReminders', [{ minutesBefore: null, when: 'day_before', time: '20:00:00' }]],
  ['repeat_reminder', { interval_minutes: 120, active_start: '08:00', active_end: '20:00' }, 'repeatReminder',
    { intervalMinutes: 120, activeStart: '08:00:00', activeEnd: '20:00:00', startAtUtc: '2031-06-10T07:00:00Z' }],
  ['repeat_reminder', { interval_minutes: 120, start_at_utc: '2031-06-10T07:00:00.0000000Z' }, 'repeatReminder',
    { intervalMinutes: 120, activeStart: null, activeEnd: null, startAtUtc: '2031-06-10T07:00:00Z' }],
  ['tag_ids', ['22222222-2222-4222-8222-222222222222'], 'tags', [{ id: '22222222-2222-4222-8222-222222222222', name: 'Health', color: '#22c55e' }]],
  ['tag_names', ['Health'], 'tags', [{ id: '22222222-2222-4222-8222-222222222222', name: 'Health', color: '#22c55e' }]],
  ['goal_ids', ['22222222-2222-4222-8222-222222222222'], 'linkedGoals', [{ id: '22222222-2222-4222-8222-222222222222', title: 'A calmer day' }]],
])('checks the producer %s representation independently, including a changed-value control', async (field, proposedValue, key, value) => {
  const { pending, detail } = task()
  pending.items[0].fields = [{ ...pending.items[0].fields[0], field, proposedValue }]
  detail[key] = value
  await expect(approveOfferTask(lifecycle(detail).api, pending, vars, title)).resolves.toMatchObject({ approved: true })
  detail[key] = null
  await expect(approveOfferTask(lifecycle(detail).api, pending, vars, title)).rejects.toThrow('Approved field differs')
})

it.each(['08:00', '08:00:00'])('accepts producer-supported time %s but rejects changed nonzero seconds', async (proposedValue) => {
  const { pending, detail } = task()
  pending.items[0].fields = [{ ...pending.items[0].fields[0], field: 'due_time', proposedValue }]
  await expect(approveOfferTask(lifecycle(detail).api, pending, vars, title)).resolves.toMatchObject({ approved: true })
  detail.dueTime = '08:00:15'
  await expect(approveOfferTask(lifecycle(detail).api, pending, vars, title)).rejects.toThrow('Approved field differs')
})

it.each(['repeat_reminder', 'scheduled_reminders'])('rejects unverified nested %s fields before approval', async (field) => {
  const { pending, detail } = task()
  const proposedValue = field === 'repeat_reminder' ? { interval_minutes: 120, unsupported: true }
    : [{ when: 'same_day', time: '08:00', unsupported: true }]
  pending.items[0].fields = [{ ...pending.items[0].fields[0], field, proposedValue }]
  const { api, requests } = lifecycle(detail)
  await expect(approveOfferTask(api, pending, vars, title)).rejects.toThrow('readback mapping')
  expect(requests.some(({ method }) => method === 'POST')).toBe(false)
})
