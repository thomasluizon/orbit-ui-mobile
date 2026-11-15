import { afterEach, describe, expect, it, vi } from 'vitest'
import { tsImport } from 'tsx/esm/api'
import { coreCases } from '../core/corpus.mjs'
import { runCase } from '../core/conversation.mjs'
import { changeList } from '../core/change-list.mjs'
import { gradePreview, matchesField, outcome } from '../core/outcome.mjs'
import { captures } from './fixtures/core-streams.mjs'
import { recordedApi, recordedStream, requestVars } from './fixtures/core-replay.mjs'
import { preview, turnTiming } from './fixtures/producer.mjs'

const { buildChatClientContext } = await tsImport('../../../packages/shared/src/chat/client-context.ts', import.meta.url)
const caseOf = (id) => coreCases().find(({ metadata }) => metadata.id === id)
const request = caseOf('owner-water-request-pt-BR-1')
const guid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

// Sends the owner request through the real stream driver against the recorded staging stream of one capture.
async function replay(name, source = request) {
  const requests = []
  const calls = []
  const { account, vars } = requestVars(name, source.vars.core, { input: source.vars.input,
    clientContext: buildChatClientContext({ platform: 'web', locale: 'pt-BR' }) })
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
  vi.stubGlobal('fetch', recordedStream(name, requests))
  const output = await runCase(vars, { api: recordedApi(name, account, calls) })
  return { output, vars, requests, calls, verdict: outcome(output, { vars }) }
}

describe('the client path', () => {
  it('sends each turn to the stream route with the form the shipped clients build', async () => {
    const { requests } = await replay('complete')
    expect(requests).toHaveLength(2)
    const [first, answer] = requests
    for (const sent of requests) {
      expect(new URL(sent.url).pathname).toBe('/api/chat/stream')
      expect(sent.headers).toMatchObject({ authorization: 'Bearer offline-token', 'api-version': '2.0', 'x-orbit-eval-trace': '1' })
      expect(sent.headers['idempotency-key']).toMatch(guid)
    }
    expect(first.headers['idempotency-key']).not.toBe(answer.headers['idempotency-key'])
    expect(first.form.get('message')).toBe(request.vars.input)
    expect(first.form.get('history')).toBe('[]')
    expect(first.form.has('blockAnswer')).toBe(false)
    const context = JSON.parse(first.form.get('clientContext'))
    expect(context).toMatchObject({ platform: 'web', locale: 'pt-BR', supportsParts: true, supportsProactiveOffers: true })
    expect(context.conversationId).toMatch(guid)
  })

  it('answers the question card through blockAnswer in the conversation that the first response returned', async () => {
    const { requests } = await replay('complete')
    const { children, turns } = captures.complete
    const card = turns[0].at(-1).response.parts[0].block
    const answer = requests[1]
    expect(JSON.parse(answer.form.get('blockAnswer'))).toEqual({ blockId: card.blockId, selectedIds: [],
      answers: [{ questionId: 'records', selectedIds: [children[4], children[5]] }] })
    expect(answer.form.get('message')).toBe(`${card.questions[0].prompt}: Water - 710ml (5º de 6) e Water - 710ml (6º de 6)`)
    expect(JSON.parse(answer.form.get('clientContext')).conversationId).toBe(turns[0].at(-1).response.conversationId)
    const history = JSON.parse(answer.form.get('history'))
    expect(history).toHaveLength(2)
    expect(history[0]).toEqual({ role: 'user', content: request.vars.input })
    expect(history[1].role).toBe('assistant')
    expect(history[1].content).toContain(card.blockId)
  })
})

describe('the outcome of the recorded staging previews', () => {
  it('passes one question, then one preview with 2 deletes and 4 renames, then the saved state', async () => {
    const { output, verdict, calls } = await replay('complete')
    expect(verdict).toMatchObject({ pass: true, reason: 'The saved state matches the approved changes.' })
    expect(output).toMatchObject({ turns: 2, questionsBeforePreview: 1 })
    expect(changeList(output.previews).changes.map(({ kind, target, fields }) => ({ kind, target, fields }))).toEqual([
      ...captures.complete.children.slice(4).map((target) => ({ kind: 'delete', target, fields: {} })),
      ...captures.complete.children.slice(0, 4).map((target) => ({ kind: 'update', target, fields: { title: 'Water - 1.18L' } })),
    ])
    const previewId = output.previews[0].id
    expect(calls.map(({ method, path }) => `${method} ${path}`)).toEqual(['GET eval/snapshot',
      `POST ai/pending-operations/${previewId}/confirm`, `POST ai/pending-operations/${previewId}/execute`, 'GET eval/snapshot'])
    expect(output.readback.after.filter((habit) => habit.title === 'Water - 1.18L')).toHaveLength(captures.complete.savedTitles.length)
  })

  it('fails the preview that holds half of the request, and approves nothing', async () => {
    const { verdict, calls, output } = await replay('half')
    expect(output.questionsBeforePreview).toBe(1)
    expect(verdict.pass).toBe(false)
    expect(verdict.reason).toBe('The preview does not update exactly the records of the request. The request needs delete and update; the preview holds delete 2.')
    expect(calls).toEqual([])
  })

  it('fails a question when the request allows none, and does not answer it', async () => {
    const { verdict, requests, output } = await replay('complete', caseOf('owner-water-choice-pt-BR-1'))
    expect(requests).toHaveLength(1)
    expect(output.questionsBeforePreview).toBe(1)
    expect(verdict).toMatchObject({ pass: false, reason: 'The assistant asked 1 time(s) before a preview; the request allows 0.' })
  })
})

