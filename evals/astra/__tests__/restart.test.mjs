import { afterEach, expect, it, vi } from 'vitest'
import { restartProposal, restartReadback } from '../restart.mjs'
import { chatResponse, toolCall, preview } from './fixtures/producer.mjs'
import parseResponse from '../response.mjs'
import AstraHttpProvider from '../http-provider.mjs'
import { completeRestart } from '../restart-lifecycle.mjs'
import { fixtureFetch } from './fixtures/public-api.mjs'
import { readRestartSnapshot } from '../fixtures/restart.mjs'

const today = '2026-10-28'
const ids = Array.from({ length: 6 }, (_, index) => `11111111-1111-4111-8111-11111111111${index}`)
const baseline = ids.map((id, index) => ({ habit: { id, title: `Habit ${index}`, dueDate: index < 4 ? '2026-10-27' : today,
  frequencyUnit: 'Day', frequencyQuantity: 1, days: [], dueTime: '08:00:00', dueEndTime: '08:15:00',
  reminderEnabled: true, reminderTimes: [30], scheduledReminders: [], relativeReminders: [],
  checklistItems: [{ text: 'Prepare', isChecked: false }] }, logs: [{ date: '2026-10-23', value: 1, note: 'Keep', createdAtUtc: '2026-10-23T08:00:00Z' }] }))
const vars = { evalRequestId: 'restart', accountDate: today, restart: { decision: 'approve', todayCount: 2, windowDays: 7 }, restartBaseline: baseline }
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

function proposal() {
  const read = toolCall('query_habits', { date: 'today', is_completed: false, include_overdue: true }, 'Succeeded', 'read', { supportsParts: true })
  read.result.payload = { scope: 'today', items: ids.map((id, index) => ({ id, title: `Habit ${index}`, emoji: null, depth: 0, isBadHabit: false, status: index < 4 ? 'overdue' : 'today' })), totalCount: 6 }
  const dates = ids.map((habit_id, index) => ({ habit_id, updates: { due_date: index < 2 ? today : '2026-10-29' } }))
  const write = toolCall('bulk_reschedule_habits', { revised_items: dates, orbit_write_complete: true }, 'PendingConfirmation', 'write', { supportsParts: true })
  const pending = { ...preview(), actionKey: 'rescheduleHabits', displayName: 'bulk_reschedule_habits',
    items: dates.map(({ habit_id, updates }, index) => ({ itemId: habit_id, entityId: habit_id, entityName: `Habit ${index}`, stateFingerprint: 'state', removesData: null,
      fields: [{ entityId: habit_id, entityName: `Habit ${index}`, field: 'due_date', oldValue: baseline[index].habit.dueDate, newValue: updates.due_date, valueType: 'date', proposedValue: updates.due_date, isEditable: true }] })) }
  return parseResponse({ ...chatResponse('restart', [read, write]), aiMessage: '', parts: [], pendingOperations: [pending] }, '',
    { response: { status: 200, headers: { 'x-orbit-request-id': 'restart' } } })
}

it('accepts a complete held restart proposal grounded in the unfinished read', () => {
  const verdict = restartProposal(proposal(), vars)
  expect(verdict.pass, verdict.reason).toBe(true)
})

