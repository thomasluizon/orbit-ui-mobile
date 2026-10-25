import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import { refreshCredential } from '../credentials.mjs'

const workflow = parse(readFileSync(new URL('../../../.github/workflows/astra-eval.yml', import.meta.url), 'utf8'))
const job = workflow.jobs.evaluate
const prepare = job.steps.find((step) => step.name === 'Prepare private rotating credentials')
const persist = job.steps.find((step) => step.name === 'Persist rotated credentials for the next window')
let directory, secretPath, credentialPath
const stored = (token) => JSON.stringify({ ORBIT_EVAL_TOKEN: { refreshToken: token } })
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'astra-workflow-'))
  secretPath = join(directory, 'environment-secret.json')
  credentialPath = join(directory, 'credentials.json')
  writeFileSync(secretPath, stored('initial-refresh'), { mode: 0o600 })
  writeFileSync(join(directory, 'gh'), `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
if (JSON.stringify(args) !== JSON.stringify(['secret', 'set', 'ORBIT_EVAL_CREDENTIALS_JSON', '--repo', 'owner/repo', '--env', 'astra-eval'])) process.exit(9)
fs.writeFileSync(process.env.TEST_ENV_SECRET, fs.readFileSync(0))
`, { mode: 0o700 })
  vi.stubEnv('ORBIT_EVAL_CREDENTIALS_FILE', credentialPath)
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://astra.invalid')
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); rmSync(directory, { recursive: true, force: true }) })
function runStep(step, credentials = stored('initial-refresh')) {
  const result = spawnSync('bash', ['-e', '-c', step.run], { encoding: 'utf8', env: {
    ...process.env, PATH: `${directory}:${process.env.PATH}`, ORBIT_EVAL_CREDENTIALS_JSON: credentials,
    GH_TOKEN: 'offline', GITHUB_REPOSITORY: 'owner/repo', TEST_ENV_SECRET: secretPath,
  } })
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout + result.stderr).not.toContain('refresh')
}
it('loads rotating credentials at job start and persists into that same environment', () => {
  expect(job.environment).toBe('astra-eval')
  expect(job.env.ORBIT_EVAL_CREDENTIALS_JSON).toBe('${{ secrets.ORBIT_EVAL_CREDENTIALS_JSON }}')
  expect(workflow.concurrency).toEqual({ group: 'astra-eval', 'cancel-in-progress': false })
})
it('a second dispatch queued before rotation starts with the newly persisted environment secret', async () => {
  const queuedSnapshots = [stored('initial-refresh'), stored('initial-refresh')]
  let serverRefresh = 'initial-refresh'
  vi.stubGlobal('fetch', async (url, options) => {
    if (new URL(url).pathname === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
    expect(JSON.parse(options.body).refreshToken).toBe(serverRefresh)
    serverRefresh += '-rotated'
    return Response.json({ token: 'access', refreshToken: serverRefresh })
  })
  for (const queued of queuedSnapshots) {
    const atJobStart = job.environment === 'astra-eval' ? readFileSync(secretPath, 'utf8') : queued
    runStep(prepare, atJobStart)
    await refreshCredential('ORBIT_EVAL_TOKEN')
    runStep(persist)
    expect(JSON.parse(readFileSync(secretPath, 'utf8')).ORBIT_EVAL_TOKEN.refreshToken).toBe(serverRefresh)
  }
})
it.each(['none', 'failed', 'same-token', 'rotation-then-failed'])('never persists a stale snapshot: %s', async (mode) => {
  runStep(prepare)
  vi.stubGlobal('fetch', async (url) => new URL(url).pathname === '/health'
    ? Response.json({ status: 'Healthy', commit: null, checks: [] }) : mode === 'failed'
    ? Response.json({}, { status: 401 }) : Response.json({ token: 'access', refreshToken: mode === 'same-token' ? 'initial-refresh' : 'rotated-refresh' }))
  if (mode === 'failed') await expect(refreshCredential('ORBIT_EVAL_TOKEN')).rejects.toThrow('refresh failed')
  if (mode === 'same-token' || mode === 'rotation-then-failed') await refreshCredential('ORBIT_EVAL_TOKEN')
  if (mode === 'rotation-then-failed') {
    vi.stubGlobal('fetch', async () => Response.json({}, { status: 401 }))
    await expect(refreshCredential('ORBIT_EVAL_TOKEN')).rejects.toThrow('refresh failed')
  }
  writeFileSync(secretPath, stored('newer-server-refresh'), { mode: 0o600 })
  runStep(persist)
  expect(readFileSync(secretPath, 'utf8')).toBe(stored('newer-server-refresh'))
})
