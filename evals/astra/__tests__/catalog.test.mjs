import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { beforeAll } from '../hooks.mjs'
import { beforeAll as beforeCoreRun } from '../core/hooks.mjs'
import { structural } from '../assertions.mjs'
import { completionControls } from '../tool-schema.mjs'
import * as policy from '../trace-policy.mjs'
import parseResponse from '../response.mjs'
import { offlineCredentials } from './fixtures/credentials.mjs'
import { chatResponse, toolCall } from './fixtures/producer.mjs'

const { RUN_PATHS, catalogOf, toolCompletionControls, toolSensitiveFields, toolWrites } = policy
const { apiCommit } = parse(readFileSync(new URL('../catalog.yaml', import.meta.url), 'utf8'))

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const exported = parse(readFileSync(new URL('../catalog.yaml', import.meta.url), 'utf8'))
const namesOf = (list) => list.map((tool) => tool.function.name)
const askForms = (list) => list.find((tool) => tool.function.name === 'ask').function.parameters.properties.input.anyOf

// Producer: catalog-export.cs exports each client shape in two flag states. The ai_change_plan path keeps one ask
// declaration for the whole turn (orbit-api RefreshAskSchema returns at once there), so it has three lists only.
it('keeps each flag-off key and holds the three flag-on lists under changePlan', () => {
  expect(Object.keys(exported)).toEqual(['apiCommit', 'offerTools', 'offerPostReadTools', 'offerHabitSetupTools', 'tools',
    'legacyTools', 'postReadTools', 'habitSetupBinding', 'habitSetupTools', 'changePlan'])
  expect(Object.keys(exported.changePlan)).toEqual(['tools', 'legacyTools', 'offerTools'])
  for (const shape of ['tools', 'legacyTools', 'offerTools']) {
    expect(exported.changePlan[shape].length).toBeGreaterThan(0)
    expect(namesOf(exported.changePlan[shape])).toEqual(namesOf(exported[shape]))
  }
  for (const key of ['postReadTools', 'habitSetupTools', 'offerPostReadTools', 'offerHabitSetupTools']) {
    expect(namesOf(exported[key])).toEqual(['ask'])
  }
  expect(namesOf(exported.changePlan.legacyTools)).not.toContain('ask')
})

// A list that the module exports by its name holds the declarations of the block-first path only, so a reader that
// imports it grades a change-plan run with the lists of the other path.
it('gives the lists of a path only through catalogOf', () => {
  for (const list of Object.keys(catalogOf('block-first'))) expect(policy, list).not.toHaveProperty(list)
  expect(Object.keys(catalogOf('block-first')).toSorted()).toEqual(['habitSetupTools', 'legacyTools', 'offerHabitSetupTools',
    'offerPostReadTools', 'offerTools', 'postReadTools', 'tools'])
})

// One map of each kind classifies the calls of both paths: the exporter takes the write class and the sensitive fields
// from the registry entry of a tool, and the flag-on schema keeps the completion arguments of each tool.
it('gives each tool one write class, one set of sensitive fields and one set of completion controls on both paths', () => {
  expect(RUN_PATHS).toEqual(['block-first', 'change-plan'])
  expect(Object.keys(catalogOf('change-plan')).toSorted()).toEqual(Object.keys(catalogOf('block-first')).toSorted())
  expect(catalogOf('change-plan')).toMatchObject({ postReadTools: [], habitSetupTools: [], offerPostReadTools: [], offerHabitSetupTools: [] })
  const declared = RUN_PATHS.flatMap((path) => Object.values(catalogOf(path)).flat())
  expect(declared.length).toBeGreaterThan(400)
  for (const tool of declared) {
    expect(toolWrites.get(tool.function.name), tool.function.name).toBe(tool.writes)
    expect([...toolSensitiveFields.get(tool.function.name)], tool.function.name).toEqual(tool.sensitiveFields)
  }
  for (const tool of catalogOf('change-plan').tools) {
    expect(completionControls(tool.function.parameters), tool.function.name).toEqual(toolCompletionControls.get(tool.function.name))
  }
})

