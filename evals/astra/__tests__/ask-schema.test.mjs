import { afterEach, expect, it, vi } from 'vitest'
import { behavior, structural } from '../assertions.mjs'
import parseResponse from '../response.mjs'
import { chatResponse, toolCall, changePlanToolCall, habitAccountRead } from './fixtures/producer.mjs'

afterEach(() => { vi.unstubAllEnvs() })

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

// AiIntentService.AppendToolConstraints keeps the cacheable SDK schema after account reads.
it.each(['choice', 'pickList', 'question'])('keeps the actual request declaration for post-read %s', async (form) => {
  const call = ask()
  call.arguments.input = { ...(form === 'choice' ? call.arguments.input : form === 'pickList' ? {
    form, missing_input: 'bulk_selection', title: 'Choose habits', action: 'log_habits',
    items: [{ id: 'water', label: 'Water', detail: null, arguments: { habit_id: 'water', date: '2031-06-10' } }],
  } : { form, missing_input: 'check_in', title: null, intro: null, progress: null,
    questions: [{ id: 'energy', type: 'yesNo', prompt: 'Feeling ready?', allowFreeText: false }],
  }), draft_call_id: null, missing_field: null }
  for (const offers of [false, true]) {
    const read = habitAccountRead(true, 'read', { ...clientContext, supportsProactiveOffers: offers })
    const candidate = structuredClone(call)
    if (offers) {
      candidate.arguments.orbit_dismissed_offer_keys = []
    }
    const grade = (entry) => structural(response([read, entry]), { ...context,
      vars: { ...context.vars, clientContext: { ...clientContext, supportsProactiveOffers: offers } } })
    const valid = await grade(candidate)
    expect(valid.pass, valid.reason).toBe(true)
    for (const fields of [['draft_call_id'], ['missing_field'], ['draft_call_id', 'missing_field']]) {
      const missing = structuredClone(candidate)
      for (const field of fields) delete missing.arguments.input[field]
      expect((await grade(missing)).pass, `Missing request properties: ${fields.join(', ')}`).toBe(false)
    }
    const extra = structuredClone(candidate)
    extra.arguments.input.invented = true
    expect((await grade(extra)).pass).toBe(false)
  }
})

