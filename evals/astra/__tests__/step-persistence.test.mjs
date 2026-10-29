import { afterEach, expect, it, vi } from 'vitest'
import * as grades from '../assertions.mjs'
import { offlineCredentials } from './fixtures/credentials.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import { chatResponse, preview, toolCall } from './fixtures/producer.mjs'
import AstraHttpProvider from '../http-provider.mjs'
import { publicApi } from '../fixtures/api.mjs'
import { clearPendingOperations } from '../fixtures/reset.mjs'
import { parse } from 'yaml'

const configuration = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))

async function providerAttempt(context) {
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
  const config = structuredClone(configuration.providers[0].config)
  config.url = `${process.env.ORBIT_EVAL_BASE_URL}/api/chat`
  context.vars.clientContextJson = JSON.stringify(context.vars.clientContext)
  context.vars.historyJson = '[]'
  return new AstraHttpProvider({ config }).callApi('Save this step', context)
}

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
function approvalServer(output, action = 'saveTask', mutate = () => {}, beforeMutate = () => {}) {
  let executed = false
  let pending = true
  const requests = []
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_TOKEN', '')
  vi.stubGlobal('fetch', async (url, options) => {
    const path = new URL(url).pathname
    if (path === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
    if (path === '/api/auth/refresh') return Response.json({ token: 'offline-token', refreshToken: 'rotated-refresh' })
    requests.push(`${options.method} ${path}`)
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer offline-token')
    if (path === '/api/chat') {
      const calls = output.trace.calls.map(({ resultStatus, ...call }) => ({ ...call, status: resultStatus }))
      return Response.json({ ...output.composition, evalTrace: chatResponse(output.trace.requestId, calls).evalTrace },
        { headers: { 'x-orbit-request-id': output.trace.responseRequestId } })
    }
    if (path === '/api/eval/pending-operations') {
      const count = pending ? 1 : 0
      if (options.method === 'DELETE') pending = false
      return Response.json(options.method === 'DELETE' ? { cancelledCount: count } : { pendingCount: count })
    }
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
      if (!pending) return Response.json({ errorCode: 'PENDING_OPERATION_NOT_FOUND' }, { status: 404 })
      expect(JSON.parse(new URL(url).searchParams.get('clientContext')).locale).toBe('en')
      return Response.json({ pendingOperationId: preview().id, confirmationToken: 'private-confirmation', expiresAtUtc: '2026-10-28T20:00:00Z' })
    }
    expect(path).toBe(`/api/ai/pending-operations/${preview().id}/execute`)
    if (!pending) return Response.json({ errorCode: 'PENDING_OPERATION_NOT_FOUND' }, { status: 404 })
    expect(JSON.parse(options.body)).toEqual({ confirmationToken: 'private-confirmation',
      clientContext: { supportsParts: true, partKinds: [], locale: 'en' } })
    executed = true
    pending = false
    // Execution JSON is deliberately unusable: persisted proof comes from the export.
    return Response.json({})
  })
  return requests
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it.each(['saveTask', 'saveChecklistItem'])('finishes %s approval and readback before returning to the next fixture reset', async (action) => {
  const { output, context } = saveAttempt(action)
  const requests = approvalServer(output, action)
  const received = await providerAttempt(context)
  expect(received.error).toBeUndefined()
  expect(received.output?.composition).toBeDefined()
  requests.push('provider returned')
  await clearPendingOperations(publicApi(context.vars.credentialKey))
  const afterReset = [...requests]
  const grade = await grades.savedStep(JSON.stringify(received.output), context)
  expect(grade.pass, grade.reason).toBe(true)
  expect(received.output.savedStepReadback).toEqual(grade)
  expect(requests).toEqual(afterReset)
  expect(requests).toEqual(['POST /api/chat', 'GET /api/profile/export',
    `POST /api/ai/pending-operations/${preview().id}/confirm`,
    `POST /api/ai/pending-operations/${preview().id}/execute`, 'GET /api/profile/export', 'provider returned',
    'DELETE /api/eval/pending-operations', 'GET /api/eval/pending-operations'])
})

it.each(['saveTask', 'saveChecklistItem'])('fails closed without stored %s readback and makes no assertion-time requests', async (action) => {
  const { output, context } = saveAttempt(action)
  const requests = approvalServer(output, action)
  const grade = await grades.savedStep(output, context)
  expect(grade.pass).toBe(false)
  expect(grade.reason).toBe('Missing saved-step approval readback.')
  expect(requests).toEqual([])
})

it.each(['saveTask', 'saveChecklistItem'])('approves %s only after a held preview and reads persistence independently', async (action) => {
  const { output, context } = saveAttempt(action)
  const requests = approvalServer(output, action)
  const received = await providerAttempt(context)
  const grade = await grades.savedStep(received.output, context)
  expect(grade.pass, grade.reason).toBe(true)
  expect(requests).toEqual(['POST /api/chat', 'GET /api/profile/export', `POST /api/ai/pending-operations/${preview().id}/confirm`,
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
  approvalServer(output, action, mutate)
  const received = await providerAttempt(context)
  expect((await grades.savedStep(received.output, context)).pass).toBe(false)
  expect(received.output.savedStepReadback.reason).toContain('Independent saved-step readback')
})

it.each(['saveTask', 'saveChecklistItem'])('rejects %s if the proposal already changed persisted habits', async (action) => {
  const { output, context } = saveAttempt(action)
  const requests = approvalServer(output, action, undefined, (habits) => { habits[0].title = 'Changed before approval' })
  const received = await providerAttempt(context)
  expect((await grades.savedStep(received.output, context)).pass).toBe(false)
  expect(received.output.savedStepReadback.reason).toBe('Habits changed before approval.')
  expect(requests).toEqual(['POST /api/chat', 'GET /api/profile/export'])
})

it.each([
  (output) => { output.trace.responseRequestId = 'another-request' },
  (output) => { output.trace.calls[0].resultStatus = 'Succeeded' },
  (output) => { output.composition.pendingOperations = [] },
  (output) => { output.composition.pendingOperations.push(preview()) },
])('never approves a failed tool or composition gate %#', async (mutate) => {
  const { output, context } = saveAttempt()
  mutate(output)
  const requests = approvalServer(output)
  const received = await providerAttempt(context)
  const grade = await grades.savedStep(received.output, context)
  expect(grade.pass).toBe(false)
  expect(grade.reason).toMatch(/Saved-step approval blocked:|Missing saved-step approval readback/)
  expect(requests).toEqual(['POST /api/chat'])
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
  const requests = approvalServer(output)
  const received = await providerAttempt(context)
  expect((await grades.savedStep(received.output, context)).pass).toBe(false)
  expect(received.output.savedStepReadback.reason).toBe('The held preview does not match the requested saved step.')
  expect(requests).toEqual(['POST /api/chat'])
})

it.each(['saveTask', 'saveChecklistItem'])('refreshes %s approval credentials and rotates only the live file', async (action) => {
  const { output, context } = saveAttempt(action)
  approvalServer(output, action)
  const livePath = process.env.ORBIT_EVAL_CREDENTIALS_FILE
  const backupPath = `${livePath}.backup`
  const before = readFileSync(livePath, 'utf8')
  writeFileSync(backupPath, before, { mode: 0o600 })
  const received = await providerAttempt(context)
  const grade = await grades.savedStep(received.output, context)
  expect(grade.pass, grade.reason).toBe(true)
  expect(JSON.parse(readFileSync(livePath, 'utf8')).ORBIT_EVAL_TOKEN.refreshToken).toBe('rotated-refresh')
  expect(readFileSync(backupPath, 'utf8')).toBe(before)
  expect(JSON.stringify(grade)).not.toContain('rotated-refresh')
  expect(JSON.stringify(grade)).not.toContain('offline-token')
})
