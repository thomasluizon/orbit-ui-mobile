import { expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import parseResponse from '../response.mjs'
import { summarize, writeReport } from '../report.mjs'
import { mergeReports } from '../merge-reports.mjs'
import { afterAll } from '../hooks.mjs'
import { describeCase, READ_LATENCY_BUDGET_MILLISECONDS } from '../latency.mjs'
import AstraHttpProvider from '../http-provider.mjs'
import { chatResponse } from './fixtures/producer.mjs'

const descriptor = { id: 'read', family: 'single', locale: 'en', readLatency: true }
const belowBudget = READ_LATENCY_BUDGET_MILLISECONDS - 1000
const faster = belowBudget - 1000
const aboveBudget = READ_LATENCY_BUDGET_MILLISECONDS + 1000
// Shape and phase names: orbit-api ChatTurnTimer.Complete and ChatTurnTiming records (#1754).
const timing = (totalMilliseconds) => ({ totalMilliseconds, phases: [
  ...['moderation', 'context_load', 'prompt_build', 'budget', 'tool_call', 'save', 'composition', 'other']
    .map((name) => ({ name, milliseconds: 10, elapsedMilliseconds: 10 })),
  { name: 'model_call', milliseconds: (totalMilliseconds - 80) / 2, elapsedMilliseconds: (totalMilliseconds - 80) / 2 },
  { name: 'model_call', milliseconds: (totalMilliseconds - 80) / 2, elapsedMilliseconds: (totalMilliseconds - 80) / 2 },
] })
function attempts(totals) {
  return totals.map((total, index) => {
    const requestId = `request-${index}`
    const response = chatResponse(requestId)
    response.evalTrace.timing = timing(total)
    return { testCase: { metadata: descriptor, vars: { evalRequestId: requestId, composition: { mode: 'data' } } }, success: true,
      response: { output: parseResponse(response, '', { response: { status: 200, headers: { 'x-orbit-request-id': requestId } } }) },
      gradingResult: { componentResults: [{ pass: true, assertion: { metric: 'composition' } }] } }
  })
}
it.each([0, 1, 2, 3])('reports the completion state for %i successful fast attempts', (count) => {
  const summary = summarize(attempts(Array(count).fill(faster)), [descriptor])
  const status = count === 3 ? 'pass' : 'incomplete'
  expect(summary.status).toBe(status)
  expect(summary.cases[0]).toMatchObject({ attempts: count, pass3: status, latency: { status } })
  expect(mergeReports([summary], [descriptor]).cases[0]).toEqual(summary.cases[0])
})
it.each([0, 1, 2])('keeps read latency incomplete with %i requests and blocked fixture setup', async (count) => {
  const provider = new AstraHttpProvider({ config: { url: 'https://astra.invalid/api/chat' } })
  const testCase = { metadata: descriptor, vars: { preconditionFailure: 'Fixture allowance unavailable.' } }
  const response = await provider.callApi('Read habits', { vars: testCase.vars })
  const blocked = Array.from({ length: 3 - count }, () => ({ testCase, response, success: false }))
  const summary = summarize([...attempts(Array(count).fill(aboveBudget)), ...blocked], [descriptor])
  expect(summary.status).toBe('incomplete')
  expect(summary.cases[0]).toMatchObject({ unavailable: 3 - count, pass3: 'incomplete',
    latency: { status: 'incomplete', totalMedianMilliseconds: null, phaseMediansMilliseconds: null } })
  expect(mergeReports([summary], [descriptor]).cases[0]).toEqual(summary.cases[0])
  const unsupported = structuredClone(summary)
  Object.assign(unsupported.cases[0], { passed: 3, unavailable: 0, missingComposition: 0, pass3: 'pass' })
  expect(() => mergeReports([unsupported], [descriptor])).toThrow()
})
it.each(['missing timing', 'capability failure'])('preserves a real %s alongside an unrun attempt', (failure) => {
  const results = attempts([faster, faster])
  if (failure === 'missing timing') delete results[0].response.output.trace.timing
  else {
    results[0].success = false
    results[0].gradingResult.componentResults[0].pass = false
  }
  expect(summarize(results, [descriptor]).status).toBe('fail')
})
it('asserts the repeat-3 median, sums repeated phases before taking medians, and reports it', () => {
  const summary = summarize(attempts([aboveBudget, faster, belowBudget]), [descriptor])
  expect(summary.status).toBe('pass')
  expect(summary.cases[0].latency).toMatchObject({ status: 'pass', totalMedianMilliseconds: belowBudget,
    phaseMediansMilliseconds: { model_call: belowBudget - 80, other: 10 } })
  const directory = mkdtempSync(join(tmpdir(), 'astra-latency-'))
  try {
    expect(writeReport(summary, directory)).toContain(`| read | ${belowBudget} | ${READ_LATENCY_BUDGET_MILLISECONDS} | pass |`)
    expect(writeReport(summary, directory)).toContain(`| read | model_call | ${belowBudget - 80} |`)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
it.each([[READ_LATENCY_BUDGET_MILLISECONDS, faster, aboveBudget], [faster, aboveBudget, aboveBudget + 1000]])('fails at or above the budget using the median: %j', (...totals) => {
  expect(summarize(attempts(totals), [descriptor]).status).toBe('fail')
})
it.each([[9003, 'pass'], [10234, 'fail'], [11938, 'fail'], [13771, 'fail']])(
  'applies staging calibration to a %i ms median: %s', (milliseconds, status) => {
    expect(summarize(attempts(Array(3).fill(milliseconds)), [descriptor]).status).toBe(status)
  },
)
it.each(['timing', 'phases', 'phase', 'invalid', 'identity'])('fails missing or invalid phase evidence: %s', (missing) => {
  const results = attempts([faster, faster, faster])
  const trace = results[0].response.output.trace
  if (missing === 'timing') delete trace.timing
  if (missing === 'phases') trace.timing.phases = []
  if (missing === 'phase') trace.timing.phases = trace.timing.phases.filter(({ name }) => name !== 'model_call')
  if (missing === 'invalid') trace.timing.phases[0].milliseconds = -1
  if (missing === 'identity') trace.requestId = 'unrelated'
  expect(summarize(results, [descriptor]).status).toBe('fail')
})
it('preserves the budget across windows and rejects a read pass without timing', () => {
  const summary = summarize(attempts([faster, belowBudget, aboveBudget]), [descriptor])
  expect(mergeReports([summary], [descriptor]).cases[0].latency).toEqual(summary.cases[0].latency)
  delete summary.cases[0].latency
  expect(() => mergeReports([summary], [descriptor])).toThrow()
})

it('classifies typed and legacy read prompts without applying latency to writes or refusals', () => {
  expect(describeCase({ metadata: descriptor, vars: { composition: { mode: 'data' } } }).readLatency).toBe(true)
  expect(describeCase({ metadata: descriptor, vars: { composition: { mode: 'fallback' }, expectations: { allowed: ['query_habits'] } } }).readLatency).toBe(true)
  expect(describeCase({ metadata: descriptor, vars: { composition: { mode: 'step-up' } } }).readLatency).toBe(true)
  for (const mode of ['preview', 'text', 'clarification', 'fallback']) {
    expect(describeCase({ metadata: descriptor, vars: { composition: { mode } } }).readLatency).toBe(false)
  }
})
it.each([[faster, belowBudget, aboveBudget], [aboveBudget, aboveBudget + 1000, faster]])('enforces latency through the final hook: %j', (...totals) => {
  const results = attempts(totals)
  const directory = mkdtempSync(join(tmpdir(), 'astra-latency-hook-'))
  const previous = process.cwd()
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  delete process.env.GITHUB_STEP_SUMMARY
  try {
    process.chdir(directory)
    const finish = () => afterAll({ results, suite: { tests: [results[0].testCase] } })
    if (totals[1] < READ_LATENCY_BUDGET_MILLISECONDS) expect(finish).not.toThrow()
    else expect(finish).toThrow('Astra launch gate fail')
  } finally {
    process.chdir(previous)
    stdout.mockRestore()
    if (summaryPath !== undefined) process.env.GITHUB_STEP_SUMMARY = summaryPath
    rmSync(directory, { recursive: true, force: true })
  }
})
it('preserves failed budgets and rejects stale or contradictory merged latency evidence', () => {
  const summary = summarize(attempts([aboveBudget, aboveBudget + 1000, faster]), [descriptor])
  expect(mergeReports([summary], [descriptor]).status).toBe('fail')
  for (const mutation of [
    (entry) => { entry.pass3 = 'pass' },
    (entry) => { entry.latency.budgetMilliseconds = READ_LATENCY_BUDGET_MILLISECONDS - 1 },
    (entry) => { delete entry.latency.phaseMediansMilliseconds.model_call },
  ]) {
    const altered = structuredClone(summary)
    mutation(altered.cases[0])
    expect(() => mergeReports([altered], [descriptor])).toThrow()
  }
})

// Recorded production get_api_keys timing; ChatTurnTimer.Complete emits only scopes entered.
it('measures a read without a save scope through parsing, reporting and window merging', () => {
  const recorded = JSON.parse(readFileSync(new URL('./fixtures/read-without-save.json', import.meta.url), 'utf8'))
  const results = attempts([faster, faster, faster])
  for (const entry of results) entry.response.output.trace.timing = structuredClone(recorded)
  const summary = summarize(results, [descriptor])
  expect(summary.cases[0].latency).toMatchObject({ totalMedianMilliseconds: recorded.totalMilliseconds,
    phaseMediansMilliseconds: { save: 0 } })
  expect(summary.cases[0].latency.status).toBe(recorded.totalMilliseconds < READ_LATENCY_BUDGET_MILLISECONDS ? 'pass' : 'fail')
  expect(mergeReports([summary], [descriptor]).cases[0].latency).toEqual(summary.cases[0].latency)
})
