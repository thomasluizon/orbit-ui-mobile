import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import AstraHttpProvider from '../http-provider.mjs'
import { configureOffers } from '../offer-context.mjs'
import { outcome, runOutcomeCase } from '../client-path.mjs'
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
    const provider = new AstraHttpProvider({ config: {} })
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
