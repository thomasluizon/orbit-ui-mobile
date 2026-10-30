import { expect, it } from 'vitest'
import { structural } from '../assertions.mjs'
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

async function validate(calls) {
  const output = parseResponse(chatResponse('ask-schema', calls), '', {
    response: { status: 200, headers: { 'x-orbit-request-id': 'ask-schema' } },
  })
  return structural(output, { vars: { evalRequestId: 'ask-schema', clientContext }, test: { vars: {} } })
}

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

it('retains the pre-read habit setup declaration', async () => {
  const verdict = await validate([ask('habit_setup')])
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
