import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { loadApiProvider } from 'promptfoo'
import { behavior, structural } from '../assertions.mjs'
import { beforeEach } from '../hooks.mjs'
import { offlineCredentials, refreshResponse } from './fixtures/credentials.mjs'
import { chatResponse, toolCall } from './fixtures/producer.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const configuration = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))
const requestId = 'independently-owned-request'
const expectations = { required: [{ name: 'query_habits', arguments: { date: 'today' } }] }
const assertionContext = { vars: { evalRequestId: requestId, expectations }, test: { vars: {} } }
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

async function request(response, status = 200, headerId = requestId) {
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
  vi.stubGlobal('fetch', async () => Response.json(response, {
    status, headers: { 'X-Orbit-Request-Id': headerId },
  }))
  const provider = await loadApiProvider('http', { options: { config: {
    ...configuration.providers[0].config, url: 'https://astra.invalid/api/chat',
    transformResponse: `file://${root}/response.mjs`,
  } } })
  const responseResult = await provider.callApi('Read today', { vars: {
    credentialKey: 'ORBIT_EVAL_TOKEN', evalRequestId: requestId,
  } })
  return responseResult.output ?? responseResult
}

describe('source-derived trace through the installed HTTP provider', () => {
  it('uses the real trace for structure and behavior', async () => {
    const output = await request(chatResponse(requestId, [toolCall('query_habits', { date: 'today' })]))
    expect(output.trace.state).toBe('available')
    expect(await structural(output, assertionContext)).toMatchObject({ pass: true })
    expect(behavior(output, assertionContext)).toMatchObject({ pass: true })
  })

  it.each([
    ['missing trace', (response) => { delete response.evalTrace }],
    ['wrong enclosing field', (response) => { response.trace = response.evalTrace; delete response.evalTrace }],
    ['wrong request', (response) => { response.evalTrace.traceId = 'other-request' }],
    ['matching returned identities from another request', (response) => { response.evalTrace.traceId = 'other-request' }, 'other-request'],
    ['missing calls', (response) => { response.evalTrace.toolCalls = [] }],
    ['wrong arguments', (response) => { response.evalTrace.toolCalls[0].arguments.date = 'tomorrow' }],
    ['extra mutation', (response) => { response.evalTrace.toolCalls.push(toolCall('log_habit', { habit_id: 'other' }, 'PendingConfirmation', 'call-2')) }],
    ['withheld arguments', (response) => { response.evalTrace.toolCalls[0].arguments = '[redacted]' }],
    ['withheld result', (response) => { response.evalTrace.toolCalls[0].result = null }],
    ['unknown status', (response) => { response.evalTrace.toolCalls[0].status = 'ok' }],
    ...['Failed', 'Denied', 'UnsupportedByPolicy', 'NotExecuted'].map((status) => [status, (response) => {
      response.evalTrace.toolCalls[0] = toolCall('query_habits', { date: 'today' }, status)
    }]),
  ])('cannot approve %s', async (_, mutate, headerId) => {
    const response = chatResponse(requestId, [toolCall('query_habits', { date: 'today' })])
    mutate(response)
    expect(behavior(await request(response, 200, headerId), assertionContext).pass).toBe(false)
  })

  it('requires the independently sent identity in both assertions', async () => {
    const output = await request(chatResponse(requestId, []))
    const missingIdentity = { vars: { expectations: {} }, test: { vars: {} } }
    expect(behavior(output, missingIdentity).pass).toBe(false)
    expect((await structural(output, missingIdentity)).pass).toBe(false)
  })

  it('keeps structural and outcome validation independent', async () => {
    const output = await request(chatResponse(requestId, [toolCall('query_habits', { date: 'today' }, 'Failed')]))
    expect((await structural(output, assertionContext)).pass).toBe(true)
    expect(behavior(output, assertionContext).pass).toBe(false)
  })

  it('accepts a held proposal but rejects an unapproved execution and a false success', async () => {
    const writeContext = { ...assertionContext, vars: { evalRequestId: requestId,
      expectations: { required: [{ name: 'log_habit', arguments: { habit_id: 'water' } }] },
    } }
    for (const status of ['PendingConfirmation', 'Succeeded', 'Denied', 'Failed']) {
      const output = await request(chatResponse(requestId, [toolCall('log_habit', { habit_id: 'water' }, status)]))
      expect(behavior(output, writeContext).pass).toBe(status === 'PendingConfirmation')
    }
    const response = chatResponse(requestId, [toolCall('log_habit', { habit_id: 'water' }, 'PendingConfirmation')])
    response.evalTrace.toolCalls[0].result.success = false
    expect(behavior(await request(response), writeContext).pass).toBe(false)
    response.evalTrace.toolCalls[0].result.success = true
    response.evalTrace.toolCalls[0].result.payload.status = 'wrong'
    expect(behavior(await request(response), writeContext).pass).toBe(false)
  })

  it('rejects a withheld required result field', async () => {
    const response = chatResponse(requestId, [toolCall('query_habits', {})])
    const requiredResult = { ...assertionContext, vars: { evalRequestId: requestId,
      expectations: { required: [{ name: 'query_habits', result: {
        entityName: 'No habits found matching the given filters.', payload: null,
      } }] },
    } }
    expect(behavior(await request(response), requiredResult).pass).toBe(true)
    delete response.evalTrace.toolCalls[0].result.entityName
    expect(behavior(await request(response), requiredResult).pass).toBe(false)
    response.evalTrace.toolCalls[0].result.entityName = '[redacted]'
    expect(behavior(await request(response), requiredResult).pass).toBe(false)
  })

  it('rejects repeated writes even when a scenario omits counts', async () => {
    const response = chatResponse(requestId, [
      toolCall('log_habit', { habit_id: 'water' }, 'PendingConfirmation'),
      toolCall('log_habit', { habit_id: 'water' }, 'PendingConfirmation', 'call-2'),
    ])
    expect(behavior(await request(response), { vars: { evalRequestId: requestId,
      expectations: { required: [{ name: 'log_habit', arguments: { habit_id: 'water' } }] },
    } }).pass).toBe(false)
  })

  it('rejects a skipped assertion envelope instead of silently approving it', async () => {
    const output = { answer: 'Water is ready.', trace: {
      state: 'skipped', requestId, responseRequestId: requestId, reason: 'Unavailable', calls: [],
    } }
    expect(behavior(output, assertionContext).pass).toBe(false)
    expect((await structural(output, assertionContext)).pass).toBe(false)
  })

  it('accepts genuinely empty tool evidence and binds expected refusals', async () => {
    const noTools = { ...assertionContext, vars: { evalRequestId: requestId, expectations: { allowed: [] } } }
    const empty = await request(chatResponse(requestId))
    expect(behavior(empty, noTools).pass).toBe(true)
    expect((await structural(empty, noTools)).pass).toBe(true)
    const refused = await request({ error: 'Daily AI message limit reached.', errorCode: 'PAY_GATE' }, 403)
    const refusalContext = { ...noTools, vars: { ...noTools.vars, expectedHttpStatus: 403 } }
    expect(behavior(refused, refusalContext).pass).toBe(true)
    expect((await structural(refused, refusalContext)).pass).toBe(true)
    expect(behavior(refused, noTools).pass).toBe(false)
    const wrongRequest = await request({ error: 'Daily AI message limit reached.', errorCode: 'PAY_GATE' }, 403, 'other-request')
    expect(behavior(wrongRequest, refusalContext).pass).toBe(false)
  })

  it.each([200, 403])('rejects invalid final responses without logging a raw trace: %s', async (status) => {
    const response = chatResponse(requestId, [toolCall('query_habits', { date: 'PRIVATE_TRACE_SENTINEL' })])
    response.aiMessage = null
    if (status === 403) Object.assign(response, { error: 'PRIVATE_TRACE_SENTINEL', errorCode: 'NO_PERMISSION' })
    const logs = []
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { logs.push(String(chunk)); return true })
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => { logs.push(String(chunk)); return true })
    let outcome
    try {
      const outcomes = await Promise.allSettled([request(response, status)])
      outcome = outcomes[0]
    } finally {
      stdout.mockRestore()
      stderr.mockRestore()
    }
    expect(logs.join('')).not.toContain('PRIVATE_TRACE_SENTINEL')
    expect(outcome.status).toBe('fulfilled')
    expect(outcome.value).toMatchObject({ error: status === 403
      ? 'Astra returned an unexpected refusal.' : 'Astra did not return a nonempty aiMessage final answer.' })
  })

  it('generates a fresh request identity after each reset', async () => {
    offlineCredentials()
    vi.stubGlobal('fetch', async (url) => new URL(url).pathname === '/health'
      ? Response.json({ status: 'Healthy', commit: null, checks: [] }) : refreshResponse())
      const test = { metadata: { id: 'offline' }, vars: { credentialKey: 'ORBIT_EVAL_TOKEN' } }
    const first = (await beforeEach({ test })).test.vars.evalRequestId
    const second = (await beforeEach({ test })).test.vars.evalRequestId
    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    expect(second).not.toBe(first)
  })
})

vi.mock('../fixtures/reset.mjs', async (importOriginal) => ({ ...await importOriginal(), resetFixture: vi.fn() }))
