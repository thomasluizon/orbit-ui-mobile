import { evalSnapshot } from './fixtures/eval-snapshot.mjs'
import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import AstraHttpProvider from '../http-provider.mjs'
import { proactiveOffers } from '../proactive-offers.mjs'
import { composition } from '../composition.mjs'
import { configureOffers } from '../offer-context.mjs'
import { chatResponse, habitAccountRead, habitBlock, preview } from './fixtures/producer.mjs'
import { offlineCredentials, refreshResponse } from './fixtures/credentials.mjs'
import { sentTurn, streamedTurn } from './fixtures/offer-stream.mjs'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
const scenarios = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'), { merge: true })
const today = '2031-06-10'
const habitId = '22222222-2222-4222-8222-222222222222'
const provider = () => new AstraHttpProvider({ config: {} })

// Producer: orbit-api ChatStreamEvent answers a refused turn with its HTTP status and its typed error before any stream.
it('stops an unexpected 400 of the stream before any readback request and gives no offer readback', async () => {
  const scenario = structuredClone(scenarios.find((entry) => entry.metadata.id === 'offers-ordinary-reading-en'))
  configureOffers(scenario)
  const vars = { ...scenario.vars, evalRequestId: 'independent-request', accountDate: today }
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://api.useorbit.org')
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline')
  const requests = []
  vi.stubGlobal('fetch', async (url) => {
    requests.push(new URL(url).pathname)
    return Response.json({ error: 'Unable to compose an answer.', errorCode: 'AI_EMPTY_RESPONSE' }, {
      status: 400, headers: { 'x-orbit-request-id': vars.evalRequestId },
    })
  })
  const response = await provider().callApi(vars.input, { vars })
  expect(response.error).toBe('The chat turn failed with HTTP 400 (AI_EMPTY_RESPONSE): Unable to compose an answer.')
  expect(response.output).not.toHaveProperty('offerReadback')
  expect(requests).toEqual(['/api/chat/stream'])
})

// Producer: HandleCrisisTurnAsync, CrisisSupportGuard and the enclosing opt-in eval trace collector.
const crisisText = {
  en: "I'm sorry you're going through this. You deserve support right now.\n\nCall or text 988 (Suicide and Crisis Lifeline)",
  'pt-BR': 'Sinto muito que você esteja passando por isso. Você merece apoio neste momento.\n\nLigue 188 para o CVV (Centro de Valorização da Vida)',
}

async function crisisAttempt(locale, fault = 'valid') {
  const scenario = structuredClone(scenarios.find((entry) => entry.metadata.id === `offers-crisis-${locale}`))
  configureOffers(scenario)
  const state = { habits: [], goals: [], tags: [], checklistTemplates: [] }
  const vars = { ...scenario.vars, evalRequestId: 'independent-request', accountDate: today,
    offerRequireReadback: true, offerBaseline: state, fixtureEvidence: state }
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://api.useorbit.org')
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline')
  const requests = []
  vi.stubGlobal('fetch', async (url, options) => {
    const path = new URL(url).pathname
    requests.push({ path, method: options.method })
    if (path === '/api/eval/snapshot') return Response.json(evalSnapshot(fault === 'changed-state' ? { ...state, tags: [{ id: habitId }] } : state))
    expect(path).toBe('/api/chat/stream')
    const sent = await sentTurn(url, options)
    expect(new Request(url, options).headers.get('x-orbit-eval-trace')).toBe('1')
    expect(sent.clientContext.supportsParts).toBe(true)
    const response = { ...chatResponse(sent.requestId), aiMessage: crisisText[locale] }
    if (fault === 'missing-parts-ordinary') vars.composition = { mode: 'text' }
    if (fault === 'text-parts') response.parts = [{ type: 'text', text: crisisText[locale] }]
    if (fault.startsWith('legacy-card-')) {
      response.habitList = structuredClone(habitBlock.block)
      if (fault === 'legacy-card-empty') response.parts = []
    }
    if (fault === 'pending') response.pendingOperations = [preview()]
    if (fault === 'offer') response.pendingOperations = [{ ...preview(), nextAction: { label: 'Plan your day' } }]
    if (fault === 'follow-up') response.followUps = ['Plan your day?']
    if (fault === 'surface') response.relatedSurfaces = ['subscriptions']
    if (fault === 'operation') response.operations = [{ operationId: 'write', sourceName: 'log_habit', riskClass: 'Low', confirmationRequirement: 'None', status: 'Failed' }]
    return streamedTurn(response, sent.requestId)
  })
  return { response: await provider().callApi(vars.input, { vars }), vars, requests }
}

