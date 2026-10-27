import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { beforeAll } from '../hooks.mjs'
import { credentialKeys } from '../credentials.mjs'
import { offlineCredentials } from './fixtures/credentials.mjs'

const { apiCommit } = parse(readFileSync(new URL('../catalog.yaml', import.meta.url), 'utf8'))

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const suiteFor = (keys) => ({ suite: { tests: keys.map((credentialKey) => ({
  metadata: { id: credentialKey }, vars: { credentialKey },
})) } })

function preflightResponse(flag = { enabled: true, planRequirement: null }) {
  return Response.json({
    limits: { MaxHabitDepth: '5', MaxTagsPerHabit: '5', MaxReferrals: '10', ReferralRewardDays: '10' },
    features: { astra_eval_unmetered: flag },
    settings: { syncIntervalSeconds: 300, syncMaxBatchSize: 100 }, minVersion: '0.0.0',
  })
}

function requestsFor(configForAccount = (index) => preflightResponse({ enabled: index === 0, planRequirement: null }), servedCommit = apiCommit) {
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_GRADER', 'offline')
  let accountIndex = -1
  const requests = vi.fn(async (url, options) => {
    const path = new URL(url).pathname
    if (path === '/health') return Response.json({ status: 'Healthy', commit: servedCommit, checks: [] })
    if (path === '/api/auth/refresh') {
      accountIndex++
      return Response.json({ token: `offline-token-${accountIndex}`, refreshToken: 'offline-refresh' })
    }
    expect(path).toBe('/api/config')
    expect(options.method).toBe('GET')
    expect(options.headers.Authorization).toBe(`Bearer offline-token-${accountIndex}`)
    expect(options.headers['api-version']).toBe('2.0')
    expect(options.redirect).toBe('error')
    return configForAccount(accountIndex)
  })
  vi.stubGlobal('fetch', requests)
  return requests
}

it.each([null, 'a'.repeat(40)])('rejects catalog mismatch before refreshing or checking selected accounts: %s', async (servedCommit) => {
  const requests = requestsFor(undefined, servedCommit)
  await expect(beforeAll(suiteFor(credentialKeys))).rejects.toThrow(`differs from API ${servedCommit}`)
  expect(requests.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/health'])
})

it.each(credentialKeys)('refuses the whole run before a case when %s violates its allowance policy', async (key) => {
  const index = credentialKeys.indexOf(key)
  const expected = key === 'ORBIT_EVAL_TOKEN'
  const requests = requestsFor((accountIndex) => preflightResponse({ enabled: accountIndex === index ? !expected : accountIndex === 0, planRequirement: null }))
  await expect(Promise.resolve().then(() => beforeAll(suiteFor(credentialKeys))))
    .rejects.toThrow(`turn ${expected ? 'on' : 'off'} astra_eval_unmetered for ${key} through /flag`)
  expect(requests.mock.calls.filter(([url]) => new URL(url).pathname === '/api/config')).toHaveLength(index + 1)
})

it('starts with the main account unmetered and both refusal accounts metered, checking each once', async () => {
  const requests = requestsFor()
  await beforeAll(suiteFor([...credentialKeys, credentialKeys[0]]))
  expect(requests.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
    '/health', ...credentialKeys.flatMap(() => ['/api/auth/refresh', '/api/config']),
  ])
})

it.each(credentialKeys.slice(1))('starts a metered-only selection for %s', async (key) => {
  const requests = requestsFor(() => preflightResponse({ enabled: false, planRequirement: null }))
  await beforeAll(suiteFor([key, key]))
  expect(requests.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
    '/health', '/api/auth/refresh', '/api/config',
  ])
})

it.each([
  ['missing flag', () => Response.json({ features: {} })],
  ['null flag', () => preflightResponse(null)],
  ['missing features', () => Response.json({})],
  ['string enabled', () => preflightResponse({ enabled: 'true', planRequirement: null })],
  ['rejected config', () => Response.json({ error: 'PRIVATE_SERVER_BODY' }, { status: 403 })],
  ['malformed config', () => new Response('PRIVATE_SERVER_BODY')],
  ['transport failure', () => { throw new Error('PRIVATE_TRANSPORT') }],
])('stops without exposing response contents for %s', async (_name, response) => {
  requestsFor(response)
  const pending = Promise.resolve().then(() => beforeAll(suiteFor([credentialKeys[1]])))
  await expect(pending).rejects.toThrow(`turn off astra_eval_unmetered for ${credentialKeys[1]} through /flag`)
  await expect(pending).rejects.not.toThrow('PRIVATE')
})
