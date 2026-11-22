import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import OrbitHttpProvider from '../http-provider.mjs'
import { configureOffers } from '../offer-context.mjs'
import { outcome, runOutcomeCase } from '../client-path.mjs'
import { prepareCorrection } from '../setup.mjs'
import { composition } from '../composition.mjs'
import { proactiveOffers } from '../proactive-offers.mjs'
import { evalSnapshot } from './fixtures/eval-snapshot.mjs'
import { offlineCredentials, refreshResponse } from './fixtures/credentials.mjs'
import { sentTurn, streamedTurn } from './fixtures/offer-stream.mjs'
import { baseline, savedId, task, title as stepTitle } from './fixtures/offer-task.mjs'
import { chatResponse, createPreview, habitBlock, preview, toolCall, traceTiming } from './fixtures/producer.mjs'

const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'), { merge: true })
const requestId = '77777777-7777-4777-8777-777777777777'
const water = '11111111-aaaa-4aaa-8aaa-111111111111'
const today = '2031-06-10'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

// The vars of one offers case as the beforeEach hook leaves them: the run configures it, the dates of the case are
// resolved against the account date, and the records of its fixture are named.
function prepared(id) {
  const source = structuredClone(corpus.find((entry) => entry.metadata.id === id))
  configureOffers(source)
  const day = (offset) => new Date(Date.parse(`${today}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10)
  const vars = JSON.parse(JSON.stringify(source.vars).replace(/\{accountDate([+-]\d+)\}/gu, (_, offset) => day(Number(offset))))
  return { ...vars, accountDate: today, accountTimeZone: 'UTC', evalRequestId: requestId, records: { water },
    fixtureEvidence: { habits: [{ id: water, title: 'Water', logs: [] }], goals: [] } }
}

// Runs one offers case through the first turn of the provider path against the reply that the test gives.
async function scripted(id, reply, { trace = null } = {}) {
  const vars = prepared(id)
  const send = async () => ({ kind: 'final', response: reply, requestId, responseRequestId: requestId,
    trace: trace ? { requestId, calls: trace, timing: traceTiming, modelCalls: 1 } : null })
  const response = await runOutcomeCase(vars, { send })
  return { vars, response, verdict: response.output ? outcome(response.output, { vars }) : null }
}

const empty = { aiMessage: '', actions: [], parts: [], pendingOperations: [] }
const held = (...previews) => ({ ...empty, pendingOperations: previews })
const habitRead = { ...empty, parts: [{ ...structuredClone(habitBlock), block: { ...habitBlock.block, read: {
  queryId: water, queryFamily: 'query_habits', scope: {}, revision: 'revision', completeness: 'complete', refreshToken: 'refresh',
  nextCursor: null, totalCount: 1, recovery: null } } }] }

// Producer: orbit-api AgentArgumentPreview.Build gives a create preview one row for each argument that holds a value.
const reading = () => createPreview([{ title: 'Read a book', frequency_unit: 'Day', frequency_quantity: 1 }])

describe('a converted offers write case', () => {
  it('passes when the held preview holds the requested change', async () => {
    const { verdict } = await scripted('offers-ordinary-reading-en', held(reading()))
    expect(verdict).toMatchObject({ pass: true, reason: 'The held previews hold exactly the requested changes.' })
  })

  it('fails when the preview holds one more record', async () => {
    const more = createPreview([{ title: 'Read a book', frequency_unit: 'Day', frequency_quantity: 1 },
      { title: 'Walk', frequency_unit: 'Day', frequency_quantity: 1 }])
    const { verdict } = await scripted('offers-ordinary-reading-en', held(more))
    expect(verdict.pass).toBe(false)
    expect(verdict.reason).toMatch(/^The preview holds a change outside the request\./u)
  })

  it('fails when one field holds another value', async () => {
    const weekly = createPreview([{ title: 'Read a book', frequency_unit: 'Week', frequency_quantity: 1 }])
    const { verdict } = await scripted('offers-ordinary-reading-en', held(weekly))
    expect(verdict.pass).toBe(false)
    expect(verdict.reason).toMatch(/^The preview does not create exactly the records of the request\./u)
  })

  it('names the requested record of an update, and fails when the preview changes another field of it', async () => {
    const rename = (extra = {}) => {
      const update = preview('Water')
      update.actionKey = 'updateHabit'
      update.items[0].entityId = water
      const row = update.items[0].fields[0]
      update.items[0].fields = Object.entries({ title: 'Morning water', ...extra }).map(([field, value]) => ({
        ...row, entityId: water, field, oldValue: 'Water', newValue: value, proposedValue: value, valueType: 'text', provenance: 'requested' }))
      return update
    }
    const accepted = await scripted('offers-stored-en', held(rename()), { trace: [] })
    expect(accepted.verdict).toMatchObject({ pass: true })
    const cleared = await scripted('offers-stored-en', held(rename({ emoji: '' })), { trace: [] })
    expect(cleared.verdict.pass).toBe(false)
    expect(cleared.verdict.reason).toMatch(/^A update of the preview changes title, emoji where the request changes title\./u)
  })

  it('counts each child draft of a routine as one create', async () => {
    const draft = (name) => ({ title: name, frequency_unit: 'Day', frequency_quantity: 1 })
    const routine = createPreview([{ title: 'Wellness routine', frequency_unit: 'Day', frequency_quantity: 1,
      sub_habits: [draft('Morning mobility'), draft('Night reading')] }])
    const { verdict } = await scripted('offers-children-en', held(routine))
    expect(verdict).toMatchObject({ pass: true })
    const missing = createPreview([{ title: 'Wellness routine', frequency_unit: 'Day', frequency_quantity: 1, sub_habits: [draft('Morning mobility')] }])
    expect((await scripted('offers-children-en', held(missing))).verdict.pass).toBe(false)
  })

  it('grades the dates of the case against the account date', async () => {
    const dentist = createPreview([{ title: 'Dentist appointment', frequency_unit: 'OneTime', due_date: '2031-06-12', due_time: '10:00' }])
    expect((await scripted('offers-calendar-gap-en', held(dentist))).verdict).toMatchObject({ pass: true })
    const wrong = createPreview([{ title: 'Dentist appointment', frequency_unit: 'OneTime', due_date: '2031-06-13', due_time: '10:00' }])
    expect((await scripted('offers-calendar-gap-en', held(wrong))).verdict.pass).toBe(false)
  })

  // Producer: orbit-api PendingOperationActionKeys gives each write its own key; the change list classifies five kinds of
  // habit change and never guesses another. An unknown key stays a limit of the grader.
  it('reports an action key that it does not classify as a limit of the grader, with the key', async () => {
    const { verdict } = await scripted('offers-ordinary-reading-en', held({ ...reading(), actionKey: 'duplicateHabit' }))
    expect(verdict).toMatchObject({ pass: false, reason: 'The grader cannot classify a held preview: duplicateHabit.',
      metadata: { graderLimit: true, unavailable: true } })
  })

  it('approves nothing and holds no rubric, so no model grades it', async () => {
    const api = vi.fn()
    vi.stubGlobal('fetch', api)
    const { response, vars } = await scripted('offers-ordinary-reading-en', held(reading()))
    expect(response.output.readback).toBeUndefined()
    expect(vars.rubric).toBeUndefined()
    expect(api).not.toHaveBeenCalled()
  })
})

describe('a converted offers read case', () => {
  it('passes on a reply with blocks and no preview', async () => {
    const { verdict, vars, response } = await scripted('offers-due-log-en', habitRead)
    expect(verdict).toMatchObject({ pass: true, reason: 'The read turn held no preview and no card.' })
    expect(composition(response.output, { vars })).toMatchObject({ pass: true })
  })

  it('fails on a reply with a preview', async () => {
    const { verdict } = await scripted('offers-due-log-en', held(reading()))
    expect(verdict).toMatchObject({ pass: false, reason: 'The read request held a preview of a change.' })
  })

  it('keeps the crisis case a read case whose reply is plain text', async () => {
    const { verdict, vars, response } = await scripted('offers-crisis-en', { ...empty, aiMessage: 'You are not alone. Call 988.', parts: undefined })
    expect(verdict).toMatchObject({ pass: true })
    expect(composition(response.output, { vars })).toMatchObject({ pass: true })
    expect(proactiveOffers(response.output, { vars })).toMatchObject({ pass: true })
  })
})

// The two requirements that the rubrics of these cases held and the outcome of a case cannot state: the steps of a
// checklist stay together, and an explicit root placement holds no parent. The offers family check owns each one, and the
// whole grade of the case (outcome, composition and offers policy) runs here.
describe('the requirements that an offers write case keeps beyond its outcome', () => {
  const owner = '22222222-2222-4222-8222-222222222222'
  const steps = {
    en: ['Open the planner', 'Clear the desk', 'Start the timer'],
    'pt-BR': ['Abrir o planejador', 'Liberar a mesa', 'Iniciar o cronômetro'],
  }
  const mergedSteps = {
    en: ['Open the planner and clear the desk', 'Start the timer', 'Check email'],
    'pt-BR': ['Abrir o planejador e liberar a mesa', 'Iniciar o cronômetro', 'Verificar e-mail'],
  }
  const titles = { en: ['Desk setup', 'Journal'], 'pt-BR': ['Preparação da mesa', 'Diário'] }

  // Producer: orbit-api CreationFields gives a create preview a `checklist_items` row with the typed list as its proposedValue.
  const requested = (pending) => {
    for (const row of pending.items[0].fields) row.provenance = 'requested'
    return pending
  }
  const checklistPreview = (locale, texts) => {
    const pending = createPreview([{ title: titles[locale][0], frequency_unit: 'Day', frequency_quantity: 1 }])
    const [row] = pending.items[0].fields
    const items = texts.map((text) => ({ text, is_checked: false }))
    pending.items[0].fields.push({ ...row, entityName: titles[locale][0], field: 'checklist_items', valueType: 'array',
      newValue: JSON.stringify(items), proposedValue: items })
    return requested(pending)
  }
  const rootPreview = (locale, parent) => requested(createPreview([{ title: titles[locale][1], frequency_unit: 'Day',
    frequency_quantity: 1, ...parent ? { parent_habit_id: parent } : {} }]))

  async function graded(id, pending) {
    const { vars, response } = await scripted(id, held(pending))
    const context = { vars: { ...vars, offerRequireReadback: false } }
    return [outcome, composition, proactiveOffers].map((grade) => grade(response.output, context)).find((verdict) => !verdict.pass)
  }

  describe.each(['en', 'pt-BR'])('in %s', (locale) => {
    it('keeps the steps of a checklist together', async () => {
      const id = `offers-checklist-${locale}`
      expect(await graded(id, checklistPreview(locale, steps[locale]))).toBeUndefined()
      expect(await graded(id, checklistPreview(locale, steps[locale].slice(0, 2)))).toMatchObject({ pass: false })
      expect(await graded(id, checklistPreview(locale, [...steps[locale].slice(0, 2), 'Check email']))).toMatchObject({ pass: false })
      expect(await graded(id, checklistPreview(locale, []))).toMatchObject({ pass: false })
      expect(await graded(id, checklistPreview(locale, mergedSteps[locale]))).toMatchObject({ pass: false })
    })

    it('holds no parent for an explicit root placement', async () => {
      const id = `offers-root-${locale}`
      expect(await graded(id, rootPreview(locale))).toBeUndefined()
      expect(await graded(id, rootPreview(locale, owner))).toMatchObject({ pass: false, reason: 'Explicit root placement received a parent.' })
    })
  })
})

// The three requirements that the rubrics of the schedule, children and reading cases held and the outcome of a case
// cannot state: the requested weekday, the drafts under the routine and the absence of an end date. A row that the person
// can remove (`suggested`) is an offer and states none of them.
describe('the requirements that an offers schedule, children and reading case keep beyond their outcome', () => {
  const titles = { en: { cleanup: 'Weekly desk cleanup', routine: 'Wellness routine', first: 'Mobility', second: 'Reading', read: 'Read a book' },
    'pt-BR': { cleanup: 'Limpar a mesa', routine: 'Rotina de bem-estar', first: 'Mobilidade', second: 'Leitura', read: 'Ler um livro' } }

  // Producer: orbit-api CreationFields gives a create preview a `days` row with the weekday names as its proposedValue,
  // a `sub_habits` row with the child drafts, and an `end_date` row with the date, each with the provenance of its field.
  const withRows = (pending, rows, provenance = 'requested') => {
    const [row] = pending.items[0].fields
    for (const field of pending.items[0].fields) field.provenance = 'requested'
    for (const [field, value] of Object.entries(rows)) {
      pending.items[0].fields.push({ ...row, entityName: pending.items[0].entityName, field, valueType: 'text',
        newValue: typeof value === 'string' ? value : JSON.stringify(value), proposedValue: value, provenance,
        ...provenance === 'suggested' ? { removal: { offerKey: 'offer', field, fields: [field] } } : {} })
    }
    return pending
  }
  const cleanup = (locale, rows, provenance, frequencyUnit = 'Day') => withRows(createPreview([{ title: titles[locale].cleanup,
    frequency_unit: frequencyUnit, frequency_quantity: 1 }]), rows, provenance)
  const reading = (locale, rows) => withRows(createPreview([{ title: titles[locale].read, frequency_unit: 'Day',
    frequency_quantity: 1 }]), rows)
  const routine = (locale, drafts) => withRows(createPreview([{ title: titles[locale].routine }]), drafts ? { sub_habits: drafts } : {})
  const draft = (title) => ({ title, frequency_unit: 'Day', frequency_quantity: 1 })
  const flat = (locale) => {
    const pending = createPreview([{ title: titles[locale].routine }, { title: titles[locale].first }, { title: titles[locale].second }])
    for (const item of pending.items) for (const field of item.fields) field.provenance = 'requested'
    return pending
  }

  async function graded(id, pending) {
    const { vars, response } = await scripted(id, held(pending))
    const context = { vars: { ...vars, offerRequireReadback: false } }
    return [outcome, composition, proactiveOffers].map((grade) => grade(response.output, context)).find((verdict) => !verdict.pass)
  }

  describe.each(['en', 'pt-BR'])('in %s', (locale) => {
    it('keeps the requested weekday of the schedule', async () => {
      const id = `offers-unsupported-schedule-${locale}`
      expect(await graded(id, cleanup(locale, { days: ['Monday'] }))).toBeUndefined()
      expect(await graded(id, cleanup(locale, { days: ['Tuesday'] }))).toMatchObject({ pass: false, reason: 'The requested weekday changed.' })
      expect(await graded(id, cleanup(locale, { days: ['Monday', 'Tuesday'] }))).toMatchObject({ pass: false })
      expect(await graded(id, cleanup(locale, {}))).toMatchObject({ pass: false, reason: 'The requested weekday changed.' })
      expect(await graded(id, cleanup(locale, { days: ['Tuesday'] }, 'suggested'))).toMatchObject({ pass: false })
    })

    // Producer: orbit-api LegacyHabitSchedule.Resolve refuses a weekday list unless the unit is Day and the quantity is 1
    // (DAYS_REQUIRE_QUANTITY_ONE), so a Week preview with days is a preview that approval cannot save.
    it('fails a weekday list on a weekly schedule, which the API refuses on approval', async () => {
      const id = `offers-unsupported-schedule-${locale}`
      expect(await graded(id, cleanup(locale, { days: ['Monday'] }, undefined, 'Week'))).toMatchObject({ pass: false })
    })

    it('holds the requested drafts under the routine', async () => {
      const id = `offers-children-${locale}`
      const drafts = [draft(titles[locale].first), draft(titles[locale].second)]
      expect(await graded(id, routine(locale, drafts))).toBeUndefined()
      expect(await graded(id, flat(locale))).toMatchObject({ pass: false, reason: 'The requested drafts are not under the routine.' })
      expect(await graded(id, routine(locale, drafts.slice(0, 1)))).toMatchObject({ pass: false })
      expect(await graded(id, routine(locale, [...drafts, draft('Meditation')]))).toMatchObject({ pass: false })
      expect(await graded(id, routine(locale))).toMatchObject({ pass: false })
    })

    it('invents no end date for an ordinary habit', async () => {
      const id = `offers-ordinary-reading-${locale}`
      expect(await graded(id, reading(locale, {}))).toBeUndefined()
      expect(await graded(id, reading(locale, { end_date: '2031-07-10' })))
        .toMatchObject({ pass: false, reason: 'The habit received an end date that the request never named.' })
    })
  })
})

// The same held preview under three traces. Producer: on the old path the trace names the write tool that the model
// called. On the flag path it names each change by its change kind (orbit-api ProcessUserChatCommand.ChangeList.cs). The
// offers case reads no tool name, so its verdict is the same under each.
describe('the tool names of the trace', () => {
  const habit = { title: 'Read a book', frequency_unit: 'Day', frequency_quantity: 1 }
  const call = (name, id) => ({ id, name, arguments: { habits: [habit] }, resultStatus: 'PendingConfirmation',
    result: toolCall(name, {}, 'PendingConfirmation', id).result })
  const traces = {
    'the bulk tool of the old path': [call('bulk_create_habits', 'call-1')],
    'the change kind of the flag path': [call('create_habit', 'create')],
    'no trace': null,
  }

  it.each(Object.keys(traces))('gives the same offers verdict under %s', async (name) => {
    const { verdict, response, vars } = await scripted('offers-ordinary-reading-en', held(reading()), { trace: traces[name] })
    expect(verdict).toMatchObject({ pass: true })
    expect(proactiveOffers(response.output, { vars: { ...vars, offerRequireReadback: false } })).toMatchObject({ pass: true })
    expect(composition(response.output, { vars })).toMatchObject({ pass: true })
  })

  it.each(Object.keys(traces))('gives the same read verdict under %s', async (name) => {
    const { verdict, response, vars } = await scripted('offers-due-log-en', habitRead, { trace: traces[name] })
    expect(verdict).toMatchObject({ pass: true })
    expect(proactiveOffers(response.output, { vars: { ...vars, offerFamily: 'resolved', offerRequireReadback: false } })).toMatchObject({ pass: true })
  })
})

// The lifecycle of the case that approves a preview, driven through the provider on the client path: the starting step
// that the person selected, the held task, its revision and rejection, and the approval with its readback of the saved record.
describe('the approval of an offers case on the client path', () => {
  const step = stepTitle
  const goal = 'Begin your day'
  const quote = JSON.stringify
  const startingStep = { ...empty, aiMessage: null, parts: [{ type: 'block', kind: 'oneSmallStep', block: {
    suggestion: { goal, step, language: 'en' }, actions: [
      { id: 'smaller', label: 'Smaller', message: `Give me an even smaller starting step for ${quote(goal)}. The previous step was ${quote(step)}.` },
      { id: 'saveTask', label: 'Save as task', message: `Save ${quote(step)} as a task.` },
      { id: 'saveChecklistItem', label: 'Save as checklist item', message: `Add ${quote(step)} to a habit's checklist.` },
    ] } }] }
  const issued = { offerKey: `smallStep:account:${today}`, kind: 'continueChat', label: 'Choose one small step',
    surface: null, prompt: 'Help me choose one small step I can take today.', entityId: null, date: today }

  async function attempt(fault = 'valid') {
    offlineCredentials()
    vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline')
    const { pending, detail } = task()
    const vars = { ...prepared('offers-action-lifecycle-en'), offerBaseline: baseline, fixtureEvidence: baseline,
      offerRequireReadback: true, issuedOffer: { action: issued } }
    vars.clientContext.selectedOfferKey = issued.offerKey
    const turns = []
    const requests = []
    let executed = false
    vi.stubGlobal('fetch', async (url, options = {}) => {
      const path = new URL(url).pathname
      requests.push({ path, method: options.method ?? 'GET' })
      if (path === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
      if (path === '/api/auth/refresh') return refreshResponse()
      if (path === '/api/eval/snapshot') return Response.json(evalSnapshot({ ...baseline, habits: executed || fault === 'unapproved-write' ? [detail] : [] }))
      if (path === `/api/habits/${savedId}`) return Response.json(detail)
      const revision = `/api/ai/pending-operations/${pending.id}`
      if (path === `${revision}/revise`) {
        const body = JSON.parse(options.body)
        if (!body.items.length) return Response.json({ isSuccess: true, error: null, pendingOperationId: null, preview: null, cancelled: true })
        const items = pending.items.map((item) => ({ ...item, fields: item.fields.map((field) => field.field === 'emoji'
          ? { ...field, proposedValue: '🍃', newValue: '🍃' } : field) }))
        return Response.json({ isSuccess: true, error: null, pendingOperationId: pending.id, cancelled: false,
          preview: { items, previewFingerprint: 'revised' } })
      }
      if (path === `${revision}/confirm`) {
        return turns.length < 3 ? Response.json({ error: 'pending_operation_not_found' }, { status: 404 })
          : Response.json({ pendingOperationId: pending.id, confirmationToken: 'offline-confirmation' })
      }
      if (path === `${revision}/execute`) { executed = true; return new Response(null, { status: 200 }) }
      expect(path).toBe('/api/chat/stream')
      const sent = await sentTurn(url, options)
      turns.push(sent)
      const response = turns.length === 1 ? startingStep : held(structuredClone(fault === 'extra-record' ? { ...pending,
        items: [...pending.items, { ...pending.items[0], itemId: 'other', entityName: 'Walk' }] } : pending))
      return streamedTurn({ ...chatResponse(sent.requestId), ...response }, sent.requestId)
    })
    const provider = new OrbitHttpProvider({ config: {} })
    const response = await provider.callApi(vars.input, { vars })
    return { response, turns, requests, executed: () => executed }
  }

  it('selects the issued step, holds the task twice in the same conversation, and approves it with the saved record read back', async () => {
    const { response, turns, executed } = await attempt()
    expect(response.error).toBeUndefined()
    expect(response.output.offerReadback, response.output.offerReadback.reason).toMatchObject({ pass: true, approval: { approved: true, title: stepTitle } })
    expect(executed()).toBe(true)
    expect(turns.map((turn) => turn.message)).toEqual(['Help me take the offered small step.',
      `Save ${quote(step)} as a task.`, `Save ${quote(step)} as a task.`])
    expect(new Set(turns.map((turn) => turn.clientContext.conversationId)).size).toBe(1)
    expect(turns[0].clientContext.selectedOfferKey).toBe(issued.offerKey)
    expect(turns[1].clientContext).not.toHaveProperty('selectedOfferKey')
    expect(turns[1].history.map(({ role }) => role)).toEqual(['user', 'assistant'])
  })

  it('fails the lifecycle when the held task holds one record outside the request', async () => {
    const { response, executed } = await attempt('extra-record')
    expect(response.output.offerReadback.pass).toBe(false)
    expect(response.output.offerReadback.reason).toMatch(/^The preview holds a change outside the request\./u)
    expect(executed()).toBe(false)
  })

  it('fails the lifecycle when the account changed before the approval', async () => {
    const { response, executed } = await attempt('unapproved-write')
    expect(response.output.offerReadback).toMatchObject({ pass: false, reason: 'Offer turn changed persisted fields without approval.' })
    expect(executed()).toBe(false)
  })
})

