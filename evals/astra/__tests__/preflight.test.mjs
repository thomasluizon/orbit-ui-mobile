import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { beforeAll } from '../hooks.mjs'
import { beforeAll as beforeCoreRun } from '../core/hooks.mjs'
import { runPathOf } from '../trace-policy.mjs'
import { credentialKeys } from '../credentials.mjs'
import { offlineCredentials } from './fixtures/credentials.mjs'

const { apiCommit } = parse(readFileSync(new URL('../catalog.yaml', import.meta.url), 'utf8'))

vi.mock('../fixtures/reset.mjs', async (original) => ({ ...await original(), resetFixture: vi.fn() }))

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const suiteFor = (keys) => ({ suite: { tests: keys.map((credentialKey) => ({
  metadata: { id: credentialKey }, vars: { credentialKey },
})) } })

// Producer: orbit-api ConfigController.GetConfig returns each flag of the account.
function preflightResponse(flag = { enabled: true, planRequirement: null }, changePlan = { enabled: false, planRequirement: null }) {
  return Response.json({
    limits: { MaxHabitDepth: '5', MaxTagsPerHabit: '5', MaxReferrals: '10', ReferralRewardDays: '10' },
    features: { astra_eval_unmetered: flag, astra_eval_trace: { enabled: true, planRequirement: null }, ai_change_plan: changePlan },
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

// A flag that does not agree with its account keeps the /flag procedure of that flag. A config read that gives no flags
// names the read, because no flag change repairs it.
const policyUnavailable = `turn off astra_eval_unmetered for ${credentialKeys[1]} through /flag on staging, then verify /api/config and retry. Eval allowance policy is unavailable.`
const flagsUnavailable = (cause) => `the flags of ${credentialKeys[1]} are unavailable; verify /api/config on staging and retry. ${cause}`
it.each([
  ['missing flag', () => Response.json({ features: {} }), policyUnavailable],
  ['null flag', () => preflightResponse(null), policyUnavailable],
  ['missing features', () => Response.json({}), policyUnavailable],
  ['string enabled', () => preflightResponse({ enabled: 'true', planRequirement: null }), policyUnavailable],
  ['rejected config', () => Response.json({ error: 'PRIVATE_SERVER_BODY' }, { status: 403 }), flagsUnavailable('Fixture API GET config failed: HTTP 403 (errorCode: none).')],
  ['malformed config', () => new Response('PRIVATE_SERVER_BODY'), flagsUnavailable('Fixture API GET config failed: non-JSON body (HTTP 200).')],
  ['transport failure', () => { throw new Error('PRIVATE_TRANSPORT') }, flagsUnavailable('Fixture API GET config failed: network.')],
])('stops with its cause and without exposing response contents for %s', async (_name, response, failure) => {
  requestsFor(response)
  const pending = Promise.resolve().then(() => beforeAll(suiteFor([credentialKeys[1]])))
  await expect(pending).rejects.toThrow(`Eval preflight failed: ${failure}`)
  await expect(pending).rejects.not.toThrow('PRIVATE')
})

const unknownPath = 'ORBIT_EVAL_ASTRA_PATH is "flag"; name block-first, the default, for the path without ai_change_plan, or change-plan for the path of that flag.'
const coreSuite = { suite: { tests: [{ metadata: { id: 'core', mustPass: true }, vars: { credentialKey: credentialKeys[0], rubric: '' } }] } }
const pathsOf = (requests) => requests.mock.calls.map(([url]) => new URL(url).pathname)

it('reads the path of a run from ORBIT_EVAL_ASTRA_PATH, and the block-first path when the run names none', () => {
  expect(runPathOf({})).toBe('block-first')
  expect(runPathOf({ ORBIT_EVAL_ASTRA_PATH: 'block-first' })).toBe('block-first')
  expect(runPathOf({ ORBIT_EVAL_ASTRA_PATH: 'change-plan' })).toBe('change-plan')
  for (const named of ['flag', '', 'Change-Plan', ' change-plan']) {
    expect(() => runPathOf({ ORBIT_EVAL_ASTRA_PATH: named })).toThrow(unknownPath.replace('"flag"', `"${named}"`))
  }
})

it.each([['launch corpus', beforeAll, suiteFor(credentialKeys)], ['core set', beforeCoreRun, coreSuite]])(
  'stops a %s run that names an unknown path before any request', async (_name, start, suite) => {
    const requests = requestsFor()
    vi.stubEnv('ORBIT_EVAL_ASTRA_PATH', 'flag')
    await expect(Promise.resolve().then(() => start(suite))).rejects.toThrow(unknownPath)
    expect(requests).not.toHaveBeenCalled()
  },
)

// Producer: orbit-api TurnPolicy.For resolves ChatContext.Policy from ai_change_plan in the flags of the account, and
// GET api/config returns the same flag. A run whose path does not agree with that flag would grade one path with the lists of the other.
const flagState = (enabled) => (index) => preflightResponse({ enabled: index === 0, planRequirement: null }, { enabled, planRequirement: null })
const disagreement = (path, key) => `Eval preflight failed: this run measures the ${path} path (ORBIT_EVAL_ASTRA_PATH); turn ${path === 'change-plan' ? 'on' : 'off'} ai_change_plan for ${key} through /flag on staging, then verify /api/config and retry.`

it.each([['change-plan', false], ['block-first', true], [undefined, true]])(
  'stops a launch corpus run of the %s path before a chat request when the flag of an account is on: %s', async (path, enabled) => {
    const requests = requestsFor(flagState(enabled))
    if (path) vi.stubEnv('ORBIT_EVAL_ASTRA_PATH', path)
    await expect(beforeAll(suiteFor(credentialKeys))).rejects.toThrow(`${disagreement(path ?? 'block-first', credentialKeys[0])} The flag state does not agree with the path of the run.`)
    expect(pathsOf(requests)).toEqual(['/health', '/api/auth/refresh', '/api/config'])
  },
)

it.each([['change-plan', true], ['block-first', false], [undefined, false]])(
  'starts a launch corpus run of the %s path when the flag of each account is on: %s', async (path, enabled) => {
    const requests = requestsFor(flagState(enabled))
    if (path) vi.stubEnv('ORBIT_EVAL_ASTRA_PATH', path)
    await expect(beforeAll(suiteFor(credentialKeys))).resolves.toBeUndefined()
    expect(pathsOf(requests)).toEqual(['/health', ...credentialKeys.flatMap(() => ['/api/auth/refresh', '/api/config'])])
  },
)

it.each([['change-plan', false], [undefined, true]])(
  'stops a core set run of the %s path before a chat request when the flag of the account is on: %s', async (path, enabled) => {
    const requests = requestsFor(flagState(enabled))
    if (path) vi.stubEnv('ORBIT_EVAL_ASTRA_PATH', path)
    await expect(beforeCoreRun(coreSuite)).rejects.toThrow(disagreement(path ?? 'block-first', credentialKeys[0]))
    expect(pathsOf(requests)).toEqual(['/health', '/api/auth/refresh', '/api/config'])
  },
)

it.each([
  ['missing flag', () => Response.json({ features: { astra_eval_unmetered: { enabled: true, planRequirement: null } } })],
  ['string enabled', () => preflightResponse(undefined, { enabled: 'false', planRequirement: null })],
])('stops with the flag procedure and without a credential value for %s', async (_name, response) => {
  requestsFor(response)
  const failure = await beforeAll(suiteFor([credentialKeys[0]])).catch((error) => error)
  expect(failure.message).toBe(`${disagreement('block-first', credentialKeys[0])} The flag state does not agree with the path of the run.`)
  expect(failure.message).not.toMatch(/offline-(?:token|refresh)/u)
})
