import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import AstraHttpProvider from '../http-provider.mjs'
import { proactiveOffers } from '../proactive-offers.mjs'
import { chatResponse, habitAccountRead, habitBlock } from './fixtures/producer.mjs'
import { offlineCredentials, refreshResponse } from './fixtures/credentials.mjs'

// ProactiveProposal.Schema only changes supported writes; read declarations are unchanged.
vi.mock('../trace-policy.mjs', async (original) => {
  const catalog = await original()
  return { ...catalog, offerTools: catalog.tools.filter((tool) => !tool.writes),
    offerPostReadTools: catalog.postReadTools.filter((tool) => !tool.writes) }
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
const configuration = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))
const today = '2031-06-10'
const habitId = '22222222-2222-4222-8222-222222222222'

it.each(['valid', 'wrong-request', 'missing-trace', 'write', 'selector-timeout', 'invalid-candidate', 'invalid-id'])(
  'drives the HTTP adapter and typed offer gate with an intercepted %s response', async (fault) => {
    const clientContext = { platform: 'web', locale: 'en', supportsParts: true, supportsProactiveOffers: true,
      supportsHabitListCard: true, supportsSkippedHabitRows: true, partKinds: ['habitList'], conversationId: habitId }
    const state = { habits: [{ id: habitId, title: 'Water', logs: [], checklistItems: [], isBadHabit: false }],
      goals: [], tags: [], checklistTemplates: [] }
    const vars = { input: 'List today’s scheduled habits.', credentialKey: 'ORBIT_EVAL_TOKEN',
      evalRequestId: 'independent-request', accountDate: today, clientContext,
      clientContextJson: JSON.stringify(clientContext), historyJson: '[]', offerFamily: 'due-log',
      offerRequireReadback: true, offerBaseline: state, fixtureEvidence: state,
      composition: { mode: 'data' }, expectations: { required: [{ name: 'query_habits' }] } }
    if (['valid', 'write'].includes(fault)) vars.offerFamily = 'resolved'
    vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://api.useorbit.org')
    vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline')
    const requests = []
    vi.stubGlobal('fetch', async (url, options) => {
      const path = new URL(url).pathname
      requests.push({ path, method: options.method })
      if (path === `/api/habits/${habitId}`) return Response.json(state.habits[0])
      if (path === '/api/profile/export') return Response.json(fault === 'write' ? { ...state, goals: [{ id: 'unrequested' }] } : state)
      expect(path).toBe('/api/chat')
      const request = new Request(url, options)
      expect(request.headers.get('x-orbit-eval-trace')).toBe('1')
      const requestId = request.headers.get('x-orbit-request-id')
      expect(requestId).toBe(vars.evalRequestId)
      const form = await request.formData()
      expect(JSON.parse(form.get('clientContext')).conversationId).toBe(habitId)
      const response = { ...chatResponse(requestId, [habitAccountRead(false, 'read', clientContext)]), aiMessage: null,
        parts: [{ ...structuredClone(habitBlock), block: { ...habitBlock.block,
          items: [{ ...habitBlock.block.items[0], id: habitId }], read: {
            queryId: habitId, queryFamily: 'query_habits', scope: {}, revision: 'revision', completeness: 'complete',
            refreshToken: 'refresh', nextCursor: null, totalCount: 1, recovery: null,
            ...(fault === 'invalid-id' ? { nextAction: { offerKey: `log:${habitId}:${today}`, kind: 'preparePreview',
              label: 'Log', prompt: 'Log Water', surface: null, entityId: 'invalid', date: today } } : {}),
          } } }] }
      if (fault === 'missing-trace') delete response.evalTrace
      return Response.json(response, { headers: { 'x-orbit-request-id': fault === 'wrong-request' ? 'wrong' : requestId } })
    })
    const provider = new AstraHttpProvider({ config: { ...configuration.providers[0].config,
      url: 'https://api.useorbit.org/api/chat', transformResponse: `file://${fileURLToPath(new URL('../response.mjs', import.meta.url))}` } })
    const response = await provider.callApi(vars.input, { vars })
    expect(response.error).toBeUndefined()
    expect(proactiveOffers(response.output, { vars }).pass).toBe(fault === 'valid')
    expect(response.output.offerReadback.pass).toBe(fault === 'valid')
    if (['selector-timeout', 'invalid-candidate'].includes(fault)) expect(response.output.offerReadback.reason).toContain('Missing eligible family action')
    if (fault === 'wrong-request') expect(response.output.offerReadback.reason).toContain('another request')
    expect(requests.filter(({ method }) => method === 'POST')).toEqual([{ path: '/api/chat', method: 'POST' }])
  },
)

it('keeps the rendered main answer in the history sent to subsequent lifecycle turns', async () => {
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline')
  const clientContext = { platform: 'web', locale: 'en', supportsParts: true, supportsProactiveOffers: true,
    supportsHabitListCard: true, supportsSkippedHabitRows: true, partKinds: ['habitList'], conversationId: habitId }
  const state = { habits: [], goals: [], tags: [], checklistTemplates: [] }
  const vars = { input: 'Do not offer that small step again. Show my day.', credentialKey: 'ORBIT_EVAL_TOKEN',
    evalRequestId: 'independent-request', accountDate: today, clientContext, clientContextJson: JSON.stringify(clientContext),
    historyJson: '[]', offerFamily: 'dismissal', offerRequireReadback: true, offerBaseline: structuredClone(state), fixtureEvidence: state,
    setup: { input: 'Show my day.' }, issuedOffer: { action: { offerKey: `smallStep:account:${today}` } },
    composition: { mode: 'data' }, expectations: { required: [{ name: 'query_habits' }] } }
  let chats = 0
  let firstHistory
  vi.stubGlobal('fetch', async (url, options) => {
    const path = new URL(url).pathname
    if (path === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
    if (path === '/api/auth/refresh') return refreshResponse()
    if (path === '/api/profile/export') return Response.json(state)
    if (path === `/api/habits/${habitId}`) return Response.json(state.habits[0])
    if (path === '/api/habits') {
      state.habits.push({ id: habitId, title: 'Breathe', isBadHabit: false, logs: [], checklistItems: [] })
      return Response.json({ id: habitId }, { status: 201 })
    }
    expect(path).toBe('/api/chat')
    const request = new Request(url, options)
    const form = await request.formData()
    const requestId = request.headers.get('x-orbit-request-id')
    const index = chats++
    if (index === 1) firstHistory = JSON.parse(form.get('history'))
    const response = chatResponse(requestId)
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
    }
    return Response.json(response, { headers: { 'x-orbit-request-id': requestId } })
  })
  const provider = new AstraHttpProvider({ config: { ...configuration.providers[0].config,
    url: 'https://orbit-api-staging-uqu2.onrender.com/api/chat', transformResponse: `file://${fileURLToPath(new URL('../response.mjs', import.meta.url))}` } })
  const response = await provider.callApi(vars.input, { vars })
  expect(response.output.offerReadback.pass, response.output.offerReadback.reason).toBe(true)
  expect(chats).toBe(15)
  expect(firstHistory.at(-1)).toEqual({ role: 'assistant', content: response.output.answer })
})