it.each([
  ['wrong read date', (output) => { output.trace.calls[0].arguments.date = null }],
  ['completed filter', (output) => { output.trace.calls[0].arguments.is_completed = true }],
  ['overdue excluded', (output) => { output.trace.calls[0].arguments.include_overdue = false }],
  ['unread page', (output) => { output.trace.calls[0].result.payload.totalCount = 7 }],
  ['write before read', (output) => { output.trace.calls.reverse() }],
  ['shared date', (output) => { output.trace.calls[1].arguments.due_date = today }],
  ['shared filter', (output) => { output.trace.calls[1].arguments.filter = {} }],
  ['missing unchanged item', (output) => { output.trace.calls[1].arguments.revised_items.pop() }],
  ['duplicate target', (output) => { output.trace.calls[1].arguments.revised_items[1] = output.trace.calls[1].arguments.revised_items[0] }],
  ['foreign target', (output) => { output.trace.calls[1].arguments.revised_items[0].habit_id = 'foreign' }],
  ['past date', (output) => { output.trace.calls[1].arguments.revised_items[0].updates.due_date = '2026-10-27' }],
  ['distant date', (output) => { output.trace.calls[1].arguments.revised_items[0].updates.due_date = '2026-11-30' }],
  ['changes beyond date', (output) => { output.trace.calls[1].arguments.revised_items[0].updates.title = 'Changed' }],
  ['preference ignored', (output) => { output.trace.calls[1].arguments.revised_items[2].updates.due_date = today }],
  ['preview missing', (output) => { output.composition.pendingOperations = [] }],
  ['preview incomplete', (output) => { output.composition.pendingOperations[0].items.pop() }],
  ['preview date differs', (output) => { output.composition.pendingOperations[0].items[0].fields[0].newValue = '2026-10-30' }],
  ['read block repeated', (output) => { output.composition.parts.push({ type: 'block', kind: 'habitList', block: {} }) }],
  ['extra write', (output) => { output.trace.calls.push({ ...output.trace.calls[1], id: 'extra' }) }],
])('rejects %s', (_, mutate) => {
  const output = proposal()
  mutate(output)
  expect(restartProposal(output, vars).pass).toBe(false)
})

it('requires all pages in order before the write', () => {
  const output = proposal()
  const first = output.trace.calls[0]
  const second = structuredClone(first)
  second.id = second.result.id = 'read-2'
  second.arguments.offset = 3
  second.result.payload.items = first.result.payload.items.splice(3)
  output.trace.calls.splice(1, 0, second)
  expect(restartProposal(output, vars).pass).toBe(true)
  second.arguments.offset = 2
  expect(restartProposal(output, vars).pass).toBe(false)
})

it.each(['preview', 'approve', 'reject'])('requires independent persisted evidence for %s', (decision) => {
  const output = proposal()
  const policy = { ...vars, restart: { ...vars.restart, decision } }
  expect(restartReadback(output, policy).pass).toBe(false)
  const after = structuredClone(baseline)
  if (decision === 'approve') after.forEach((entry, index) => { entry.habit.dueDate = index < 2 ? today : '2026-10-29' })
  output.restartReadback = { held: structuredClone(baseline), after }
  expect(restartReadback(output, policy).pass).toBe(true)
  for (const field of ['title', 'frequencyUnit', 'frequencyQuantity', 'days', 'dueTime', 'dueEndTime', 'reminderEnabled', 'reminderTimes', 'scheduledReminders', 'relativeReminders', 'checklistItems']) {
    const broken = structuredClone(output)
    broken.restartReadback.after[0].habit[field] = null
    expect(restartReadback(broken, policy).pass, field).toBe(false)
  }
  output.restartReadback.after[0].logs = []
  expect(restartReadback(output, policy).pass).toBe(false)
})

it('connects the restart graders to the production behavior assertion', async () => {
  const { behavior } = await import('../assertions.mjs')
  const output = proposal()
  const context = { vars: { ...vars, expectations: { required: [{ name: 'query_habits' }, { name: 'bulk_reschedule_habits' }] } } }
  expect(behavior(output, context).pass).toBe(false)
  output.restartReadback = { held: structuredClone(baseline), after: structuredClone(baseline) }
  output.restartReadback.after.forEach((entry, index) => { entry.habit.dueDate = index < 2 ? today : '2026-10-29' })
  expect(behavior(output, context).pass).toBe(true)
  output.trace.calls[0].arguments.include_overdue = false
  expect(behavior(output, context).pass).toBe(false)
})

