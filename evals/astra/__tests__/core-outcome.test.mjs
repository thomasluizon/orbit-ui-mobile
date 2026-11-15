import { afterEach, describe, expect, it, vi } from 'vitest'
import { tsImport } from 'tsx/esm/api'
import { coreCases, coreDescriptors } from '../core/corpus.mjs'
import { runCase } from '../core/conversation.mjs'
import { changeList } from '../core/change-list.mjs'
import { mergeRuns } from '../core/merge.mjs'
import { gradePreview, matchesField, outcome } from '../core/outcome.mjs'
import { summarize } from '../core/report.mjs'
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
const noTrace = 'The card answer needs the eval trace of the turn, and the turn returned none.'
const choiceCard = (question, options) => ({ type: 'block', kind: 'choice', block: { blockId: '99999999-0000-4000-8000-000000000001',
  question, options, multiSelect: false, allowFreeText: false, expiresAtUtc: '2026-11-14T00:00:00Z' } })
// The promptfoo result of one graded attempt, as the core hooks give it to the report, and the build of a run window.
const promptfooResult = (descriptor, output, { pass, reason, metadata }) => ({ testCase: { metadata: descriptor, vars: {} }, success: pass,
  response: { output }, gradingResult: { componentResults: [{ pass, reason, metadata, assertion: { metric: 'outcome' } }] } })
const build = { run: 'must-pass', apiCommit: 'a'.repeat(40) }

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

