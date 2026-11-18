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
import { chatResponse, toolCall, changeListTrace, changeShapes } from './fixtures/producer.mjs'

const { RUN_PATHS, catalogsOf, toolCompletionControls, toolSensitiveFields, toolWrites } = policy
const { apiCommit } = parse(readFileSync(new URL('../catalog.yaml', import.meta.url), 'utf8'))

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const exported = parse(readFileSync(new URL('../catalog.yaml', import.meta.url), 'utf8'))
const namesOf = (list) => list.map((tool) => tool.function.name)
const askForms = (list) => list.find((tool) => tool.function.name === 'ask').function.parameters.properties.input.anyOf

const { changeKinds, planTitleArgument, wrapperName, changesArgument, shapes } = exported.changePlan
const listKeys = ['tools', 'legacyTools', 'offerTools']
const kindNames = changeKinds.map((kind) => kind.name)
const shapeLists = Object.keys(shapes).flatMap((shape) => listKeys.map((key) => [shape, key]))
// Producer: orbit-api ChangeKinds.MergedForms. The single form of each of these writes is one kind with its bulk form.
const mergedSingleForms = ['create_habit', 'create_sub_habit', 'delete_habit', 'log_habit', 'skip_habit']

// Producer: catalog-export.cs exports each client shape in two flag states. The ai_change_plan path keeps one ask
// declaration for the whole turn (orbit-api RefreshAskSchema returns at once there), so it has three lists only. It has
// them one time for each declaration shape of the change list (orbit-api ChangeDeclarationShape).
it('keeps each flag-off key and holds the three flag-on lists of each shape under changePlan', () => {
  expect(Object.keys(exported)).toEqual(['apiCommit', 'offerTools', 'offerPostReadTools', 'offerHabitSetupTools', 'tools',
    'legacyTools', 'postReadTools', 'habitSetupBinding', 'habitSetupTools', 'changePlan'])
  expect(Object.keys(exported.changePlan)).toEqual(['changeKinds', 'planTitleArgument', 'wrapperName', 'changesArgument', 'shapes'])
  // Producer: orbit-api ChangeDeclarations.PlanTitleArgument, WrapperName and ChangesArgument.
  expect(exported.changePlan).toMatchObject({ planTitleArgument: 'plan_title', wrapperName: 'propose_changes', changesArgument: 'changes' })
  expect(Object.keys(shapes)).toEqual(['kinds', 'wrapper'])
  expect(changeShapes).toEqual(Object.keys(shapes))
  for (const lists of Object.values(shapes)) expect(Object.keys(lists)).toEqual(listKeys)
  for (const key of ['postReadTools', 'habitSetupTools', 'offerPostReadTools', 'offerHabitSetupTools']) {
    expect(namesOf(exported[key])).toEqual(['ask'])
  }
})

// Producer: orbit-api ChangeKinds.IsKind. A change kind is a registered write tool that is no merged single form.
it('names each change kind with the write class and the sensitive fields of its registry entry', () => {
  const blockFirstWrites = exported.tools.filter((tool) => tool.writes)
  expect(kindNames).toEqual(namesOf(blockFirstWrites).filter((name) => !mergedSingleForms.includes(name)))
  for (const kind of changeKinds) {
    const { writes, sensitiveFields } = blockFirstWrites.find((tool) => tool.function.name === kind.name)
    expect(kind, kind.name).toEqual({ name: kind.name, writes, sensitiveFields })
  }
})

// Producer: orbit-api ProcessUserChatCommandHandler.ChangeListDeclarations. Each shape declares each read tool, ask and
// revise_pending_changes of the block-first list, and it declares no plan and no merged single form.
it.each(shapeLists)('declares each read tool, no present_plan and no merged single form in the %s shape of %s', (shape, key) => {
  const names = namesOf(shapes[shape][key])
  const reads = shapes[shape][key].filter((tool) => !tool.writes)
  expect(namesOf(reads)).toEqual(namesOf(exported[key].filter((tool) => !tool.writes && tool.function.name !== 'present_plan')))
  expect(names).toContain('revise_pending_changes')
  expect(names.includes('ask')).toBe(key !== 'legacyTools')
  for (const name of ['present_plan', ...mergedSingleForms]) expect(names, name).not.toContain(name)
  expect(reads).toEqual(shapes[changeShapes[0]][key].filter((tool) => !tool.writes))
})

