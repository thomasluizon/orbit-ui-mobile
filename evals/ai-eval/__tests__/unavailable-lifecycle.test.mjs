import { evalSnapshot } from './fixtures/eval-snapshot.mjs'
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import { completeOfferAttempt } from '../offer-lifecycle.mjs'
import { configureOffers } from '../offer-context.mjs'
import { proactiveOffers } from '../proactive-offers.mjs'
import { composition } from '../assertions.mjs'
import { offerTurns, openCaseConversation, outcome, runOutcomeCase } from '../client-path.mjs'
import { summarize, writeResults } from '../report.mjs'
import { mergeReports } from '../merge-reports.mjs'
import { describeCase } from '../latency.mjs'
import { ATTEMPTS_PER_CASE } from '../attempts.mjs'
import { chatResponse, habitAccountRead, preview, turnTiming } from './fixtures/producer.mjs'
import { offlineCredentials, refreshResponse } from './fixtures/credentials.mjs'
import { recordedGateThirteen } from './fixtures/gate-thirteen.mjs'

const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'), { merge: true })
const recorded = recordedGateThirteen()
const httpError = recorded.find((row) => row.httpError?.errorCode === 'AI_UNAVAILABLE').httpError
const today = '2031-06-10'
const habitId = '22222222-2222-4222-8222-222222222222'
const directories = []
afterEach(() => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function dismissal() {
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline')
  const test = structuredClone(corpus.find((entry) => entry.metadata.id === 'offers-dismissal-en'))
  configureOffers(test)
  const state = { habits: [], goals: [], tags: [], checklistTemplates: [] }
  Object.assign(test.vars, { accountDate: today, evalRequestId: 'main-request',
    offerRequireReadback: true, offerBaseline: structuredClone(state), fixtureEvidence: structuredClone(state),
    issuedOffer: { action: { offerKey: `smallStep:account:${today}` } } })
  vi.stubGlobal('fetch', async (url, options) => {
    const path = new URL(url).pathname
    if (path === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
    if (path === '/api/auth/refresh') return refreshResponse()
    if (path === '/api/eval/snapshot') return Response.json(evalSnapshot(state))
    if (path === '/api/habits' && options.method === 'POST') {
      state.habits.push({ id: habitId, title: 'Breathe', logs: [], checklistItems: [] })
      return Response.json({ id: habitId }, { status: 201 })
    }
    if (path === `/api/habits/${habitId}`) return Response.json(state.habits[0])
    throw new Error(`Unexpected offline request: ${path}`)
  })
  return { test, state }
}

// One turn of the stream as the client path receives it, with its eval trace.
function answer(requestId, vars, state, index = 0) {
  const greeting = index > 0 && index <= 11
  const calls = greeting ? [] : [habitAccountRead(false, 'read', vars.clientContext)]
  const response = { ...chatResponse(requestId, calls), aiMessage: greeting ? 'Hello.' : null,
    parts: greeting ? [{ type: 'text', text: 'Hello.' }] : [{ type: 'block', kind: 'habitList', block: {
      scope: 'today', items: state.habits.map((habit) => ({ id: habit.id, title: habit.title, emoji: null,
        depth: 0, isBadHabit: false, status: 'today' })), totalCount: state.habits.length,
      read: { queryId: habitId, queryFamily: 'query_habits', scope: {}, revision: 'revision', refreshToken: 'refresh',
        completeness: 'complete', recovery: null, nextCursor: null, totalCount: state.habits.length,
        ...(index === 14 ? { nextAction: { offerKey: `log:${habitId}:${today}`, kind: 'preparePreview',
          label: 'Log Breathe', prompt: 'Log Breathe today.', surface: null, entityId: habitId, date: today } } : {}) },
    } }] }
  return { kind: 'final', response, requestId, responseRequestId: requestId,
    trace: { requestId, calls, timing: turnTiming(), modelCalls: 1 } }
}

// Producer: the shared turn loop gives a turn that the server refused its status, its code and its message.
const outage = (requestId) => ({ kind: 'failed', status: httpError.status, code: httpError.errorCode, error: httpError.error,
  responseRequestId: requestId })

// The provider path of the case: its first turn, then its lifecycle in the same conversation. `reply(index, requestId)`
// gives the turn of that index.
async function lifecycle(test, state, reply) {
  let index = 0
  const send = async (_conversation, _attempted, requestId) => reply(index++, requestId, state)
  const conversation = openCaseConversation(test.vars)
  const { output } = await runOutcomeCase(test.vars, { send, conversation })
  output.offerReadback = await completeOfferAttempt(output, test.vars, offerTurns(conversation, { send }))
  return { output, turns: () => index }
}

async function attempts(output, test) {
  const context = { vars: test.vars, test }
  const componentResults = await Promise.all([
    ['outcome', outcome], ['composition', composition], ['proactiveOffers', proactiveOffers],
  ].map(async ([metric, grade]) => ({ ...await grade(output, context), assertion: { metric } })))
  return Array.from({ length: ATTEMPTS_PER_CASE }, () => ({ testCase: test, response: { output },
    success: componentResults.every((check) => check.pass), gradingResult: { componentResults } }))
}

it.each([1, 11, 12, 13, 14])('continues an unavailable dismissal at lifecycle turn %i in the next window', async (stop) => {
  const { test, state } = dismissal()
  const { output } = await lifecycle(test, state, (index, requestId) => index === stop ? outage(requestId)
    : answer(requestId, test.vars, state, index))
  const results = await attempts(output, test)
  const descriptor = describeCase(test)
  const summary = summarize(results, [descriptor])
  expect(summary.cases[0]).toMatchObject({ allAttemptsPass: 'incomplete', unavailable: ATTEMPTS_PER_CASE })
  expect(summary.cases[0].unavailableReasons[0]).toContain('AI_UNAVAILABLE')
  expect(output.offerReadback).toMatchObject({ pass: false, metadata: { unavailable: true } })
  expect(output.offerReadback.turns).toHaveLength(stop)
  const failed = output.offerReadback.turns.at(-1)
  expect(failed).toMatchObject({ unavailable: true, httpStatus: 400, httpError: { errorCode: 'AI_UNAVAILABLE' } })
  expect(failed.httpError.responseRequestId).toMatch(/^[0-9a-f-]{36}$/u)
  const directory = mkdtempSync(join(tmpdir(), 'orbit-unavailable-'))
  directories.push(directory)
  writeResults(results, directory)
  const evidence = JSON.parse(readFileSync(join(directory, 'attempts/offers-dismissal-en-r1.json'), 'utf8'))
  expect(evidence).toMatchObject({ pass: false, unavailable: true,
    assertions: [{}, {}, { metric: 'proactiveOffers', unavailable: true }] })
  expect(evidence.offerReadback.turns.at(-1).httpError.errorCode).toBe('AI_UNAVAILABLE')
  expect(evidence.offerReadback.turns.at(-1).httpError.responseRequestId).toBe(failed.httpError.responseRequestId)
  const nextWindow = dismissal()
  const next = await lifecycle(nextWindow.test, nextWindow.state, (index, requestId) => answer(requestId, nextWindow.test.vars, nextWindow.state, index))
  expect(next.output.offerReadback.pass, next.output.offerReadback.reason).toBe(true)
  expect(next.turns()).toBe(15)
  const passing = summarize(await attempts(next.output, nextWindow.test), [descriptor])
  expect(passing.status).toBe('pass')
  expect(mergeReports([summary, passing], [descriptor]).cases[0]).toMatchObject({ allAttemptsPass: 'pass', sourceWindow: 2,
    superseded: [{ allAttemptsPass: 'incomplete', unavailable: ATTEMPTS_PER_CASE }] })
})

it.each(['outcome', 'timing', 'other-error'])('keeps an independent %s failure in the dismissal gate', async (fault) => {
  const { test, state } = dismissal()
  const reply = (index, requestId) => index === 0 ? answer(requestId, test.vars, state)
    : fault === 'other-error' ? { kind: 'failed', status: 500, code: null, error: 'Chat stream request failed.', responseRequestId: requestId }
      : outage(requestId)
  const { output } = await lifecycle(test, state, reply)
  // The first turn holds a preview of a change, which a read turn must not hold.
  if (fault === 'outcome') Object.assign(output, { previews: [preview()], composition: { ...output.composition, pendingOperations: [preview()] } })
  if (fault === 'timing') output.trace.timing = null
  const descriptor = describeCase(test)
  const summary = summarize(await attempts(output, test), [descriptor])
  expect(summary.cases[0].allAttemptsPass).toBe('fail')
  expect(() => mergeReports([summary, summary], [descriptor])).toThrow('declare its permitted rerun')
  if (fault === 'other-error') expect(output.offerReadback.metadata?.unavailable).not.toBe(true)
})
