import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import { completeOfferAttempt } from '../offer-lifecycle.mjs'
import { configureOffers } from '../offer-context.mjs'
import { proactiveOffers } from '../proactive-offers.mjs'
import { structural, behavior, composition } from '../assertions.mjs'
import parseResponse from '../response.mjs'
import { summarize, writeResults } from '../report.mjs'
import { mergeReports } from '../merge-reports.mjs'
import { describeCase } from '../latency.mjs'
import { ATTEMPTS_PER_CASE } from '../attempts.mjs'
import { chatResponse, habitAccountRead, turnTiming } from './fixtures/producer.mjs'
import { offlineCredentials, refreshResponse } from './fixtures/credentials.mjs'

const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'), { merge: true })
const recorded = JSON.parse(readFileSync(new URL('./fixtures/gate-thirteen.json', import.meta.url), 'utf8'))
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
  Object.assign(test.vars, { accountDate: today, evalRequestId: 'main-request', historyJson: '[]',
    offerRequireReadback: true, offerBaseline: structuredClone(state), fixtureEvidence: structuredClone(state),
    issuedOffer: { action: { offerKey: `smallStep:account:${today}` } } })
  vi.stubGlobal('fetch', async (url, options) => {
    const path = new URL(url).pathname
    if (path === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
    if (path === '/api/auth/refresh') return refreshResponse()
    if (path === '/api/profile/export') return Response.json(state)
    if (path === '/api/habits' && options.method === 'POST') {
      state.habits.push({ id: habitId, title: 'Breathe', logs: [], checklistItems: [] })
      return Response.json({ id: habitId }, { status: 201 })
    }
    if (path === `/api/habits/${habitId}`) return Response.json(state.habits[0])
    throw new Error(`Unexpected offline request: ${path}`)
  })
  return { test, state }
}

function answer(vars, state, index = 0) {
  const greeting = index > 0 && index <= 11
  const calls = greeting ? [] : [habitAccountRead(false, 'read', vars.clientContext)]
  for (const call of calls) call.arguments.orbit_dismissed_offer_keys = []
  const response = { ...chatResponse(vars.evalRequestId, calls), aiMessage: greeting ? 'Hello.' : null,
    parts: greeting ? [{ type: 'text', text: 'Hello.' }] : [{ type: 'block', kind: 'habitList', block: {
      scope: 'today', items: state.habits.map((habit) => ({ id: habit.id, title: habit.title, emoji: null,
        depth: 0, isBadHabit: false, status: 'today' })), totalCount: state.habits.length,
      read: { queryId: habitId, queryFamily: 'query_habits', scope: {}, revision: 'revision', refreshToken: 'refresh',
        completeness: 'complete', recovery: null, nextCursor: null, totalCount: state.habits.length,
        ...(index === 14 ? { nextAction: { offerKey: `log:${habitId}:${today}`, kind: 'preparePreview',
          label: 'Log Breathe', prompt: 'Log Breathe today.', surface: null, entityId: habitId, date: today } } : {}) },
    } }] }
  response.evalTrace.timing = turnTiming()
  return parseResponse(response, '', { response: { status: 200, headers: { 'x-orbit-request-id': vars.evalRequestId } } })
}

async function attempts(output, test) {
  const context = { vars: test.vars, test }
  const componentResults = await Promise.all([
    ['toolStructure', structural], ['toolBehavior', behavior], ['composition', composition], ['proactiveOffers', proactiveOffers],
  ].map(async ([metric, grade]) => ({ ...await grade(output, context), assertion: { metric } })))
  return Array.from({ length: ATTEMPTS_PER_CASE }, () => ({ testCase: test, response: { output },
    success: componentResults.every((check) => check.pass), gradingResult: { componentResults } }))
}

