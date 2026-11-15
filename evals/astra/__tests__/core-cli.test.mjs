import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { MUST_PASS_ATTEMPTS, coreCases, corpusDigest } from '../core/corpus.mjs'
import { mergeRuns } from '../core/merge.mjs'
import { gradePreview } from '../core/outcome.mjs'
import { offlineCredentials } from './fixtures/credentials.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const cli = resolve(root, 'node_modules/promptfoo/dist/src/entrypoint.js')
const requestId = 'owner-water-request-pt-BR-1'
const scratch = []
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true }) })

// Runs the committed must-pass config through the real promptfoo CLI: the hooks, the stream driver, the outcome
// grader and the report, with the recorded staging stream of one capture in place of the API.
function spawnGate(capture, caseId, environment) {
  offlineCredentials()
  const directory = mkdtempSync(resolve(tmpdir(), 'core-gate-'))
  scratch.push(directory)
  const run = spawnSync(process.execPath, ['--import', resolve(root, '__tests__/fixtures/core-preload.mjs'), cli, 'eval',
    '--config', resolve(root, 'core/must-pass.promptfooconfig.yaml'), '--no-write', '--no-share', '--no-cache', '--no-table',
    '--filter-metadata', `id=${caseId}`], { cwd: directory, encoding: 'utf8', timeout: 180000,
    env: { ...process.env, ...environment, CORE_TEST_CAPTURE: capture, ORBIT_EVAL_GRADER: `file://${root}/__tests__/fixtures/grader.mjs`,
      PROMPTFOO_CONFIG_DIR: resolve(directory, '.promptfoo'), PROMPTFOO_DISABLE_TELEMETRY: '1', PROMPTFOO_DISABLE_SHARING: '1' } })
  expect(run.error, run.stdout + run.stderr).toBeUndefined()
  return { run, directory, summaryPath: resolve(directory, 'reports/core-must-pass/summary.json') }
}

function runGate(capture, caseId = requestId, environment = {}) {
  const { run, directory, summaryPath } = spawnGate(capture, caseId, environment)
  expect(existsSync(summaryPath), run.stdout + run.stderr).toBe(true)
  return { run, directory, summary: JSON.parse(readFileSync(summaryPath, 'utf8')) }
}

describe('the must-pass run through the real promptfoo CLI', () => {
  // Producer: orbit-api ProcessUserChatCommand.Handle returns the eval trace only when the account holds astra_eval_trace,
  // and GET api/config resolves the same flag. Each card answer and each model call of the gate reads that trace.
  it('stops before any chat turn when the eval account lacks the trace flag', () => {
    const { run, summaryPath } = spawnGate('complete', requestId, { CORE_TEST_TRACE: 'off' })
    const printed = run.stdout + run.stderr
    expect(run.status, printed).not.toBe(0)
    expect(printed).toContain('Eval preflight failed: turn on astra_eval_trace for ORBIT_EVAL_TOKEN through /flag on staging, then verify /api/config and retry.')
    expect(printed).not.toContain('core-test: chat turn sent')
    expect(existsSync(summaryPath)).toBe(false)
  })

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

  it('keeps a grader limit final on its build, and stores the held previews for an offline regrade', () => {
    const unknownKey = 'The grader cannot classify a held preview: moveHabit.'
    const limited = runGate('complete', requestId, { CORE_TEST_ACTION_KEY: 'moveHabit' })
    expect(limited.summary.cases[0]).toMatchObject({ id: requestId, attempts: 3, passed: 0, graderLimits: 3, passK: 'incomplete',
      reasons: [], graderLimitReasons: [unknownKey] })
    const later = runGate('complete')
    expect(later.summary.cases[0]).toMatchObject({ id: requestId, passK: 'pass' })
    expect(() => mergeRuns([limited.summary, later.summary], { asBaseline: true }))
      .toThrow(`Case ${requestId} holds a grader limit, which is final on its build; no rerun on the same build replaces it.`)
    const evidence = JSON.parse(readFileSync(resolve(limited.directory, 'reports/core-must-pass/attempts', `${requestId}-r1.json`), 'utf8'))
    const { heldPreviews } = evidence
    expect(heldPreviews.records).toMatchObject({ parent: 'parent', walk: 'walk',
      children: ['children[0]', 'children[1]', 'children[2]', 'children[3]', 'children[4]', 'children[5]'] })
    expect(JSON.stringify(heldPreviews)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/u)
    const vars = { accountDate: heldPreviews.accountDate, core: { ...coreCases().find(({ metadata }) => metadata.id === requestId).vars.core,
      records: heldPreviews.records } }
    const recorded = { questionsBeforePreview: evidence.questionsBeforePreview, previews: heldPreviews.previews }
    expect(gradePreview(recorded, vars)).toMatchObject({ pass: false, reason: unknownKey, metadata: { graderLimit: true } })
    // A grader that reads the key as the change set of the recorded API grades the recorded attempt without a model call.
    const extended = { ...recorded, previews: heldPreviews.previews.map((preview) => ({ ...preview, actionKey: 'applyAccountChanges' })) }
    expect(gradePreview(extended, vars)).toMatchObject({ pass: true, reason: 'The held previews hold exactly the requested changes.' })
  })
})
