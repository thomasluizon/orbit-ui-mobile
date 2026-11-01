import { ATTEMPTS_PER_CASE } from '../attempts.mjs'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { behavior, structural } from '../assertions.mjs'
import parseResponse from '../response.mjs'
import { summarize } from '../report.mjs'
import { toolCall, capacityFailureCall } from './fixtures/producer.mjs'
import { retrospectiveResponse } from './fixtures/public-api.mjs'
import { nullableSchema, schemaVariants } from '../tool-schema.mjs'

const { tools: catalog } = parse(readFileSync(new URL('../catalog.yaml', import.meta.url), 'utf8'))
const scenarios = ['scenarios.yaml', 'composition-scenarios.yaml'].flatMap((path) => parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')))
let callNumber = 0
const call = (name, arguments_, overrides = {}, clientContext = {}) => {
  const writes = catalog.find((tool) => tool.function.name === name)?.writes
  const produced = toolCall(name, arguments_, overrides.resultStatus ?? (writes ? 'PendingConfirmation' : 'Succeeded'),
    `call-${++callNumber}`, clientContext)
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
  gradingResult: { componentResults: [{ pass: true, assertion: { metric: 'composition' }, metadata: { skipped } }] },
})

function exampleArguments(expected) {
  if (Array.isArray(expected)) return expected.map(exampleArguments)
  if (expected && typeof expected === 'object') {
    if ('anyOf' in expected) return exampleArguments(expected.anyOf[0])
    if ('textContains' in expected) return expected.textContains
    if ('optional' in expected) return expected.optional
    return Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, exampleArguments(value)]))
  }
  return expected
}

function schemaArguments(schema, root = schema) {
  if (nullableSchema(schema, root)) return null
  schema = schemaVariants(schema, root)[0]
  if (schema.enum) return schema.enum.find((value) => value !== null)
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type
  if (type === 'object') return Object.fromEntries((schema.required ?? []).map((name) => [name, schemaArguments(schema.properties[name], root)]))
  if (type === 'array') return Array.from({ length: schema.minItems ?? 1 }, () => schemaArguments(schema.items, root))
  return type === 'string' ? 'first' : type === 'boolean' ? true : 1
}

