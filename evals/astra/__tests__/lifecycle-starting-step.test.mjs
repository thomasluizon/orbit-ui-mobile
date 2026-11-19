import { afterEach, describe, expect, it, vi } from 'vitest'
import { composition } from '../composition.mjs'
import { outcome, runOutcomeCase } from '../client-path.mjs'
import { prepareCorrection } from '../setup.mjs'
import { recordedStream } from './fixtures/core-replay.mjs'
import { suggestionDraft } from './fixtures/producer.mjs'
import { startingResponse } from './fixtures/starting-step.mjs'
import { account, accountDate, attempt, caseOf, itemOf, preparedCase, previewOf, requestId, storedHabit, turnOf } from './fixtures/lifecycle-case.mjs'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

const water = '22222222-2222-4222-8222-222222222222'
const checklist = [{ text: 'Prepare water', isChecked: true }, { text: 'Fill glass', isChecked: false }]
const habits = [storedHabit(water, 'Water', { checklistItems: checklist })]
const records = { first: water, water, second: water, walk: water }
const stream = (response) => [{ type: 'started', turnId: requestId, state: 'running', replayed: false },
  { type: 'final', turnId: requestId, state: 'completed', response: { ...response, conversationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' } }]

// Prepares one case as the beforeEach hook does, against the stream of the setup turn that the test gives. Returns the
// vars of the case, the requests that the setup turn sent and the block that it showed.
async function prepare(id, { supportsContext = true, extra = {} } = {}) {
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
  const vars = preparedCase(id, { records, habits, checklistHabitId: water, ...extra })
  const locale = caseOf(id).metadata.locale
  const requests = []
  const shown = startingResponse(locale, requestId, undefined, supportsContext)
  vi.stubGlobal('fetch', recordedStream([stream(shown)], requests))
  await prepareCorrection({ vars, metadata: caseOf(id).metadata })
  return { vars, requests, block: shown.parts[0].block }
}

const asSent = ({ vars }, response) => async (_conversation, attempted) => ({ kind: 'final', response, requestId, responseRequestId: requestId, trace: null, attempted, vars })

describe('the setup turn of a starting-step case', () => {
  it('sends the setup message on the client path, in the client that the setup states', async () => {
    const { requests, vars } = await prepare('composition-one-small-step-save-task-en')
    expect(requests).toHaveLength(1)
    expect(new URL(requests[0].url).pathname).toBe('/api/chat/stream')
    expect(requests[0].form.get('message')).toBe(vars.setup.input)
    expect(JSON.parse(requests[0].form.get('clientContext')).partKinds).toContain('oneSmallStep')
  })

  it.each(['en', 'pt-BR'])('turns the action of the block into the message of the follow-up in %s, in the same conversation', async (locale) => {
    const { vars, block } = await prepare(`composition-one-small-step-save-task-${locale}`)
    const action = block.actions.find(({ id }) => id === 'saveTask')
    expect(vars.input).toBe(action.message)
    expect(vars.previousStartingStep).toEqual(block.suggestion)
    expect(vars.conversation.messages.map(({ role }) => role)).toEqual(['user', 'ai'])
    expect(vars.outcome.changes[0].fields.title).toBe(block.suggestion.step)
  })

  it('names the stored habit in the save request of a checklist and appends the step to its stored checklist', async () => {
    const { vars, block } = await prepare('composition-one-small-step-save-checklist-en')
    expect(vars.input).toBe(`${block.actions.find(({ id }) => id === 'saveChecklistItem').message} Use the habit "Water".`)
    expect(vars.outcome.changes[0].fields.checklist_items).toEqual({ checklist: [{ text: 'Prepare water', checked: true },
      { text: 'Fill glass', checked: false }, { text: block.suggestion.step, checked: false }] })
    const pt = await prepare('composition-one-small-step-save-checklist-pt-BR')
    expect(pt.vars.input.endsWith(' Use o hábito "Water".')).toBe(true)
  })

  it('sends the previous step with a smaller request, and none with a save request', async () => {
    const smaller = await prepare('composition-one-small-step-smaller-en')
    expect(smaller.vars.clientContext.previousStartingStep).toEqual(smaller.block.actions[0].previousStep)
    expect(smaller.vars.conversation.context).toEqual({ ...smaller.vars.clientContext, supportsProactiveOffers: false })
    const save = await prepare('composition-one-small-step-save-task-en')
    expect(save.vars.clientContext).not.toHaveProperty('previousStartingStep')
  })

  it('keeps the legacy client of the follow-up, with no starting-step block, in the conversation of the setup', async () => {
    const { vars } = await prepare('composition-one-small-step-smaller-legacy-en')
    expect(vars.clientContext.partKinds).toEqual([])
    expect(vars.conversation.context.partKinds).toEqual([])
    expect(vars.conversation.messages).toHaveLength(2)
  })

  it('sends the follow-up of the legacy step client with its own history and no conversation id', async () => {
    const { vars } = await prepare('composition-one-small-step-smaller-legacy-en')
    const requests = []
    const step = 'Read one line'
    vi.stubGlobal('fetch', recordedStream([stream(turnOf({ aiMessage: step, parts: [{ type: 'text', text: step }] }))], requests))
    await runOutcomeCase(vars)
    const sent = JSON.parse(requests[0].form.get('clientContext'))
    expect(sent).not.toHaveProperty('conversationId')
    expect(sent.supportsProactiveOffers).toBe(false)
    expect(sent.partKinds).toEqual([])
    expect(JSON.parse(requests[0].form.get('history')).map(({ role }) => role)).toEqual(['user', 'assistant'])
  })

  it.each(['smaller', 'save-task', 'save-checklist'])('sends the follow-up of the %s step case with offers off, as its setup turn did', async (family) => {
    const { vars, requests } = await prepare(`composition-one-small-step-${family}-en`)
    const step = 'Read one line'
    vi.stubGlobal('fetch', recordedStream([stream(turnOf({ aiMessage: step, parts: [{ type: 'text', text: step }] }))], requests))
    await runOutcomeCase(vars)
    expect(requests).toHaveLength(2)
    const [setupContext, followUpContext] = requests.map(({ form }) => JSON.parse(form.get('clientContext')))
    expect(setupContext.supportsProactiveOffers).toBe(false)
    expect(followUpContext.supportsProactiveOffers).toBe(false)
    expect(followUpContext.conversationId).toBe('cccccccc-cccc-4ccc-8ccc-cccccccccccc')
  })

  it('sends the follow-up of a correction case with offers off, as its setup turn did', async () => {
    vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
    vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
    const id = 'composition-medical-correction-en'
    const setup = { ...caseOf(id).vars.setup, outcome: { changes: [{ kind: 'create', fields: { title: { contains: ['cholesterol'] } } }] } }
    const vars = preparedCase(id, { records, habits: [], setup })
    const requests = []
    const held = turnOf({ pendingOperations: [previewOf('createHabits', [itemOf(null, 'Cholesterol exam', { title: [null, 'Cholesterol exam'] })])] })
    vi.stubGlobal('fetch', recordedStream([stream(held), stream(held)], requests))
    await prepareCorrection({ vars, metadata: caseOf(id).metadata })
    await runOutcomeCase(vars)
    const [setupContext, followUpContext] = requests.map(({ form }) => JSON.parse(form.get('clientContext')))
    expect(setupContext.supportsProactiveOffers).toBe(false)
    expect(followUpContext.supportsProactiveOffers).toBe(false)
  })

  it('stops the case when the setup turn shows no starting step', async () => {
    vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
    vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
    const vars = preparedCase('composition-one-small-step-smaller-en', { records, habits })
    vi.stubGlobal('fetch', recordedStream([stream(turnOf({ aiMessage: 'Start with a walk.', parts: [{ type: 'text', text: 'Start with a walk.' }] }))]))
    await expect(prepareCorrection({ vars, metadata: caseOf('composition-one-small-step-smaller-en').metadata }))
      .rejects.toThrow('Correction setup failed: Missing one starting-step block with server actions and no prose.')
  })

  it.each(['en', 'pt-BR'].flatMap((locale) => ['one-small-step-smaller', 'one-small-step-smaller-legacy', 'one-small-step-save-task', 'one-small-step-save-checklist',
    'suggestions-refine'].map((family) => `composition-${family}-${locale}`)))('stops %s when its setup turn holds a preview of a change', async (id) => {
    vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
    vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
    const vars = preparedCase(id, { records, habits })
    const held = turnOf({ pendingOperations: [previewOf('createHabit', [itemOf(null, 'Read', { title: [null, 'Read'] })])] })
    vi.stubGlobal('fetch', recordedStream([stream(held)]))
    await expect(prepareCorrection({ vars, metadata: caseOf(id).metadata })).rejects.toThrow('Correction setup failed: The read request held a preview of a change.')
  })

  it('takes the drafts to refine from the suggestion block of the setup turn', async () => {
    vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
    vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
    const id = 'composition-suggestions-refine-en'
    const vars = preparedCase(id, { records, habits: [] })
    const drafts = [suggestionDraft({ dueDate: accountDate, title: 'Read' }), { ...suggestionDraft({ dueDate: accountDate, title: 'Stretch' }), id: '99999999-9999-4999-8999-999999999999' }]
    vi.stubGlobal('fetch', recordedStream([stream(turnOf({ parts: [{ type: 'block', kind: 'habitSuggestions', block: { language: 'en', drafts } }] }))]))
    await prepareCorrection({ vars, metadata: caseOf(id).metadata })
    expect(vars.baselineDrafts).toEqual(drafts)
    expect(vars.refineDraft).toEqual(drafts[0])
  })
})

// Each row that a save-task case states, with the row of a preview that breaks that row alone. The preview shows a row for each
// argument that the model passed (AgentArgumentPreview.Build: days as the JSON text of the list, a boolean as True or False).
const taskViolations = {
  title: { title: [null, 'Study'] },
  frequency_unit: { frequency_unit: [null, 'Day'] },
  frequency_quantity: { frequency_quantity: [null, '3', 'number'] },
  days: { days: [null, '["Monday"]', 'array'] },
  is_bad_habit: { is_bad_habit: [null, 'True', 'boolean'] },
  is_general: { is_general: [null, 'True', 'boolean'] },
  parent_habit_id: { parent_habit_id: [null, 'Water'] },
}
const lowercaseFlags = { is_bad_habit: { is_bad_habit: [null, 'false', 'boolean'] }, is_general: { is_general: [null, 'false', 'boolean'] } }
const withoutRow = (vars, field) => ({ ...vars.outcome, changes: vars.outcome.changes.map((change) => ({ ...change,
  fields: Object.fromEntries(Object.entries(change.fields).filter(([name]) => name !== field)) })) })

describe.each(['en', 'pt-BR'])('a save case of a starting step in %s', (locale) => {
  const saveTask = `composition-one-small-step-save-task-${locale}`
  const saveChecklist = `composition-one-small-step-save-checklist-${locale}`
  const taskHeld = (step, rows = {}) => [previewOf('createHabit', [itemOf(null, step, { title: [null, step], frequency_unit: [null, 'OneTime'], ...rows })])]
  const graded = async (vars, held) => outcome((await runOutcomeCase(vars, { send: asSent({ vars }, turnOf({ pendingOperations: held })), api: account(habits, held).api })).output, { vars })

  it('passes the one-time task that holds the step, approves it and reads the saved task back', async () => {
    const { vars, block } = await prepare(saveTask)
    const step = block.suggestion.step
    const held = taskHeld(step)
    const fixture = account(habits, held)
    const response = await runOutcomeCase(vars, { send: asSent({ vars }, turnOf({ pendingOperations: held })), api: fixture.api })
    const verdict = outcome(response.output, { vars })
    expect(verdict).toMatchObject({ pass: true, reason: 'The saved state matches the approved changes.' })
    expect(fixture.state.at(-1)).toMatchObject({ title: step, frequencyUnit: null })
  })

  it('states one row for each argument that the save-task preview must show', () => {
    expect(Object.keys(caseOf(saveTask).vars.outcome.changes[0].fields).toSorted()).toEqual(Object.keys(taskViolations).toSorted())
  })

  it.each(Object.entries(taskViolations))('fails a saved task whose preview breaks the row %s, and passes it once that row is removed', async (field, row) => {
    const { vars, block } = await prepare(saveTask)
    const held = taskHeld(block.suggestion.step, row)
    expect(await graded(vars, held)).toMatchObject({ pass: false, reason: expect.stringContaining('The preview does not create exactly the records of the request.') })
    expect((await graded({ ...vars, outcome: withoutRow(vars, field) }, held)).pass, `without ${field}`).toBe(true)
  })

  it.each(Object.entries(lowercaseFlags))('fails the flag %s in another case than the exact text of the preview', async (field, row) => {
    const { vars, block } = await prepare(saveTask)
    expect(await graded(vars, taskHeld(block.suggestion.step, row))).toMatchObject({ pass: false })
  })

  it('passes a saved task whose preview shows no day, no flag and no parent, or shows them empty', async () => {
    const { vars, block } = await prepare(saveTask)
    const shown = { days: [null, '[]', 'array'], is_bad_habit: [null, 'False', 'boolean'], is_general: [null, 'False', 'boolean'], parent_habit_id: [null, 'No parent'] }
    expect(await graded(vars, taskHeld(block.suggestion.step, shown))).toMatchObject({ pass: true })
  })

  it('fails an approval that saves the step with a repeat count that the preview did not show', async () => {
    const { vars, block } = await prepare(saveTask)
    const step = block.suggestion.step
    const shown = taskHeld(step)
    const saves = taskHeld(step, { frequency_quantity: [null, '3'] })
    const response = await runOutcomeCase(vars, { send: asSent({ vars }, turnOf({ pendingOperations: shown })), api: account(habits, saves).api })
    expect(outcome(response.output, { vars }).pass).toBe(false)
  })

  it.each([['save-task', saveTask], ['save-checklist', saveChecklist]])('fails the %s approval when the held preview changed the account, and approves nothing', async (_name, id) => {
    const { vars, block } = await prepare(id)
    const step = block.suggestion.step
    const held = id === saveTask ? taskHeld(step) : [previewOf('updateChecklist', [itemOf(water, 'Water', { habit_id: [null, water],
      checklist_items: [JSON.stringify(checklist.map(({ text, isChecked }) => ({ text, is_checked: isChecked }))),
        JSON.stringify([...checklist.map(({ text, isChecked }) => ({ text, is_checked: isChecked })), { text: step, is_checked: false }]), 'array'] })])]
    const fixture = account([...habits, storedHabit('44444444-4444-4444-8444-444444444444', 'Written before the approval')], held)
    const response = await runOutcomeCase(vars, { send: asSent({ vars }, turnOf({ pendingOperations: held })), api: fixture.api })
    expect(outcome(response.output, { vars })).toMatchObject({ pass: false, reason: 'The held preview changed the account before its approval.' })
    expect(fixture.calls.map((call) => call.path.split('/').at(-1))).not.toContain('execute')
  })

  // Producer: PreviewChecklistAppendAsync merges the added item into checklist_items, and AgentArgumentPreview.Build gives
  // the row the canonical JSON of the full list and the habit_id row.
  const checklistPreview = (items) => [previewOf('updateChecklist', [itemOf(water, 'Water', { habit_id: [null, water],
    checklist_items: [JSON.stringify(checklist.map(({ text, isChecked }) => ({ text, is_checked: isChecked }))), JSON.stringify(items), 'array'] })])]
  const itemsWith = (step, change = (list) => list) => change([...checklist.map(({ text, isChecked }) => ({ text, is_checked: isChecked })), { text: step, is_checked: false }])

  it('states the checklist row alone for the save-checklist preview', () => {
    expect(Object.keys(caseOf(saveChecklist).vars.outcome.changes[0].fields)).toEqual(['checklist_items'])
  })

  it('passes the stored checklist with the step appended unchecked, and saves exactly that', async () => {
    const { vars, block } = await prepare(saveChecklist)
    const held = checklistPreview(itemsWith(block.suggestion.step))
    const fixture = account(habits, held)
    const response = await runOutcomeCase(vars, { send: asSent({ vars }, turnOf({ pendingOperations: held })), api: fixture.api })
    expect(outcome(response.output, { vars })).toMatchObject({ pass: true })
    expect(fixture.state[0].checklistItems).toEqual([...checklist, { text: block.suggestion.step, isChecked: false }])
  })

  it.each([
    ['an item lost', (list) => list.slice(1)],
    ['the items reversed', (list) => [...list].reverse()],
    ['the step twice', (list) => [...list, list.at(-1)]],
    ['a checked state changed', (list) => list.map((item, index) => index === 0 ? { ...item, is_checked: false } : item)],
    ['the step checked', (list) => list.map((item, index) => index === list.length - 1 ? { ...item, is_checked: true } : item)],
  ])('fails %s', async (_name, change) => {
    const { vars, block } = await prepare(saveChecklist)
    const held = checklistPreview(itemsWith(block.suggestion.step, change))
    expect(await graded(vars, held)).toMatchObject({ pass: false, reason: expect.stringContaining('gives checklist_items the value') })
  })

  // The failure rows of the deleted step-persistence test: the account saves something other than the held preview, the
  // readback is missing, or the turn holds no single preview to approve.
  const savedTaskDefects = {
    'saves nothing': { savesNothing: true },
    'saves another title': { afterDecision: (state) => { state.at(-1).title = 'Wrong title' } },
    'saves a repeating habit': { afterDecision: (state) => { state.at(-1).frequencyUnit = 'Day' } },
    'saves a second record': { afterDecision: (state) => { state.push({ ...state.at(-1), id: '55555555-5555-4555-8555-555555555555' }) } },
    'changes a stored habit': { afterDecision: (state) => { state[0].title = 'Unrequested change' } },
  }
  const savedChecklistDefects = {
    'loses an item': { afterDecision: (state) => { state[0].checklistItems.shift() } },
    'unchecks an item': { afterDecision: (state) => { state[0].checklistItems[0].isChecked = false } },
    'reverses the items': { afterDecision: (state) => { state[0].checklistItems.reverse() } },
  }
  const approved = async (id, held, options) => {
    const { vars } = await prepare(id)
    const fixture = account(habits, held, options)
    const response = await runOutcomeCase(vars, { send: asSent({ vars }, turnOf({ pendingOperations: held })), api: fixture.api })
    return { vars, response, fixture, verdict: outcome(response.output, { vars }) }
  }
  const savedPaths = (fixture) => fixture.calls.map((call) => call.path.split('/').at(-1)).filter((path) => ['confirm', 'execute'].includes(path))

  it.each(Object.entries(savedTaskDefects))('fails a saved task of an approval that %s', async (_name, options) => {
    const { block } = await prepare(saveTask)
    const { verdict } = await approved(saveTask, taskHeld(block.suggestion.step), options)
    expect(verdict.pass).toBe(false)
    expect(verdict.reason).not.toBe('The saved state matches the approved changes.')
  })

  it.each(Object.entries(savedChecklistDefects))('fails a saved checklist of an approval that %s', async (_name, options) => {
    const { block } = await prepare(saveChecklist)
    const { verdict } = await approved(saveChecklist, checklistPreview(itemsWith(block.suggestion.step)), options)
    expect(verdict.pass).toBe(false)
    expect(verdict.reason).not.toBe('The saved state matches the approved changes.')
  })

  it.each([['save-task', saveTask], ['save-checklist', saveChecklist]])('fails the %s case that has no saved state readback', async (_name, id) => {
    const { block } = await prepare(id)
    const held = id === saveTask ? taskHeld(block.suggestion.step) : checklistPreview(itemsWith(block.suggestion.step))
    const { vars, response } = await approved(id, held)
    delete response.output.readback
    expect(outcome(response.output, { vars })).toMatchObject({ pass: false, reason: 'The approved preview has no saved state readback.' })
  })

  const none = 'The reply holds no preview and no question card.'
  const twoPreviews = (step) => [...taskHeld(step), ...taskHeld(step).map((preview) => ({ ...preview, id: '22222222-2222-4222-8222-222222222223' }))]
  it.each([
    ['a write that was saved', () => ({ operations: [{ operationId: 'create_habit', status: 'Succeeded' }] }), none],
    ['no preview', () => ({}), none],
    ['two previews', (step) => ({ pendingOperations: twoPreviews(step) }), 'The request is held in 2 previews.'],
  ])('approves nothing of a save-task turn with %s', async (_name, fields, reason) => {
    const { vars, block } = await prepare(saveTask)
    const fixture = account(habits, taskHeld(block.suggestion.step))
    const response = await runOutcomeCase(vars, { send: asSent({ vars }, turnOf(fields(block.suggestion.step))), api: fixture.api })
    expect(outcome(response.output, { vars })).toMatchObject({ pass: false, reason })
    expect(savedPaths(fixture)).toEqual([])
    expect(fixture.state).toHaveLength(habits.length)
  })
})

describe('a read case of a starting step', () => {
  const read = (id, response, extra) => attempt(id, { replies: [turnOf(response)], habits: [], records, ...extra })
  const shown = (locale = 'en') => startingResponse(locale)

  it('passes one starting-step block with its server actions', async () => {
    const { vars, verdict, response } = await read('composition-one-small-step-en', { parts: shown().parts })
    expect(verdict).toMatchObject({ pass: true })
    expect(await composition(response.output, { vars })).toMatchObject({ pass: true, reason: 'One starting step with its server actions and no prose.' })
  })

  it('fails a reply that holds a preview of a change', async () => {
    const { verdict } = await read('composition-one-small-step-en', { parts: shown().parts, pendingOperations: [previewOf('createHabit', [itemOf(null, 'x', { title: [null, 'x'] })])] })
    expect(verdict).toMatchObject({ pass: false, reason: 'The read request held a preview of a change.' })
  })

  it.each([
    ['prose beside the block', (response) => { response.parts.unshift({ type: 'text', text: 'Try this.' }); response.aiMessage = 'Try this.' }],
    ['a changed action message', (response) => { response.parts[0].block.actions[1].message = 'Save something else.' }],
    ['a second block', (response) => { response.parts.push(structuredClone(response.parts[0])) }],
  ])('fails %s', async (_name, mutate) => {
    const response = shown()
    mutate(response)
    const { vars, response: attempted } = await read('composition-one-small-step-en', { parts: response.parts, aiMessage: response.aiMessage })
    expect((await composition(attempted.output, { vars })).pass).toBe(false)
  })

  it('passes the readable step alone for a client with no block, and fails a block or an extra line for it', async () => {
    const step = shown().parts[0].block.suggestion.step
    const ok = await read('composition-one-small-step-legacy-en', { aiMessage: step, parts: [{ type: 'text', text: step }] })
    expect(await composition(ok.response.output, { vars: ok.vars })).toMatchObject({ pass: true })
    const extra = await read('composition-one-small-step-legacy-en', { aiMessage: `${step}\nSave as task`, parts: [{ type: 'text', text: `${step}\nSave as task` }] })
    expect((await composition(extra.response.output, { vars: extra.vars })).pass).toBe(false)
    const block = await read('composition-one-small-step-legacy-en', { parts: shown().parts })
    expect((await composition(block.response.output, { vars: block.vars })).pass).toBe(false)
  })

  it.each(['composition-one-small-step-smaller-en', 'composition-one-small-step-smaller-legacy-en'])('fails the previous step again for %s and accepts another', async (id) => {
    const legacy = id.endsWith('legacy-en')
    const step = shown().parts[0].block.suggestion.step
    const reply = (text) => legacy ? { aiMessage: text, parts: [{ type: 'text', text }] }
      : { parts: startingResponse('en', requestId, { goal: 'Study', step: text, language: 'en' }).parts }
    const same = await read(id, reply(step), { previousStartingStep: { goal: 'Study', step, language: 'en' } })
    expect(await composition(same.response.output, { vars: same.vars })).toMatchObject({ pass: false, reason: expect.stringContaining('A smaller step must change the previous action') })
    if (legacy) return
    const other = await read(id, reply('Read one line'), { previousStartingStep: { goal: 'Study', step, language: 'en' } })
    expect(other.verdict.pass).toBe(true)
  })
})

describe.each(['en', 'pt-BR'])('a read case of the one small step and the suggestions in %s', (locale) => {
  it.each(['one-small-step', 'one-small-step-legacy', 'one-small-step-smaller', 'one-small-step-smaller-legacy', 'suggestions', 'suggestions-duplicate'])(
    'holds no preview in the case %s: a turn with no preview passes and a turn with a preview fails', async (family) => {
      const id = `composition-${family}-${locale}`
      expect(caseOf(id).vars.outcome).toMatchObject({ read: true })
      const none = await attempt(id, { replies: [turnOf({})], habits: [], records })
      expect(none.verdict).toMatchObject({ pass: true, reason: 'The read turn held no preview and no card.' })
      const held = await attempt(id, { replies: [turnOf({ pendingOperations: [previewOf('createHabit', [itemOf(null, 'x', { title: [null, 'x'] })])] })], habits: [], records })
      expect(held.verdict).toMatchObject({ pass: false, reason: 'The read request held a preview of a change.' })
    })
})

describe('a suggestion case', () => {
  const draft = suggestionDraft({ dueDate: accountDate, title: 'Read' })
  const block = (drafts) => ({ type: 'block', kind: 'habitSuggestions', block: { language: 'en', drafts } })
  const read = (response) => attempt('composition-suggestions-en', { replies: [turnOf(response)], habits: [], records })

  it('passes the block of two drafts with the short server introduction and no preview', async () => {
    const { verdict, vars, response } = await read({ parts: [block([draft, { ...draft, id: '99999999-9999-4999-8999-999999999999', title: 'Stretch' }])] })
    expect(verdict).toMatchObject({ pass: true })
    expect(await composition(response.output, { vars })).toMatchObject({ pass: true })
  })

  it('fails one draft where the case asks two, and a reply that holds a preview', async () => {
    const { vars, response } = await read({ parts: [block([draft])] })
    expect((await composition(response.output, { vars })).pass).toBe(false)
    const held = await read({ parts: [block([draft])], pendingOperations: [previewOf('createHabit', [itemOf(null, 'x', { title: [null, 'x'] })])] })
    expect(held.verdict).toMatchObject({ pass: false, reason: 'The read request held a preview of a change.' })
  })
})
