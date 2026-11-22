import { expect, it } from 'vitest'
import { behavior } from '../assertions.mjs'
import parseResponse from '../response.mjs'
import { toolCall } from './fixtures/producer.mjs'

// Saved tool-call projections omit identities; rebuild only the producer envelope for outcome grading.
function replay(attempt, expectations) {
  const calls = attempt.toolCalls.map((record, index) => {
    const { status, ...call } = toolCall(record.name, {}, record.resultStatus, `call-${index}`)
    return { ...call, ...record, id: call.id, result: { ...call.result, ...record.result, id: call.id } }
  })
  return behavior({ httpStatus: 200, trace: { state: 'available', requestId: 'replay', responseRequestId: 'replay', calls } },
    { vars: { evalRequestId: 'replay', expectations } })
}

it.each(['AI_EMPTY_RESPONSE', null])('retains an unexpected HTTP 400 diagnostic with code %s without accepting it', (errorCode) => {
  const response = parseResponse({ error: 'Unable to compose an answer.', errorCode }, '', {
    response: { status: 400, headers: { 'x-orbit-request-id': 'diagnostic-request' } },
  })
  expect(response).toMatchObject({ error: 'Orbit returned an unexpected refusal.', output: { httpStatus: 400,
    httpError: { status: 400, error: 'Unable to compose an answer.', errorCode, responseRequestId: 'diagnostic-request' } } })
  expect(response).not.toHaveProperty('composition')
  expect(behavior(response.output, { vars: { evalRequestId: 'diagnostic-request', expectations: {} } }).pass).toBe(false)
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
