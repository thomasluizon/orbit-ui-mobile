import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { MUST_PASS_ATTEMPTS, corpusDigest } from '../core/corpus.mjs'
import { offlineCredentials } from './fixtures/credentials.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const cli = resolve(root, 'node_modules/promptfoo/dist/src/entrypoint.js')
const requestId = 'owner-water-request-pt-BR-1'
const scratch = []
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true }) })

// Runs the committed must-pass config through the real promptfoo CLI: the hooks, the stream driver, the outcome
// grader and the report, with the recorded staging stream of one capture in place of the API.
function runGate(capture, caseId = requestId) {
  offlineCredentials()
  const directory = mkdtempSync(resolve(tmpdir(), 'core-gate-'))
  scratch.push(directory)
  const run = spawnSync(process.execPath, ['--import', resolve(root, '__tests__/fixtures/core-preload.mjs'), cli, 'eval',
    '--config', resolve(root, 'core/must-pass.promptfooconfig.yaml'), '--no-write', '--no-share', '--no-cache', '--no-table',
    '--filter-metadata', `id=${caseId}`], { cwd: directory, encoding: 'utf8', timeout: 180000,
    env: { ...process.env, CORE_TEST_CAPTURE: capture, ORBIT_EVAL_GRADER: `file://${root}/__tests__/fixtures/grader.mjs`,
      PROMPTFOO_CONFIG_DIR: resolve(directory, '.promptfoo'), PROMPTFOO_DISABLE_TELEMETRY: '1', PROMPTFOO_DISABLE_SHARING: '1' } })
  const summaryPath = resolve(directory, 'reports/core-must-pass/summary.json')
  expect(run.error, run.stdout + run.stderr).toBeUndefined()
  expect(existsSync(summaryPath), run.stdout + run.stderr).toBe(true)
  return { run, directory, summary: JSON.parse(readFileSync(summaryPath, 'utf8')) }
}

describe('the must-pass run through the real promptfoo CLI', () => {
  it('passes pass^3 when each of the 3 attempts reaches the complete preview and its saved state', () => {
    const caseId = requestId
    const { run, directory, summary } = runGate('complete')
    expect(run.status, run.stdout + run.stderr).toBe(0)
    expect(summary).toMatchObject({ gate: 'core', run: 'must-pass', status: 'pass', corpusDigest })
    expect(summary.cases).toHaveLength(1)
    expect(summary.cases[0]).toMatchObject({ id: caseId, family: 'owner-turns', locale: 'pt-BR', mustPass: true, k: MUST_PASS_ATTEMPTS,
      attempts: 3, passed: 3, passK: 'pass', maxQuestions: 1, questionsBeforePreview: [1, 1, 1], reasons: [] })
    expect(summary.groups).toEqual([{ family: 'owner-turns', locale: 'pt-BR', cases: 1, passed: 1, passRate: 1, passK: 'pass' }])
    const evidence = JSON.parse(readFileSync(resolve(directory, 'reports/core-must-pass/attempts', `${caseId}-r3.json`), 'utf8'))
    expect(evidence).toMatchObject({ caseId, repeat: 3, pass: true, questionsBeforePreview: 1 })
    expect(evidence.heldChanges.map(({ kind }) => kind)).toEqual(['delete', 'delete', 'update', 'update', 'update', 'update'])
  })

  it('fails pass^3, with no rerun, when the attempts reach the preview that holds half of the request', () => {
    const { run, summary } = runGate('half')
    expect(run.status, run.stdout + run.stderr).not.toBe(0)
    expect(summary.status).toBe('fail')
    expect(summary.cases[0]).toMatchObject({ attempts: 3, passed: 0, passK: 'fail', questionsBeforePreview: [1, 1, 1],
      reasons: ['The preview does not update exactly the records of the request. The request needs delete and update; the preview holds delete 2.'] })
  })

  it('fails pass^3 for the run-5 situation when the attempts get the recorded run-5 list card', () => {
    const { run, summary } = runGate('run5', 'owner-water-run-5-pt-BR-1')
    expect(run.status, run.stdout + run.stderr).not.toBe(0)
    expect(summary.status).toBe('fail')
    expect(summary.cases).toHaveLength(1)
    expect(summary.cases[0]).toMatchObject({ id: 'owner-water-run-5-pt-BR-1', family: 'owner-turns', mustPass: true, attempts: 3, passed: 0,
      passK: 'fail', graderLimits: 0, questionsBeforePreview: [null, null, null],
      reasons: ['The reply shows a list card that can only log habits; the request needs delete and update.'] })
  })
})