it.each(['en', 'pt-BR'])('accepts the producer plain-text crisis response in %s through the HTTP and readback gates', async (locale) => {
  const { response, vars, requests } = await crisisAttempt(locale)
  expect(response.error).toBeUndefined()
  expect(response.output.answer).toBe(crisisText[locale])
  expect(response.output.composition).not.toHaveProperty('parts')
  const verdict = composition(response.output, { vars })
  expect(verdict, verdict.reason).toMatchObject({ pass: true })
  expect(response.output.offerReadback).toMatchObject({ pass: true })
  expect(proactiveOffers(response.output, { vars })).toMatchObject({ pass: true })
  expect(requests).toEqual([{ path: '/api/chat/stream', method: 'POST' }, { path: '/api/eval/snapshot', method: 'GET' }])
})

it.each(['absent', 'empty'])('rejects a client-renderable legacy card in a crisis HTTP response with %s parts', async (parts) => {
  const { response, vars } = await crisisAttempt('en', `legacy-card-${parts}`)
  expect(response.error).toBeUndefined()
  expect.soft(composition(response.output, { vars }).pass).toBe(false)
  expect.soft(proactiveOffers(response.output, { vars }).pass).toBe(false)
  expect.soft(response.output.offerReadback.pass).toBe(false)
  expect(response.output.composition.habitList).toEqual(habitBlock.block)
})

it.each(['missing-parts-ordinary', 'text-parts', 'pending', 'offer', 'follow-up', 'surface', 'operation', 'changed-state'])(
  'rejects a crisis response with %s evidence', async (fault) => {
    const { response, vars } = await crisisAttempt('en', fault)
    expect(response.output.offerReadback, response.error).toMatchObject({ pass: false })
    expect(proactiveOffers(response.output, { vars }).pass).toBe(false)
  },
)

it.each(['valid', 'missing-trace', 'write', 'selector-timeout', 'invalid-candidate', 'invalid-id'])(
  'drives the client path and the typed offer gate with an intercepted %s response', async (fault) => {
    const clientContext = { platform: 'web', locale: 'en', supportsParts: true, supportsProactiveOffers: true,
      supportsHabitListCard: true, supportsSkippedHabitRows: true, partKinds: ['habitList'], conversationId: habitId }
    const state = { habits: [{ id: habitId, title: 'Water', logs: [], checklistItems: [], isBadHabit: false }],
      goals: [], tags: [], checklistTemplates: [] }
    const vars = { input: 'List today’s scheduled habits.', credentialKey: 'ORBIT_EVAL_TOKEN',
      evalRequestId: 'independent-request', accountDate: today, clientContext, offerFamily: 'due-log',
      offerRequireReadback: true, offerBaseline: state, fixtureEvidence: state,
      composition: { mode: 'data' }, outcome: { read: true } }
    if (['valid', 'write', 'missing-trace'].includes(fault)) vars.offerFamily = 'resolved'
    vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://api.useorbit.org')
    vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline')
    const requests = []
    vi.stubGlobal('fetch', async (url, options) => {
      const path = new URL(url).pathname
      requests.push({ path, method: options.method })
      if (path === `/api/habits/${habitId}`) return Response.json(state.habits[0])
      if (path === '/api/eval/snapshot') return Response.json(evalSnapshot(fault === 'write' ? { ...state, goals: [{ id: 'unrequested' }] } : state))
      expect(path).toBe('/api/chat/stream')
      expect(new Request(url, options).headers.get('x-orbit-eval-trace')).toBe('1')
      const sent = await sentTurn(url, options)
      expect(sent.requestId).toBe(vars.evalRequestId)
      expect(sent.clientContext.conversationId).toBe(habitId)
      const response = { ...chatResponse(sent.requestId, [habitAccountRead(false, 'read', clientContext)]), aiMessage: null,
        parts: [{ ...structuredClone(habitBlock), block: { ...habitBlock.block,
          items: [{ ...habitBlock.block.items[0], id: habitId }], read: {
            queryId: habitId, queryFamily: 'query_habits', scope: {}, revision: 'revision', completeness: 'complete',
            refreshToken: 'refresh', nextCursor: null, totalCount: 1, recovery: null,
            ...(fault === 'invalid-id' ? { nextAction: { offerKey: `log:${habitId}:${today}`, kind: 'preparePreview',
              label: 'Log', prompt: 'Log Water', surface: null, entityId: 'invalid', date: today } } : {}),
          } } }] }
      if (fault === 'missing-trace') delete response.evalTrace
      return streamedTurn(response, sent.requestId)
    })
    const response = await provider().callApi(vars.input, { vars })
    expect(response.error).toBeUndefined()
    expect(proactiveOffers(response.output, { vars }).pass).toBe(['valid', 'missing-trace'].includes(fault))
    expect(response.output.offerReadback.pass).toBe(['valid', 'missing-trace'].includes(fault))
    if (['selector-timeout', 'invalid-candidate'].includes(fault)) expect(response.output.offerReadback.reason).toContain('Missing eligible family action')
    expect(requests.filter(({ method }) => method === 'POST')).toEqual([{ path: '/api/chat/stream', method: 'POST' }])
  },
)

