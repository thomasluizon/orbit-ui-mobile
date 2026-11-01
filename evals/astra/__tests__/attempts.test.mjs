import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { summarize } from '../report.mjs'
import { summarizeLatency } from '../latency.mjs'
import { mergeReports } from '../merge-reports.mjs'
import parseResponse from '../response.mjs'
import { chatResponse, turnTiming } from './fixtures/producer.mjs'

const descriptor = { id: 'launch', family: 'single', locale: 'en' }
function attempt(success = true) {
  const requestId = 'launch-request'
  const response = chatResponse(requestId)
  response.evalTrace.timing = turnTiming()
  return { testCase: { metadata: descriptor, vars: { evalRequestId: requestId } }, success,
    response: { output: parseResponse(response, '', { response: { status: 200,
      headers: { 'x-orbit-request-id': requestId } } }) },
    gradingResult: { componentResults: [{ pass: success, assertion: { metric: 'composition' } }] } }
}

it('configures one attempt for the launch gate', () => {
  const configuration = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))
  expect(configuration.evaluateOptions.repeat).toBe(1)
})
it.each([[true, 'pass'], [false, 'fail']])('grades one completed attempt with success=%s as %s', (success, status) => {
  expect(summarize([attempt(success)], [descriptor])).toMatchObject({ status, k: 1,
    cases: [{ attempts: 1, passed: Number(success), allAttemptsPass: status }] })
})
it.each([0, 2])('keeps %i successful attempts incomplete', (count) => {
  expect(summarize(Array.from({ length: count }, () => attempt()), [descriptor])).toMatchObject({
    status: 'incomplete', cases: [{ allAttemptsPass: 'incomplete' }],
  })
})
it('uses the one completed request time as the latency median', () => {
  expect(summarizeLatency([attempt()])).toMatchObject({ status: 'pass',
    totalMedianMilliseconds: turnTiming().totalMilliseconds })
})
it('refuses a window with a different attempt count', () => {
  const summary = summarize([attempt()], [descriptor])
  expect(() => mergeReports([{ ...summary, k: 2 }], [descriptor])).toThrow()
})
