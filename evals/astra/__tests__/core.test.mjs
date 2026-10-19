import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { behavior, structural } from '../assertions.mjs'
import parseResponse from '../response.mjs'
import { summarize } from '../report.mjs'

const catalog = parse(readFileSync(new URL('../catalog.yaml', import.meta.url), 'utf8'))
const call = (name, arguments_, overrides = {}) => ({ name, arguments: arguments_, resultStatus: 'ok', result: {}, ...overrides })
// This envelope belongs to this harness. It is not a fixture for an unshipped API field.
const envelope = (calls) => ({ answer: 'Done.', trace: {
  state: 'available', requestId: 'local-request', responseRequestId: 'local-request', calls,
} })
const context = (expectations) => ({
  vars: { expectations }, test: { vars: {} }, provider: { config: { tools: catalog } },
})
const attempt = (id, success = true, skipped = false) => ({
  testCase: { metadata: { id } }, success,
  gradingResult: { componentResults: [{ metadata: { skipped } }] },
})

describe('tool evidence', () => {
  it('skips unverified API trace fields with an explicit reason', () => {
    const response = parseResponse({ aiMessage: 'Hello' })
    expect(behavior(response, context({}))).toMatchObject({ pass: true, metadata: { skipped: true } })
    expect(response.trace.reason).toContain('#1573')
  })
  it.each([{}, { aiMessage: null }, { aiMessage: '' }, { aiMessage: ' ' }])('rejects missing final text: %j', (response) => {
    expect(() => parseResponse(response)).toThrow('aiMessage')
  })
  it('grades a budget refusal only in a case expecting the verified HTTP outcome', () => {
    const output = parseResponse({ error: 'Daily AI message limit reached.', errorCode: 'PAY_GATE' }, '', { response: { status: 403 } })
    expect(behavior(output, { vars: { expectedHttpStatus: 403, expectations: {} } }).pass).toBe(true)
    expect(behavior(output, context({})).pass).toBe(false)
    expect(() => parseResponse({ error: 'Denied', errorCode: 'NO_PERMISSION' }, '', { response: { status: 403 } })).toThrow('unexpected refusal')
  })
  it('matches a compound operation in either order', () => {
    const calls = [call('update_habit', { habit_id: 'first', title: '  CAMINHADA  diária ' }), call('skip_habit', { habit_id: 'second' })]
    const expectations = { required: [
      { name: 'skip_habit', arguments: { habit_id: 'second' } },
      { name: 'update_habit', arguments: { habit_id: 'first', title: { textContains: 'caminhada diaria' } } },
    ] }
    expect(behavior(envelope(calls), context(expectations)).pass).toBe(true)
    expect(behavior(envelope(calls.reverse()), context(expectations)).pass).toBe(true)
  })
  it('rejects a compound case with only one required tool', () => {
    expect(behavior(envelope([call('log_habit', { habit_id: 'first' })]), context({ required: [
      { name: 'log_habit', arguments: { habit_id: 'first' } }, { name: 'skip_habit', arguments: { habit_id: 'second' } },
    ] })).pass).toBe(false)
  })
  it.each(['other-id', 'FIRST'])('matches IDs exactly: %s', (habitId) => {
    expect(behavior(envelope([call('log_habit', { habit_id: habitId })]), context({ required: [
      { name: 'log_habit', arguments: { habit_id: 'first' } },
    ] })).pass).toBe(false)
  })
  it('matches enum casing exactly', () => {
    expect(behavior(envelope([call('create_habit', { title: 'Walk', frequency_unit: 'day' })]), context({ required: [
      { name: 'create_habit', arguments: { frequency_unit: 'Day' } },
    ] })).pass).toBe(false)
  })
  it('checks result payloads and status when expected', () => {
    const expectations = { required: [{ name: 'log_habit', resultStatus: 'ok', result: { applied: true } }] }
    expect(behavior(envelope([call('log_habit', {})]), context(expectations)).pass).toBe(false)
    expect(behavior(envelope([call('log_habit', {}, { result: { applied: true } })]), context(expectations)).pass).toBe(true)
  })
  it('matches one bulk call with an unordered ID set', () => {
    const expectations = { required: [{ name: 'bulk_log_habits', arguments: { habit_ids: ['first', 'second'] } }],
      counts: { bulk_log_habits: 1 }, forbidden: ['log_habit'] }
    expect(behavior(envelope([call('bulk_log_habits', { habit_ids: ['second', 'first'] })]), context(expectations)).pass).toBe(true)
    expect(behavior(envelope([call('log_habit', { habit_id: 'first' }), call('log_habit', { habit_id: 'second' })]), context(expectations)).pass).toBe(false)
    expect(behavior(envelope([call('bulk_log_habits', { habit_ids: ['first', 'second'] }), call('bulk_log_habits', {})]), context(expectations)).pass).toBe(false)
  })
  it('accepts both verified bulk ID argument forms and rejects extra targets', () => {
    const expectations = { required: [{ name: 'bulk_log_habits', argumentsAnyOf: [
      { habit_ids: ['first', 'second'] }, { filter: { habit_ids: ['first', 'second'] } },
    ] }] }
    expect(behavior(envelope([call('bulk_log_habits', { filter: { habit_ids: ['second', 'first'] } })]), context(expectations)).pass).toBe(true)
    expect(behavior(envelope([call('bulk_log_habits', { filter: { habit_ids: ['first', 'other'] } })]), context(expectations)).pass).toBe(false)
  })
  it('requires distinct calls for distinct requirements', () => {
    expect(behavior(envelope([call('log_habit', {})]), context({ required: [{ name: 'log_habit' }, { name: 'log_habit' }] })).pass).toBe(false)
  })
  it('forbids any mutation during clarification', () => {
    expect(behavior(envelope([call('create_habit', { title: 'Maybe' })]), context({ allowed: ['ask', 'query_habits'] })).pass).toBe(false)
  })
  it('rejects a trace belonging to another request', () => {
    const output = envelope([])
    output.trace.responseRequestId = 'another-request'
    expect(behavior(output, context({})).pass).toBe(false)
  })
  it('rejects a trace without the full tool result', () => {
    const output = envelope([call('query_habits', {})])
    delete output.trace.calls[0].result
    expect(behavior(output, context({})).pass).toBe(false)
  })
  it('delegates structure validation to the installed promptfoo assertion', async () => {
    expect((await structural(envelope([call('log_habit', { habit_id: 'first' })]), context({}))).pass).toBe(true)
    expect((await structural(envelope([call('log_habit', {})]), context({}))).pass).toBe(false)
    expect((await structural(envelope([call('invented_tool', {})]), context({}))).pass).toBe(false)
  })
  it('accepts a genuine no-tool answer and skips missing trace separately', async () => {
    expect((await structural(envelope([]), context({}))).pass).toBe(true)
    expect(await structural(parseResponse({ aiMessage: 'Hello' }), context({}))).toMatchObject({ metadata: { skipped: true } })
  })
})

describe('pass^3 gate', () => {
  it('requires three successful attempts for every case', () => {
    expect(summarize([attempt('a'), attempt('a'), attempt('a')], ['a']).status).toBe('pass')
    expect(summarize([attempt('a'), attempt('a'), attempt('a', false)], ['a']).status).toBe('fail')
  })
  it('never counts skipped tool evidence as a launch pass', () => {
    const summary = summarize([attempt('a', true, true), attempt('a'), attempt('a')], ['a'])
    expect(summary.status).toBe('incomplete')
    expect(summary.cases[0]).toMatchObject({ pass3: 'incomplete', skipped: 1 })
  })
  it('detects missing, extra, or absent cases', () => {
    expect(summarize([attempt('a'), attempt('a')], ['a']).status).toBe('incomplete')
    expect(summarize(Array.from({ length: 4 }, () => attempt('a')), ['a']).status).toBe('incomplete')
    expect(summarize([], ['a']).status).toBe('incomplete')
    expect(summarize([], []).status).toBe('incomplete')
  })
})
