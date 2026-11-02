import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { structural, behavior } from '../assertions.mjs'
import parseResponse from '../response.mjs'
import { summarize } from '../report.mjs'
import { describeCase } from '../latency.mjs'
import { mergeReports } from '../merge-reports.mjs'
import { ATTEMPTS_PER_CASE } from '../attempts.mjs'
import { publicApi } from '../fixtures/api.mjs'
import { resetFixture } from '../fixtures/reset.mjs'
import { fixtureFetch } from './fixtures/public-api.mjs'
import { completeOfferAttempt } from '../offer-lifecycle.mjs'
import { configureOffers } from '../offer-context.mjs'
import { offerSafety } from '../proactive-offers.mjs'
import { chatResponse, habitAccountRead, toolCall, turnTiming } from './fixtures/producer.mjs'
import { offlineCredentials, refreshResponse } from './fixtures/credentials.mjs'

const recorded = JSON.parse(readFileSync(new URL('./fixtures/gate-thirteen.json', import.meta.url), 'utf8'))
const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'), { merge: true })
const clientContext = { supportsParts: true }
const context = { vars: { evalRequestId: 'request', clientContext }, test: { vars: {} } }
const decoded = (calls) => parseResponse(chatResponse('request', calls), '', {
  response: { status: 200, headers: { 'x-orbit-request-id': 'request' } },
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it.each(recorded.filter((row) => row.toolCalls.some((call) => call.name === 'ask')))(
  'validates both declarations that could have produced $caseId', async (row) => {
    const call = toolCall('ask', {}, 'Succeeded', 'ask', clientContext)
    call.arguments = row.toolCalls.find((entry) => entry.name === 'ask').arguments
    for (const offers of [false, true]) {
      const vars = { ...context.vars, clientContext: { ...clientContext, supportsProactiveOffers: offers } }
      if (offers) call.arguments = { ...call.arguments, orbit_dismissed_offer_keys: [] }
      const read = habitAccountRead(true)
      if (offers) read.arguments.orbit_dismissed_offer_keys = []
      const verdict = await structural(decoded([read, call]), { ...context, vars })
      expect(verdict.pass, verdict.reason).toBe(true)
    }
  },
)

it('names the selected pickList branch when its required items are missing', async () => {
  const call = toolCall('ask', {}, 'Succeeded', 'ask', clientContext)
  call.arguments = structuredClone(recorded.find((row) => row.caseId === 'composition-pickList-en').toolCalls[1].arguments)
  delete call.arguments.input.items
  const verdict = await structural(decoded([habitAccountRead(true), call]), context)
  expect(verdict.pass).toBe(false)
  expect(verdict.reason).toContain('pickList')
  expect(verdict.reason).toContain('items')
  expect(verdict.reason).not.toContain("property 'question'")
})

function outcomes(calls, expectations) {
  return behavior(decoded(calls), { vars: { ...context.vars, expectations } })
}

it('does not charge failed, non-dispatched creates against a held create scope', () => {
  const row = recorded.find((entry) => entry.caseId === 'offers-parent-en')
  const failed = row.toolCalls.map((call, index) => ({ ...toolCall(call.name, {}, 'Failed', `failed-${index}`),
    arguments: call.arguments, result: { ...toolCall(call.name, {}, 'Failed', `failed-${index}`).result, ...call.result } }))
  const held = toolCall('create_habit', { ...failed[0].arguments, suggested_fields: ['emoji'] }, 'PendingConfirmation', 'held')
  const expectations = { allowed: ['create_habit'], required: [{ name: 'create_habit' }], counts: { create_habit: 1 } }
  expect(outcomes([...failed, held], expectations).pass).toBe(true)
  expect(outcomes(failed, expectations)).toMatchObject({ pass: false,
    reason: 'Tool execution did not reach its expected outcome: create_habit' })
  expect(outcomes([held, { ...held, id: 'extra', result: { ...held.result, id: 'extra' } }], expectations).pass).toBe(false)
  const retargeted = structuredClone(held)
  retargeted.arguments.title = 'Unrequested habit'
  expect(outcomes([...failed, retargeted], expectations).pass).toBe(false)
})

it('records AI_UNAVAILABLE as incomplete evidence through the report boundary', () => {
  const row = recorded.find((entry) => entry.httpError)
  const testCase = structuredClone(corpus.find((entry) => entry.metadata.id === row.caseId))
  const descriptor = describeCase(testCase)
  expect(descriptor.readLatency).toBe(true)
  const response = parseResponse(row.httpError, '', { response: { status: 400,
    headers: { 'x-orbit-request-id': row.httpError.responseRequestId } } })
  const summary = summarize([{ success: false, response, error: response.error,
    testCase }], [descriptor])
  const completed = decoded([])
  completed.trace.timing = turnTiming()
  const passing = summarize(Array.from({ length: ATTEMPTS_PER_CASE }, () => ({ success: true,
    testCase: { ...testCase, vars: { ...testCase.vars, evalRequestId: 'request' } },
    response: { output: completed },
    gradingResult: { componentResults: [{ pass: true, assertion: { metric: 'composition' } }] },
  })), [descriptor])
  expect(passing.status).toBe('pass')
  const continuation = () => mergeReports([summary, passing], [descriptor])
  expect(continuation).not.toThrow()
  expect(continuation().cases[0]).toMatchObject({ allAttemptsPass: 'pass', sourceWindow: 2,
    superseded: [{ allAttemptsPass: 'incomplete', unavailable: 1 }] })
  expect(summary.cases[0]).toMatchObject({ allAttemptsPass: 'incomplete', unavailable: 1,
    latency: { status: 'incomplete', totalMedianMilliseconds: null, phaseMediansMilliseconds: null } })
})

it('retains route and typed code on a non-retryable preview conflict', async () => {
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline')
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://fixture.invalid')
  const request = vi.fn(async () => Response.json({ isSuccess: false, error: 'revision_conflict',
    pendingOperationId: null, preview: null, cancelled: false }, { status: 409 }))
  vi.stubGlobal('fetch', request)
  await expect(publicApi('ORBIT_EVAL_TOKEN')('POST', 'ai/pending-operations/11111111-1111-4111-8111-111111111111/revise', {}))
    .rejects.toThrow('Fixture API POST ai/pending-operations/{id}/revise failed: HTTP 409 (errorCode: none).')
  expect(request).toHaveBeenCalledTimes(1)
})

it('records the failing continuation before its structural verification', async () => {
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline')
  const state = { habits: [], goals: [], tags: [], checklistTemplates: [] }
  vi.stubGlobal('fetch', async (url) => new URL(url).pathname === '/health'
    ? Response.json({ status: 'Healthy' }) : new URL(url).pathname === '/api/auth/refresh'
      ? refreshResponse() : Response.json(state))
  const output = decoded([])
  output.composition = { aiMessage: 'Hello.', parts: [{ type: 'text', text: 'Hello.' }] }
  const vars = { ...context.vars, credentialKey: 'ORBIT_EVAL_TOKEN', offerFamily: 'dismissal',
    composition: { mode: 'text' }, expectations: { allowed: [] }, offerBaseline: state,
    issuedOffer: { action: { offerKey: 'smallStep:account:2031-06-10' } } }
  const call = toolCall('ask', {}, 'Succeeded', 'unread-ask', clientContext)
  const verdict = await completeOfferAttempt(output, vars, async (_input, next) => ({
    output: { ...decoded([call]), trace: { ...decoded([call]).trace,
      requestId: next.vars.evalRequestId, responseRequestId: next.vars.evalRequestId } },
  }))
  expect(verdict.pass).toBe(false)
  expect(verdict.reason).toContain('ask requires')
  expect(verdict.turns).toHaveLength(1)
  expect(verdict.turns[0].toolCalls[0].name).toBe('ask')
  expect(verdict.turns[0].assertions[0]).toMatchObject({ metric: 'structural', pass: false })
  expect(verdict.turns[0].trace.requestId).toMatch(/^[0-9a-f-]{36}$/u)
  expect(verdict.turns[0].trace.responseRequestId).toBe(verdict.turns[0].trace.requestId)
})

it('exempts only the bound selected starting-step suggestion from the unsolicited-write guard', () => {
  const test = structuredClone(corpus.find((entry) => entry.metadata.id === 'offers-action-lifecycle-en'))
  configureOffers(test)
  const vars = { ...test.vars, issuedOffer: { action: { offerKey: 'smallStep:account:2031-06-10' } },
    clientContext: { ...test.vars.clientContext, selectedOfferKey: 'smallStep:account:2031-06-10' } }
  const output = decoded([toolCall('suggest_breakdown', { one_small_step: true, language: 'en' })])
  output.composition = { parts: [], operations: [{ sourceName: 'suggest_breakdown', status: 'Succeeded' }] }
  expect(offerSafety(output, { vars }).pass).toBe(true)
  for (const context of [{ ...vars, issuedOffer: undefined }, { ...vars, clientContext: { ...vars.clientContext, selectedOfferKey: undefined } },
    { ...vars, clientContext: { ...vars.clientContext, selectedOfferKey: 'smallStep:account:2031-06-11' } }]) {
    expect(offerSafety(output, { vars: context })).toMatchObject({ pass: false, reason: 'Unsolicited write executed.' })
  }
  output.composition.operations.push({ sourceName: 'create_habit', status: 'Succeeded' })
  expect(offerSafety(output, { vars }).pass).toBe(false)
  output.trace.calls.push({ ...output.trace.calls[0], name: 'create_habit', id: 'extra' })
  expect(offerSafety(output, { vars }).pass).toBe(false)
})

it.each(['en', 'pt-BR'])('declares the selected small-step tool in the lifecycle policy for %s', (locale) => {
  const test = structuredClone(corpus.find((entry) => entry.metadata.id === `offers-action-lifecycle-${locale}`))
  configureOffers(test)
  const call = toolCall('suggest_breakdown', { one_small_step: true, language: locale }, 'Succeeded', 'step')
  const verdict = outcomes([call], test.vars.expectations)
  expect(verdict.pass, verdict.reason).toBe(true)
  expect(outcomes([call, toolCall('create_habit', { title: 'Unrequested' }, 'PendingConfirmation', 'write')], test.vars.expectations).pass).toBe(false)
})

it.each(['future-start', 'completed', 'missing', 'skipped'])(
  'verifies the restart due population after resetting %s state', async (fault) => {
    offlineCredentials()
    vi.stubEnv('ORBIT_EVAL_TOKEN', 'pro-access')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2031-06-10T12:00:00Z'))
    try {
      const habits = [], requests = []
      const source = fixtureFetch(() => ({ habits, requests, goals: [], tags: [], templates: [],
        pro: true, email: 'thomaslrgregorio+orbit-eval-pro@gmail.com' }))
      vi.stubGlobal('fetch', source)
      const test = structuredClone(corpus.find((entry) => entry.metadata.id === 'composition-restart-preview-en'))
      await resetFixture({ ...test, metadata: { ...test.metadata, fixture: 'pro' } })
      const walk = habits[1]
      walk.startDate = '2031-06-12'
      walk.isCompleted = true
      let checked = false
      vi.stubGlobal('fetch', async (url, options) => {
        if (options.method === 'GET' && new URL(url).pathname === '/api/habits') {
          checked = true
          const query = new URL(url).searchParams
          expect(query.get('dateFrom')).toBe('2031-06-10')
          expect(query.get('dateTo')).toBe('2031-06-10')
          expect(query.get('includeOverdue')).toBe('true')
          expect(query.get('isCompleted')).toBe('false')
          const items = habits.filter((habit) => !habit.deleted && habit.startDate <= '2031-06-10'
            && !habit.isCompleted && !(fault === 'missing' && habit.id === walk.id))
            .map((habit) => ({ ...habit, isCompleted: false, isLoggedInRange: false,
              isSkippedOnDate: fault === 'skipped' && habit.id === walk.id }))
          return Response.json({ items, page: 1, pageSize: 50, totalCount: items.length, totalPages: 1 })
        }
        const response = await source(url, options)
        if (options.method === 'PUT' && new URL(url).pathname === `/api/habits/${walk.id}`) {
          const body = JSON.parse(options.body)
          // Habit.Reanchor resets completion when a supplied start changes the recurrence anchor.
          if (body.startDate) { walk.startDate = body.startDate; walk.isCompleted = false }
        }
        return response
      })
      if (['missing', 'skipped'].includes(fault)) await expect(resetFixture(test)).rejects.toThrow('Restart fixture needs all six unfinished habits due today or overdue.')
      else await expect(resetFixture(test)).resolves.toBeUndefined()
      expect(checked).toBe(true)
    } finally { vi.useRealTimers() }
  },
)
