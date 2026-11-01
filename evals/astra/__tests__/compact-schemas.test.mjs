import { expect, it, vi } from 'vitest'
import { assertions } from 'promptfoo'
import { structural } from '../assertions.mjs'
import { attemptEvidence } from '../evidence.mjs'
import { observableSchema, tools } from '../trace-policy.mjs'
import { toolCall } from './fixtures/producer.mjs'

// Apply the producer's local-reference representation to its exported draft setup union.
vi.mock('../trace-policy.mjs', async (importOriginal) => {
  const policy = await importOriginal()
  const compact = (catalog) => structuredClone(catalog).map((tool) => {
    tool.function.description = ''
    const root = tool.function.parameters
    root.$defs ??= {}
    for (const variant of root.properties.input.anyOf) {
      root.$defs.setupDraftCallId = variant.properties.draft_call_id
      variant.properties.draft_call_id = { $ref: '#/$defs/setupDraftCallId' }
    }
    root.$defs.setupInput = root.properties.input
    root.$defs.setupUnion = { anyOf: [{ $ref: '#/$defs/setupInput' }] }
    root.properties.input = { $ref: '#/$defs/setupUnion' }
    return tool
  })
  return { ...policy, habitSetupTools: compact(policy.habitSetupTools),
    offerHabitSetupTools: compact(policy.offerHabitSetupTools) }
})

const clientContext = { supportsParts: true }

it('fills strict nullable references throughout recursive habit arguments', () => {
  const { arguments: supplied } = toolCall('bulk_create_habits', { habits: [{ title: 'Read',
    frequency_unit: 'Day', sub_habits: [{ title: 'Open book', frequency_unit: 'Day' }] }] },
  'PendingConfirmation', 'create', clientContext)
  expect(supplied.habits[0]).toMatchObject({ title: 'Read', days: null, repeat_reminder: null,
    sub_habits: [{ title: 'Open book', days: null, repeat_reminder: null }] })
})

it('retains referenced object and array arguments in evidence without retaining unknown secrets', () => {
  const call = toolCall('bulk_create_habits', { habits: [{ title: 'Read', frequency_unit: 'Day',
    repeat_reminder: { interval_minutes: 60, cookie: 'private-reminder' },
    sub_habits: [{ title: 'Open book', frequency_unit: 'Day', cookie: 'private-child' }] }] },
  'PendingConfirmation', 'create', clientContext)
  const entry = { testCase: { vars: { clientContext } }, response: { output: {
    answer: 'private-reminder private-child', trace: { calls: [call] },
  } } }
  const evidence = attemptEvidence(entry, { assertions: [] })
  expect(evidence.toolCalls[0].arguments.habits[0]).toMatchObject({ title: 'Read',
    repeat_reminder: { interval_minutes: 60 }, sub_habits: [{ title: 'Open book' }] })
  expect(evidence.answer).toBe('[redacted] [redacted]')
  expect(JSON.stringify(evidence)).not.toMatch(/private-reminder|private-child|cookie/)
})

it.each(['choice', 'question'])('binds a referenced setup %s to the exact draft and field', async (form) => {
  const create = toolCall('create_habit', { title: 'Read' }, 'Succeeded', 'draft', clientContext)
  // Isolate binding from fixture default generation; all exported create fields except these two are nullable.
  const createSchema = tools.find((tool) => tool.function.name === 'create_habit').function.parameters
  create.arguments = { ...Object.fromEntries(createSchema.required.map((name) => [name, null])),
    title: 'Read', orbit_write_complete: false }
  create.result.payload = { draft_call_id: 'draft', title: 'Read', missing_field: 'frequency_unit',
    clarification: { missingArgumentKey: 'frequency_unit' } }
  const input = { form, missing_input: 'habit_setup', draft_call_id: 'draft', missing_field: 'frequency_unit',
    ...(form === 'choice' ? { question: 'How often?', options: [
      { id: 'daily', label: 'Daily', description: null }, { id: 'weekly', label: 'Weekly', description: null },
    ], multiSelect: false, allowFreeText: false } : { title: null, intro: null, progress: null,
      questions: [{ id: 'frequency_unit', type: 'yesNo', prompt: 'Should this repeat?', allowFreeText: false }] }) }
  const ask = toolCall('ask', { input }, 'Succeeded', 'ask', clientContext)
  const validate = () => structural({ trace: { state: 'available', requestId: 'compact', responseRequestId: 'compact',
    calls: [create, ask].map(({ status, ...call }) => ({ ...call, resultStatus: status })) } },
  { vars: { evalRequestId: 'compact', clientContext }, test: { vars: {} } })
  const valid = await validate()
  expect(valid.pass, valid.reason).toBe(true)
  for (const key of ['draft_call_id', 'missing_field']) {
    ask.arguments.input[key] = 'wrong-binding'
    expect((await validate()).pass).toBe(false)
    ask.arguments.input[key] = input[key]
  }
})

it('filters sensitivity marks in definitions while Ajv validates recursive local references at the parameters root', async () => {
  // ToolSchemaReferences.FactorHabitTree and StrictToolSchema.AllowNull retain this recursive shape.
  const root = { type: 'object', properties: { habit: { $ref: '#/$defs/habit' } }, required: ['habit'],
    additionalProperties: false, $defs: { habit: { type: 'object', properties: {
      title: { type: 'string' }, frequency_unit: { type: 'string', enum: ['Day', 'Week'] },
      query_token: { type: ['string', 'null'] }, sub_habits: { anyOf: [
        { type: 'array', items: { $ref: '#/$defs/habit' } }, { type: 'null' },
      ] },
    }, required: ['title', 'frequency_unit', 'query_token', 'sub_habits'], additionalProperties: false } } }
  const parameters = observableSchema(root, new Set(['querytoken']))
  expect(parameters.$defs.habit.properties).not.toHaveProperty('query_token')
  expect(parameters.$defs.habit.required).toEqual(['title', 'frequency_unit', 'sub_habits'])
  expect(root.$defs.habit.required).toContain('query_token')
  const validate = (habit) => assertions.runAssertion({ assertion: { type: 'is-valid-openai-tools-call' },
    provider: { config: { tools: [{ type: 'function', function: { name: 'compact_habit', parameters } }] } },
    test: { vars: {} }, providerResponse: { output: [{ type: 'function', function: {
      name: 'compact_habit', arguments: JSON.stringify({ habit }),
    } }] } })
  const child = { title: 'Open book', frequency_unit: 'Day', sub_habits: null }
  const valid = await validate({ title: 'Read', frequency_unit: 'Week', sub_habits: [child] })
  expect(valid.pass, valid.reason).toBe(true)
  for (const change of [(habit) => { delete habit.title }, (habit) => { habit.frequency_unit = 'invented' },
    (habit) => { habit.extra = true }, (habit) => { habit.query_token = null }]) {
    const invalid = structuredClone(child)
    change(invalid)
    expect((await validate({ title: 'Read', frequency_unit: 'Week', sub_habits: [invalid] })).pass).toBe(false)
  }
})
