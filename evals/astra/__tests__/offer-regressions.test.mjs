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
    return { ...call, ...record, id: call.id, result: { ...call.result, ...record.result, id: call.id } }
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

// Producer: AgentOperationExecutor argument checks and ProcessUserChatCommand.Correction.SameArgumentTargets.
it('Q accepts one same-target argument repair and rejects unrecovered, repeated or retargeted failures', () => {
  const scenario = structuredClone(corpus.find((entry) => entry.metadata.id === 'offers-repeat-en'))
  configureOffers(scenario)
  const failed = { ...toolCall('create_habit', { title: 'Drink water', is_general: true, frequency_unit: 'Day' }, 'Failed'),
    resultStatus: 'Failed' }
  failed.result.error = 'GENERAL_HABIT_HAS_FREQUENCY: General habits cannot have a frequency.'
  const repaired = { ...toolCall('create_habit', { title: 'Drink water', is_general: true, frequency_unit: null }, 'PendingConfirmation'),
    resultStatus: 'PendingConfirmation' }
  const grade = (toolCalls) => replay({ toolCalls }, scenario.vars.expectations)
  const valid = grade([failed, repaired])
  expect(valid, valid.reason).toMatchObject({ pass: true })
  for (const calls of [[failed], [repaired, failed], [failed, { ...failed }, repaired],
    [failed, { ...repaired, name: 'update_habit' }],
    [failed, { ...repaired, arguments: { ...repaired.arguments, title: 'Walk' } }],
    [failed, repaired, { ...repaired }],
    [{ ...failed, result: { ...failed.result, success: true } }, repaired],
    [{ ...failed, result: { ...failed.result, error: null } }, repaired]]) {
    expect(grade(calls).pass).toBe(false)
  }
})

it.each(['habit_id', 'goal_id', 'template_id', 'parent_habit_id', 'habit_ids', 'filter', 'action', 'habits', 'sub_habits', 'revised_items'])(
  'Q preserves supplied repair target %s', (key) => {
    const nested = ['habits', 'sub_habits', 'revised_items'].includes(key)
    const original = nested ? [{ title: 'Water', habit_id: 'water' }] : key === 'habit_ids' ? ['water']
      : key === 'filter' ? { tag: 'Water' } : 'water'
    const changed = nested ? [{ title: 'Water', habit_id: 'walk' }] : key === 'habit_ids' ? ['walk']
      : key === 'filter' ? { tag: 'Walk' } : 'walk'
    const failed = { ...toolCall('create_habit', { title: 'Water', [key]: original }, 'Failed'), resultStatus: 'Failed' }
    failed.result.error = 'Invalid argument.'
    const repaired = { ...toolCall('create_habit', { title: 'Water', [key]: original }, 'PendingConfirmation'), resultStatus: 'PendingConfirmation' }
    const expectations = { permittedMutations: [{ name: 'create_habit', resultStatus: 'PendingConfirmation' }] }
    const valid = replay({ toolCalls: [failed, repaired] }, expectations)
    expect(valid.pass, valid.reason).toBe(true)
    repaired.arguments[key] = changed
    expect(replay({ toolCalls: [failed, repaired] }, expectations).pass).toBe(false)
  },
)
