import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { behavior, structural } from '../assertions.mjs'
import parseResponse from '../response.mjs'
import { summarize } from '../report.mjs'
import { toolCall } from './fixtures/producer.mjs'

const catalog = parse(readFileSync(new URL('../catalog.yaml', import.meta.url), 'utf8'))
const scenarios = parse(readFileSync(new URL('../scenarios.yaml', import.meta.url), 'utf8'))
let callNumber = 0
const call = (name, arguments_, overrides = {}) => {
  const writes = catalog.find((tool) => tool.function.name === name)?.writes
  const produced = toolCall(name, arguments_, writes ? 'PendingConfirmation' : 'Succeeded', `call-${++callNumber}`)
  const { status, ...fields } = produced
  return { ...fields, resultStatus: status, ...overrides }
}
const envelope = (calls) => ({ answer: 'Done.', trace: {
  state: 'available', requestId: 'local-request', responseRequestId: 'local-request', calls,
} })
const context = (expectations) => ({
  vars: { expectations, evalRequestId: 'local-request' }, test: { vars: {} }, provider: { config: { tools: catalog } },
})
const attempt = (id, success = true, skipped = false) => ({
  testCase: { metadata: { id } }, success,
  gradingResult: { componentResults: [{ metadata: { skipped } }] },
})

function exampleArguments(expected) {
  if (Array.isArray(expected)) return expected.map(exampleArguments)
  if (expected && typeof expected === 'object') {
    if ('textContains' in expected) return expected.textContains
    return Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, exampleArguments(value)]))
  }
  return expected
}

describe('production scenario mutation scope', () => {
  it('classifies every catalog tool explicitly', () => {
    for (const tool of catalog) expect(typeof tool.writes, tool.function.name).toBe('boolean')
  })

  it.each(scenarios.map((scenario) => [scenario.metadata.id, scenario.vars]))(
    '%s accepts its operations and rejects an extra valid write', async (_, vars) => {
      const calls = (vars.expectations.required ?? []).map((required) => call(required.name,
        exampleArguments(required.argumentsAnyOf?.[0] ?? required.arguments ?? {})))
      const output = { ...envelope(calls), httpStatus: vars.expectedHttpStatus ?? 200 }
      const scenarioContext = { ...context(vars.expectations), vars: { ...vars, evalRequestId: 'local-request' } }
      expect(behavior(output, scenarioContext).pass).toBe(true)
      const extra = vars.expectations.required?.some((required) => required.name === 'update_habit')
        ? call('log_habit', { habit_id: '{secondHabitId}' })
        : call('update_habit', { habit_id: '{secondHabitId}', title: 'Unrequested rename' })
      expect((await structural(envelope([extra]), scenarioContext)).pass).toBe(true)
      expect(behavior({ ...output, trace: { ...output.trace, calls: [...calls, extra] } }, scenarioContext).pass).toBe(false)
    },
  )

  it('rejects every catalog mutation in a production read scenario', async () => {
    const { expectations } = scenarios.find((scenario) => scenario.metadata.id === 'single-read-en').vars
    for (const tool of catalog.filter((tool) => tool.writes)) {
      const extra = call(tool.function.name, { title: 'Unrequested', habit_id: 'other', habit_ids: ['other'] })
      expect((await structural(envelope([extra]), context(expectations))).pass).toBe(true)
      expect(behavior(envelope([call('query_habits', { date: 'today' }), extra]), context(expectations)).pass).toBe(false)
    }
  })

  it('permits reads but rejects another target for the same mutation without relying on counts', () => {
    const expectations = { required: [{ name: 'log_habit', arguments: { habit_id: 'first' } }] }
    const calls = [call('query_habits', {}), call('log_habit', { habit_id: 'first' })]
    expect(behavior(envelope(calls), context(expectations)).pass).toBe(true)
    expect(behavior(envelope([...calls, call('log_habit', { habit_id: 'second' })]), context(expectations)).pass).toBe(false)
  })

  it('scopes an optional free-limit create without requiring the refused write', () => {
    const { expectations } = scenarios.find((scenario) => scenario.metadata.id === 'edge-free-limit-en').vars
    expect(behavior(envelope([]), context(expectations)).pass).toBe(true)
    expect(behavior(envelope([call('create_habit', { title: 'Stretch', frequency_unit: 'Day' })]), context(expectations)).pass).toBe(true)
    expect(behavior(envelope([call('create_habit', { title: 'Unrequested', frequency_unit: 'Day' })]), context(expectations)).pass).toBe(false)
  })

  it.each(['bulk_log_habits', 'bulk_skip_habits'])(
    '%s rejects conflicting selectors while permitting either selector and extra date', async (name) => {
      const habitIds = ['first', 'second']
      for (const arguments_ of [
        { habit_ids: habitIds }, { filter: { habit_ids: habitIds } },
        { habit_ids: habitIds, date: '2026-01-01' }, { filter: { habit_ids: habitIds }, date: '2026-01-01' },
        { filter: { habit_ids: habitIds }, habit_ids: null },
      ]) {
        expect((await structural(envelope([call(name, arguments_)]), context({}))).pass).toBe(true)
      }
      for (const filter of [{ habit_ids: habitIds }, { all: true }]) {
        expect((await structural(envelope([call(name, { habit_ids: habitIds, filter })]), context({}))).pass).toBe(false)
      }
      for (const arguments_ of [{}, { habit_ids: null }, { filter: null }, { habit_ids: null, filter: null }]) {
        expect((await structural(envelope([call(name, arguments_)]), context({}))).pass).toBe(false)
      }
    },
  )

  it.each(['bulk_log_habits', 'bulk_skip_habits'])(
    '%s rejects an explicit null filter with top-level habit IDs', async (name) => {
      const arguments_ = { habit_ids: ['first', 'second'], filter: null }
      expect((await structural(envelope([call(name, arguments_)]), context({}))).pass).toBe(false)
    },
  )
})