// runCase stops one question past the allowed count, before any preview. The attempt keeps that count, so the questions
// criterion of the gate fails on the output that a real run returns.
describe('the questions criterion of the gate', () => {
  it('fails when the attempts of a case ask more often than the case allows', async () => {
    const asked = captures.complete.turns[0]
    const descriptor = coreDescriptors().find(({ id }) => id === request.metadata.id)
    const results = []
    for (let attempt = 0; attempt < descriptor.k; attempt++) {
      const { output, verdict, requests } = await replay('complete', request, { turns: [asked, asked, captures.complete.turns[1]] })
      expect(requests).toHaveLength(2)
      expect(output).toMatchObject({ questionsBeforePreview: 2, previews: [] })
      results.push(promptfooResult(descriptor, output, verdict))
    }
    const window = summarize(results, [descriptor], build)
    expect(window.cases[0]).toMatchObject({ passK: 'fail', maxQuestions: 1, questionsBeforePreview: [2, 2, 2] })
    const merged = mergeRuns([window], { asBaseline: true, descriptors: [descriptor] })
    expect(merged.criteria.questions).toMatchObject({ mean: 2, allowedMean: 1, attemptsOverLimit: 3, status: 'fail' })
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

    // Producer: both paths that issue a list card record its ask in the eval trace (ProcessUserChatCommand.Tools.cs
    // RecordToolRound, ProcessUserChatCommand.SelectionAsk.cs), so a turn without a trace is a missing precondition of the
    // run, not a limit of the grader: the case stays open and continues in a later window.
    it('gives no evidence when the turn returns no trace, and does not answer', async () => {
      const { sent, output, verdict } = await answered([])
      expect(sent).toHaveLength(1)
      expect(output).toMatchObject({ unavailable: true, error: noTrace })
      expect(output.graderLimit).toBeUndefined()
      expect(verdict).toMatchObject({ pass: false, metadata: { unavailable: true } })
    })

    // The measured run cost holds the spend of each window, so a later window that replaces the attempt keeps the model
    // calls of its traced turns. The turn without a trace adds none, as a failed turn adds none.
    it('keeps the cost measured when a later window replaces the attempt without a trace', async () => {
      const { output, verdict } = await answered([])
      expect(output.modelCalls).toBe(0)
      const descriptor = coreDescriptors().find(({ id }) => id === logWalk.metadata.id)
      const passed = promptfooResult(descriptor, { turns: 2, questionsBeforePreview: 1, previews: [{ id: 'preview', actionKey: 'logHabits', items: [] }],
        modelCalls: 3, seconds: 2 }, { pass: true, reason: 'The saved state matches the approved changes.' })
      const first = summarize([passed, passed, promptfooResult(descriptor, output, verdict)], [descriptor], build)
      const later = summarize([passed, passed, passed], [descriptor], build)
      const merged = mergeRuns([first, later], { asBaseline: true, runCostUsd: 0.012, descriptors: [descriptor] })
      expect(merged.cases[0]).toMatchObject({ passK: 'pass', modelCalls: [3, 3, 3], supersededModelCalls: [3, 3, 0] })
      expect(merged.cost).toMatchObject({ modelCalls: 15, perModelCallUsd: 0.0008, status: 'pass' })
      expect(merged.status).toBe('pass')
    })

    it.each([
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

  // Producer: orbit-api ends a reply with a question only through a valid, accepted ask, which is a choice, question or
  // list card (AskTool.cs, ProcessUserChatCommand.Ask.cs). A question in text comes from an invalid ask, from the
  // server fallback after the model did not ask, or from the model asking in prose. So a text-only reply is never the
  // question, whatever its words: a real question in text and a false report of the work fail the same way.
  const noCard = 'The reply holds no preview and no question card.'
  it.each([
    ['owner-water-request-pt-BR-1', textReply('Quais 2 dos 6 hábitos você quer excluir?')],
    ['owner-water-request-pt-BR-1', textReply(null, [{ type: 'text', text: 'Quais 2 dos 6 hábitos você quer excluir?' }])],
    ['owner-water-request-pt-BR-1', textReply('Pronto, encontrei 6 hábitos Water - 710ml. Quais 2 você quer excluir?')],
    ['owner-water-request-pt-BR-1', textReply('Registrei que há 6 hábitos iguais. Quais 2 você quer excluir?')],
    ['owner-water-request-en-1', textReply('I created a list of your 6 Water habits below. Which 2 should I delete?')],
    ['owner-water-request-pt-BR-1', textReply('Pronto! Excluí os dois e renomeei os outros quatro. Quer mais alguma coisa?')],
    ['owner-water-request-pt-BR-1', textReply('Tudo pronto! Quer mais alguma coisa?')],
    ['owner-water-request-pt-BR-1', textReply('Feito ✅ Quer mais alguma coisa?')],
    ['owner-water-request-pt-BR-1', textReply('Já está feito! Posso ajudar com mais algo?')],
    ['owner-water-request-pt-BR-1', textReply('As alterações foram feitas! Quer mais alguma coisa?')],
    ['owner-water-request-pt-BR-1', textReply('Excluídos os 2 últimos e renomeados os outros 4. Mais alguma coisa?')],
    ['owner-water-request-pt-BR-1', textReply('Mudanças aplicadas! Precisa de mais alguma coisa?')],
    ['owner-water-request-en-1', textReply('Done! I deleted the two and renamed the other four. Anything else?')],
    ['owner-water-request-en-1', textReply('Done ✅ Anything else?')],
    ['owner-water-request-en-1', textReply('All done, anything else?')],
    ['owner-water-request-en-1', textReply('Deleted 2 and renamed the other 4. Anything else?')],
    ['owner-water-request-en-1', textReply('Your habits are updated. Anything else I can help with?')],
    ['owner-water-request-en-1', textReply('The changes are saved. Want anything else?')],
    ['owner-water-request-pt-BR-1', textReply('Entendi o pedido.')],
    ['owner-water-request-en-1', textReply(null)],
    ['ask-which-duplicate-pt-BR-1', textReply('Registrei a Caminhada. Quer mais alguma coisa?')],
    ['ask-which-duplicate-en-1', textReply('Which walk did you mean, the first or the second?')],
    ['same-title-singular-pt-BR-1', textReply('Entendi.')],
  ])('fails the text-only reply of %s (%#), and counts no question', async (id, reply) => {
    const { sent, output, verdict } = await scripted([reply, finalOf('complete', 1)], caseOf(id))
    expect(sent).toHaveLength(1)
    expect(output.questionsBeforePreview).toBe(0)
    expect(verdict).toMatchObject({ pass: false, reason: noCard })
  })
})

// Producer: AiChoiceSelection.TargetsOf takes the target_ids that the ask declares for an option, and the option's own id
// only when that id is a record id. The eval trace keeps the ask arguments, so a set option names its records there alone.
describe('a same-title choice card with set options', () => {
  const source = caseOf('owner-water-request-en-1')
  const { children } = captures.complete
  const options = [{ id: 'last-two', label: 'The last 2' }, { id: 'first-four', label: 'The first 4' }]
  const card = choiceCard('Which 2 should I delete?', options)
  const askTrace = { calls: [{ name: 'ask', resultStatus: 'Succeeded', arguments: { input: { form: 'choice', question: card.block.question,
    options: [{ ...options[0], target_ids: children.slice(4) }, { ...options[1], target_ids: children.slice(0, 4) }] } } }] }
  const asked = (traces) => scripted([textReply(null, [card]), finalOf('complete', 1)], source, { traces })

  it('answers through blockAnswer with the set option of the decision that the trace names', async () => {
    const { sent, verdict } = await asked([askTrace])
    expect(sent[1]).toEqual({ content: 'The last 2', blockAnswer: { blockId: card.block.blockId, selectedIds: ['last-two'] } })
    expect(verdict).toMatchObject({ pass: true })
  })

  it('gives no evidence when the turn returns no trace, and does not answer', async () => {
    const { sent, output, verdict } = await asked([])
    expect(sent).toHaveLength(1)
    expect(output).toMatchObject({ unavailable: true, error: noTrace, modelCalls: 0 })
    expect(output.answerFailure).toBeUndefined()
    expect(verdict).toMatchObject({ pass: false, metadata: { unavailable: true } })
  })
})

// The round 3 rule holds for a read request too: only a card is the question, and a list card asks the person to act.
describe('a read request', () => {
  const read = caseOf('read-today-en-1')
  const text = { type: 'text', text: 'You have Water and Walk due today.' }
  const listCard = { type: 'block', kind: 'pickList', block: { blockId: '99999999-0000-4000-8000-000000000002', title: 'Which did you finish?',
    action: 'log_habits', items: [{ id: 'water', label: 'Water', detail: null }, { id: 'walk', label: 'Walk', detail: null }],
    expiresAtUtc: '2026-11-14T00:00:00Z' } }

  it.each([['a list card that asks the person to log', listCard],
    ['a choice card', choiceCard('Did you finish one?', [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }])]])('fails a reply that ends in %s', async (_name, card) => {
    const { sent, output, verdict } = await scripted([textReply(text.text, [text, card])], read)
    expect(sent).toHaveLength(1)
    expect(output.asked).toBe(true)
    expect(verdict).toMatchObject({ pass: false, reason: 'The read request ended in a card that asks the person to act.' })
  })

  it('passes a reply that holds no preview and no card, whatever its text asks', async () => {
    const { verdict } = await scripted([textReply('You have Water and Walk due today. Want to log one?', [text])], read)
    expect(verdict).toMatchObject({ pass: true, reason: 'The read turn held no preview and no card.' })
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

// Producer: orbit-api 1d2a826b8. The core context sends a conversationId, so offers are on (ProactiveProposal.cs:16-20).
// AnnotateOfferField (PendingOperationChangePreviewer.Offers.cs:376-383) marks a field that the model listed in
// suggested_fields `suggested`, editable and removable under its offer key (ProactiveProposal.Key, :229-233). It marks a
// field that the model wrote without listing it `requested`, and each other field `stored`. AddChildOfferFields
// (:400-414) gives an offer of a child draft the row path `sub_habits/<n>/<field>`. ResolveValueType gives an emoji the
// value type `emoji`.
function offerRow(item, field, proposedValue, { oldValue = null, newValue = String(proposedValue), valueType = 'text', entityId = item.entityId } = {}) {
  return { entityId, entityName: item.entityName, field, oldValue, newValue, valueType, proposedValue, isEditable: true,
    provenance: 'suggested', removal: { offerKey: `preview:${entityId}:3F9A0C1B2D4E5F6A7B8C9D0E:${field}`, field, fields: [field] } }
}
// Producer: AddChanges (PendingOperationChangePreviewer.cs:897-945) gives an update one row for each field whose value the
// update changes, with the domain value in the stored format, and AnnotateOfferField marks a row that the model did not
// write `stored`.
const derivedRow = (item, field, oldValue, newValue, valueType, proposedValue) => ({ entityId: item.entityId,
  entityName: item.entityName, field, oldValue, newValue, valueType, proposedValue, isEditable: true, provenance: 'stored' })
const requestedRow = (row) => ({ ...row, provenance: 'requested', removal: undefined })
const unannotatedRow = (row) => ({ ...row, provenance: undefined, removal: undefined })

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
      preview: preview().id, fields: { due_time: '15:50', frequency_unit: 'OneTime' }, offered: {}, derived: {}, drafts: [] }])
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

  // Producer: HabitPreviewDates.Bind (HabitPreviewDates.cs:10-23) gives a one-time create without a date the date of
  // today, and PreviewAsync (PendingOperationChangePreviewer.Offers.cs:35-42) marks that row `suggested` with no removal.
  // The client shows a field as an offer only with a removal (pending-operation-card-view.ts suggestedFieldRemovals).
  describe('with the default date of the server', () => {
    function datedToday(dateRow) {
      const source = caseOf('create-tomorrow-at-three-en-1')
      const vars = { accountDate: '2026-11-13', core: { ...structuredClone(source.vars.core), baseline: [], records: {} } }
      vars.core.expected.changes[0].fields.due_date = { daysFromToday: 0 }
      const held = createPreview('Dentist', { due_date: '2026-11-13', due_time: '15:00', frequency_unit: 'OneTime' })
      const [item] = held.items
      item.fields = item.fields.map((row) => row.field === 'due_date' ? dateRow(row, item) : { ...row, provenance: 'requested' })
      const saved = savedRow({ title: 'Dentist', dueDate: '2026-11-13', dueTime: '15:00:00', frequencyUnit: null, frequencyQuantity: null })
      return outcome({ turns: 1, questionsBeforePreview: 0, previews: [held], readback: { baseline: [], held: [], after: [saved] } }, { vars })
    }

    it('passes a request for today that the default date of the server holds', () => {
      expect(datedToday((row) => ({ ...row, provenance: 'suggested' }))).toMatchObject({ pass: true,
        reason: 'The saved state matches the approved changes.' })
    })

    it('fails a request for today whose date the preview only offers', () => {
      const verdict = datedToday((row, item) => offerRow(item, 'due_date', '2026-11-13', { valueType: 'date', entityId: row.entityId }))
      expect(verdict.pass).toBe(false)
      expect(verdict.reason).toMatch(/does not create exactly the records of the request/u)
    })
  })

  // Producer: CreationFields (PendingOperationChangePreviewer.Reuse.cs:61-67) gives a create preview one `sub_habits` row
  // whose proposedValue holds the child drafts with their own children, and the approval saves each draft as a record
  // with its trimmed title (Habit.cs:314).
  describe('with offered sub-habits', () => {
    const drafts = [{ title: 'Warm up', sub_habits: [{ title: 'Breathe' }] }, { title: 'Stretch' }]
    function offeredCreate(mark = (row) => row) {
      const held = createPreview('Read', { frequency_unit: 'Week', frequency_quantity: '3' })
      const [item] = held.items
      const nullId = item.fields[0].entityId
      item.fields.push(mark(offerRow(item, 'sub_habits', drafts, { newValue: 'Warm up, Stretch', valueType: 'list', entityId: nullId })),
        offerRow(item, 'sub_habits/0/sub_habits', drafts[0].sub_habits, { newValue: 'Breathe', valueType: 'list', entityId: nullId }),
        offerRow(item, 'sub_habits/1/emoji', '🤸', { valueType: 'emoji', entityId: nullId }))
      return held
    }
    const savedChildren = (titles) => titles.map((title, index) => savedRow({ id: `99999999-9999-4999-8999-99999999990${index}`, title,
      dueDate: '2026-11-13', frequencyUnit: 'Week', frequencyQuantity: 3 }))
    function gradeSaved(held, childTitles) {
      const vars = { accountDate: '2026-11-13', core: { ...structuredClone(caseOf('create-three-per-week-en-1').vars.core), baseline: [], records: {} } }
      const parent = savedRow({ title: 'Read', dueDate: '2026-11-13', frequencyUnit: 'Week', frequencyQuantity: 3 })
      return outcome({ turns: 1, questionsBeforePreview: 0, previews: [held],
        readback: { baseline: [], held: [], after: [parent, ...savedChildren(childTitles)] } }, { vars })
    }

    it('passes when the approval saves the requested record and each offered draft once', () => {
      expect(gradeSaved(offeredCreate(), ['Warm up', 'Breathe', 'Stretch'])).toMatchObject({ pass: true,
        reason: 'The saved state matches the approved changes.' })
      expect(changeList([offeredCreate()]).changes).toEqual([{ kind: 'create', target: null, preview: preview().id,
        fields: { title: 'Read', frequency_unit: 'Week', frequency_quantity: '3' },
        offered: { sub_habits: 'Warm up, Stretch', 'sub_habits/0/sub_habits': 'Breathe', 'sub_habits/1/emoji': '🤸' }, derived: {},
        drafts: ['Warm up', 'Breathe', 'Stretch'] }])
    })

    it.each([
      ['a record that no draft holds in the place of a draft', () => gradeSaved(offeredCreate(), ['Warm up', 'Breathe', 'Extra'])],
      ['a second requested record in the place of a draft', () => gradeSaved(offeredCreate(), ['Warm up', 'Breathe', 'Read'])],
      ['one record more than the drafts', () => gradeSaved(offeredCreate(), ['Warm up', 'Breathe', 'Stretch', 'Extra'])],
      ['fewer records than the drafts', () => gradeSaved(offeredCreate(), ['Warm up', 'Stretch'])],
      ['the sub-habits that the preview marks requested', () => gradeSaved(offeredCreate(requestedRow), ['Warm up', 'Breathe', 'Stretch'])],
    ])('fails when the approval saves %s', (_name, grade) => {
      expect(grade()).toMatchObject({ pass: false, reason: 'The created records differ from the approved changes.' })
    })
  })
})

describe('an offer of the assistant in the preview', () => {
  const renameOf = (held) => held.items.find((item) => item.fields.some((field) => field.field === 'title'))
  // The recorded preview turn, with rows that the test adds to the first rename, in its item and in the flat changes.
  function offeredTurn(rows) {
    const response = structuredClone(finalOf('complete', 1))
    const [held] = response.pendingOperations
    const added = rows(renameOf(held))
    renameOf(held).fields.push(...added)
    held.changes.push(...added)
    return response
  }
  const emoji = (item) => offerRow(item, 'emoji', '💧', { valueType: 'emoji' })
  const frequency = (item) => [offerRow(item, 'frequency_unit', 'Week'), offerRow(item, 'frequency_quantity', 3, { valueType: 'number' })]
  // Producer: a repeat_reminder offer on bulk_update_habits also sets ReminderEnabled (BulkHabitToolArguments.cs:179-180),
  // and AddChanges (PendingOperationChangePreviewer.cs:930-945) shows the repeat reminder and the reminder flag that it
  // changes. The model wrote neither field, so the flag is `stored`. The Water children hold no reminder (reset.mjs).
  const repeatValue = { interval_minutes: 120, active_start: '08:00', active_end: '22:00' }
  const repeatReminder = (item, mark = (row) => row) => [
    offerRow(item, 'repeat_reminder', repeatValue, { oldValue: 'null', newValue: JSON.stringify(repeatValue) }),
    mark(derivedRow(item, 'reminder_enabled', 'false', 'true', 'boolean', true))]

  it('passes a rename that also offers an emoji, and approves the preview as shown', async () => {
    const { output, verdict, calls } = await scripted([finalOf('complete', 0), offeredTurn((item) => [emoji(item)])])
    expect(verdict).toMatchObject({ pass: true, reason: 'The saved state matches the approved changes.' })
    expect(calls.map(({ method, path }) => `${method} ${path}`)).toContain(`POST ai/pending-operations/${output.previews[0].id}/execute`)
    const target = captures.complete.children[0]
    expect(changeList(output.previews).changes.find((change) => change.target === target))
      .toMatchObject({ kind: 'update', fields: { title: 'Water - 1.18L' }, offered: { emoji: '💧' }, derived: {}, drafts: [] })
  })

  it('passes a rename that also offers a repeat reminder, with the reminder flag that the offer changes', async () => {
    const { output, verdict } = await scripted([finalOf('complete', 0), offeredTurn((item) => repeatReminder(item))])
    expect(verdict).toMatchObject({ pass: true, reason: 'The saved state matches the approved changes.' })
    expect(changeList(output.previews).changes.find((change) => change.target === captures.complete.children[0]))
      .toMatchObject({ fields: { title: 'Water - 1.18L' }, offered: { repeat_reminder: JSON.stringify(repeatValue) }, derived: { reminder_enabled: 'true' } })
  })

  it('fails a rename whose preview shows a reminder flag that the model wrote, and approves nothing', async () => {
    const { verdict, calls } = await scripted([finalOf('complete', 0), offeredTurn((item) => repeatReminder(item, requestedRow))])
    expect(verdict).toMatchObject({ pass: false, reason: 'A update of the preview changes title, reminder_enabled where the request changes title.' })
    expect(calls).toEqual([])
  })

  it.each([
    ['marks requested', requestedRow],
    ['leaves unannotated', unannotatedRow],
  ])('fails a rename that also changes an emoji the preview %s, and approves nothing', async (_name, mark) => {
    const { verdict, calls } = await scripted([finalOf('complete', 0), offeredTurn((item) => [mark(emoji(item))])])
    expect(verdict).toMatchObject({ pass: false, reason: 'A update of the preview changes title, emoji where the request changes title.' })
    expect(calls).toEqual([])
  })

  // Producer: MergeStoredSuggestion (PendingOperationChangePreviewer.Offers.cs:279-291) keeps an offered scalar only where
  // the stored value is empty. The live Water children are daily, so a frequency offer reaches none of them; the children
  // of the offline account hold no frequency, so this offer reaches one and the readback rule is measured here.
  async function savedFrequency(rows, { savedOn = captures.complete.children[0], unit = 'Week', quantity = 3 } = {}) {
    const { output, vars } = await scripted([finalOf('complete', 0), offeredTurn(rows)])
    if (!output.readback) return outcome(output, { vars })
    Object.assign(output.readback.after.find((habit) => habit.id === savedOn), { frequencyUnit: unit, frequencyQuantity: quantity })
    return outcome(output, { vars })
  }

  it('passes when the approval saves the offered frequency of the renamed record as the preview showed it', async () => {
    expect(await savedFrequency(frequency)).toMatchObject({ pass: true, reason: 'The saved state matches the approved changes.' })
  })

  it.each([
    ['a preview without the offer', () => savedFrequency(() => [])],
    ['another record than the one it is offered for', () => savedFrequency(frequency, { savedOn: captures.complete.children[1] })],
    ['the renamed record with another value than the preview showed', () => savedFrequency(frequency, { unit: 'Month', quantity: 9 })],
  ])('fails when the approval saves a frequency on %s', async (_name, grade) => {
    expect(await grade()).toMatchObject({ pass: false, reason: 'The saved records differ from the approved changes.' })
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