// The setup of the case that selects an offer runs on the client path, which sends `conversation.context`. Only the form
// field of the `POST /api/chat` provider reads `clientContextJson`, so the setup leaves no copy of the selected offer there.
describe('the setup of an offers case that selects its issued offer', () => {
  it('holds the selected offer in the client context and writes no form field of the old provider path', async () => {
    offlineCredentials()
    vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline')
    const issued = { offerKey: `smallStep:account:${today}`, kind: 'continueChat', label: 'Choose one small step',
      surface: null, prompt: 'Help me choose one small step I can take today.', entityId: null, date: today }
    const emptyDay = { ...empty, parts: [{ ...structuredClone(habitBlock), block: { ...habitBlock.block, scope: 'today', items: [],
      totalCount: 0, read: { ...habitRead.parts[0].block.read, totalCount: 0, nextAction: issued } } }] }
    vi.stubGlobal('fetch', async (url, options = {}) => {
      const path = new URL(url).pathname
      if (path === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
      if (path === '/api/auth/refresh') return refreshResponse()
      if (path === '/api/eval/snapshot') return Response.json(evalSnapshot(baseline))
      expect(path).toBe('/api/chat/stream')
      const sent = await sentTurn(url, options)
      return streamedTurn({ ...chatResponse(sent.requestId), ...emptyDay }, sent.requestId)
    })
    const test = { vars: { ...prepared('offers-action-lifecycle-en'), offerBaseline: baseline, fixtureEvidence: baseline }, metadata: {} }
    await prepareCorrection(test)
    expect(test.vars.clientContext.selectedOfferKey).toBe(issued.offerKey)
    expect(test.vars.conversation.context).toBe(test.vars.clientContext)
    expect(test.vars).not.toHaveProperty('clientContextJson')
  })
})