describe('production scenario mutation scope', () => {
  it.each([
    ['voice-en', 'bulk_log_habits', '{habitId}'],
    ['voice-pt', 'bulk_skip_habits', '{secondHabitId}'],
  ])('%s accepts one approved bulk preview for only its requested target', (id, name, habitId) => {
    const { expectations } = scenarios.find((scenario) => scenario.metadata.id === id).vars
    for (const arguments_ of [{ habit_ids: [habitId] }, { filter: { habit_ids: [habitId] } }]) {
      expect(behavior(envelope([call(name, arguments_)]), context(expectations)).pass).toBe(true)
    }
    expect(behavior(envelope([call(name, { habit_ids: [habitId, 'unrequested'] })]), context(expectations)).pass).toBe(false)
    expect(behavior(envelope([call(name, { habit_ids: [habitId] }), call(name, { habit_ids: [habitId] })]), context(expectations)).pass).toBe(false)
    const single = call(name === 'bulk_log_habits' ? 'log_habit' : 'skip_habit', { habit_id: habitId })
    expect(behavior(envelope([single, call(name, { habit_ids: [habitId] })]), context(expectations)).pass).toBe(false)
  })
  it('accepts only the named today reads, including daily summary defaults', () => {
    const { expectations } = scenarios.find((scenario) => scenario.metadata.id === 'single-read-en').vars
    for (const [name, arguments_] of [
      ['get_daily_summary', {}], ['query_habits', { date: 'today' }], ['query_habits', { date: '{accountDate}' }], ['get_daily_summary', { date_from: null, date_to: null }],
      ['get_daily_summary', { date_from: '{accountDate}', date_to: '{accountDate}', generate_narrative: false }],
    ]) expect(behavior(envelope([call(name, arguments_)]), context(expectations)).pass).toBe(true)
    for (const [name, arguments_] of [
      ['get_daily_summary', { date_from: 'yesterday' }], ['get_daily_summary', { date_to: 'tomorrow' }],
      ['query_habits', { date: 'tomorrow' }], ['get_streak', {}],
    ]) expect(behavior(envelope([call(name, arguments_)]), context(expectations)).pass).toBe(false)
    expect(behavior(envelope([]), context(expectations)).pass).toBe(false)
  })

  it('accepts one Meditar create through either tool and rejects extra targets or calls', () => {
    const { expectations } = scenarios.find((scenario) => scenario.metadata.id === 'single-create-pt').vars
    const habit = { title: 'Meditar', frequency_unit: 'Day', frequency_quantity: 1 }
    const single = call('create_habit', habit)
    const bulk = call('bulk_create_habits', { habits: [habit] })
    expect(behavior(envelope([single]), context(expectations)).pass).toBe(true)
    expect(behavior(envelope([bulk]), context(expectations)).pass).toBe(true)
    for (const calls of [[], [single, bulk], [bulk, call('bulk_create_habits', { habits: [habit] })],
      [call('bulk_create_habits', { habits: [habit, { ...habit, title: 'Walk' }] })],
      [call('bulk_create_habits', { habits: [{ ...habit, frequency_unit: 'Week' }] })],
      [call('bulk_create_habits', { habits: [{ ...habit, title: 'Walk' }] })],
    ]) expect(behavior(envelope(calls), context(expectations)).pass).toBe(false)
  })

  it('classifies every catalog tool explicitly', () => {
    for (const tool of catalog) expect(typeof tool.writes, tool.function.name).toBe('boolean')
  })

  it.each(scenarios.filter((scenario) => !scenario.vars.refine && !scenario.metadata.family?.startsWith('offers-')).map((scenario) => [scenario.metadata.id, scenario.vars]))(
    '%s accepts its operations and rejects an extra valid write', async (id, vars) => {
      const retrospective = retrospectiveResponse(true)
      vars = JSON.parse(JSON.stringify(vars).replaceAll('{accountDate}', retrospective.dateTo)
        .replaceAll('{retrospectiveFrom}', retrospective.dateFrom))
      const calls = (vars.expectations.required ?? []).map((entry) => {
        const required = entry.anyOf?.[0] ?? entry
        const outcome = required.resultStatus === undefined ? {} : { resultStatus: required.resultStatus }
        const produced = call(required.name, exampleArguments(required.argumentsAnyOf?.[0] ?? required.arguments ?? {}), outcome, vars.clientContext)
        if (id === 'edge-free-limit-en') produced.result = { ...capacityFailureCall().result, id: produced.id }
        if (required.name === 'get_retrospective') produced.result.payload = retrospective
        return produced
      })
      const output = { ...envelope(calls), httpStatus: vars.expectedHttpStatus ?? 200 }
      // This test isolates declared mutation scope; restart.test exercises the fixture and readback graders.
      const scenarioContext = { ...context(vars.expectations), vars: { ...vars, restart: undefined, evalRequestId: 'local-request' } }
      expect(behavior(output, scenarioContext).pass).toBe(true)
      if (id.startsWith('composition-compound-legacy-') || id.startsWith('composition-rankings-')) {
        const structure = await structural(output, scenarioContext)
        expect(structure.pass, structure.reason).toBe(true)
      }
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
      const arguments_ = ['bulk_log_habits', 'bulk_skip_habits', 'bulk_delete_habits'].includes(tool.function.name)
        ? { habit_ids: ['other'] } : schemaArguments(tool.function.parameters)
      const extra = call(tool.function.name, arguments_)
      expect((await structural(envelope([extra]), context(expectations))).pass, tool.function.name).toBe(true)
      expect(behavior(envelope([call('query_habits', { date: 'today' }), extra]), context(expectations)).pass).toBe(false)
    }
  })

  it('permits reads but rejects another target for the same mutation without relying on counts', () => {
    const expectations = { required: [{ name: 'log_habit', arguments: { habit_id: 'first' } }] }
    const calls = [call('query_habits', {}), call('log_habit', { habit_id: 'first' })]
    expect(behavior(envelope(calls), context(expectations)).pass).toBe(true)
    expect(behavior(envelope([...calls, call('log_habit', { habit_id: 'second' })]), context(expectations)).pass).toBe(false)
  })

  it('requires the typed free-limit refusal and rejects a held preview or extra target', () => {
    const { expectations } = scenarios.find((scenario) => scenario.metadata.id === 'edge-free-limit-en').vars
    const failure = call('create_habit', { title: 'Stretch', frequency_unit: 'Day' }, { resultStatus: 'Failed' })
    failure.result = { ...capacityFailureCall().result, id: failure.id }
    expect(behavior(envelope([]), context(expectations)).pass).toBe(false)
    expect(behavior(envelope([failure]), context(expectations)).pass).toBe(true)
    expect(behavior(envelope([call('create_habit', { title: 'Stretch', frequency_unit: 'Day' })]), context(expectations)).pass).toBe(false)
    failure.arguments.title = 'Unrequested'
    expect(behavior(envelope([failure]), context(expectations)).pass).toBe(false)
  })

  it.each(['bulk_log_habits', 'bulk_skip_habits'])(
    '%s validates model selector shapes and rejects failed selector executions', async (name) => {
      const habitIds = ['first', 'second']
      for (const arguments_ of [
        { habit_ids: habitIds }, { filter: { habit_ids: habitIds } },
        { habit_ids: habitIds, date: '2026-01-01' }, { filter: { habit_ids: habitIds }, date: '2026-01-01' },
        { filter: { habit_ids: habitIds }, habit_ids: null },
      ]) {
        expect((await structural(envelope([call(name, arguments_)]), context({}))).pass).toBe(true)
      }
      for (const filter of [{ habit_ids: habitIds }, { all: true }]) {
        const rejected = call(name, { habit_ids: habitIds, filter }, { resultStatus: 'Failed' })
        expect((await structural(envelope([rejected]), context({}))).pass).toBe(true)
        expect(behavior(envelope([rejected]), context({ permittedMutations: [{ name }] })).pass).toBe(false)
      }
      for (const arguments_ of [{}, { habit_ids: null }, { filter: null }, { habit_ids: null, filter: null }]) {
        const rejected = call(name, arguments_, { resultStatus: 'Failed' })
        expect((await structural(envelope([rejected]), context({}))).pass).toBe(true)
        expect(behavior(envelope([rejected]), context({ permittedMutations: [{ name }] })).pass).toBe(false)
      }
    },
  )

  it.each(['bulk_log_habits', 'bulk_skip_habits'])(
    '%s accepts an explicit null filter with top-level habit IDs', async (name) => {
      const arguments_ = { habit_ids: ['first', 'second'], filter: null }
      expect((await structural(envelope([call(name, arguments_)]), context({}))).pass).toBe(true)
    },
  )
})

