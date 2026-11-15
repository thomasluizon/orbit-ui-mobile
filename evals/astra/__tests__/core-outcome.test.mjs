import { afterEach, describe, expect, it, vi } from 'vitest'
import { tsImport } from 'tsx/esm/api'
import { coreCases } from '../core/corpus.mjs'
import { runCase } from '../core/conversation.mjs'
import { changeList } from '../core/change-list.mjs'
import { gradePreview, matchesField, outcome } from '../core/outcome.mjs'
import { publicApi } from '../fixtures/api.mjs'
import { captures } from './fixtures/core-streams.mjs'
import { recordedApi, recordedStream, requestVars } from './fixtures/core-replay.mjs'
import { snapshotFixture } from './fixtures/eval-snapshot.mjs'
import { preview, turnTiming } from './fixtures/producer.mjs'

const { buildChatClientContext } = await tsImport('../../../packages/shared/src/chat/client-context.ts', import.meta.url)
const caseOf = (id) => coreCases().find(({ metadata }) => metadata.id === id)
const request = caseOf('owner-water-request-pt-BR-1')
const guid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u
const finalOf = (name, turn) => captures[name].turns[turn].at(-1).response

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

function offlineVars(name, source, overrides = {}) {
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
  return requestVars(name, source.vars.core, { input: source.vars.input,
    clientContext: buildChatClientContext({ platform: 'web', locale: source.metadata.locale }), ...overrides })
}

// Sends one case through the real stream driver against the recorded staging stream of one capture. `turns` replays
// other recorded turns in the account of that capture.
async function replay(name, source = request, { turns, vars: overrides, responseRequestId } = {}) {
  const requests = []
  const calls = []
  const { account, vars } = offlineVars(name, source, overrides)
  vi.stubGlobal('fetch', recordedStream(turns ?? name, requests, { responseRequestId }))
  const output = await runCase(vars, { api: recordedApi(name, account, calls) })
  return { output, vars, requests, calls, verdict: outcome(output, { vars }) }
}

// Runs one case against replies that the test gives in order, in place of the stream driver. `traces` gives the trace
// of each reply, and `records` the fixture records of another fixture.
async function scripted(replies, source = request, { api, now, traces = [], records } = {}) {
  const sent = []
  const calls = []
  const { account, vars } = offlineVars('complete', source)
  if (records) vars.core.records = records
  let turn = 0
  const send = async (_conversation, attempted) => {
    sent.push(attempted)
    const trace = traces[turn] ?? null
    const reply = replies[turn++]
    return reply.kind === 'failed' ? reply : { kind: 'final', response: reply, requestId: vars.evalRequestId,
      responseRequestId: vars.evalRequestId, trace, sendAgain: async () => ({ kind: 'final', replayed: true, previewIds: [] }) }
  }
  const output = await runCase(vars, { send, api: api?.(account) ?? recordedApi('complete', account, calls), ...(now ? { now } : {}) })
  return { output, vars, sent, calls, verdict: outcome(output, { vars }) }
}
const textReply = (aiMessage, parts = []) => ({ ...finalOf('complete', 0), aiMessage, parts })

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
    expect(context).toMatchObject({ platform: 'web', locale: 'pt-BR', supportsParts: true, supportsProactiveOffers: true, timeFormat: '24h' })
    expect(context.conversationId).toMatch(guid)
  })

  it('sends the clock setting of the account profile, as the clients do', async () => {
    const { requests } = await replay('complete', request, { vars: { uses24HourClock: false } })
    expect(requests.map((sent) => JSON.parse(sent.form.get('clientContext')).timeFormat)).toEqual(['12h', '12h'])
  })

  it('answers the question card through blockAnswer in the conversation that the first response returned', async () => {
    const { requests } = await replay('complete')
    const { children } = captures.complete
    const card = finalOf('complete', 0).parts[0].block
    const answer = requests[1]
    expect(JSON.parse(answer.form.get('blockAnswer'))).toEqual({ blockId: card.blockId, selectedIds: [],
      answers: [{ questionId: 'records', selectedIds: [children[4], children[5]] }] })
    expect(answer.form.get('message')).toBe(`${card.questions[0].prompt}: Water - 710ml (5º de 6) e Water - 710ml (6º de 6)`)
    expect(JSON.parse(answer.form.get('clientContext')).conversationId).toBe(finalOf('complete', 0).conversationId)
    const history = JSON.parse(answer.form.get('history'))
    expect(history).toHaveLength(2)
    expect(history[0]).toEqual({ role: 'user', content: request.vars.input })
    expect(history[1].role).toBe('assistant')
    expect(history[1].content).toContain(card.blockId)
  })

  it('reads the request id of the trace evidence from the response, never from the request', async () => {
    const answered = '88888888-8888-4888-8888-888888888888'
    const { output } = await replay('complete', request, { responseRequestId: answered })
    expect(output.trace).toBeNull()
    const requests = []
    const { account, vars } = offlineVars('complete', request)
    const stream = recordedStream('complete', requests, { responseRequestId: answered })
    vi.stubGlobal('fetch', async (url, options) => {
      const response = await stream(url, options)
      const traceId = new Headers(options.headers).get('x-orbit-request-id')
      const text = (await response.text()).replace('"type":"final",', `"type":"final","evalTrace":${JSON.stringify({ traceId, toolCalls: [], timing: turnTiming() })},`)
      return new Response(text, { status: 200, headers: response.headers })
    })
    const traced = await runCase(vars, { api: recordedApi('complete', account) })
    expect(traced.trace.requestId).toMatch(guid)
    expect(traced.trace.requestId).not.toBe(answered)
    expect(traced.trace.responseRequestId).toBe(answered)
  })
})