// Producer: orbit-api AskTool.GetChangePlanParameterSchema adds one choice form with `about` and `several`, and removes
// `target_ids` from each option.
it.each(['tools', 'offerTools'])('declares the choice about records only in the flag-on ask of %s', (shape) => {
  const about = askForms(exported.changePlan[shape]).filter((form) => Object.hasOwn(form.properties, 'about'))
  expect(about).toHaveLength(1)
  expect(Object.keys(about[0].properties)).toEqual(['form', 'missing_input', 'question', 'about', 'several', 'allowFreeText'])
  expect(JSON.stringify(exported.changePlan[shape])).not.toContain('target_ids')
  expect(askForms(exported[shape]).some((form) => Object.hasOwn(form.properties, 'about'))).toBe(false)
  expect(JSON.stringify(askForms(exported[shape]))).toContain('target_ids')
})

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
const habitMonth = ['get_habit_month', { window: 'month', relative_period: 'this_month', language: 'en', orbit_read_complete: true }]

async function validateTrace(name, arguments_, clientContext) {
  const call = { ...toolCall(name, {}), arguments: arguments_ }
  const output = parseResponse(chatResponse('catalog', [call]), '', {
    response: { status: 200, headers: { 'x-orbit-request-id': 'catalog' } },
  })
  return structural(output, { vars: { evalRequestId: 'catalog', clientContext }, test: { vars: {} } })
}

// Producer: QueryHabitsTool.GetParameterSchema, QueryGoalsTool.GetParameterSchema and StrictToolSchema.Create.
const legacyReads = [
  ['query_habits', { for_selection: null, relative_period: 'today', search: null, date: null, include_overdue: null,
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

// The core set refuses a catalog of another commit through the same requireCatalogCommit (trace-policy.mjs), with the
// same message, before it writes any report.
it.each([['different commit', 'a'.repeat(40)], ['missing commit', null]])(
  'checks the catalog before the first core set case: %s', async (_, servedCommit) => {
    offlineCredentials()
    const request = vi.fn(async () => Response.json({ status: 'Healthy', commit: servedCommit, checks: [] }))
    vi.stubGlobal('fetch', request)
    const failure = await beforeCoreRun({ suite: { tests: [] } }).catch((error) => error)
    expect(failure).toBeInstanceOf(Error)
    expect(failure.message).toBe(`Astra catalog ${apiCommit} differs from API ${servedCommit}. Regenerate from a clean API `
      + 'checkout at that commit with node evals/astra/generate-catalog.mjs <api-checkout>.')
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

// Producer: the exported composition and legacy declarations control which completion arguments exist.
it.each(['en', 'pt-BR'])('uses the current starting-step completion declaration in %s', async (language) => {
  const arguments_ = { one_small_step: true, language, title: 'Walk',
    suggested_sub_habits: [{ title: 'Put on shoes' }] }
  for (const supportsParts of [false, true]) {
    const clientContext = { supportsParts }
    const call = toolCall('suggest_breakdown', arguments_, 'Succeeded', 'step', clientContext)
    expect(call.arguments).not.toHaveProperty('orbit_write_complete')
    if (supportsParts) expect(call.arguments).toHaveProperty('orbit_read_complete', false)
    else expect(call.arguments).not.toHaveProperty('orbit_read_complete')
    const valid = await validateTrace(call.name, call.arguments, clientContext)
    expect(valid.pass, valid.reason).toBe(true)
    const complete = toolCall('suggest_breakdown', arguments_, 'Succeeded', 'step', clientContext, true)
    if (supportsParts) expect(complete.arguments).toHaveProperty('orbit_read_complete', true)
    else expect(complete.arguments).not.toHaveProperty('orbit_read_complete')
    expect((await validateTrace(complete.name, complete.arguments, clientContext)).pass).toBe(true)
    const stale = { ...call.arguments, orbit_write_complete: false }
    expect((await validateTrace(call.name, stale, clientContext)).pass).toBe(false)
  }
})