// Producer: orbit-api ChangeDeclarations.WithPlanTitle. The kinds shape declares one tool for each change kind, and each
// of them requires the plan title.
it.each(listKeys)('declares one tool with a plan title for each change kind in the kinds shape of %s', (key) => {
  const writes = shapes.kinds[key].filter((tool) => tool.writes)
  expect(namesOf(writes)).toEqual(kindNames)
  expect(namesOf(writes)).toContain('bulk_delete_habits')
  expect(namesOf(shapes.kinds[key])).not.toContain(wrapperName)
  for (const { function: { name, parameters } } of writes) {
    expect(parameters.properties[planTitleArgument], name).toMatchObject({ type: ['string', 'null'] })
    expect(parameters.required, name).toContain(planTitleArgument)
  }
})

// Producer: orbit-api ChangeDeclarations.Wrapper. The wrapper shape declares one propose_changes tool. It holds the
// change list, the plan title and the completion control, and each item of the list is one alternative for each kind.
it.each(listKeys)('declares one propose_changes tool with one alternative for each change kind in the wrapper shape of %s', (key) => {
  const writes = shapes.wrapper[key].filter((tool) => tool.writes)
  expect(namesOf(writes)).toEqual([wrapperName])
  const [{ sensitiveFields, function: { parameters } }] = writes
  expect(sensitiveFields).toEqual([])
  expect(parameters.required).toEqual(expect.arrayContaining(['orbit_write_complete', changesArgument, planTitleArgument]))
  const alternatives = parameters.properties[changesArgument].items.anyOf
  expect(alternatives.map((item) => item.properties.kind.enum)).toEqual(kindNames.map((name) => [name]))
  for (const item of alternatives) {
    expect(item.required).toEqual(['id', 'kind', 'arguments'])
    for (const control of [planTitleArgument, 'orbit_write_complete']) {
      expect(Object.keys(item.properties.arguments.properties ?? {}), item.properties.kind.enum[0]).not.toContain(control)
    }
  }
})

// A list that the module exports by its name holds the declarations of the block-first path only, so a reader that
// imports it grades a change-plan run with the lists of the other path.
it('gives the lists of a path only through catalogsOf', () => {
  for (const list of Object.keys(catalogsOf('block-first')[0])) expect(policy, list).not.toHaveProperty(list)
  expect(Object.keys(catalogsOf('block-first')[0]).toSorted()).toEqual(['habitSetupTools', 'legacyTools', 'offerHabitSetupTools',
    'offerPostReadTools', 'offerTools', 'postReadTools', 'tools'])
})

// One map of each kind classifies the calls of both paths: the exporter takes the write class and the sensitive fields
// from the registry entry of a tool, and the flag-on schema keeps the completion arguments of each tool.
it('gives each tool one write class, one set of sensitive fields and one set of completion controls on both paths', () => {
  expect(RUN_PATHS).toEqual(['block-first', 'change-plan'])
  expect(catalogsOf('block-first')).toHaveLength(1)
  expect(catalogsOf('change-plan')).toHaveLength(changeShapes.length)
  for (const lists of catalogsOf('change-plan')) {
    expect(Object.keys(lists).toSorted()).toEqual(Object.keys(catalogsOf('block-first')[0]).toSorted())
    expect(lists).toMatchObject({ postReadTools: [], habitSetupTools: [], offerPostReadTools: [], offerHabitSetupTools: [] })
  }
  const declared = RUN_PATHS.flatMap((path) => catalogsOf(path).flatMap((lists) => Object.values(lists).flat()))
  expect(declared.length).toBeGreaterThan(400)
  for (const tool of declared) {
    expect(toolWrites.get(tool.function.name), tool.function.name).toBe(tool.writes)
    expect([...toolSensitiveFields.get(tool.function.name)], tool.function.name).toEqual(tool.sensitiveFields)
  }
  for (const tool of Object.values(shapes).flatMap((lists) => lists.tools)) {
    if (!toolCompletionControls.has(tool.function.name)) continue
    expect(completionControls(tool.function.parameters), tool.function.name).toEqual(toolCompletionControls.get(tool.function.name))
  }
  expect(Object.values(shapes).flatMap((lists) => namesOf(lists.tools)).filter((name) => !toolCompletionControls.has(name)))
    .toEqual([wrapperName])
})