describe('tool evidence', () => {
  it('fails unavailable API trace evidence with an explicit reason', () => {
    const response = parseResponse({ aiMessage: 'Hello' })
    expect(behavior(response, context({}))).toMatchObject({ pass: false, metadata: { unavailable: true } })
    expect(response.trace.state).toBe('unavailable')
  })
  it.each([{}, { aiMessage: null }, { aiMessage: '' }, { aiMessage: ' ' }])('rejects missing final text: %j', (response) => {
    expect(parseResponse(response)).toEqual({ error: 'Astra did not return a nonempty aiMessage final answer.' })
  })
  it('grades a budget refusal only in a case expecting the verified HTTP outcome', () => {
    const output = parseResponse({ error: 'Daily AI message limit reached.', errorCode: 'PAY_GATE' }, '', { response: { status: 403, headers: { 'x-orbit-request-id': 'local-request' } } })
    expect(behavior(output, { vars: { evalRequestId: 'local-request', expectedHttpStatus: 403, expectations: { allowed: [] } } }).pass).toBe(true)
    expect(behavior(output, context({})).pass).toBe(false)
    expect(parseResponse({ error: 'Denied', errorCode: 'NO_PERMISSION' }, '', { response: { status: 403 } }))
      .toEqual({ error: 'Astra returned an unexpected refusal.' })
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
  it('checks source-derived result text, null payload and status when expected', () => {
    const expectations = { required: [{ name: 'query_habits', resultStatus: 'Succeeded', result: {
      entityName: 'No habits found matching the given filters.', payload: null,
    } }] }
    const matching = call('query_habits', {})
    expect(behavior(envelope([matching]), context(expectations)).pass).toBe(true)
    matching.result.entityName = 'A different result'
    expect(behavior(envelope([matching]), context(expectations)).pass).toBe(false)
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
  it('accepts a genuine no-tool answer and rejects missing trace separately', async () => {
    expect((await structural(envelope([]), context({}))).pass).toBe(true)
    expect(await structural(parseResponse({ aiMessage: 'Hello' }), context({}))).toMatchObject({ pass: false, metadata: { unavailable: true } })
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
  it('reports unavailable evidence as incomplete and preserves independent rubric failures', () => {
    const unavailable = attempt('a', false)
    unavailable.gradingResult.componentResults = [{ pass: false, metadata: { unavailable: true } }]
    expect(summarize([unavailable, attempt('a'), attempt('a')], ['a']).status).toBe('incomplete')
    unavailable.gradingResult.componentResults.push({ pass: false })
    expect(summarize([unavailable, attempt('a'), attempt('a')], ['a']).status).toBe('fail')
  })
  it('detects missing, extra, or absent cases', () => {
    expect(summarize([attempt('a'), attempt('a')], ['a']).status).toBe('incomplete')
    expect(summarize(Array.from({ length: 4 }, () => attempt('a')), ['a']).status).toBe('incomplete')
    expect(summarize([], ['a']).status).toBe('incomplete')
    expect(summarize([], []).status).toBe('incomplete')
  })
})