it.each(['none', 'aim', 'dated_event', 'inspect'])('retains the producer offer read intent %s under strict validation', async (intent) => {
  const offerContext = { ...clientContext, supportsProactiveOffers: true }
  const read = habitAccountRead(false, 'read', offerContext)
  expect(read.arguments.orbit_offer_intent).toBe('none')
  read.arguments.orbit_offer_intent = intent
  const offerGrade = (call) => structural(response([call]), {
    ...context, vars: { ...context.vars, clientContext: offerContext },
  })
  const valid = await offerGrade(read)
  expect(valid.pass, valid.reason).toBe(true)
  expect(response([read]).trace.calls[0].arguments.orbit_offer_intent).toBe(intent)
  delete read.arguments.orbit_offer_intent
  const missing = await offerGrade(read)
  expect(missing.pass).toBe(false)
  expect(missing.reason).toContain('orbit_offer_intent')
  expect(missing.reason).toContain('required')
  expect(habitAccountRead().arguments).not.toHaveProperty('orbit_offer_intent')
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

// The ai_change_plan path. Producer: orbit-api ExecuteChangePlanAskAsync needs no read before ask, a read there returns
// no selection (ChangePlanTurnPolicy.ReadSelectionOf), and RefreshesAskSchema is false there, so RefreshAskSchema gives
// no bound declaration. So the read-before-ask rule and the
// selection_required clause are rules of the block-first path only.
const readRequired = 'ask requires a typed account read or a bound missing-field draft.'
const records = ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
const onChangePlan = () => vi.stubEnv('ORBIT_EVAL_ASTRA_PATH', 'change-plan')
const onBlockFirst = () => vi.stubEnv('ORBIT_EVAL_ASTRA_PATH', 'block-first')
const validateFor = (offers) => (calls) => structural(response(calls), { ...context,
  vars: { ...context.vars, clientContext: { ...clientContext, supportsProactiveOffers: offers } } })
const flagAsk = (input, offers = false) => changePlanToolCall('ask', { input }, 'Succeeded', 'ask',
  { ...clientContext, supportsProactiveOffers: offers })

// Producer: AskTool.GetChangePlanParameterSchema and ChangePlanReplayTests.RunAboutAskAsync.
const aboutInput = () => ({ form: 'choice', missing_input: 'record_selection', question: 'Which Water - 710ml do you mean?',
  about: [...records], several: false, allowFreeText: false })
// Producer: ChangePlanRequestTests.AskFormMap_ChoiceWithLabelsShowsForEveryMissingInputLabelWithNoRead.
const labelInput = (reason = 'preference') => ({ form: 'choice', missing_input: reason, question: 'When?', multiSelect: true,
  allowFreeText: true, options: [{ id: 'morning', label: 'Morning' }, { id: 'evening', label: 'Evening' }] })

it.each([['a choice about records', aboutInput], ['a choice with labels', labelInput]].flatMap(([name, input]) =>
  [false, true].map((offers) => [name, offers, input])))(
  'accepts %s with no read on the ai_change_plan path, and fails the same trace on the block-first path (offers: %s)',
  async (_, offers, input) => {
    const calls = [flagAsk(input(), offers)]
    onChangePlan()
    const flagPath = await validateFor(offers)(calls)
    expect(flagPath.pass, flagPath.reason).toBe(true)
    for (const select of [onBlockFirst, () => vi.unstubAllEnvs()]) {
      select()
      expect(await validateFor(offers)(calls)).toMatchObject({ pass: false, reason: readRequired })
    }
  },
)

it.each(['habit_setup', ...reasons])('accepts the %s label with no read on the ai_change_plan path', async (reason) => {
  onChangePlan()
  const verdict = await validate([flagAsk(labelInput(reason))])
  expect(verdict.pass, verdict.reason).toBe(true)
})

// Producer: ChangePlanTurnPolicy.ReadSelectionOf removes the selection of a read on the flag path.
it('accepts an ask after a read that holds no selection and no read directive on the ai_change_plan path only', async () => {
  const read = changePlanToolCall('query_habits', { for_selection: true }, 'Succeeded', 'read', clientContext)
  read.result.payload = { scope: 'all', items: [] }
  expect(read.result).not.toHaveProperty('readDirective')
  onChangePlan()
  const flagPath = await validate([read, flagAsk(labelInput('record_selection'))])
  expect(flagPath.pass, flagPath.reason).toBe(true)
  onBlockFirst()
  expect(await validate([read, flagAsk(labelInput('record_selection'))])).toMatchObject({ pass: false, reason: readRequired })
  const selection = await validate([habitAccountRead(true), ask()])
  expect(selection.pass, selection.reason).toBe(true)
})

// The flag-on ask declares the draft fields on each form with labels, and the server binds no declaration to a draft.
it('validates a draft-bound ask against the flag-on declaration only on the ai_change_plan path', async () => {
  const create = missingFieldCreate()
  const bound = (draft) => flagAsk({ ...labelInput('habit_setup'), draft_call_id: draft, missing_field: 'frequency_unit' })
  onChangePlan()
  for (const calls of [[create, bound('new-draft')], [create, bound('another-draft')], [bound('new-draft')]]) {
    const verdict = await validate(calls)
    expect(verdict.pass, verdict.reason).toBe(true)
  }
  const unknownField = bound('new-draft')
  unknownField.arguments.input.invented = true
  expect((await validate([create, unknownField])).pass).toBe(false)
  onBlockFirst()
  expect((await validate([create, setupAsk('choice', 'another-draft')])).pass).toBe(false)
})

it('accepts about of two records on the ai_change_plan path, and fails its schema on the block-first path', async () => {
  onChangePlan()
  const valid = await validate([flagAsk(aboutInput())])
  expect(valid.pass, valid.reason).toBe(true)
  const one = flagAsk(aboutInput())
  one.arguments.input.about = [records[0]]
  // The flag-on ask declares two choice forms; the reason names the fault of the form that the call is closest to.
  expect(await validate([one])).toMatchObject({ pass: false,
    reason: 'ask choice: Call to "ask" does not match schema: [{"instancePath":"/input/about","schemaPath":"#/properties/input/properties/about/minItems","keyword":"minItems","params":{"limit":2},"message":"must NOT have fewer than 2 items"}]' })
  const withTargets = flagAsk(labelInput())
  withTargets.arguments.input.options[0].target_ids = [records[0]]
  expect((await validate([withTargets])).pass).toBe(false)
  onBlockFirst()
  const blockFirst = await validate([habitAccountRead(), flagAsk(aboutInput())])
  expect(blockFirst.pass).toBe(false)
  expect(blockFirst.reason).not.toBe(readRequired)
  expect(blockFirst.reason).toMatch(/^ask choice: Call to "ask" does not match schema/u)
})
