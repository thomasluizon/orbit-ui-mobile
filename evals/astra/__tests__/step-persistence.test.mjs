import { afterEach, expect, it, vi } from 'vitest'
import * as grades from '../assertions.mjs'
import { chatResponse, preview, toolCall } from './fixtures/producer.mjs'

const habitId = '22222222-2222-4222-8222-222222222222'
const savedId = '33333333-3333-4333-8333-333333333333'
const step = 'Open the book'
// Producer: ExportedHabit, ChecklistItem and AiController.ConfirmPendingOperationResponse.
const original = { id: habitId, title: 'Water', description: null, emoji: null, isBadHabit: false, isGeneral: false,
  dueDate: '2026-10-28', endDate: null, frequencyUnit: 'Day', frequencyQuantity: 1, days: [],
  checklistItems: [{ text: 'Prepare water', isChecked: true }, { text: 'Fill glass', isChecked: false }],
  createdAtUtc: '2026-10-01T00:00:00Z', logs: [], intervalWeeks: null }
function saveAttempt(action = 'saveTask') {
  const checklist = [...original.checklistItems, { text: step, isChecked: false }]
  const name = action === 'saveTask' ? 'create_habit' : 'update_checklist'
  const arguments_ = action === 'saveTask' ? { title: step, frequency_unit: 'OneTime' }
    : { habit_id: habitId, checklist_items: checklist.map(({ text, isChecked }) => ({ text, is_checked: isChecked })) }
  const pending = preview(action === 'saveTask' ? step : original.title)
  pending.displayName = name
  pending.items[0].entityId = action === 'saveTask' ? null : habitId
  pending.items[0].fields = action === 'saveTask' ? pending.items[0].fields.filter((field) => field.field === 'frequency_unit')
    : [{ ...pending.items[0].fields[0], field: 'checklist_items', proposedValue: arguments_.checklist_items,
      valueType: 'array', newValue: JSON.stringify(arguments_.checklist_items) }]
  const { status, ...call } = toolCall(name, arguments_, 'PendingConfirmation', 'call-1', { supportsParts: true })
  const composition = { ...chatResponse('request'), aiMessage: null, parts: [], pendingOperations: [pending] }
  const vars = { evalRequestId: 'request', startingStepAction: action,
    previousStartingStep: { goal: 'Study', step, language: 'en' }, startingHabitBaseline: [structuredClone(original)],
    checklistHabitId: habitId, clientContext: { supportsParts: true, partKinds: [], locale: 'en' }, composition: { mode: 'preview' },
    credentialKey: 'ORBIT_EVAL_TOKEN', expectations: { required: [{ name, arguments: arguments_ }], allowed: [name], counts: { [name]: 1 } } }
  const output = { httpStatus: 200, composition, trace: { state: 'available', requestId: 'request', responseRequestId: 'request',
    calls: [{ ...call, resultStatus: status }] } }
  return { output, context: { vars, test: { vars } }, checklist }
}
function approvalServer(action, mutate = () => {}, beforeMutate = () => {}) {
  let executed = false
  const requests = []
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
  vi.stubGlobal('fetch', async (url, options) => {
    const path = new URL(url).pathname
    requests.push(`${options.method} ${path}`)
    expect(options.headers.Authorization).toBe('Bearer offline-token')
    if (path === '/api/profile/export') {
      const habits = [structuredClone(original)]
      if (executed) {
        if (action === 'saveTask') habits.push({ ...structuredClone(original), id: savedId, title: step,
          frequencyUnit: null, frequencyQuantity: null, checklistItems: [] })
        else habits[0].checklistItems.push({ text: step, isChecked: false })
        mutate(habits)
      } else beforeMutate(habits)
      return Response.json({ habits })
    }
    if (path.endsWith('/confirm')) {
      expect(JSON.parse(new URL(url).searchParams.get('clientContext')).locale).toBe('en')
      return Response.json({ pendingOperationId: preview().id, confirmationToken: 'private-confirmation', expiresAtUtc: '2026-10-28T20:00:00Z' })
    }
    expect(path).toBe(`/api/ai/pending-operations/${preview().id}/execute`)
    expect(JSON.parse(options.body)).toEqual({ confirmationToken: 'private-confirmation',
      clientContext: { supportsParts: true, partKinds: [], locale: 'en' } })
    executed = true
    // Execution JSON is deliberately unusable: persisted proof comes from the export.
    return Response.json({})
  })
  return requests
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it.each(['saveTask', 'saveChecklistItem'])('approves %s only after a held preview and reads persistence independently', async (action) => {
  const { output, context } = saveAttempt(action)
  const requests = approvalServer(action)
  const grade = await grades.savedStep(output, context)
  expect(grade.pass, grade.reason).toBe(true)
  expect(requests).toEqual(['GET /api/profile/export', `POST /api/ai/pending-operations/${preview().id}/confirm`,
    `POST /api/ai/pending-operations/${preview().id}/execute`, 'GET /api/profile/export'])
  expect(grade.metadata.savedStep).toMatchObject({ approved: true, unchangedBeforeApproval: true, title: action === 'saveTask' ? step : original.title })
  expect(JSON.stringify(grade)).not.toContain('private-confirmation')
})

it.each([
  ['saveTask', (habits) => { habits.pop() }],
  ['saveTask', (habits) => { habits[1].title = 'Wrong title' }],
  ['saveTask', (habits) => { habits[1].frequencyUnit = 'Day' }],
  ['saveTask', (habits) => { habits.push({ ...habits[1], id: 'extra' }) }],
  ['saveTask', (habits) => { habits[0].title = 'Unrequested change' }],
  ['saveChecklistItem', (habits) => { habits[0].checklistItems.shift() }],
  ['saveChecklistItem', (habits) => { habits[0].checklistItems[0].isChecked = false }],
  ['saveChecklistItem', (habits) => { habits[0].checklistItems.reverse() }],
])('fails independent persistence readback for %s %#', async (action, mutate) => {
  const { output, context } = saveAttempt(action)
  approvalServer(action, mutate)
  expect((await grades.savedStep(output, context)).pass).toBe(false)
})

it.each(['saveTask', 'saveChecklistItem'])('rejects %s if the proposal already changed persisted habits', async (action) => {
  const { output, context } = saveAttempt(action)
  const requests = approvalServer(action, undefined, (habits) => { habits[0].title = 'Changed before approval' })
  expect((await grades.savedStep(output, context)).pass).toBe(false)
  expect(requests).toEqual(['GET /api/profile/export'])
})

it.each([
  (output) => { output.trace.responseRequestId = 'another-request' },
  (output) => { output.trace.calls[0].resultStatus = 'Succeeded' },
  (output) => { output.composition.pendingOperations = [] },
  (output) => { output.composition.pendingOperations.push(preview()) },
])('never approves a failed tool or composition gate %#', async (mutate) => {
  const { output, context } = saveAttempt()
  mutate(output)
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  expect((await grades.savedStep(output, context)).pass).toBe(false)
  expect(fetch).not.toHaveBeenCalled()
})

it('does not claim persistence for unrelated cases', async () => {
  expect((await grades.savedStep({}, { vars: {} })).pass).toBe(true)
})

it.each([
  (pending) => { pending.items[0].entityName = 'Wrong task' },
  (pending) => { pending.items[0].fields[0].proposedValue = 'Day' },
])('rejects a task preview that does not match the requested step %#', async (mutate) => {
  const { output, context } = saveAttempt()
  mutate(output.composition.pendingOperations[0])
  const requests = approvalServer('saveTask')
  expect((await grades.savedStep(output, context)).pass).toBe(false)
  expect(requests).toEqual([])
})
