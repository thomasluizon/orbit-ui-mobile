import { afterEach, expect, it, vi } from 'vitest'
import { approveBrainDump } from '../brain-dump-approval.mjs'
import { brainDumpPreview } from '../brain-dumps.mjs'
import { brainDumpAttempt, brainDumpCases, existingId } from './fixtures/brain-dump.mjs'
import { fixtureFetch } from './fixtures/public-api.mjs'
import { offlineCredentials } from './fixtures/credentials.mjs'
import { beforeEach as prepareAttempt } from '../hooks.mjs'
import AstraHttpProvider from '../http-provider.mjs'
import { parse, stringify } from 'yaml'
import { readFileSync } from 'node:fs'

const configuration = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

// Producer: API ExportedHabit, HabitDetailResponse and AiController confirmation and execution routes.
function approvalApi(source, failure) {
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'pro-access')
  const attempt = brainDumpAttempt(source)
  const habits = [{ id: existingId, title: source.metadata.locale === 'pt-BR' ? 'Beber água' : 'Water',
    description: null, emoji: null, isBadHabit: false, isGeneral: false, dueDate: attempt.test.vars.accountDate,
    endDate: null, frequencyUnit: 'Day', frequencyQuantity: 1, days: [], checklistItems: [],
    createdAtUtc: '2026-10-01T00:00:00Z', logs: [], intervalWeeks: null }]
  const baseline = structuredClone(habits)
  let approved = false
  let pendingCount = 1
  const requests = []
  const fetch = vi.fn(async (url, options) => {
    const request = new Request(url, options)
    const path = new URL(url).pathname.slice(5)
    const method = request.method
    requests.push({ path, method })
    if (path === 'chat') return Response.json(attempt.response, { headers: { 'x-orbit-request-id': attempt.test.vars.evalRequestId } })
    if (path === 'profile/export') {
      if (!approved && failure === 'early-write') habits[0].title = 'Changed before approval'
      return Response.json({ habits })
    }
    if (path === 'eval/pending-operations') {
      if (method === 'DELETE') { const cancelledCount = pendingCount; pendingCount = 0; return Response.json({ cancelledCount }) }
      return Response.json({ pendingCount: failure === 'extra-pending' && !approved ? 2 : pendingCount })
    }
    if (path.endsWith('/confirm')) return Response.json(failure === 'missing-token' ? {} : {
      pendingOperationId: attempt.output.composition.pendingOperations[0].id,
      confirmationToken: 'private-approval-token', expiresAtUtc: '2026-10-28T20:00:00Z',
    })
    if (path.endsWith('/execute')) {
      expect(await request.json()).toEqual({ confirmationToken: 'private-approval-token', clientContext: attempt.test.vars.clientContext })
      approved = true
      pendingCount = failure === 'still-pending' ? 1 : 0
      if (failure !== 'no-write') {
        for (const habit of attempt.output.trace.calls.find((call) => call.name === 'bulk_create_habits').arguments.habits) {
          if (habit.habit_id && failure !== 'duplicate') continue
          habits.push({ ...baseline[0], id: `00000000-0000-4000-8000-${String(habits.length).padStart(12, '0')}`, title: habit.title,
            frequencyUnit: habit.frequency_unit === 'OneTime' ? null : habit.frequency_unit,
            frequencyQuantity: habit.frequency_unit === 'OneTime' ? null : habit.frequency_quantity,
            dueDate: failure === 'wrong-date' ? '2026-12-01' : habit.due_date,
            days: habit.days ?? [], intervalWeeks: habit.interval_weeks ?? null })
        }
      }
      return Response.json({})
    }
    if (path.startsWith('habits/')) {
      const row = habits.find((habit) => habit.id === path.split('/')[1])
      const proposed = attempt.output.trace.calls.find((call) => call.name === 'bulk_create_habits').arguments.habits.find((habit) => habit.title === row.title)
      return Response.json({ schedule: approved && failure === 'wrong-schedule' ? 'General' : row.frequencyUnit === null ? 'OneTime' : 'Recurring',
        dueTime: (approved && failure === 'wrong-time') || (!approved && failure === 'early-time-write')
          ? '23:00:00' : proposed?.due_time ?? null, dueEndTime: proposed?.due_end_time ?? null })
    }
    throw new Error(`Unexpected approval request: ${method} ${path}`)
  })
  vi.stubGlobal('fetch', fetch)
  return { ...attempt, baseline: { habits: baseline, details: baseline.map((habit) => [habit.id,
    { schedule: 'Recurring', dueTime: null, dueEndTime: null }]) }, habits, requests, fetch }
}

