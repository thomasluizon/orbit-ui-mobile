import { afterEach, expect, it, vi } from 'vitest'
import { beforeEach } from '../hooks.mjs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resetFixture } from '../fixtures/reset.mjs'
import AstraHttpProvider from '../http-provider.mjs'
import { summarize } from '../report.mjs'
import { offlineCredentials, refreshResponse } from './fixtures/credentials.mjs'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })
it('records a fixture failure with its original reason and sends no chat request', async () => {
  offlineCredentials()
  const request = vi.fn(async (url) => new URL(url).pathname === '/health'
    ? Response.json({ status: 'Healthy', commit: null, checks: [] }) : refreshResponse())
  vi.stubGlobal('fetch', request)
  const consoleLine = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  const reason = 'Fixture daily allowance is exhausted; resume in another daily window.'
  vi.mocked(resetFixture).mockRejectedValueOnce(new Error(reason))
  const original = { metadata: { id: 'unavailable', fixture: 'free-at-limit' }, vars: { credentialKey: 'ORBIT_EVAL_TOKEN' } }
  const { test } = await beforeEach({ test: original })
  expect(test.vars.preconditionFailure).toContain(reason)
  expect(consoleLine.mock.calls.flat().join('')).toContain(reason)
  const provider = new AstraHttpProvider({ config: { url: 'https://astra.invalid/api/chat' } })
  const response = await provider.callApi('Create Stretch', { vars: test.vars })
  expect(response.error).toContain(reason)
  expect(request.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/health', '/api/auth/refresh'])
  const attempts = Array.from({ length: 3 }, () => ({ testCase: test, response, error: response.error, success: false }))
  expect(summarize(attempts, [test.metadata]).cases[0]).toMatchObject({ attempts: 3, passed: 0, unavailable: 3, pass3: 'incomplete' })
  const next = (await beforeEach({ test })).test
  expect(next.vars).not.toHaveProperty('preconditionFailure')
})
it('redacts credential values while retaining the fixture cause', async () => {
  offlineCredentials()
  vi.stubGlobal('fetch', async (url) => new URL(url).pathname === '/health'
    ? Response.json({ status: 'Healthy', commit: null, checks: [] }) : refreshResponse())
  const consoleLine = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  vi.mocked(resetFixture).mockRejectedValueOnce(new Error('Fixture cause: offline-token offline-refresh'))
  const { test } = await beforeEach({ test: { metadata: { id: 'redaction' }, vars: { credentialKey: 'ORBIT_EVAL_TOKEN' } } })
  expect(test.vars.preconditionFailure).toBe('Fixture cause: [redacted] [redacted]')
  expect(consoleLine.mock.calls.flat().join('')).not.toContain('offline-token')
  expect(consoleLine.mock.calls.flat().join('')).not.toContain('offline-refresh')
})
it('the reset executable reports the original cause and a failing exit code', () => {
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('../fixtures/reset.mjs', import.meta.url)), 'unknown-case'], { encoding: 'utf8', timeout: 10000 })
  expect(run.status).toBe(1)
  expect(run.stderr).toContain('Unknown corpus case ID.')
})
vi.mock('../fixtures/reset.mjs', async (importOriginal) => ({ ...await importOriginal(), resetFixture: vi.fn() }))