// The eval trace names a change by its kind in each shape (orbit-api ChangeDeclarations.Read), and the wrapper is a
// traced call only when it holds no change. The mutation scope check needs a write class for each traced name.
it('gives each change kind and the wrapper the write class true', () => {
  for (const name of [...kindNames, wrapperName]) expect(toolWrites.get(name), name).toBe(true)
})

// A traced change holds the arguments of the change, so its declaration in a trace list is no declaration of a model
// call: the kinds shape loses the plan title, and the wrapper shape gives each kind the arguments of its alternative.
it.each(shapeLists)('reads a traced change against the arguments of its kind in the %s shape of %s', (shape, key) => {
  const list = catalogsOf('change-plan')[changeShapes.indexOf(shape)][key]
  const declared = shapes[shape][key]
  for (const kind of changeKinds) {
    const traced = list.filter((tool) => tool.function.name === kind.name)
    expect(traced, kind.name).toHaveLength(1)
    expect(traced[0], kind.name).toMatchObject({ type: 'function', writes: true, sensitiveFields: kind.sensitiveFields })
    const { parameters, strict, description } = traced[0].function
    expect(strict, kind.name).toBe(true)
    expect(Object.keys(parameters.properties), kind.name).not.toContain(planTitleArgument)
    expect(parameters.required, kind.name).not.toContain(planTitleArgument)
    const own = declared.find((tool) => tool.function.name === kind.name)
    if (own) {
      expect(description).toBe(own.function.description)
      expect({ ...parameters.properties, [planTitleArgument]: own.function.parameters.properties[planTitleArgument] })
        .toEqual(own.function.parameters.properties)
      expect(parameters.required).toEqual(own.function.parameters.required.filter((name) => name !== planTitleArgument))
    } else {
      const wrapper = declared.find((tool) => tool.function.name === wrapperName).function.parameters
      const item = wrapper.properties[changesArgument].items.anyOf.find((entry) => entry.properties.kind.enum.includes(kind.name))
      expect(description).toBe(item.description)
      expect(parameters).toEqual({ ...item.properties.arguments, $defs: wrapper.$defs })
    }
  }
  expect(list.filter((tool) => !kindNames.includes(tool.function.name)))
    .toEqual(declared.filter((tool) => !kindNames.includes(tool.function.name)))
})

