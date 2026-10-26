import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { parse, stringify } from 'yaml'
import { loadApiProvider } from 'promptfoo'
import { beforeAll, beforeEach } from '../hooks.mjs'
import { resetFixture } from '../fixtures/reset.mjs'
import { behavior } from '../assertions.mjs'
import { offlineCredentials, refreshResponse } from './fixtures/credentials.mjs'
import { chatResponse, toolCall } from './fixtures/producer.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const configuration = parse(readFileSync(resolve(root, 'promptfooconfig.yaml'), 'utf8'))
const catalog = parse(readFileSync(resolve(root, 'catalog.yaml'), 'utf8'))
const scenarios = parse(readFileSync(resolve(root, 'scenarios.yaml'), 'utf8'))
const cli = resolve(root, 'node_modules/promptfoo/dist/src/entrypoint.js')
const scratch = []
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true }) })

describe('real promptfoo CLI with an offline provider', () => {
  it.each([
    [false, false, 'pass', undefined], [true, false, 'fail', undefined], [false, true, 'incomplete', undefined],
    [false, false, 'fail', 'prose-first'], [false, false, 'pass', 'block-only'], [false, false, 'fail', 'repeated-figure'],
    [false, false, 'fail', 'slow-latency'], [false, false, 'fail', 'missing-timing'],
    [false, false, 'incomplete', 'missing-composition'], [false, false, 'incomplete', 'skipped-composition'],
  ])('runs the production assertions and pass^3 reporter; broken=%s, noTrace=%s, status=%s, mode=%s', (broken, noTrace, status, responseMode) => {
    offlineCredentials()
    const directory = mkdtempSync(resolve(tmpdir(), 'astra-eval-'))
    scratch.push(directory)
    const configPath = resolve(directory, 'config.yaml')
    const assertions = configuration.defaultTest.assert.filter((assertion) => responseMode !== 'missing-composition' || assertion.metric !== 'composition').map((assertion) => ({
      ...assertion, ...(responseMode === 'skipped-composition' && assertion.metric === 'composition'
        ? { value: "({ pass: true, score: 1, reason: 'Calibration skip.', metadata: { skipped: true } })" } : assertion.type === 'javascript'
        ? { value: assertion.value.replace('file://', `file://${root}/`) } : {}),
    }))
    writeFileSync(configPath, stringify({
      ...configuration,
      providers: [{ id: `file://${root}/__tests__/fixtures/target.mjs`, config: { tools: catalog } }],
      defaultTest: { vars: configuration.defaultTest.vars, assert: assertions, options: { provider: `file://${root}/__tests__/fixtures/grader.mjs` } },
      tests: [{ description: 'Offline Water case', metadata: { id: 'offline-water', fixture: 'pro', locale: 'en' }, vars: {
        input: 'Mark Water done', credentialKey: 'ORBIT_EVAL_TOKEN', broken, noTrace, responseMode,
        clientContext: {}, composition: { mode: 'fallback' },
        ...(responseMode && ['prose-first', 'block-only', 'repeated-figure', 'slow-latency', 'missing-timing'].includes(responseMode) ? {
          clientContext: { supportsParts: true, partKinds: ['habitList'], supportsHabitListCard: true }, composition: { mode: 'data', kinds: ['habitList'] },
        } : {}), rubric: 'Describe Water only.',
        expectations: { required: [{ name: 'log_habit', arguments: { habit_id: 'water' } }] },
      } }],
      extensions: [`file://${root}/hooks.mjs:beforeEach`, `file://${root}/hooks.mjs:afterAll`],
    }))
    const run = spawnSync(process.execPath, ['--import', resolve(root, '__tests__/fixtures/auth-preload.mjs'), cli, 'eval', '--config', configPath, '-o', resolve(directory, 'promptfoo.json'), '--no-write', '--no-share', '--no-cache', '--no-table', '--filter-metadata', 'id=offline-water'], {
      cwd: directory, encoding: 'utf8', timeout: 45000,
      env: { ...process.env, ORBIT_EVAL_BASE_URL: 'https://orbit-api-staging-uqu2.onrender.com', PROMPTFOO_CONFIG_DIR: resolve(directory, '.promptfoo'),
        PROMPTFOO_DISABLE_TELEMETRY: '1', PROMPTFOO_DISABLE_SHARING: '1' },
    })
    const summaryPath = resolve(directory, 'reports/summary.json')
    expect(run.error, run.stdout + run.stderr).toBeUndefined()
    expect(existsSync(summaryPath), run.stdout + run.stderr).toBe(true)
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'))
    if (status !== 'pass') expect(run.status, run.stdout + run.stderr).not.toBe(0)
    else expect(run.status, run.stdout + run.stderr).toBe(0)
    expect(summary.status).toBe(status)
    if (['slow-latency', 'missing-timing'].includes(responseMode)) {
      expect(summary.cases[0]).toMatchObject({ passed: 3, latency: { status: 'fail' } })
    }
    if (status === 'pass') expect(summary.gateStatus).toBe('incomplete')
    expect(summary.cases[0]).toMatchObject({ attempts: 3, passed: broken || noTrace || ['prose-first', 'repeated-figure'].includes(responseMode) ? 0 : 3, skipped: responseMode === 'skipped-composition' ? 3 : 0, unavailable: noTrace ? 3 : 0 })
    expect(readFileSync(summaryPath, 'utf8')).not.toContain('TOOL_TRACE_SECRET')
    const resultsPath = resolve(directory, 'reports/results.json')
    expect(existsSync(resultsPath)).toBe(true)
    expect(statSync(resultsPath).mode & 0o777).toBe(0o600)
    const attempts = JSON.parse(readFileSync(resultsPath, 'utf8'))
    expect(attempts.map(({ caseId, repeat, pass, httpStatus }) => ({ caseId, repeat, pass, httpStatus }))).toEqual(
      [1, 2, 3].map((repeat) => ({ caseId: 'offline-water', repeat,
        pass: !broken && !noTrace && !['prose-first', 'repeated-figure'].includes(responseMode), httpStatus: 200 })),
    )
    for (const attempt of attempts) {
      expect(attempt.assertions.length).toBe(responseMode === 'missing-composition' ? 3 : 4)
      expect(attempt.assertions.map(({ metric }) => metric)).toEqual(assertions.map(({ metric }) => metric))
      for (const assertion of attempt.assertions) {
        expect(typeof assertion.metric).toBe('string')
        expect(typeof assertion.pass).toBe('boolean')
        expect(typeof assertion.reason).toBe('string')
      }
    }
    expect(readFileSync(resultsPath, 'utf8')).not.toContain('TOOL_TRACE_SECRET')
    if (broken) expect(attempts.every(({ assertions }) => assertions.some(({ metric, pass, reason }) =>
      metric === 'toolBehavior' && !pass && reason.includes('log_habit')))).toBe(true)
    if (status !== 'pass') expect(existsSync(resolve(directory, 'promptfoo.json'))).toBe(false)
  })
})