it.each(['valid', 'invalid-kind', 'invalid-date', 'invalid-target'])(
  'validates continuation offers on the client path and keeps the conversation: %s', async (fault) => {
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline')
  const clientContext = { platform: 'web', locale: 'en', supportsParts: true, supportsProactiveOffers: true,
    supportsHabitListCard: true, supportsSkippedHabitRows: true, partKinds: ['habitList'], conversationId: habitId }
  const state = { habits: [], goals: [], tags: [], checklistTemplates: [] }
  const vars = { input: 'Do not offer that small step again. Show my day.', credentialKey: 'ORBIT_EVAL_TOKEN',
    evalRequestId: 'independent-request', accountDate: today, clientContext,
    offerFamily: 'dismissal', offerRequireReadback: true, offerBaseline: structuredClone(state), fixtureEvidence: structuredClone(state),
    setup: { input: 'Show my day.' }, issuedOffer: { action: { offerKey: `smallStep:account:${today}` } },
    composition: { mode: 'data' }, outcome: { read: true } }
  const turns = []
  vi.stubGlobal('fetch', async (url, options) => {
    const path = new URL(url).pathname
    if (path === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
    if (path === '/api/auth/refresh') return refreshResponse()
    if (path === '/api/eval/snapshot') return Response.json(evalSnapshot(state))
    if (path === `/api/habits/${habitId}`) return Response.json(state.habits[0])
    if (path === '/api/habits') {
      state.habits.push({ id: habitId, title: 'Breathe', isBadHabit: false, logs: [], checklistItems: [] })
      return Response.json({ id: habitId }, { status: 201 })
    }
    expect(path).toBe('/api/chat/stream')
    const sent = await sentTurn(url, options)
    const index = turns.push(sent) - 1
    const response = chatResponse(sent.requestId)
    if (index > 0 && index < 12) {
      response.aiMessage = 'Hello.'
      response.parts = [{ type: 'text', text: 'Hello.' }]
    } else {
      response.aiMessage = null
      response.evalTrace.toolCalls = [habitAccountRead(false, 'read', clientContext)]
      response.parts = [{ ...habitBlock, block: { scope: 'today', items: state.habits.map((habit) => ({
        id: habit.id, title: habit.title, emoji: null, depth: 0, isBadHabit: false, status: 'today',
      })), totalCount: state.habits.length, read: { queryId: habitId, queryFamily: 'query_habits', scope: {},
        revision: 'revision', completeness: 'complete', refreshToken: 'refresh', nextCursor: null, totalCount: state.habits.length,
        recovery: null, ...(index === 14 ? { nextAction: { offerKey: `log:${habitId}:${today}`, kind: 'preparePreview',
          label: 'Log this habit', prompt: 'Log Breathe today.', surface: null, entityId: habitId, date: today } } : {}),
      } } }]
      if (index === 14) {
        const action = response.parts[0].block.read.nextAction
        if (fault === 'invalid-kind') action.kind = 'continueChat'
        if (fault === 'invalid-date') action.date = '2031-06-09'
        if (fault === 'invalid-target') action.entityId = '33333333-3333-4333-8333-333333333333'
        expect(action.offerKey).toBe(`log:${habitId}:${today}`)
      }
    }
    return streamedTurn(response, sent.requestId)
  })
  const response = await provider().callApi(vars.input, { vars })
  expect(response.output.offerReadback.pass, response.output.offerReadback.reason).toBe(fault === 'valid')
  expect(proactiveOffers(response.output, { vars }).pass).toBe(fault === 'valid')
  if (fault !== 'valid') expect(response.output.offerReadback.reason).toContain('Malformed, stale or ungrounded next action')
  expect(turns).toHaveLength(15)
  // The first continuation sends the history that the shipped client holds: the request and the answer of the first turn.
  expect(turns[1].history.map(({ role }) => role)).toEqual(['user', 'assistant'])
  expect(turns[1].history[0].content).toBe(vars.input)
  expect(turns[1].history[1].content).toContain('habitList')
  // The reload sends the same conversation with no history, and the other device sends the mobile platform.
  expect(turns[12]).toMatchObject({ history: [], clientContext: { platform: 'web', conversationId: habitId } })
  expect(turns[13]).toMatchObject({ history: [], clientContext: { platform: 'mobile', conversationId: habitId } })
})
