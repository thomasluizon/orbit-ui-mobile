import { expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import parseResponse from '../response.mjs'
import { summarize, writeReport } from '../report.mjs'
import { mergeReports } from '../merge-reports.mjs'
import { afterAll } from '../hooks.mjs'
import { describeCase } from '../latency.mjs'
import { chatResponse } from './fixtures/producer.mjs'

const descriptor = { id: 'read', family: 'single', locale: 'en', readLatency: true }
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
it('asserts the repeat-3 median, sums repeated phases before taking medians, and reports it', () => {
  const summary = summarize(attempts([9000, 3000, 4000]), [descriptor])
  expect(summary.status).toBe('pass')
  expect(summary.cases[0].latency).toMatchObject({ status: 'pass', totalMedianMilliseconds: 4000,
    phaseMediansMilliseconds: { model_call: 3920, other: 10 } })
  const directory = mkdtempSync(join(tmpdir(), 'astra-latency-'))
  try {
    expect(writeReport(summary, directory)).toContain('| read | 4000 | 5000 | pass |')
    expect(writeReport(summary, directory)).toContain('| read | model_call | 3920 |')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
it.each([[5000, 3000, 6000], [3000, 6000, 7000]])('fails at or above the budget using the median: %j', (...totals) => {
  expect(summarize(attempts(totals), [descriptor]).status).toBe('fail')
})
it.each(['timing', 'phases', 'phase', 'invalid', 'identity'])('fails missing or invalid phase evidence: %s', (missing) => {
  const results = attempts([3000, 3000, 3000])
  const trace = results[0].response.output.trace
  if (missing === 'timing') delete trace.timing
  if (missing === 'phases') trace.timing.phases = []
  if (missing === 'phase') trace.timing.phases = trace.timing.phases.filter(({ name }) => name !== 'model_call')
  if (missing === 'invalid') trace.timing.phases[0].milliseconds = -1
  if (missing === 'identity') trace.requestId = 'unrelated'
  expect(summarize(results, [descriptor]).status).toBe('fail')
})
it('preserves the budget across windows and rejects a read pass without timing', () => {
  const summary = summarize(attempts([3000, 4000, 9000]), [descriptor])
  expect(mergeReports([summary], [descriptor]).cases[0].latency).toEqual(summary.cases[0].latency)
  delete summary.cases[0].latency
  expect(() => mergeReports([summary], [descriptor])).toThrow()
})

it('classifies typed and legacy read prompts without applying latency to writes or refusals', () => {
  expect(describeCase({ metadata: descriptor, vars: { composition: { mode: 'data' } } }).readLatency).toBe(true)
  expect(describeCase({ metadata: descriptor, vars: { composition: { mode: 'fallback' }, expectations: { allowed: ['query_habits'] } } }).readLatency).toBe(true)
  for (const mode of ['preview', 'text', 'clarification', 'fallback']) {
    expect(describeCase({ metadata: descriptor, vars: { composition: { mode } } }).readLatency).toBe(false)
  }
})
it.each([[3000, 4000, 9000], [6000, 7000, 3000]])('enforces latency through the final hook: %j', (...totals) => {
  const results = attempts(totals)
  const directory = mkdtempSync(join(tmpdir(), 'astra-latency-hook-'))
  const previous = process.cwd()
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  delete process.env.GITHUB_STEP_SUMMARY
  try {
    process.chdir(directory)
    const finish = () => afterAll({ results, suite: { tests: [results[0].testCase] } })
    if (totals[1] < 5000) expect(finish).not.toThrow()
    else expect(finish).toThrow('Astra launch gate fail')
  } finally {
    process.chdir(previous)
    stdout.mockRestore()
    if (summaryPath !== undefined) process.env.GITHUB_STEP_SUMMARY = summaryPath
    rmSync(directory, { recursive: true, force: true })
  }
})
it('preserves failed budgets and rejects stale or contradictory merged latency evidence', () => {
  const summary = summarize(attempts([6000, 7000, 3000]), [descriptor])
  expect(mergeReports([summary], [descriptor]).status).toBe('fail')
  for (const mutation of [
    (entry) => { entry.pass3 = 'pass' },
    (entry) => { entry.latency.budgetMilliseconds = 9999 },
    (entry) => { delete entry.latency.phaseMediansMilliseconds.model_call },
  ]) {
    const altered = structuredClone(summary)
    mutation(altered.cases[0])
    expect(() => mergeReports([altered], [descriptor])).toThrow()
  }
})