it.each([1, 11, 12, 13, 14])('continues an unavailable dismissal at lifecycle turn %i in the next window', async (stop) => {
  const { test, state } = dismissal()
  const output = answer(test.vars, state)
  let index = 0
  output.offerReadback = await completeOfferAttempt(output, test.vars, async (_input, next) => {
    index++
    return index === stop ? parseResponse(httpError, '', { response: { status: 400,
      headers: { 'x-orbit-request-id': next.vars.evalRequestId } } }) : { output: answer(next.vars, state, index) }
  })
  const results = await attempts(output, test)
  const descriptor = describeCase(test)
  const summary = summarize(results, [descriptor])
  expect(summary.cases[0]).toMatchObject({ allAttemptsPass: 'incomplete', unavailable: ATTEMPTS_PER_CASE,
    unavailableReasons: ['Astra response evidence is unavailable (AI_UNAVAILABLE).'] })
  expect(output.offerReadback).toMatchObject({ pass: false, metadata: { unavailable: true } })
  expect(output.offerReadback.turns).toHaveLength(stop)
  const failed = output.offerReadback.turns.at(-1)
  expect(failed).toMatchObject({ unavailable: true, httpStatus: 400, httpError: { errorCode: 'AI_UNAVAILABLE' } })
  expect(failed.httpError.responseRequestId).toMatch(/^[0-9a-f-]{36}$/u)
  const directory = mkdtempSync(join(tmpdir(), 'astra-unavailable-'))
  directories.push(directory)
  writeResults(results, directory)
  const evidence = JSON.parse(readFileSync(join(directory, 'attempts/offers-dismissal-en-r1.json'), 'utf8'))
  expect(evidence).toMatchObject({ pass: false, unavailable: true,
    assertions: [{}, {}, {}, { metric: 'proactiveOffers', unavailable: true }] })
  expect(evidence.offerReadback.turns.at(-1).httpError.errorCode).toBe('AI_UNAVAILABLE')
  expect(evidence.offerReadback.turns.at(-1).httpError.responseRequestId).toBe(failed.httpError.responseRequestId)
  const nextWindow = dismissal()
  const completed = answer(nextWindow.test.vars, nextWindow.state)
  let completedIndex = 0
  completed.offerReadback = await completeOfferAttempt(completed, nextWindow.test.vars, async (_input, next) => ({
    output: answer(next.vars, nextWindow.state, ++completedIndex),
  }))
  expect(completed.offerReadback.pass, completed.offerReadback.reason).toBe(true)
  expect(completedIndex).toBe(14)
  const passing = summarize(await attempts(completed, nextWindow.test), [descriptor])
  expect(passing.status).toBe('pass')
  expect(mergeReports([summary, passing], [descriptor]).cases[0]).toMatchObject({ allAttemptsPass: 'pass', sourceWindow: 2,
    superseded: [{ allAttemptsPass: 'incomplete', unavailable: ATTEMPTS_PER_CASE }] })
})

it.each(['behavior', 'timing', 'other-error'])('keeps an independent %s failure in the dismissal gate', async (fault) => {
  const { test, state } = dismissal()
  const output = answer(test.vars, state)
  output.offerReadback = await completeOfferAttempt(output, test.vars, async () => parseResponse(httpError, '', {
    response: { status: 400, headers: { 'x-orbit-request-id': 'unavailable-request' } },
  }))
  if (fault === 'behavior') test.vars.expectations.required = [{ name: 'get_daily_summary' }]
  if (fault === 'timing') output.trace.timing = null
  if (fault === 'other-error') output.offerReadback = await completeOfferAttempt(output, test.vars,
    async () => ({ error: 'Astra returned an unexpected refusal.' }))
  const descriptor = describeCase(test)
  const summary = summarize(await attempts(output, test), [descriptor])
  expect(summary.cases[0].allAttemptsPass).toBe('fail')
  expect(() => mergeReports([summary, summary], [descriptor])).toThrow('declare its permitted rerun')
  if (fault === 'other-error') expect(output.offerReadback.metadata?.unavailable).not.toBe(true)
})
