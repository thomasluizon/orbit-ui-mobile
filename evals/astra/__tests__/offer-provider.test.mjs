import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import AstraHttpProvider from '../http-provider.mjs'
import { proactiveOffers } from '../proactive-offers.mjs'
import { chatResponse, habitAccountRead, habitBlock } from './fixtures/producer.mjs'

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