function boundary(decision, failure) {
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'pro-access')
  const habits = baseline.map(({ habit, logs }) => ({ ...structuredClone(habit), logs: structuredClone(logs),
    description: null, intervalWeeks: null, slipAlertEnabled: false, isBadHabit: false, isGeneral: false,
    isFlexible: false, endDate: null, emoji: null }))
  const requests = []
  const fixture = fixtureFetch(() => ({ habits, goals: [], tags: [], templates: [], requests }))
  let cancelled = false
  vi.stubGlobal('fetch', async (url, options) => {
    const path = new URL(url).pathname
    if (!path.startsWith('/api/ai/')) return fixture(url, options)
    requests.push({ path, body: options.body ? JSON.parse(options.body) : undefined })
    if (failure === 'transport') return Response.json({}, { status: 503 })
    if (path.endsWith('/confirm')) {
      if (cancelled) return Response.json({ error: 'Pending operation not found.' }, { status: 404 })
      return Response.json({ pendingOperationId: preview().id, confirmationToken: 'private-confirmation-token', expiresAtUtc: '2026-10-28T20:00:00Z' })
    }
    if (path.endsWith('/execute')) {
      if (failure !== 'ignored') habits.forEach((habit, index) => { habit.dueDate = index < 2 ? today : '2026-10-29' })
      if (failure === 'lost-reminder') habits[0].reminderTimes = []
      return Response.json({ operation: {}, pendingOperation: null, policyDenial: null })
    }
    if (path.endsWith('/revise')) {
      cancelled = failure !== 'ignored'
      return Response.json({ isSuccess: true, error: null, pendingOperationId: null, preview: null, cancelled })
    }
    throw new Error('Unexpected approval route.')
  })
  return { habits, requests, policy: { ...structuredClone(vars), credentialKey: 'ORBIT_EVAL_TOKEN',
    restart: { ...vars.restart, decision }, clientContext: { supportsParts: true, partKinds: [] },
    composition: { mode: 'preview' }, expectations: { required: [{ name: 'query_habits' }, { name: 'bulk_reschedule_habits' }] } } }
}

it.each(['preview', 'approve', 'reject'])('runs %s through the HTTP provider and independent reads', async (decision) => {
  const { requests, policy } = boundary(decision)
  const { publicApi } = await import('../fixtures/api.mjs')
  policy.restartBaseline = await readRestartSnapshot(publicApi(policy.credentialKey))
  requests.length = 0
  const provider = new AstraHttpProvider({ config: {} })
  provider.provider = Promise.resolve({ callApi: async () => ({ output: proposal() }) })
  const response = await provider.callApi('Help me restart', { vars: policy })
  expect(response.error).toBeUndefined()
  expect(restartReadback(response.output, policy).pass).toBe(true)
  expect(requests.filter(({ method, path }) => method === 'GET' && /^habits\/[^/]+$/.test(path))).toHaveLength(12)
  const writes = requests.filter(({ path }) => path.startsWith('/api/ai/'))
  expect(writes.map(({ path }) => path.split('/').at(-1))).toEqual(decision === 'approve' ? ['confirm', 'execute'] : decision === 'reject' ? ['revise', 'confirm'] : [])
  if (decision === 'approve') expect(writes[1].body).toEqual({ confirmationToken: 'private-confirmation-token', clientContext: policy.clientContext })
  if (decision === 'reject') expect(writes[0].body.items).toEqual([])
  expect(JSON.stringify(response)).not.toContain('private-confirmation-token')
})

it.each(['ignored', 'lost-reminder'])('fails persisted approval grading after a %s write', async (failure) => {
  const { policy } = boundary('approve', failure)
  const { publicApi } = await import('../fixtures/api.mjs')
  policy.restartBaseline = await readRestartSnapshot(publicApi(policy.credentialKey))
  const output = await completeRestart(proposal(), policy)
  expect(restartReadback(output, policy).pass).toBe(false)
})

it('refuses a rejection that leaves the proposal confirmable', async () => {
  const { policy } = boundary('reject', 'ignored')
  const { publicApi } = await import('../fixtures/api.mjs')
  policy.restartBaseline = await readRestartSnapshot(publicApi(policy.credentialKey))
  await expect(completeRestart(proposal(), policy)).rejects.toThrow('remains confirmable')
})

it('prevents approval when the held preview already changed persisted habits', async () => {
  const { policy, habits, requests } = boundary('approve')
  const { publicApi } = await import('../fixtures/api.mjs')
  policy.restartBaseline = await readRestartSnapshot(publicApi(policy.credentialKey))
  habits[0].title = 'Changed before approval'
  const output = await completeRestart(proposal(), policy)
  expect(restartReadback(output, policy).pass).toBe(false)
  expect(requests.some(({ path }) => path.startsWith('/api/ai/'))).toBe(false)
})

it('never approves malformed tool evidence', async () => {
  const { policy, requests } = boundary('approve')
  const output = proposal()
  output.trace.responseRequestId = 'other-request'
  await completeRestart(output, policy)
  expect(requests).toHaveLength(0)
})
