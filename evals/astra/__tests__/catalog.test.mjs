import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { beforeAll } from '../hooks.mjs'
import { structural } from '../assertions.mjs'
import parseResponse from '../response.mjs'
import { offlineCredentials } from './fixtures/credentials.mjs'
import { chatResponse, toolCall } from './fixtures/producer.mjs'

const apiCommit = '0031b9e336fb046c00bee9335ef5808479f70437'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

// Producer: orbit-api src/Orbit.Application/Chat/Tools/Implementations/QueryHabitsTool.cs:26-45,
// src/Orbit.Application/Chat/RelativeReadPeriod.cs:37-43 and Chat/TerminalReadDirective.cs:19-33.
const relativeRead = ['query_habits', { relative_period: 'today', orbit_read_complete: true }]
// Producer: orbit-api src/Orbit.Application/Chat/Tools/Implementations/GetSubscriptionOverviewTool.cs:19-28
// and src/Orbit.Application/Chat/TerminalReadDirective.cs:19-33.
const completedRead = ['get_subscription_overview', { include_status: true, orbit_read_complete: true }]
// Producer: orbit-api src/Orbit.Application/Chat/Tools/Implementations/CreateHabitTool.cs:29,
// BulkCreateHabitsTool.cs:410-440, src/Orbit.Domain/Entities/Habit.cs:8-34 and ValueObjects/HabitPlacement.cs:7-9.
const placedHabit = ['create_habit', { title: 'Read', frequency_unit: 'Day', frequency_quantity: 1,
  parent_habit_id: '11111111-1111-4111-8111-111111111111', placement: 'sub_habit' }]
// Producer: orbit-api src/Orbit.Application/Chat/Tools/Implementations/GetHabitMonthTool.cs:18-35
// src/Orbit.Application/Habits/Queries/RetrospectivePeriodRange.cs:14-18 and Chat/TerminalReadDirective.cs:19-33.
const habitMonth = ['get_habit_month', { relative_period: 'this_month', language: 'en', orbit_read_complete: true }]

async function validateTrace(name, arguments_, clientContext) {
  const call = { ...toolCall(name, {}), arguments: arguments_ }
  const output = parseResponse(chatResponse('catalog', [call]), '', {
    response: { status: 200, headers: { 'x-orbit-request-id': 'catalog' } },
  })
  return structural(output, { vars: { evalRequestId: 'catalog', clientContext }, test: { vars: {} } })
}

// Producer: QueryHabitsTool.GetParameterSchema, QueryGoalsTool.GetParameterSchema and StrictToolSchema.Create.
const legacyReads = [
  ['query_habits', { relative_period: 'today', search: null, date: null, include_overdue: null,
    is_general: null, is_completed: null, is_bad_habit: null, frequency: null, tag: null,
    include_sub_habits: null, include_metrics: null, offset: null, limit: null }],
  ['query_goals', { search: null, status: null, include_completed: null, include_descriptions: null,
    include_linked_habits: null, offset: null, limit: null }],
]

it.each(legacyReads)('validates %s against the declared client context', async (name, arguments_) => {
  for (const clientContext of [undefined, {}, { supportsParts: false }]) {
    const valid = await validateTrace(name, arguments_, clientContext)
    expect(valid.pass, valid.reason).toBe(true)
    expect((await validateTrace(name, { ...arguments_, orbit_read_complete: true }, clientContext)).pass).toBe(false)
  }
  expect((await validateTrace(name, arguments_, { supportsParts: true })).pass).toBe(false)
  const complete = await validateTrace(name, { ...arguments_, orbit_read_complete: true }, { supportsParts: true })
  expect(complete.pass, complete.reason).toBe(true)
})

it('synthesizes trace arguments for the client without inserting omitted fields', () => {
  for (const [name, arguments_] of legacyReads) {
    const expected = { ...arguments_ }
    if (name === 'query_habits') expected.relative_period = null
    expect(toolCall(name, {}).arguments).toStrictEqual(expected)
    expect(toolCall(name, {}, 'Succeeded', 'call-1', { supportsParts: false }).arguments)
      .not.toHaveProperty('orbit_read_complete')
    expect(toolCall(name, {}, 'Succeeded', 'call-1', { supportsParts: true }).arguments)
      .toHaveProperty('orbit_read_complete', false)
  }
  const ranking = toolCall('get_habit_ranking', { habit_ids: ['habit'], query_token: 'query', cursor: 'page' }).arguments
  for (const key of ['habit_ids', 'query_token', 'cursor']) expect(ranking).not.toHaveProperty(key)
})

