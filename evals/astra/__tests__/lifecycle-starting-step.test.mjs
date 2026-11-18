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
    expect(smaller.vars.conversation.context).toBe(smaller.vars.clientContext)
    const save = await prepare('composition-one-small-step-save-task-en')
    expect(save.vars.clientContext).not.toHaveProperty('previousStartingStep')
  })

  it('keeps the legacy client of the follow-up, with no starting-step block, in the conversation of the setup', async () => {
    const { vars } = await prepare('composition-one-small-step-smaller-legacy-en')
    expect(vars.clientContext.partKinds).toEqual([])
    expect(vars.conversation.context.partKinds).toEqual([])
    expect(vars.conversation.messages).toHaveLength(2)
  })

  it('stops the case when the setup turn shows no starting step', async () => {
    vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
    vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
    const vars = preparedCase('composition-one-small-step-smaller-en', { records, habits })
    vi.stubGlobal('fetch', recordedStream([stream(turnOf({ aiMessage: 'Start with a walk.', parts: [{ type: 'text', text: 'Start with a walk.' }] }))]))
    await expect(prepareCorrection({ vars, metadata: caseOf('composition-one-small-step-smaller-en').metadata }))
      .rejects.toThrow('Correction setup failed: Missing one starting-step block with server actions and no prose.')
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

describe('a save case of a starting step', () => {
  it('passes the one-time task that holds the step, approves it and reads the saved task back', async () => {
    const { vars, block } = await prepare('composition-one-small-step-save-task-en')
    const step = block.suggestion.step
    const held = [previewOf('createHabit', [itemOf(null, step, { title: [null, step], frequency_unit: [null, 'OneTime'] })])]
    const fixture = account(habits, held)
    const response = await runOutcomeCase(vars, { send: asSent({ vars }, turnOf({ pendingOperations: held })), api: fixture.api })
    const verdict = outcome(response.output, { vars })
    expect(verdict).toMatchObject({ pass: true, reason: 'The saved state matches the approved changes.' })
    expect(fixture.state.at(-1)).toMatchObject({ title: step, frequencyUnit: null })
  })

  it.each([
    ['another title', (step) => itemOf(null, 'Study', { title: [null, 'Study'], frequency_unit: [null, 'OneTime'] })],
    ['a recurring habit', (step) => itemOf(null, step, { title: [null, step], frequency_unit: [null, 'Day'] })],
  ])('fails %s', async (_name, item) => {
    const { vars, block } = await prepare('composition-one-small-step-save-task-en')
    const held = [previewOf('createHabit', [item(block.suggestion.step)])]
    const response = await runOutcomeCase(vars, { send: asSent({ vars }, turnOf({ pendingOperations: held })), api: account(habits, held).api })
    expect(outcome(response.output, { vars }).pass).toBe(false)
  })

  // Producer: PreviewChecklistAppendAsync merges the added item into checklist_items, and AgentArgumentPreview.Build gives
  // the row the canonical JSON of the full list and the habit_id row.
  const checklistPreview = (items) => [previewOf('updateChecklist', [itemOf(water, 'Water', { habit_id: [null, water],
    checklist_items: [JSON.stringify(checklist.map(({ text, isChecked }) => ({ text, is_checked: isChecked }))), JSON.stringify(items), 'array'] })])]
  const itemsWith = (step, change = (list) => list) => change([...checklist.map(({ text, isChecked }) => ({ text, is_checked: isChecked })), { text: step, is_checked: false }])

  it('passes the stored checklist with the step appended unchecked, and saves exactly that', async () => {
    const { vars, block } = await prepare('composition-one-small-step-save-checklist-en')
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
    const { vars, block } = await prepare('composition-one-small-step-save-checklist-en')
    const held = checklistPreview(itemsWith(block.suggestion.step, change))
    const response = await runOutcomeCase(vars, { send: asSent({ vars }, turnOf({ pendingOperations: held })), api: account(habits, held).api })
    expect(outcome(response.output, { vars })).toMatchObject({ pass: false, reason: expect.stringContaining('gives checklist_items the value') })
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