describe('HTTP provider wiring without a server', () => {
  it.each(['legacy-moderation', 'budget', 'unexpected-refusal', 'unrelated-refusal', 'unauthorized', 'wrong-request', 'throttled', 'server-error', 'not-found', 'not-json', 'reset-stop'])(
    'the real HTTP pipeline continues after an expected budget refusal and fails other refusals: %s', (mode) => {
      offlineCredentials()
      const directory = mkdtempSync(resolve(tmpdir(), 'astra-http-eval-'))
      scratch.push(directory)
      const configPath = resolve(directory, 'config.yaml')
      writeFileSync(configPath, stringify({
        ...configuration,
        providers: [{ ...configuration.providers[0], id: `file://${root}/http-provider.mjs`, config: { ...configuration.providers[0].config,
          transformResponse: `file://${root}/response.mjs`,
        } }],
        defaultTest: { ...configuration.defaultTest,
          options: { provider: `file://${root}/__tests__/fixtures/grader.mjs` },
          assert: configuration.defaultTest.assert.map((assertion) => assertion.type === 'javascript'
            ? { ...assertion, value: assertion.value.replace('file://', `file://${root}/`) } : assertion),
        },
        tests: (mode === 'reset-stop' ? ['healthy', mode, 'healthy-next'] : [mode, 'healthy']).map((input) => ({ metadata: {
          id: input, fixture: input === 'reset-stop' ? 'unknown' : 'pro', locale: 'en',
        }, vars: {
          input, credentialKey: 'ORBIT_EVAL_TOKEN', composition: { mode: input === 'legacy-moderation' ? 'fallback' : 'text' },
          ...(input === 'legacy-moderation' ? { clientContext: {}, expectedErrorCode: 'CONTENT_MODERATION_REFUSED' } : {}),
          expectedHttpStatus: ['budget', 'unrelated-refusal', 'wrong-request'].includes(input) ? 403 : input === 'legacy-moderation' ? 400 : 200,
          expectations: { allowed: [] }, rubric: 'Describe the result.',
        } })),
        extensions: configuration.extensions.map((extension) => extension.replace('file://', `file://${root}/`)),
      }))
      const run = spawnSync(process.execPath, ['--import', resolve(root, '__tests__/fixtures/http-preload.mjs'), cli,
        'eval', '--config', configPath, '--no-write', '--no-share', '--no-cache', '--no-table'], {
        cwd: directory, encoding: 'utf8', timeout: 45000,
        env: { ...process.env, ORBIT_EVAL_BASE_URL: 'https://orbit-api-staging-uqu2.onrender.com', ORBIT_EVAL_GRADER: 'offline',
          ASTRA_TEST_REQUEST_LOG: resolve(directory, 'requests.txt'),
          PROMPTFOO_CONFIG_DIR: resolve(directory, '.promptfoo'), PROMPTFOO_DISABLE_TELEMETRY: '1', PROMPTFOO_DISABLE_SHARING: '1' },
      })
      expect(run.error, run.stdout + run.stderr).toBeUndefined()
      expect(readFileSync(resolve(directory, 'requests.txt'), 'utf8').trim().split('\n')).toHaveLength(6)
      if (mode === 'reset-stop') {
        expect(run.status, run.stdout + run.stderr).not.toBe(0)
        expect(run.stdout + run.stderr).toContain('Unknown fixture.')
        expect(run.stdout + run.stderr).not.toContain('Aborting scan')
        const attempts = JSON.parse(readFileSync(resolve(directory, 'reports/results.json'), 'utf8'))
        expect(attempts).toHaveLength(9)
        expect(attempts.filter(({ caseId }) => caseId !== 'reset-stop').every(({ pass }) => pass)).toBe(true)
        expect(attempts.filter(({ caseId }) => caseId === 'reset-stop').every(({ pass, reason, httpStatus }) =>
          !pass && reason.includes('Unknown fixture.') && httpStatus === null)).toBe(true)
        const summary = JSON.parse(readFileSync(resolve(directory, 'reports/summary.json'), 'utf8'))
        expect(summary.status).toBe('incomplete')
        expect(summary.cases.map(({ attempts }) => attempts)).toEqual([3, 3, 3])
        expect(summary.cases[1]).toMatchObject({ unavailable: 3, pass3: 'incomplete' })
      } else if (['budget', 'legacy-moderation'].includes(mode)) {
        expect(run.status, run.stdout + run.stderr).toBe(0)
        const summary = JSON.parse(readFileSync(resolve(directory, 'reports/summary.json'), 'utf8'))
        expect(summary.cases.map(({ attempts, passed }) => ({ attempts, passed }))).toEqual([
          { attempts: 3, passed: 3 }, { attempts: 3, passed: 3 },
        ])
        const attempts = JSON.parse(readFileSync(resolve(directory, 'reports/results.json'), 'utf8'))
        expect(attempts.map(({ httpStatus }) => httpStatus)).toEqual([...(mode === 'budget' ? [403, 403, 403] : [400, 400, 400]), 200, 200, 200])
      } else {
        expect(run.status, run.stdout + run.stderr).not.toBe(0)
        expect(run.stdout + run.stderr).not.toContain('Aborting scan')
        const attempts = JSON.parse(readFileSync(resolve(directory, 'reports/results.json'), 'utf8'))
        expect(attempts).toHaveLength(6)
        const status = ({ unauthorized: 401, throttled: 429, 'server-error': 500, 'not-found': 404, 'not-json': 502 })[mode] ?? 403
        expect(attempts.map(({ httpStatus }) => httpStatus)).toEqual([status, status, status, 200, 200, 200])
        expect(attempts.slice(0, 3).every(({ pass }) => !pass)).toBe(true)
        expect(attempts.slice(3).every(({ pass }) => pass)).toBe(true)
      }
    },
  )
  it.each([
    ['ORBIT_EVAL_TOKEN', 200], ['ORBIT_EVAL_FREE_TOKEN', 200], ['ORBIT_EVAL_BUDGET_TOKEN', 403],
  ])('renders multipart and the selected credential: %s, status=%s', async (credentialKey, status) => {
    offlineCredentials()
    vi.stubEnv(credentialKey, 'expired-token')
    let requests = 0
    vi.stubGlobal('fetch', async (url, options) => {
      if (new URL(url).pathname === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
    if (new URL(url).pathname === '/api/auth/refresh') return refreshResponse()
      requests++
      const request = new Request(url, options)
      expect(request.url).toBe('https://astra.invalid/api/chat')
      expect(request.headers.get('authorization')).toBe('Bearer offline-token')
      expect(request.headers.get('x-orbit-eval-trace')).toBe('1')
      expect(request.headers.get('x-orbit-request-id')).toBe(test.vars.evalRequestId)
      const form = await request.formData()
      expect(form.get('message')).toBe('Water & Walk? á')
      expect(form.get('history')).toBe('[]')
      return Response.json(status === 200 ? chatResponse(test.vars.evalRequestId, [toolCall('query_habits', { date: 'today' })])
        : { error: 'Daily AI message limit reached.', errorCode: 'PAY_GATE' }, { status, headers: { 'X-Orbit-Request-Id': test.vars.evalRequestId } })
    })
    const provider = await loadApiProvider(`file://${root}/http-provider.mjs`, { options: { config: {
        ...configuration.providers[0].config,
        url: 'https://astra.invalid/api/chat',
        transformResponse: `file://${root}/response.mjs`,
    } } })
      const { test } = await beforeEach({ test: { metadata: { id: 'offline-http' }, vars: { credentialKey,
      expectedHttpStatus: status, expectations: status === 403 ? { allowed: [] }
        : { required: [{ name: 'query_habits', arguments: { date: 'today' } }] },
    } } })
    const response = await provider.callApi('Water & Walk? á', { vars: test.vars })
    expect(response.output).toMatchObject({ answer: status === 200 ? 'Water is ready.' : 'Daily AI message limit reached.',
      httpStatus: status, trace: { state: status === 403 ? 'refused' : 'available' } })
    expect(behavior(response.output, { vars: test.vars }).pass).toBe(true)
    expect(requests).toBe(1)
  })
})

describe('corpus and execution constraints', () => {
  it('has a manual-dispatch-only Action that publishes summary files only', () => {
    const workflow = parse(readFileSync(resolve(root, '../../.github/workflows/astra-eval.yml'), 'utf8'))
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch'])
    expect(workflow.on.workflow_dispatch.inputs.case_ids.required).toBe(true)
    const steps = workflow.jobs.evaluate.steps
    expect(steps.find((step) => step.name?.startsWith('Evaluate selected')).run).toContain('--filter-metadata')
    expect(steps.findIndex((step) => step.name?.startsWith('Persist rotated'))).toBeLessThan(steps.findIndex((step) => step.name?.startsWith('Remove local')))
    expect(steps.find((step) => step.name?.startsWith('Persist rotated')).if).toBe('always()')
    const upload = workflow.jobs.evaluate.steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'))
    expect(upload.with.path.trim().split('\n')).toEqual(['evals/astra/reports/summary.json', 'evals/astra/reports/summary.md'])
  })
  it('contains every required category and unique case IDs', () => {
    const categories = new Set(scenarios.map((scenario) => scenario.metadata.category))
    for (const category of ['single', 'compound', 'bulk', 'ambiguity', 'guardrail', 'moderation', 'grounding', 'bilingual', 'voice', 'edge', 'budget']) {
      expect(categories.has(category)).toBe(true)
    }
    expect(new Set(scenarios.map((scenario) => scenario.metadata.id)).size).toBe(scenarios.length)
    for (const scenario of scenarios) expect(scenario.vars.rubric.trim()).not.toBe('')
  })
  it('requires credentials and an HTTPS origin before requests', () => {
    offlineCredentials()
    for (const key of ['ORBIT_EVAL_BASE_URL', 'ORBIT_EVAL_GRADER', 'ORBIT_EVAL_HABIT_ID',
      'ORBIT_EVAL_SECOND_HABIT_ID', 'ORBIT_EVAL_OVERDUE_DATE', 'ORBIT_EVAL_TOKEN', 'ORBIT_EVAL_FREE_TOKEN', 'ORBIT_EVAL_BUDGET_TOKEN']) {
      vi.stubEnv(key, key === 'ORBIT_EVAL_BASE_URL' ? 'https://astra.invalid' : key === 'ORBIT_EVAL_OVERDUE_DATE' ? '2026-01-01' : 'offline')
    }
    expect(() => beforeAll({ suite: { tests: scenarios } })).not.toThrow()
    vi.stubEnv('ORBIT_EVAL_BASE_URL', 'http://astra.invalid')
    expect(() => beforeAll({ suite: { tests: scenarios } })).toThrow('HTTPS')
    vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://astra.invalid')
    writeFileSync(process.env.ORBIT_EVAL_CREDENTIALS_FILE, '{}')
    expect(() => beforeAll({ suite: { tests: scenarios } })).not.toThrow()
  })
  it('resets before each attempt and resolves IDs in prompts and expectations', async () => {
    offlineCredentials()
    vi.stubGlobal('fetch', async (url) => new URL(url).pathname === '/health'
      ? Response.json({ status: 'Healthy', commit: null, checks: [] }) : refreshResponse())
      vi.stubEnv('ORBIT_EVAL_HABIT_ID', 'actual-water')
    const test = structuredClone(scenarios.find((scenario) => scenario.metadata.id === 'single-log-en'))
    expect((await beforeEach({ test })).test.vars.expectations.required[0].arguments.habit_id).toBe('actual-water')
    expect(test.vars.input).toContain('actual-water')
    vi.mocked(resetFixture).mockRejectedValueOnce(new Error('reset failed'))
    expect((await beforeEach({ test })).test.vars.preconditionFailure).toBe('reset failed')
  })
})

vi.mock('../fixtures/reset.mjs', async (importOriginal) => ({ ...await importOriginal(), resetFixture: vi.fn() }))
