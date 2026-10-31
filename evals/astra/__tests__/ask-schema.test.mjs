import { expect, it } from 'vitest'
import { behavior, structural } from '../assertions.mjs'
import parseResponse from '../response.mjs'
import { chatResponse, toolCall, habitAccountRead } from './fixtures/producer.mjs'

const clientContext = { supportsParts: true }
const reasons = ['preference', 'check_in', 'record_selection', 'bulk_selection']

// Producer: AskTool.cs:45-53,119-136,195-200 and StrictToolSchema.Create.
function ask(reason = 'record_selection') {
  return toolCall('ask', { input: { form: 'choice', missing_input: reason,
    question: 'Which habit?', options: [
      { id: 'water', label: 'Water', description: null },
      { id: 'walk', label: 'Walk', description: null },
    ], multiSelect: false, allowFreeText: false } }, 'Succeeded', 'ask', clientContext)
}

function response(calls) {
  return parseResponse(chatResponse('ask-schema', calls), '', {
    response: { status: 200, headers: { 'x-orbit-request-id': 'ask-schema' } },
  })
}

const context = { vars: { evalRequestId: 'ask-schema', clientContext }, test: { vars: {} } }
const validate = (calls) => structural(response(calls), context)

it.each(reasons)('accepts %s after a successful typed account read, including an empty result', async (reason) => {
  const verdict = await validate([habitAccountRead(), ask(reason)])
  expect(verdict.pass, verdict.reason).toBe(true)
})

it('accepts the selection read payload that omits a read directive', async () => {
  const verdict = await validate([habitAccountRead(true), ask()])
  expect(verdict.pass, verdict.reason).toBe(true)
})

it('accepts a typed account read from another tool', async () => {
  const read = toolCall('get_subscription_overview', { include_status: true }, 'Succeeded', 'plan', clientContext)
  read.result.readDirective = '[[orbit:read:plan]]'
  const verdict = await validate([read, ask('preference')])
  expect(verdict.pass, verdict.reason).toBe(true)
})

it.each(reasons)('rejects pre-read %s even when the ask execution succeeded', async (reason) => {
  expect((await validate([ask(reason)])).pass).toBe(false)
  expect((await validate([ask(reason), habitAccountRead()])).pass).toBe(false)
})

it('rejects habit setup without a prior typed missing-field create result', async () => {
  expect((await validate([ask('habit_setup')])).pass).toBe(false)
})

it('classifies a post-read ask as a non-write without mutation scope', () => {
  const verdict = behavior(response([habitAccountRead(true), ask()]), {
    ...context, vars: { ...context.vars, expectations: { allowed: ['query_habits', 'ask'] } },
  })
  expect(verdict.pass, verdict.reason).toBe(true)
})

// Producer: Models/HabitSetupDraft.cs:5-9, NeedsClarificationPayload.cs:3-6 and CreateHabitTool.cs:332-352.
function missingFieldCreate(name = 'create_habit', id = 'new-draft', title = 'Walking habit') {
  const call = toolCall(name, { title, ...(name === 'create_sub_habit'
    ? { parent_habit_id: '11111111-1111-4111-8111-111111111111' } : {}) }, 'Succeeded', id, clientContext)
  call.result.payload = { draft_call_id: id, missing_field: 'frequency_unit', title,
    clarification: { question: 'habits.clarification.questionFallback', missingArgumentKey: 'frequency_unit',
      quickActions: [
        ['daily', { frequency_unit: 'Day', frequency_quantity: 1 }],
        ['weekly', { frequency_unit: 'Week', frequency_quantity: 1 }],
        ['threePerWeek', { frequency_unit: 'Week', frequency_quantity: 3, is_flexible: true }],
        ['oneTime', { frequency_unit: 'OneTime' }],
      ].map(([key, patch]) => ({ label: `habits.clarification.quickAction.${key}`, value: JSON.stringify(patch), description: null })) } }
  return call
}

function setupAsk(form = 'choice', id = 'new-draft', field = 'frequency_unit') {
  const call = ask('habit_setup')
  call.arguments.input = { ...(form === 'choice' ? call.arguments.input : {
    form: 'question', missing_input: 'habit_setup', title: null, intro: null, progress: null,
    questions: [{ id: field, type: 'yesNo', prompt: 'Should this repeat?', allowFreeText: false }],
  }), draft_call_id: id, missing_field: field }
  return call
}

it.each(['create_habit', 'create_sub_habit'].flatMap((name) => ['choice', 'question'].map((form) => [name, form])))(
  'accepts a bound %s missing-field %s before any account read', async (name, form) => {
    const verdict = await validate([missingFieldCreate(name), setupAsk(form)])
    expect(verdict.pass, verdict.reason).toBe(true)
    expect((await validate([setupAsk(form), missingFieldCreate(name)])).pass).toBe(false)
  },
)

it.each([
  ['other reason', (input) => { input.missing_input = 'preference' }],
  ['other draft', (input) => { input.draft_call_id = 'another-draft' }],
  ['other field', (input) => { input.missing_field = 'due_time' }],
  ['missing binding', (input) => { delete input.draft_call_id }],
  ['missing question', (input) => { delete input.question }],
])('rejects a draft setup ask with %s', async (_, change) => {
  const call = setupAsk()
  change(call.arguments.input)
  expect((await validate([missingFieldCreate(), call])).pass).toBe(false)
})

