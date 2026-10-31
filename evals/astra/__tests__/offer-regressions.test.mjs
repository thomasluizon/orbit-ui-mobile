import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { configureOffers } from '../offer-context.mjs'
import { behavior } from '../assertions.mjs'
import parseResponse from '../response.mjs'
import { toolCall } from './fixtures/producer.mjs'
import { toolWrites } from '../trace-policy.mjs'

const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'), { merge: true })
const recorded = JSON.parse(readFileSync(new URL('./fixtures/offer-read-outcomes.json', import.meta.url), 'utf8'))

// Saved tool-call projections omit identities; rebuild only the producer envelope for outcome grading.
function replay(attempt, expectations) {
  const calls = attempt.toolCalls.map((record, index) => {
    const { status, ...call } = toolCall(record.name, {}, record.resultStatus, `call-${index}`)
    return { ...call, ...record, result: { ...call.result, ...record.result } }
  })
  return behavior({ httpStatus: 200, trace: { state: 'available', requestId: 'replay', responseRequestId: 'replay', calls } },
    { vars: { evalRequestId: 'replay', expectations } })
}

it('replays the saved children prerequisite reads without changing any previously passing outcome', () => {
  expect(recorded.filter((attempt) => attempt.pass)).toHaveLength(55)
  for (const attempt of recorded) {
    const scenario = structuredClone(corpus.find((entry) => entry.metadata.id === attempt.caseId))
    configureOffers(scenario)
    const verdict = replay(attempt, scenario.vars.expectations)
    expect.soft(verdict.pass, `${attempt.caseId}-r${attempt.repeat}: ${verdict.reason}`).toBe(true)
  }
})

it.each(['main', 'setup'])('allows successful prerequisite reads while holding %s writes', (branch) => {
  const scenario = structuredClone(corpus.find((entry) => entry.metadata.id === (branch === 'setup'
    ? 'offers-preview-rejection-en' : 'offers-ordinary-reading-en')))
  configureOffers(scenario)
  const expectations = branch === 'setup' ? scenario.vars.setup.expectations : scenario.vars.expectations
  expect(expectations.permittedMutations.every(({ name }) => toolWrites.get(name) === true)).toBe(true)
  const write = expectations.permittedMutations[0].name
  const toolCalls = [toolCall('query_habits', {}, 'Succeeded', 'read'), toolCall(write, {}, 'PendingConfirmation', 'write')]
    .map(({ status, ...call }) => ({ ...call, resultStatus: status }))
  expect(replay({ toolCalls }, expectations).pass).toBe(true)
  toolCalls[0].resultStatus = 'Failed'
  expect(replay({ toolCalls }, expectations).pass).toBe(false)
})

it.each(['AI_EMPTY_RESPONSE', null])('retains an unexpected HTTP 400 diagnostic with code %s without accepting it', (errorCode) => {
  const response = parseResponse({ error: 'Unable to compose an answer.', errorCode }, '', {
    response: { status: 400, headers: { 'x-orbit-request-id': 'diagnostic-request' } },
  })
  expect(response).toMatchObject({ error: 'Astra returned an unexpected refusal.', output: { httpStatus: 400,
    httpError: { status: 400, error: 'Unable to compose an answer.', errorCode, responseRequestId: 'diagnostic-request' } } })
  expect(response).not.toHaveProperty('composition')
  expect(behavior(response.output, { vars: { evalRequestId: 'diagnostic-request', expectations: {} } }).pass).toBe(false)
})