// Producer: orbit-api AskTool.GetChangePlanParameterSchema adds one choice form with `about` and `several`, and removes
// `target_ids` from each option.
it.each(shapeLists.filter(([, key]) => key !== 'legacyTools'))('declares the choice about records only in the flag-on ask of the %s shape of %s', (shape, key) => {
  const about = askForms(shapes[shape][key]).filter((form) => Object.hasOwn(form.properties, 'about'))
  expect(about).toHaveLength(1)
  expect(Object.keys(about[0].properties)).toEqual(['form', 'missing_input', 'question', 'about', 'several', 'allowFreeText'])
  expect(JSON.stringify(shapes[shape][key])).not.toContain('target_ids')
  expect(askForms(exported[key]).some((form) => Object.hasOwn(form.properties, 'about'))).toBe(false)
  expect(JSON.stringify(askForms(exported[key]))).toContain('target_ids')
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

async function validateCalls(calls, clientContext) {
  const output = parseResponse(chatResponse('catalog', calls), '', {
    response: { status: 200, headers: { 'x-orbit-request-id': 'catalog' } },
  })
  return structural(output, { vars: { evalRequestId: 'catalog', clientContext }, test: { vars: {} } })
}
const clients = [['parts', { supportsParts: true }], ['legacy', {}], ['offer', { supportsParts: true, supportsProactiveOffers: true }]]

// Producer: orbit-api ChangeListReplayTests.ChangeList_TheEvalTraceRecordsEachChangeWithItsKindAndArguments. In each
// shape the trace holds one call for each change, with the name of its kind and no propose_changes call.
it.each(changeShapes.flatMap((shape) => clients.map(([client, clientContext]) => [shape, client, clientContext])))(
  'validates each traced change of the %s shape against the arguments of its kind (%s client)', async (shape, _, clientContext) => {
    vi.stubEnv('ORBIT_EVAL_ASTRA_PATH', 'change-plan')
    const calls = changeListTrace(shape, clientContext)
    expect(calls.map(({ id, name, status }) => [id, name, status])).toEqual([
      ['delete', 'bulk_delete_habits', 'PendingConfirmation'], ['rename', 'bulk_update_habits', 'PendingConfirmation']])
    for (const call of calls) expect(call.arguments).not.toHaveProperty(planTitleArgument)
    const valid = await validateCalls(calls, clientContext)
    expect(valid.pass, valid.reason).toBe(true)
    const [remove, rename] = calls
    const undeclared = await validateCalls([{ ...remove, arguments: { ...remove.arguments, note: 'not declared' } }, rename], clientContext)
    expect(undeclared.pass).toBe(false)
    expect(undeclared.reason).toContain('bulk_delete_habits')
    // No run names its shape, so the reason holds the refusal of each shape, and one of them names the argument.
    expect(undeclared.reason).toContain('"additionalProperty":"note"')
    const invalidUpdate = structuredClone(rename)
    invalidUpdate.arguments.updates.title = 7
    const mistyped = await validateCalls([remove, invalidUpdate], clientContext)
    expect(mistyped.pass).toBe(false)
    expect(mistyped.reason).toContain('bulk_update_habits')
    // The plan title is an argument of the model call, never of a change (ChangeDeclarations.Read).
    const titled = await validateCalls([{ ...remove, arguments: { ...remove.arguments, [planTitleArgument]: null } }, rename], clientContext)
    expect(titled.pass).toBe(false)
  },
)

// One API serves one shape, so no trace holds a change of one shape next to a change of another.
const shapePairs = changeShapes.flatMap((first) => changeShapes.filter((second) => second !== first).map((second) => [first, second]))
it.each(shapePairs)('refuses a trace with a change of the %s shape and a change of the %s shape', async (first, second) => {
  vi.stubEnv('ORBIT_EVAL_ASTRA_PATH', 'change-plan')
  const clientContext = { supportsParts: true }
  const [remove] = changeListTrace(first, clientContext)
  const [, rename] = changeListTrace(second, clientContext)
  const mixed = await validateCalls([remove, rename], clientContext)
  expect(mixed.pass).toBe(false)
  expect(mixed.reason).toContain('bulk_update_habits')
  const single = await validateCalls([remove, changeListTrace(first, clientContext)[1]], clientContext)
  expect(single.pass, single.reason).toBe(true)
})

// Producer: orbit-api ProcessUserChatCommandHandler.TurnDeclarations. The block-first path declares the plan and each
// single write form; the ai_change_plan path declares neither, so a call of one of them is no valid call there.
it('validates a trace with present_plan and delete_habit on the block-first path only', async () => {
  const clientContext = { supportsParts: true }
  const plan = toolCall('present_plan', { title: 'Delete two habits', steps: [
    { text: 'Delete Water', tool: 'delete_habit', phase: 'approval' },
    { text: 'Delete Walk', tool: 'delete_habit', phase: 'approval' }] }, 'Succeeded', 'plan', clientContext)
  const remove = toolCall('delete_habit', { habit_id: '11111111-1111-4111-8111-111111111111' }, 'PendingConfirmation', 'delete', clientContext, true)
  for (const select of [() => vi.unstubAllEnvs(), () => vi.stubEnv('ORBIT_EVAL_ASTRA_PATH', 'block-first')]) {
    select()
    const valid = await validateCalls([plan, remove], clientContext)
    expect(valid.pass, valid.reason).toBe(true)
  }
  vi.stubEnv('ORBIT_EVAL_ASTRA_PATH', 'change-plan')
  for (const call of [plan, remove]) {
    const refused = await validateCalls([call], clientContext)
    expect(refused.pass, call.name).toBe(false)
    expect(refused.reason, call.name).toContain(call.name)
  }
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
