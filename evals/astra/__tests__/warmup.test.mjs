import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { parse } from 'yaml'
import { beforeAll as preflight, beforeEach as prepareAttempt } from '../hooks.mjs'
import { offlineCredentials } from './fixtures/credentials.mjs'
import { fixtureFetch } from './fixtures/public-api.mjs'

const corpus = parse(readFileSync(new URL('../scenarios.yaml', import.meta.url), 'utf8'))
const selected = (id) => structuredClone(corpus.find((test) => test.metadata.id === id))
let requests, states

beforeEach(() => {
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_GRADER', 'offline')
  requests = []
  states = Object.fromEntries(['pro', 'free', 'budget'].map((name) => [name, {
    habits: [], goals: [], tags: [], templates: [], requests: [], pro: name === 'pro',
    exhausted: name === 'budget', capacity: 2, unmetered: name === 'pro',
    email: `thomaslrgregorio+orbit-eval-${name}@gmail.com`,
  }]))
  const endpoints = Object.fromEntries(Object.entries(states).map(([name, state]) => [name, fixtureFetch(() => state)]))
  vi.stubGlobal('fetch', async (url, options) => {
    const path = new URL(url).pathname
    const account = options.headers?.Authorization?.match(/^Bearer (pro|free|budget)-access$/)?.[1]
    requests.push({ path, account, method: options.method })
    if (path === '/api/auth/refresh') {
      const name = JSON.parse(options.body).refreshToken.split('-')[0]
      return Response.json({ token: `${name}-access`, refreshToken: `${name}-refresh` })
    }
    return endpoints[account ?? 'pro'](url, options)
  })
  const credentials = JSON.parse(readFileSync(process.env.ORBIT_EVAL_CREDENTIALS_FILE, 'utf8'))
  for (const [key, name] of [['ORBIT_EVAL_TOKEN', 'pro'], ['ORBIT_EVAL_FREE_TOKEN', 'free'], ['ORBIT_EVAL_BUDGET_TOKEN', 'budget']]) {
    credentials[key].refreshToken = `${name}-refresh`
  }
  writeFileSync(process.env.ORBIT_EVAL_CREDENTIALS_FILE, JSON.stringify(credentials))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it('wakes staging then resets each selected account once before any case and still resets each attempt', async () => {
  const tests = [selected('single-read-en'), selected('edge-free-limit-en'), selected('single-create-pt')]
  await preflight({ suite: { tests } })
  expect(requests[0].path).toBe('/health')
  const resets = () => requests.filter(({ path, method }) => path === '/api/eval/pending-operations' && method === 'DELETE')
  expect(resets().map(({ account }) => account)).toEqual(['pro', 'free'])
  expect(states.pro.habits).toHaveLength(2)
  expect(states.free.habits).toHaveLength(2)
  expect(states.budget.requests).toHaveLength(0)
  expect(tests.every((test) => !test.vars.fixtureEvidence)).toBe(true)
  const { test } = await prepareAttempt({ test: tests[0] })
  expect(test.vars.preconditionFailure).toBeUndefined()
  expect(resets().map(({ account }) => account)).toEqual(['pro', 'free', 'pro'])
  expect(requests.some(({ path }) => path === '/api/chat')).toBe(false)
})

it('reports a safe warm-up failure once per account and lets its cases and other accounts reset', async () => {
  const intercepted = globalThis.fetch
  let unavailable = true
  vi.stubGlobal('fetch', async (url, options) => {
    if (unavailable && new URL(url).pathname === '/api/eval/pending-operations') {
      return Response.json({}, { status: 503 })
    }
    return intercepted(url, options)
  })
  const warnings = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  try {
    const tests = [selected('single-read-en'), selected('single-create-pt'), selected('edge-free-limit-en')]
    await expect(preflight({ suite: { tests } })).resolves.toBeUndefined()
    expect(warnings.mock.calls.map(([message]) => message)).toEqual([
      expect.stringMatching(/warm-up.*ORBIT_EVAL_TOKEN.*HTTP 503/),
      expect.stringMatching(/warm-up.*ORBIT_EVAL_FREE_TOKEN.*HTTP 503/),
    ])
    expect(tests.every((test) => !test.vars.preconditionFailure)).toBe(true)
    unavailable = false
    const { test } = await prepareAttempt({ test: tests[0] })
    expect(test.vars.preconditionFailure).toBeUndefined()
    expect(states.pro.habits).toHaveLength(2)
  } finally { warnings.mockRestore() }
})
