import { afterEach, expect, it, vi } from 'vitest'
import { beforeAll } from '../hooks.mjs'
import { credentialKeys } from '../credentials.mjs'
import { offlineCredentials } from './fixtures/credentials.mjs'

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

function requestsFor(configForAccount = () => preflightResponse()) {
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_GRADER', 'offline')
  let accountIndex = -1
  const requests = vi.fn(async (url, options) => {
    const path = new URL(url).pathname
    if (path === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
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

it.each(credentialKeys)('refuses the whole run before a case when %s lacks unmetered access', async (key) => {
  const index = credentialKeys.indexOf(key)
  const requests = requestsFor((accountIndex) => preflightResponse({ enabled: accountIndex !== index, planRequirement: null }))
  await expect(Promise.resolve().then(() => beforeAll(suiteFor(credentialKeys))))
    .rejects.toThrow(`turn on astra_eval_unmetered for ${key} through /flag`)
  expect(requests.mock.calls.filter(([url]) => new URL(url).pathname === '/api/config')).toHaveLength(index + 1)
})

it('starts only after all selected accounts resolve the flag, checking each account once', async () => {
  const requests = requestsFor()
  await beforeAll(suiteFor([...credentialKeys, credentialKeys[0]]))
  expect(requests.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
    '/health', ...credentialKeys.flatMap(() => ['/api/auth/refresh', '/api/config']),
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
  await expect(pending).rejects.toThrow(`turn on astra_eval_unmetered for ${credentialKeys[1]} through /flag`)
  await expect(pending).rejects.not.toThrow('PRIVATE')
})
