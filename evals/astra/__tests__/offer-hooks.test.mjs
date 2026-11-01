import { ATTEMPTS_PER_CASE } from '../attempts.mjs'
import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { beforeAll, beforeEach } from '../hooks.mjs'
import AstraHttpProvider from '../http-provider.mjs'
import { offlineCredentials, refreshResponse } from './fixtures/credentials.mjs'
import { chatResponse, toolCall } from './fixtures/producer.mjs'
import { buildChatClientContext } from '../../../packages/shared/src/chat/client-context.ts'

const catalogFault = vi.hoisted(() => ({ missing: false }))
vi.mock('node:fs', async (original) => {
  const filesystem = await original()
  return { ...filesystem, readFileSync: (path, ...options) => catalogFault.missing && String(path).endsWith('/catalog.yaml')
    ? 'apiCommit: offline\n' : filesystem.readFileSync(path, ...options) }
})

vi.mock('../fixtures/reset.mjs', async (original) => ({ ...await original(), resetFixture: vi.fn() }))
vi.mock('../trace-policy.mjs', async (original) => {
  const catalog = await original()
  return { ...catalog, offerTools: catalog.tools.filter((tool) => !tool.writes),
    offerPostReadTools: catalog.postReadTools.filter((tool) => !tool.writes) }
})
afterEach(() => { catalogFault.missing = false; vi.unstubAllGlobals(); vi.unstubAllEnvs() })
const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'), { merge: true })

it.each(['en', 'pt-BR'])('prepares the shared client kinds for %s offer requests and preview setup', async (locale) => {
  offlineCredentials()
  const scenario = structuredClone(corpus.find((entry) => entry.metadata.id === `offers-ordinary-reading-${locale}`))
  vi.stubGlobal('fetch', async (url) => {
    const path = new URL(url).pathname
    if (path === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
    if (path === '/api/profile/export') return Response.json({ habits: [], goals: [], tags: [], checklistTemplates: [] })
    return refreshResponse()
  })
  const { test } = await beforeEach({ test: scenario })
  expect(test.vars.preconditionFailure).toBeUndefined()
  expect(test.vars.clientContext.partKinds).toEqual(buildChatClientContext({ platform: 'web', locale }).partKinds)
  expect(JSON.parse(test.vars.clientContextJson).partKinds).toEqual(test.vars.clientContext.partKinds)
  const setup = structuredClone(corpus.find((entry) => entry.metadata.id === `offers-preview-rejection-${locale}`))
  const { configureOffers } = await import('../offer-context.mjs')
  configureOffers(setup)
  expect(setup.vars.setup.clientContext.partKinds).toEqual(test.vars.clientContext.partKinds)
})

it('keeps all supplied cases, resolves their YAML contexts and configures the configured attempts', () => {
  const cases = corpus.filter((entry) => entry.metadata.family.startsWith('offers-'))
  expect(cases).toHaveLength(60)
  expect(new Set(cases.map((entry) => entry.metadata.family)).size).toBe(29)
  expect(cases.every((entry) => entry.vars.clientContext.locale === entry.metadata.locale)).toBe(true)
  expect(cases.every((entry) => !Object.hasOwn(entry.vars.clientContext, '<<'))).toBe(true)
  for (const entry of cases) expect(cases.some((other) => other.metadata.family === entry.metadata.family && other.metadata.locale !== entry.metadata.locale)).toBe(true)
  const config = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))
  expect(config.evaluateOptions.repeat).toBe(ATTEMPTS_PER_CASE)
  expect(config.defaultTest.assert.some((assertion) => assertion.metric === 'proactiveOffers')).toBe(true)
})

