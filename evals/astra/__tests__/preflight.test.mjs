import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { beforeAll } from '../hooks.mjs'
import { beforeAll as beforeCoreRun } from '../core/hooks.mjs'
import { credentialKeys } from '../credentials.mjs'
import { offlineCredentials } from './fixtures/credentials.mjs'
import { offlineGrader } from './fixtures/grader.mjs'

const { apiCommit } = parse(readFileSync(new URL('../catalog.yaml', import.meta.url), 'utf8'))

vi.mock('../fixtures/reset.mjs', async (original) => ({ ...await original(), resetFixture: vi.fn() }))

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
  vi.stubEnv('ORBIT_EVAL_GRADER', offlineGrader)
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

const policyUnavailable = 'Eval allowance policy is unavailable.'
it.each([
  ['missing flag', () => Response.json({ features: {} }), policyUnavailable],
  ['null flag', () => preflightResponse(null), policyUnavailable],
  ['missing features', () => Response.json({}), policyUnavailable],
  ['string enabled', () => preflightResponse({ enabled: 'true', planRequirement: null }), policyUnavailable],
  ['rejected config', () => Response.json({ error: 'PRIVATE_SERVER_BODY' }, { status: 403 }), 'Fixture API GET config failed: HTTP 403 (errorCode: none).'],
  ['malformed config', () => new Response('PRIVATE_SERVER_BODY'), 'Fixture API GET config failed: non-JSON body (HTTP 200).'],
  ['transport failure', () => { throw new Error('PRIVATE_TRANSPORT') }, 'Fixture API GET config failed: network.'],
])('stops with its cause and without exposing response contents for %s', async (_name, response, cause) => {
  requestsFor(response)
  const pending = Promise.resolve().then(() => beforeAll(suiteFor([credentialKeys[1]])))
  await expect(pending).rejects.toThrow(`turn off astra_eval_unmetered for ${credentialKeys[1]} through /flag on staging, then verify /api/config and retry. ${cause}`)
  await expect(pending).rejects.not.toThrow('PRIVATE')
})

// A grader that cannot grade turns every graded attempt incomplete after its chat turn spends, so each graded run sends one
// small rubric through the configured grader first. Producer: claude-grader.mjs fails closed without the worker account.
const claudeGrader = `file://${fileURLToPath(new URL('../claude-grader.mjs', import.meta.url))}`
const coreSuite = { suite: { tests: [{ metadata: { id: 'read-en', mustPass: true },
  vars: { credentialKey: 'ORBIT_EVAL_TOKEN', rubric: 'Describe Water only.' } }] } }

it.each([
  ['without the worker account', claudeGrader, 'Claude rubric grading failed: ORBIT_WORKER_CLAUDE_CONFIG_DIR is not set.'],
  ['with an unknown provider', 'offline', 'Could not identify provider'],
])('stops the full corpus run before an account check when the configured grader cannot grade: %s', async (_name, grader, cause) => {
  const requests = requestsFor()
  vi.stubEnv('ORBIT_EVAL_GRADER', grader)
  vi.stubEnv('ORBIT_WORKER_CLAUDE_CONFIG_DIR', '')
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  await expect(beforeAll(suiteFor(credentialKeys))).rejects.toThrow(cause)
  expect(requests.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/health'])
})

// A same-title card question is read through the same Claude grader, so a core run of a card case needs it as a rubric does.
const cardSuite = { suite: { tests: [{ metadata: { id: 'owner-water-request-en', mustPass: true },
  vars: { credentialKey: 'ORBIT_EVAL_TOKEN', core: { answer: { sameTitle: { deleted: [4, 5], renamed: [0, 1, 2, 3] } } } } }] } }

it.each([['a rubric', coreSuite], ['a same-title card answer', cardSuite]])('stops a core run with %s before an account check when the configured grader cannot grade', async (_name, suite) => {
  const requests = requestsFor()
  vi.stubEnv('ORBIT_EVAL_GRADER', claudeGrader)
  vi.stubEnv('ORBIT_WORKER_CLAUDE_CONFIG_DIR', '')
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  await expect(beforeCoreRun(suite)).rejects.toThrow('The configured grader cannot grade, so the run stops before any chat '
    + 'turn spends: Claude rubric grading failed: ORBIT_WORKER_CLAUDE_CONFIG_DIR is not set.')
  expect(requests.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/health'])
})

// Promptfoo resolves a relative file:// grader from the folder of the run's config (core/ for the core set), so the check
// loads the grader from that folder too: a reference the rubric could not load stops the run. A core run that passes the
// check stops at the trace flag, which this config response lacks, before it writes a report.
it.each([
  ['the full corpus', () => beforeAll(suiteFor(credentialKeys)), 'file://__tests__/fixtures/grader.mjs',
    'file://../evals/astra/__tests__/fixtures/grader.mjs', undefined],
  ['the core set', () => beforeCoreRun(coreSuite), 'file://../__tests__/fixtures/grader.mjs',
    'file://__tests__/fixtures/grader.mjs', 'turn on astra_eval_trace for ORBIT_EVAL_TOKEN'],
])('loads a relative grader of %s from the folder of its config', async (_name, start, loads, fails, nextStop) => {
  const refused = requestsFor()
  vi.stubEnv('ORBIT_EVAL_GRADER', fails)
  await expect(start()).rejects.toThrow('ENOENT')
  expect(refused.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/health'])
  const accepted = requestsFor()
  vi.stubEnv('ORBIT_EVAL_GRADER', loads)
  if (nextStop) await expect(start()).rejects.toThrow(nextStop)
  else await expect(start()).resolves.toBeUndefined()
  expect(accepted.mock.calls.map(([url]) => new URL(url).pathname)).toContain('/api/config')
})