// Producer: GetHabitRankingTool.GetParameterSchema and ProcessUserChatCommand.EvalTrace.cs:17-66.
it('validates sanitized ranking traces while retaining every observable constraint', async () => {
  const arguments_ = { relative_period: 'this_month', period_count: null, date_from: null,
    date_to_exclusive: null, window: null, months: null, metric: 'completion_log_records',
    page_size: null, refresh: null, orbit_read_complete: true }
  const clientContext = { supportsParts: true }
  const valid = await validateTrace('get_habit_ranking', arguments_, clientContext)
  expect(valid.pass, valid.reason).toBe(true)
  for (const key of ['habit_ids', 'query_token', 'cursor']) {
    expect((await validateTrace('get_habit_ranking', { ...arguments_, [key]: null }, clientContext)).pass).toBe(false)
  }
  for (const key of Object.keys(arguments_)) {
    const missing = { ...arguments_ }
    delete missing[key]
    expect((await validateTrace('get_habit_ranking', missing, clientContext)).pass, key).toBe(false)
  }
  for (const invalid of [{ metric: 'invented' }, { page_size: 'ten' }, { page_size: 0 }, { extra: true }]) {
    expect((await validateTrace('get_habit_ranking', { ...arguments_, ...invalid }, clientContext)).pass).toBe(false)
  }
})

// The collector applies result-schema marks recursively to the entire AiToolCallResult envelope.
it('accepts the producer result-name omission only where sensitivity metadata declares it', async () => {
  async function validate(call) {
    const output = parseResponse(chatResponse('catalog', [call]), '', {
      response: { status: 200, headers: { 'x-orbit-request-id': 'catalog' } },
    })
    return structural(output, { vars: { evalRequestId: 'catalog' }, test: { vars: {} } })
  }
  const ranking = toolCall('get_habit_ranking', {})
  delete ranking.result.name
  const valid = await validate(ranking)
  expect(valid.pass, valid.reason).toBe(true)
  for (const name of ['get_habit_ranking', 'wrong-tool']) {
    expect((await validate({ ...ranking, result: { ...ranking.result, name } })).pass).toBe(false)
  }
  const missingId = structuredClone(ranking)
  delete missingId.result.id
  expect((await validate(missingId)).pass).toBe(false)
  const read = toolCall('query_habits', {})
  delete read.result.name
  expect((await validate(read)).pass).toBe(false)
})

it.each([relativeRead, completedRead, placedHabit, habitMonth])('accepts the producer arguments for %s', async (name, supplied) => {
  const clientContext = { supportsParts: true }
  const { status, ...call } = toolCall(name, supplied, 'Succeeded', 'call-1', clientContext)
  const output = { trace: { state: 'available', requestId: 'catalog', responseRequestId: 'catalog',
    calls: [{ ...call, resultStatus: status }] } }
  const result = await structural(output, { vars: { evalRequestId: 'catalog', clientContext }, test: { vars: {} } })
  expect(result.pass, result.reason).toBe(true)
})

it.each([['different commit', 'a'.repeat(40)], ['missing commit', null], ['matching commit', apiCommit]])(
  'checks the catalog before the first live case: %s', async (_, servedCommit) => {
    offlineCredentials()
    vi.stubEnv('ORBIT_EVAL_GRADER', 'offline-grader')
    // Producer: orbit-api src/Orbit.Api/Extensions/WebApplicationExtensions.cs:103-125.
    const request = vi.fn(async () => Response.json({ status: 'Healthy', commit: servedCommit, checks: [] }))
    vi.stubGlobal('fetch', request)
    const start = async () => beforeAll({ suite: { tests: [] } })
    if (servedCommit === apiCommit) await expect(start()).resolves.toBeUndefined()
    else {
      const failure = await start().catch((error) => error)
      expect(failure).toBeInstanceOf(Error)
      expect(failure.message).toContain(`catalog ${apiCommit}`)
      expect(failure.message).toContain(`API ${servedCommit}`)
      expect(failure.message).toContain('node evals/astra/generate-catalog.mjs')
    }
    expect(request.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/health'])
  },
)

it('records the full API source commit and refuses a dirty checkout without replacing the catalog', () => {
  const catalogPath = new URL('../catalog.yaml', import.meta.url)
  const committed = readFileSync(catalogPath, 'utf8')
  expect(parse(committed).apiCommit).toBe(apiCommit)
  const directory = mkdtempSync(join(tmpdir(), 'astra-dirty-api-'))
  try {
    execFileSync('git', ['init', '--quiet', directory])
    writeFileSync(join(directory, 'untracked'), 'dirty')
    const run = spawnSync(process.execPath,
      [fileURLToPath(new URL('../generate-catalog.mjs', import.meta.url)), directory], { encoding: 'utf8' })
    expect(run.status, run.stderr).toBe(1)
    expect(run.stderr).toContain('requires a clean API checkout')
    expect(readFileSync(catalogPath, 'utf8')).toBe(committed)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