it.each([
  ['unbound question', (input) => { input.questions[0].id = 'due_time' }],
  ['multiple questions', (input) => { input.questions.push({ ...input.questions[0] }) }],
])('rejects a draft setup with %s', async (_, change) => {
  const call = setupAsk('question')
  change(call.arguments.input)
  expect((await validate([missingFieldCreate(), call])).pass).toBe(false)
})

it.each([
  ['untyped result', (call) => { call.result.payload = { missing_field: 'frequency_unit' } }],
  ['failed create', (call) => { call.status = 'Failed'; call.result.success = false }],
  ['other call identity', (call) => { call.result.payload.draft_call_id = 'another-draft' }],
  ['other title', (call) => { call.result.payload.title = 'Another habit' }],
  ['other clarification field', (call) => { call.result.payload.clarification.missingArgumentKey = 'due_time' }],
  ['missing clarification', (call) => { delete call.result.payload.clarification }],
])('does not unlock draft setup after %s', async (_, change) => {
  const call = missingFieldCreate()
  change(call)
  expect((await validate([call, setupAsk()])).pass).toBe(false)
})

it('does not carry missing-field drafts between turns', async () => {
  expect((await validate([missingFieldCreate()])).pass).toBe(true)
  expect((await validate([setupAsk()])).pass).toBe(false)
})

it('keeps bindings for distinct titles and retires a replaced draft for the same title', async () => {
  const first = missingFieldCreate()
  const replacement = missingFieldCreate('create_habit', 'replacement')
  expect((await validate([first, replacement, setupAsk()])).pass).toBe(false)
  const current = await validate([first, replacement, setupAsk('choice', 'replacement')])
  expect(current.pass, current.reason).toBe(true)
  const other = missingFieldCreate('create_habit', 'other-draft', 'Reading habit')
  for (const id of ['new-draft', 'other-draft']) {
    const verdict = await validate([first, other, setupAsk('choice', id)])
    expect(verdict.pass, verdict.reason).toBe(true)
  }
})

it('does not offer a draft-bound pick list', async () => {
  const call = setupAsk()
  call.arguments.input = { form: 'pickList', missing_input: 'habit_setup', draft_call_id: 'new-draft',
    missing_field: 'frequency_unit', title: 'Choose habits', action: 'create_habits',
    items: [{ id: 'walk', label: 'Walk', detail: null, arguments: { title: 'Walk' } }] }
  expect((await validate([missingFieldCreate(), call])).pass).toBe(false)
})

it('replaces the draft declaration with the full declaration after an account read', async () => {
  const verdict = await validate([missingFieldCreate(), habitAccountRead(true), ask('preference')])
  expect(verdict.pass, verdict.reason).toBe(true)
})

it('does not carry account reads between turns', async () => {
  expect((await validate([habitAccountRead()])).pass).toBe(true)
  expect((await validate([ask()])).pass).toBe(false)
})

it.each(['Failed', 'PendingConfirmation', 'Denied', 'UnsupportedByPolicy', 'NotExecuted'])(
  'does not unlock ask after a %s account read', async (status) => {
    const read = habitAccountRead()
    read.status = status
    read.result.success = false
    expect((await validate([read, ask()])).pass).toBe(false)
  },
)

it('requires successful typed evidence bound to the read call', async () => {
  for (const change of [
    (read) => { delete read.result.readDirective },
    (read) => { read.result.readDirective = '[[orbit:read:another-call]]' },
    (read) => { read.result.success = false },
    (read) => { read.result.payload.selection_required = false; delete read.result.readDirective },
  ]) {
    const read = habitAccountRead()
    change(read)
    expect((await validate([read, ask()])).pass).toBe(false)
  }
  const help = toolCall('describe_feature', { feature_key: 'frequencies' }, 'Succeeded', 'help', clientContext)
  expect((await validate([help])).pass).toBe(true)
  expect((await validate([help, ask('preference')])).pass).toBe(false)
  const write = toolCall('update_habit', { habit_id: 'water', title: 'Water' }, 'Succeeded', 'write', clientContext)
  write.result.readDirective = '[[orbit:read:write]]'
  expect((await validate([write])).pass).toBe(true)
  expect((await validate([write, ask()])).pass).toBe(false)
})

it.each([
  ['unknown reason', (input) => { input.missing_input = 'invented' }],
  ['missing question', (input) => { delete input.question }],
  ['wrong question type', (input) => { input.question = 42 }],
  ['too few options', (input) => { input.options = [] }],
  ['extra field', (input) => { input.extra = true }],
])('rejects a malformed post-read ask: %s', async (_, change) => {
  const call = ask()
  change(call.arguments.input)
  expect((await validate([habitAccountRead(), call])).pass).toBe(false)
})

it('still validates every other call after the schema transition', async () => {
  const invalidRead = toolCall('query_habits', { extra: true }, 'Succeeded', 'invalid', clientContext)
  expect((await validate([habitAccountRead(), ask(), invalidRead])).pass).toBe(false)
})