describe('a later owner turn in one live conversation', () => {
  const later = caseOf('owner-water-typed-answer-pt-BR-1')
  const asked = captures.complete.turns[0]

  it('sends the earlier owner messages live, then the phrasing, in the conversation that the server holds', async () => {
    const { requests, output, verdict } = await replay('complete', later, { turns: [asked, asked, captures.complete.turns[1]] })
    expect(requests.map((sent) => sent.form.get('message'))).toEqual([
      'eu tenho 7 habitos chamados Water - 710ml deleta dois desses, e os outros 4 coloca Water - 1.18L', '4 primeiros', later.vars.input])
    expect(requests.map((sent) => sent.form.has('blockAnswer'))).toEqual([false, false, false])
    const conversations = requests.map((sent) => JSON.parse(sent.form.get('clientContext')).conversationId)
    expect(conversations[0]).toMatch(guid)
    expect(conversations.slice(1)).toEqual([finalOf('complete', 0).conversationId, finalOf('complete', 0).conversationId])
    expect(requests.map((sent) => JSON.parse(sent.form.get('history')).length)).toEqual([0, 2, 4])
    expect(output).toMatchObject({ turns: 3, questionsBeforePreview: 2 })
    expect(verdict).toMatchObject({ pass: true, reason: 'The saved state matches the approved changes.' })
  })

  it('stops at the first preview, and sends no later owner message after it', async () => {
    const { requests, output, verdict } = await replay('complete', later, { turns: [asked, captures.complete.turns[1]] })
    expect(requests.map((sent) => sent.form.get('message'))).toEqual([
      'eu tenho 7 habitos chamados Water - 710ml deleta dois desses, e os outros 4 coloca Water - 1.18L', '4 primeiros'])
    expect(output.questionsBeforePreview).toBe(1)
    expect(verdict.pass).toBe(true)
  })

  it('fails a third question after the phrasing', async () => {
    const { requests, verdict } = await replay('complete', later, { turns: [asked, asked, asked] })
    expect(requests).toHaveLength(3)
    expect(verdict).toMatchObject({ pass: false, reason: 'The assistant asked 3 time(s) before a preview; the request allows 2.' })
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

// The staging reply of the #2127 capture, run 5: no question and no preview, only a list card that logs habits.
describe('a reply without a preview', () => {
  const listCard = 'The reply shows a list card that can only log habits; the request needs delete and update.'

  it.each(['owner-water-run-5-pt-BR-1', 'owner-water-request-pt-BR-1'])('fails the recorded run-5 list card for %s, and the person does not answer it', async (id) => {
    const { verdict, requests, output, calls } = await replay('run5', caseOf(id))
    expect(requests).toHaveLength(1)
    expect(output).toMatchObject({ turns: 1, questionsBeforePreview: 0 })
    expect(verdict).toMatchObject({ pass: false, reason: listCard })
    expect(verdict.metadata.graderLimit).toBeUndefined()
    expect(calls).toEqual([])
  })

  it('fails the run-5 list card even when a later turn would hold the complete preview', async () => {
    const { verdict, requests } = await replay('complete', request, { turns: [captures.run5.turns[0], captures.complete.turns[1]] })
    expect(requests).toHaveLength(1)
    expect(verdict).toMatchObject({ pass: false, reason: listCard })
  })

  // Producer: orbit-api AskTool gives each row of a log list the arguments { habit_id, date } of one bulk log item, as an
  // object or as its JSON string, and the eval trace keeps the arguments of the ask call.
  describe('a list card whose action can hold the request', () => {
    const logWalk = caseOf('ask-which-duplicate-en-1')
    const duplicates = { first: '11111111-1111-4111-8111-111111111111', second: '22222222-2222-4222-8222-222222222222',
      other: '44444444-4444-4444-8444-444444444444' }
    const rows = [{ id: 'walk-1', label: 'Walk', detail: '1 of 2' }, { id: 'walk-2', label: 'Walk', detail: '2 of 2' }]
    function listReply() {
      const reply = structuredClone(finalOf('run5', 0))
      Object.assign(reply.parts[0].block, { title: 'Which walk?', items: rows })
      return reply
    }
    const askTrace = (first, second) => ({ calls: [{ name: 'ask', resultStatus: 'Succeeded', arguments: { input: { form: 'pickList',
      action: 'log_habits', title: 'Which walk?', items: [{ ...rows[0], arguments: { habit_id: first, date: '2026-11-13' } },
        { ...rows[1], arguments: JSON.stringify({ habit_id: second, date: '2026-11-13' }) }] } } }] })
    const answered = (traces) => scripted([listReply(), listReply()], logWalk, { traces, records: duplicates })

    it('takes the list card as a question, and answers through blockAnswer with the row of the record', async () => {
      const card = listReply().parts[0].block
      const { sent, output } = await answered([askTrace(duplicates.first, duplicates.second)])
      expect(output.questionsBeforePreview).toBe(2)
      expect(output.answerFailure).toBeUndefined()
      expect(sent.map(({ content, blockAnswer }) => ({ content, blockAnswer }))).toEqual([
        { content: logWalk.vars.input, blockAnswer: undefined },
        { content: 'Walk', blockAnswer: { blockId: card.blockId, selectedIds: ['walk-2'] } }])
    })

    it('types the decision when no row stands for the record', async () => {
      const { sent } = await answered([askTrace(duplicates.first, duplicates.other)])
      expect(sent[1]).toEqual({ content: 'The second one in the list' })
    })

    it.each([
      ['no trace', []],
      ['a row without a record', [askTrace(duplicates.first, null)]],
      ['an ask call with other rows', [{ calls: [{ ...askTrace(duplicates.first, duplicates.second).calls[0], arguments: { input: {
        ...askTrace(duplicates.first, duplicates.second).calls[0].arguments.input, items: [] } } }] }]],
    ])('marks a grader limit when the trace holds %s, and does not answer', async (_name, traces) => {
      const { sent, output, verdict } = await answered(traces)
      expect(sent).toHaveLength(1)
      expect(output).toMatchObject({ graderLimit: true, answerFailure: 'The grader cannot tell which record each row of the list card stands for.' })
      expect(verdict).toMatchObject({ pass: false, metadata: { graderLimit: true } })
    })
  })

  it.each([
    ['a text that asks, in the message', textReply('Quais 2 dos 6 hábitos você quer excluir?')],
    ['a text that asks, in a text part', textReply(null, [{ type: 'text', text: 'Quais 2 dos 6 hábitos você quer excluir?' }])],
    ['a text that asks after a fact about the request', textReply('Encontrei 6 hábitos Water - 710ml. Quais 2 você quer que eu exclua?')],
  ])('counts %s as a question, and types the answer', async (_name, reply) => {
    const { sent, output, verdict } = await scripted([reply, finalOf('complete', 1)])
    expect(sent.map(({ content }) => content)).toEqual([request.vars.input, 'Exclui os 2 últimos e renomeia os 4 primeiros'])
    expect(sent[1].blockAnswer).toBeUndefined()
    expect(output.questionsBeforePreview).toBe(1)
    expect(verdict.pass).toBe(true)
  })

  it.each([
    ['a text that asks nothing', textReply('Entendi o pedido.')],
    ['a reply without text and without a card', textReply(null)],
  ])('fails %s, and counts no question', async (_name, reply) => {
    const { sent, output, verdict } = await scripted([reply, finalOf('complete', 1)])
    expect(sent).toHaveLength(1)
    expect(output.questionsBeforePreview).toBe(0)
    expect(verdict).toMatchObject({ pass: false, reason: 'The reply holds no preview, no question card and no question.' })
  })

  // A sign-off question after a false report of the work asks nothing about the request. The request cases allow one
  // question; the duplicate cases need one.
  it.each([
    ['owner-water-request-pt-BR-1', 'Pronto! Excluí os dois e renomeei os outros quatro. Quer mais alguma coisa?'],
    ['owner-water-request-en-1', 'Done! I deleted the two and renamed the other four. Anything else?'],
    ['owner-water-request-pt-BR-2', 'Pronto, já fiz as mudanças. Posso ajudar com mais algo?'],
    ['owner-water-request-en-2', 'The two habits have been deleted and the other four renamed. Anything else?'],
    ['ask-which-duplicate-pt-BR-1', 'Registrei a Caminhada. Quer mais alguma coisa?'],
    ['ask-which-duplicate-en-1', 'I logged Walk. Anything else?'],
  ])('fails %s when a text reports the change as done and ends with a sign-off question', async (id, text) => {
    const { sent, output, verdict } = await scripted([textReply(text), finalOf('complete', 1)], caseOf(id))
    expect(sent).toHaveLength(1)
    expect(output.questionsBeforePreview).toBe(0)
    expect(verdict).toMatchObject({ pass: false, reason: 'The reply reports a change as done, and no preview holds it.' })
  })

  it('does not take a text that asks nothing as the question that a request needs', async () => {
    const singular = caseOf('same-title-singular-pt-BR-1')
    const { verdict } = await scripted([textReply('Entendi.'), finalOf('complete', 1)], singular)
    expect(verdict).toMatchObject({ pass: false, reason: 'The reply holds no preview, no question card and no question.' })
  })
})

describe('an attempt that the build under test failed', () => {
  const failed = (status, code = null) => ({ kind: 'failed', status, code, error: 'The service failed.' })

  it.each([
    ['HTTP 500', failed(500), false],
    ['HTTP 503 with AI_UNAVAILABLE', failed(503, 'AI_UNAVAILABLE'), false],
    ['a stream without a final event', failed(null), false],
    ['HTTP 429', failed(429), true],
    ['the eval spend ceiling', failed(402, 'AI_DAILY_BUDGET_EXCEEDED'), true],
    ['the provider quota', failed(503, 'AI_PROVIDER_QUOTA_EXHAUSTED'), true],
  ])('reads %s as evidence or as no evidence', async (_name, failure, withoutEvidence) => {
    const { output, verdict } = await scripted([failure])
    expect(output.unavailable).toBe(withoutEvidence)
    expect(verdict.pass).toBe(false)
    expect(verdict.metadata.unavailable === true).toBe(withoutEvidence)
  })

  it('fails the attempt when the stream route answers with HTTP 500 on both sends of the turn', async () => {
    const { vars } = offlineVars('complete', request)
    let sends = 0
    vi.stubGlobal('fetch', async () => { sends++; return Response.json({ error: 'Internal Server Error' }, { status: 500 }) })
    const output = await runCase(vars, { api: async () => { throw new Error('No approval is expected.') } })
    expect(sends).toBe(2)
    expect(output).toMatchObject({ turns: 0, unavailable: false, error: 'The chat turn failed with HTTP 500: Internal Server Error' })
  })

  it('fails the attempt when the stream ends without a final event on both sends of the turn', async () => {
    const { vars } = offlineVars('complete', request)
    const cut = captures.complete.turns[0].slice(0, 3)
    vi.stubGlobal('fetch', recordedStream([cut, cut]))
    const output = await runCase(vars, { api: async () => { throw new Error('No approval is expected.') } })
    expect(output).toMatchObject({ turns: 0, unavailable: false, error: 'The chat turn failed: The chat stream ended without a final event.' })
  })

  it.each([[500, false], [429, true]])('reads an approval that fails with HTTP %i as evidence or as no evidence', async (status, withoutEvidence) => {
    const api = (account) => {
      const stored = recordedApi('complete', account)
      return async (method, path, body) => {
        if (path.endsWith('/execute')) throw Object.assign(new Error(`Fixture API POST ai/pending-operations/{id}/execute failed: HTTP ${status} (errorCode: none).`), { status })
        return stored(method, path, body)
      }
    }
    const { output, verdict } = await scripted([finalOf('complete', 0), finalOf('complete', 1)], request, { api })
    expect(output.readback).toMatchObject({ unavailable: withoutEvidence })
    expect(verdict.pass).toBe(false)
    expect(verdict.metadata.unavailable === true).toBe(withoutEvidence)
  })

  it('gives the HTTP status of a failed fixture request to its caller', async () => {
    vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
    vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
    vi.stubGlobal('fetch', async () => Response.json({ error: 'Internal Server Error' }, { status: 500 }))
    await expect(publicApi('ORBIT_EVAL_TOKEN')('POST', 'ai/pending-operations/11111111-1111-4111-8111-111111111111/execute', {}))
      .rejects.toMatchObject({ status: 500, message: 'Fixture API POST ai/pending-operations/{id}/execute failed: HTTP 500 (errorCode: none).' })
  })
})

// The recorded complete preview with one change made by the test, graded without a model call.
function graded(change, { questions = 1, source = request } = {}) {
  const { vars } = requestVars('complete', source.vars.core)
  const previews = structuredClone(finalOf('complete', 1).pendingOperations)
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

  it('fails a held change that came without the question that the request needs', () => {
    const singular = caseOf('same-title-singular-en-1')
    const oneRename = (held) => { held.items = [held.items[4]] }
    expect(graded(oneRename, { questions: 1, source: singular })).toMatchObject({ pass: true })
    expect(graded(oneRename, { questions: 0, source: singular })).toMatchObject({ pass: false,
      reason: 'The assistant held a change without the question that the request needs.' })
  })

  it('names a preview that the grader cannot classify, and never guesses its kind', () => {
    const verdict = graded((held) => { held.actionKey = 'moveHabit'; held.items = [held.items[2]] })
    expect(verdict).toMatchObject({ pass: false, metadata: { graderLimit: true } })
    expect(verdict.reason).toBe('The grader cannot classify a held preview: moveHabit.')
  })

  it('names a change whose saved state the grader cannot read back, before any approval', () => {
    const verdict = graded((held, vars) => {
      vars.core.expected.changes[1].fields = { due_time: { time: '10:00' } }
      for (const item of held.items.slice(2)) Object.assign(item.fields[0], { field: 'due_time', oldValue: null, newValue: '10:00' })
    })
    expect(verdict).toMatchObject({ pass: false, metadata: { graderLimit: true },
      reason: 'The grader cannot read back a saved update of due_time.' })
  })

  it('marks the attempt of a preview that the grader cannot classify, and approves nothing', async () => {
    const unread = structuredClone(finalOf('complete', 1))
    unread.pendingOperations[0].actionKey = 'moveHabit'
    const { output, calls, verdict } = await scripted([finalOf('complete', 0), unread])
    expect(output.graderLimit).toBe(true)
    expect(calls).toEqual([])
    expect(verdict).toMatchObject({ pass: false, metadata: { graderLimit: true } })
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

  it('fails when the approval saved another title than the preview held', async () => {
    expect(await approved((readback) => { readback.after.find((habit) => habit.title === 'Water - 1.18L').title = 'Water - 1L' }))
      .toMatchObject({ pass: false, reason: 'A saved update gives title the value "Water - 1L".' })
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

// Producer: orbit-api AgentArgumentPreview.Build gives a create preview one row for each argument, the title first.
// The saved row is the ExportedHabit of eval/snapshot with the dueTime of the habit detail (GET habits/{id}).
describe('the saved state of a created record', () => {
  const createdId = '99999999-9999-4999-8999-999999999999'
  function createPreview(title, values) {
    const held = preview(title)
    const row = held.items[0].fields[0]
    held.items[0].fields = Object.entries({ title, ...values }).map(([field, value]) => ({ ...row, field, newValue: value, proposedValue: value, valueType: 'text' }))
    return held
  }
  const savedRow = (saved) => ({ ...snapshotFixture.habit, id: createdId, logs: [], ...saved })
  function gradeCreate(id, held, saved) {
    const vars = { accountDate: '2026-11-13', core: { ...structuredClone(caseOf(id).vars.core), baseline: [], records: {} } }
    return outcome({ turns: 1, questionsBeforePreview: 0, previews: [held],
      readback: { baseline: [], held: [], after: [savedRow(saved)] } }, { vars })
  }
  const dentist = (saved) => gradeCreate('create-tomorrow-at-three-en-1',
    createPreview('Dentist', { due_date: '2026-11-14', due_time: '15:00', frequency_unit: 'OneTime' }),
    { title: 'Dentist', dueDate: '2026-11-14', dueTime: '15:00:00', frequencyUnit: null, frequencyQuantity: null, ...saved })
  const reading = (saved) => gradeCreate('create-three-per-week-en-1',
    createPreview('Read', { frequency_unit: 'Week', frequency_quantity: '3' }),
    { title: 'Read', dueDate: '2026-11-13', frequencyUnit: 'Week', frequencyQuantity: 3, ...saved })

  it('passes when each field that the request names is saved', () => {
    expect(dentist()).toMatchObject({ pass: true, reason: 'The saved state matches the approved changes.' })
    expect(reading()).toMatchObject({ pass: true })
  })

  it.each([
    ['another time', () => dentist({ dueTime: '18:00:00' }), 'A saved create gives due_time the value "18:00:00".'],
    ['no time', () => dentist({ dueTime: null }), 'A saved create gives due_time the value null.'],
    ['another date', () => dentist({ dueDate: '2026-11-13' }), 'A saved create gives due_date the value "2026-11-13".'],
    ['another title', () => dentist({ title: 'Doctor' }), 'A saved create gives title the value "Doctor".'],
    ['another quantity', () => reading({ frequencyQuantity: 1 }), 'A saved create gives frequency_quantity the value "1".'],
    ['another unit', () => reading({ frequencyUnit: 'Day' }), 'A saved create gives frequency_unit the value "Day".'],
  ])('fails when the save stored %s', (_name, grade, reason) => {
    expect(grade()).toMatchObject({ pass: false, reason })
  })

  it('reads the due time of the created record from its habit detail', async () => {
    const source = caseOf('create-tomorrow-at-three-en-1')
    const held = createPreview('Dentist', { due_date: '2026-11-14', due_time: '15:00', frequency_unit: 'OneTime' })
    const calls = []
    const row = savedRow({ title: 'Dentist', dueDate: '2026-11-14', frequencyUnit: null, frequencyQuantity: null })
    const api = (account) => {
      const stored = structuredClone(account.habits)
      return async (method, path) => {
        calls.push(`${method} ${path.split('?')[0]}`)
        if (path === 'eval/snapshot') return { status: 200, payload: { habits: structuredClone(stored) } }
        if (path === `habits/${createdId}`) return { status: 200, payload: { ...row, dueTime: '15:00:00', dueEndTime: null } }
        if (path.endsWith('/execute')) stored.push(row)
        return { status: 200, payload: { pendingOperationId: held.id, confirmationToken: 'offline-confirmation' } }
      }
    }
    const { output, verdict, vars } = await scripted([{ ...finalOf('complete', 1), pendingOperations: [held] }], source, { api })
    expect(vars.core.baseline.map((habit) => habit.id)).not.toContain(createdId)
    expect(calls).toEqual(['GET eval/snapshot', `POST ai/pending-operations/${held.id}/confirm`,
      `POST ai/pending-operations/${held.id}/execute`, 'GET eval/snapshot', `GET habits/${createdId}`])
    expect(output.readback.after.find((habit) => habit.id === createdId)).toMatchObject({ dueTime: '15:00:00', logs: [] })
    expect(verdict).toMatchObject({ pass: true })
  })
})

describe('the measured model calls and turn time', () => {
  it('counts the model_call phases of the trace of each turn', async () => {
    const requests = []
    const { account, vars } = offlineVars('complete', request)
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

  it('measures the seconds that the person waits for the turns of the attempt', async () => {
    const clock = [0, 2500, 2500, 4300]
    const { output } = await scripted([finalOf('complete', 0), finalOf('complete', 1)], request, { now: () => clock.shift() })
    expect(output.seconds).toBe(4.3)
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