// The recorded complete preview with one change made by the test, graded without a model call.
function graded(change, { questions = 1 } = {}) {
  const { vars } = requestVars('complete', request.vars.core)
  const previews = structuredClone(captures.complete.turns[1].at(-1).response.pendingOperations)
  change?.(previews[0], vars)
  return gradePreview({ turns: questions + 1, questionsBeforePreview: questions, previews }, vars)
}
const retarget = (item, id) => { item.entityId = id; item.itemId = `${item.itemId.split('/')[0]}/${id}`; for (const field of item.fields) field.entityId = id }

describe('the change list comparison', () => {
  it('passes the recorded preview unchanged', () => {
    expect(graded()).toMatchObject({ pass: true })
  })

  it.each([
    ['a rename is missing', (held) => { held.items.splice(2, 1) }, /does not update exactly the records/u],
    ['a delete is missing', (held) => { held.items.splice(0, 1) }, /does not delete exactly the records/u],
    ['a rename has another title', (held) => { held.items[2].fields[0].newValue = 'Water - 1L' }, /gives title the value "Water - 1L"/u],
    ['a rename also changes another field', (held) => { held.items[2].fields.push({ ...held.items[2].fields[0], field: 'emoji', oldValue: null, newValue: '💧' }) }, /changes title, emoji where the request changes title/u],
    ['a change targets the parent', (held, vars) => { retarget(held.items[2], vars.core.records.parent) }, /does not update exactly the records/u],
    ['a change outside the request is held', (held, vars) => { held.items.push({ ...structuredClone(held.items[2]), itemId: `1/${vars.core.records.walk}`, entityId: vars.core.records.walk }) }, /holds a change outside the request/u],
    ['one record is in two changes', (held) => { retarget(held.items[2], held.items[0].entityId) }, /One record is in two changes/u],
  ])('fails when %s', (_name, change, reason) => {
    const verdict = graded(change)
    expect(verdict.pass).toBe(false)
    expect(verdict.reason).toMatch(reason)
  })

  it('holds the answered positions only after an answer', () => {
    const swap = (held, vars) => {
      const { children } = vars.core.records
      retarget(held.items[0], children[0])
      retarget(held.items[2], children[4])
    }
    expect(graded(swap).pass).toBe(false)
    expect(graded(swap, { questions: 0 }).pass).toBe(true)
  })

  it('names a preview that the grader cannot classify, and never guesses its kind', () => {
    const verdict = graded((held) => { held.actionKey = 'moveHabit'; held.items = [held.items[2]] })
    expect(verdict).toMatchObject({ pass: false, metadata: { graderLimit: true } })
    expect(verdict.reason).toBe('The grader cannot classify a held preview: moveHabit.')
  })

  it('reads a create preview of the producer as one create with its fields', () => {
    expect(changeList([preview('Dentist')]).changes).toEqual([{ kind: 'create', target: null,
      preview: preview().id, fields: { due_time: '15:50', frequency_unit: 'OneTime' } }])
  })
})

describe('the saved state readback', () => {
  const approved = async (change) => {
    const { output, vars } = await replay('complete')
    change(output.readback)
    return outcome(output, { vars })
  }

  it('fails when the approval saved nothing', async () => {
    expect(await approved((readback) => { readback.after = readback.held })).toMatchObject({ pass: false,
      reason: 'The saved records differ from the approved changes.' })
  })

  it('fails when the held preview already changed the account', async () => {
    expect(await approved((readback) => { readback.held = readback.after })).toMatchObject({ pass: false,
      reason: 'The held preview changed the account before its approval.' })
  })

  it('fails when the approval saved a record that the preview did not hold', async () => {
    expect(await approved((readback) => { readback.after.push({ id: '99999999-9999-4999-8999-999999999999', title: 'Extra', logs: [] }) }))
      .toMatchObject({ pass: false, reason: 'The created records differ from the approved changes.' })
  })
})

describe('the measured model calls', () => {
  it('counts the model_call phases of the trace of each turn', async () => {
    const requests = []
    const { account, vars } = requestVars('complete', request.vars.core, { input: request.vars.input,
      clientContext: buildChatClientContext({ platform: 'web', locale: 'pt-BR' }) })
    vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
    vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
    const stream = recordedStream('complete', requests)
    vi.stubGlobal('fetch', async (url, options) => {
      const response = await stream(url, options)
      const traceId = new Headers(options.headers).get('x-orbit-request-id')
      const text = (await response.text()).replace('"type":"final",', `"type":"final","evalTrace":${JSON.stringify({ traceId, toolCalls: [], timing: turnTiming() })},`)
      return new Response(text, { status: 200, headers: response.headers })
    })
    const output = await runCase(vars, { api: recordedApi('complete', account) })
    expect(output.modelCalls).toBe(4)
    expect(output.trace).toMatchObject({ state: 'available', requestId: expect.stringMatching(guid) })
  })

  it('leaves the calls unmeasured when a turn has no trace', async () => {
    expect((await replay('complete')).output.modelCalls).toBeNull()
  })
})

describe('the field expectations', () => {
  it.each([
    [{ contains: ['cara de barro'] }, 'Cinema: Cara-De-Barro', true],
    [{ contains: ['dentist'] }, 'Dentista', true],
    [{ contains: ['dentist'] }, 'Médico', false],
    [{ monthDay: '11-07' }, '2027-11-07', true],
    [{ monthDay: '11-07' }, '2026-07-11', false],
    [{ time: '21:15' }, '21:15:00', true],
    [{ time: '21:15' }, '09:15', false],
    [{ daysFromToday: 1 }, '2026-11-14', true],
    [{ daysFromToday: 1 }, '2026-11-13', false],
    ['Week', 'Week', true],
    ['3', '1', false],
  ])('matches %j against %j: %s', (expected, value, matches) => {
    expect(matchesField(expected, value, '2026-11-13')).toBe(matches)
  })
})