describe('tool evidence', () => {
  it.each([
    ['query_habits', { search: 42 }], ['query_habits', { date: false }], ['query_habits', { is_completed: 'false' }],
    ['update_habit', { habit_id: 'first', frequency_quantity: 1.5 }], ['log_habit', { habit_id: null }],
    ['bulk_create_habits', { habits: [{ title: 'Walk', parent_habit_id: 42 }] }],
    ['query_habits', { invented_argument: true }],
  ])('retains producer constraints for malformed %s arguments: %j', async (name, arguments_) => {
    expect((await structural(envelope([call(name, arguments_)]), context({}))).pass).toBe(false)
  })
  it.each([
    ['query_habits', { search: null, date: null, is_completed: null }],
    ['update_habit', { habit_id: 'first', frequency_quantity: null }],
    ['bulk_create_habits', { habits: [{ title: 'Walk', parent_habit_id: null }] }],
    ['bulk_log_habits', { habit_ids: ['first'], filter: null }],
    ['bulk_skip_habits', { habit_ids: ['first'], filter: null }],
    ['bulk_delete_habits', { habit_ids: ['first'], filter: null }],
  ])('accepts the producer optional-null schema for %s', async (name, arguments_) => {
    expect((await structural(envelope([call(name, arguments_)]), context({}))).pass).toBe(true)
  })
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

describe('pass^k gate', () => {
  it('requires every configured attempt to succeed for every case', () => {
    const results = Array.from({ length: ATTEMPTS_PER_CASE }, () => attempt('a'))
    expect(summarize(results, ['a']).status).toBe('pass')
    results[0] = attempt('a', false)
    expect(summarize(results, ['a']).status).toBe('fail')
  })
  it('never counts skipped tool evidence as a launch pass', () => {
    const results = Array.from({ length: ATTEMPTS_PER_CASE }, () => attempt('a'))
    results[0] = attempt('a', true, true)
    const summary = summarize(results, ['a'])
    expect(summary.status).toBe('incomplete')
    expect(summary.cases[0]).toMatchObject({ allAttemptsPass: 'incomplete', skipped: 1 })
  })
  it('reports unavailable evidence as incomplete and preserves independent rubric failures', () => {
    const unavailable = attempt('a', false)
    unavailable.gradingResult.componentResults = [{ pass: false, metadata: { unavailable: true } }]
    const results = Array.from({ length: ATTEMPTS_PER_CASE }, () => attempt('a'))
    results[0] = unavailable
    expect(summarize(results, ['a']).status).toBe('incomplete')
    unavailable.gradingResult.componentResults.push({ pass: false })
    expect(summarize(results, ['a']).status).toBe('fail')
  })
  it('detects missing, extra, or absent cases', () => {
    expect(summarize(Array.from({ length: ATTEMPTS_PER_CASE - 1 }, () => attempt('a')), ['a']).status).toBe('incomplete')
    expect(summarize(Array.from({ length: ATTEMPTS_PER_CASE + 1 }, () => attempt('a')), ['a']).status).toBe('incomplete')
    expect(summarize([attempt('foreign')], ['a']).status).toBe('incomplete')
    expect(summarize([], ['a']).status).toBe('incomplete')
    expect(summarize([], []).status).toBe('incomplete')
  })
})