it.each(['valid', 'wrong-trace', 'wrong-offer', 'dismiss-failed', 'fixture-failed'])(
  'drives fresh conversation setup, issued-key dismissal and preconditions: %s', async (fault) => {
    offlineCredentials()
    const source = corpus.find((entry) => entry.metadata.id === 'offers-dismissal-en')
    const seed = source.vars.clientContext.conversationId
    const conversations = []
    const requestIds = []
    let dismissed = 0
    vi.stubGlobal('fetch', async (url, options) => {
      const path = new URL(url).pathname
      if (path === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
      if (path === '/api/auth/refresh') return refreshResponse()
      if (path === '/api/profile/export') return Response.json(fault === 'fixture-failed' ? {}
        : { habits: [], goals: [], tags: [], checklistTemplates: [] })
      if (path === '/api/chat/offers/dismiss') {
        const body = JSON.parse(options.body)
        expect(body.conversationId).toBe(conversations.at(-1))
        expect(body.offerKeys).toHaveLength(1)
        expect(body.offerKeys[0]).toMatch(/^smallStep:account:/u)
        dismissed++
        return new Response(null, { status: fault === 'dismiss-failed' ? 400 : 204 })
      }
      expect(path).toBe('/api/chat')
      const request = new Request(url, options)
      const form = await request.formData()
      const client = JSON.parse(form.get('clientContext'))
      const id = request.headers.get('x-orbit-request-id')
      const today = new Date().toISOString().slice(0, 10)
      conversations.push(client.conversationId)
      requestIds.push(id)
      expect(client.conversationId).not.toBe(seed)
      expect(id).not.toBe(client.conversationId)
      const action = { offerKey: `smallStep:account:${today}`, kind: 'continueChat', label: 'Choose one small step',
        surface: null, prompt: 'Help me choose one small step I can take today.', entityId: null, date: today }
      if (fault === 'wrong-offer') action.kind = 'execute'
      return Response.json({ ...chatResponse(id, [toolCall('get_daily_summary', {}, 'Succeeded', 'read', client)]),
        aiMessage: null, parts: [{ type: 'block', kind: 'daySummary', block: { date: today, dateTo: null,
          due: 0, done: 0, completionRate: null, overdueCount: 0, currentStreak: 0, surfaceId: 'today', rows: [], totalRows: 0,
          read: { queryId: '33333333-3333-4333-8333-333333333333', queryFamily: 'get_daily_summary', scope: {},
            revision: 'revision', completeness: 'complete', refreshToken: 'refresh', nextCursor: null, totalCount: 0,
            recovery: null, nextAction: action },
        } }] }, { headers: { 'x-orbit-request-id': fault === 'wrong-trace' ? 'wrong' : id } })
    })
    for (let attempt = 0; attempt < (fault === 'valid' ? ATTEMPTS_PER_CASE + 1 : 1); attempt++) {
      const { test } = await beforeEach({ test: structuredClone(source) })
      if (fault === 'valid') {
        expect(test.vars.preconditionFailure).toBeUndefined()
        expect(test.vars.clientContext.conversationId).toBe(conversations.at(-1))
        expect(test.vars.setup.clientContext.conversationId).toBe(conversations.at(-1))
        expect(test.vars.evalRequestId).not.toBe(requestIds.at(-1))
        expect(test.vars.issuedOffer.action.offerKey).toMatch(/^smallStep:account:/u)
      } else {
        expect(test.vars.preconditionFailure).toBeTruthy()
        const response = await new AstraHttpProvider({ config: {} }).callApi(test.vars.input, { vars: test.vars })
        expect(response.metadata.astraPreconditionFailure).toBe(true)
      }
    }
    if (fault === 'valid') {
      expect(new Set(conversations).size).toBe(ATTEMPTS_PER_CASE + 1)
      expect(new Set(requestIds).size).toBe(ATTEMPTS_PER_CASE + 1)
      expect(dismissed).toBe(ATTEMPTS_PER_CASE + 1)
    } else if (fault !== 'dismiss-failed') expect(dismissed).toBe(0)
  },
)

it('stops an offer run before HTTP when the committed catalog lacks producer variants', async () => {
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_GRADER', 'offline')
  const fetch = vi.fn()
  catalogFault.missing = true
  vi.stubGlobal('fetch', fetch)
  await expect(beforeAll({ suite: { tests: [structuredClone(corpus.find((entry) => entry.metadata.id === 'offers-empty-en'))] } }))
    .rejects.toThrow('Regenerate the proactive tool catalogs')
  expect(fetch).not.toHaveBeenCalled()
})