it.each(brainDumpCases)('approves and independently reads every schedule for $metadata.id', async (source) => {
  const { test, output, baseline, requests } = approvalApi(source)
  const verdict = await approveBrainDump(output, test.vars, baseline, brainDumpPreview(output, test.vars))
  expect(verdict.pass, verdict.reason).toBe(true)
  expect(verdict.beforeApprovalUnchanged).toBe(true)
  expect(verdict.persistedItems).toHaveLength(test.vars.brainDump.items.length + (test.vars.brainDump.additionalIdeas ?? 0))
  expect(verdict.persistedItems.map((item) => item.schedule)).toContain('OneTime')
  expect(verdict.persistedItems.map((item) => item.schedule)).toContain('Recurring')
  expect(requests.slice(-2)).toEqual([{ path: 'eval/pending-operations', method: 'DELETE' }, { path: 'eval/pending-operations', method: 'GET' }])
})

it.each(['early-write', 'early-time-write', 'extra-pending', 'missing-token', 'no-write', 'wrong-date', 'wrong-schedule', 'wrong-time', 'still-pending', 'duplicate'])(
  'fails approval readback for %s and clears pending state', async (failure) => {
    const source = brainDumpCases.find((entry) => entry.metadata.family === 'brain-dump-reuse')
    const { test, output, baseline, requests } = approvalApi(source, failure)
    const verdict = await approveBrainDump(output, test.vars, baseline, brainDumpPreview(output, test.vars))
    expect(verdict.pass, verdict.reason).toBe(false)
    if (['early-write', 'early-time-write', 'extra-pending', 'missing-token'].includes(failure)) expect(requests.some(({ path }) => path.endsWith('/execute'))).toBe(false)
    expect(requests.slice(-2).map(({ method }) => method)).toEqual(['DELETE', 'GET'])
  },
)

it('never confirms an invalid preview', async () => {
  const { test, output, baseline, requests } = approvalApi(brainDumpCases[0])
  const verdict = await approveBrainDump(output, test.vars, baseline, { pass: false, score: 0, reason: 'Invalid preview.' })
  expect(verdict.pass).toBe(false)
  expect(requests.map(({ method }) => method)).toEqual(['DELETE', 'GET'])
})

it.each(['valid', 'wrong-schedule', 'invalid-preview', 'wrong-arguments'])(
  'runs the real HTTP provider with %s evidence', async (mode) => {
  const { test, requests, response } = approvalApi(brainDumpCases[0], mode)
  if (mode === 'invalid-preview') delete response.pendingOperations[0].items[0].habitType
  if (mode === 'wrong-arguments') response.evalTrace.toolCalls[0].arguments.habits[0].due_date = '2026-12-01'
  const config = structuredClone(configuration.providers[0].config)
  config.url = `${process.env.ORBIT_EVAL_BASE_URL}/api/chat`
  test.vars.clientContextJson = JSON.stringify(test.vars.clientContext)
  test.vars.historyJson = '[]'
  const provider = new AstraHttpProvider({ config })
  const received = await provider.callApi(test.vars.input, { vars: test.vars })
  expect(received.error).toBeUndefined()
  expect(received.output.brainDumpReadback.pass).toBe(mode === 'valid')
  if (['valid', 'wrong-schedule'].includes(mode)) {
    expect(requests.findIndex(({ path }) => path.endsWith('/confirm'))).toBeGreaterThan(requests.findIndex(({ path }) => path === 'chat'))
  } else expect(requests.some(({ path }) => path.endsWith('/confirm'))).toBe(false)
  expect(received.output.composition.pendingOperations).toEqual(response.pendingOperations)
})

it.each(brainDumpCases)('isolates each $metadata.id attempt before setup', async (source) => {
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'pro-access')
  const state = { habits: [], goals: [], tags: [], templates: [], requests: [], pro: true, exhausted: false,
    capacity: 100, email: 'thomaslrgregorio+orbit-eval-pro@gmail.com' }
  vi.stubGlobal('fetch', fixtureFetch(() => state))
  for (let repeat = 0; repeat < 3; repeat++) {
    state.requests.length = 0
    const { test } = await prepareAttempt({ test: parse(stringify(source)) })
    expect(test.vars.preconditionFailure).toBeUndefined()
    expect(test.vars.brainDump.items[0].due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const isolation = state.requests.filter(({ path }) => path === 'eval/pending-operations')
    expect(isolation.map(({ method }) => method)).toEqual(['DELETE', 'GET'])
    expect(state.requests.indexOf(isolation[1])).toBeLessThan(state.requests.findIndex(({ path }) => path === 'profile'))
  }
})
