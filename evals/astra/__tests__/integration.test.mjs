import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { parse, stringify } from 'yaml'
import { loadApiProvider } from 'promptfoo'
import { beforeAll, beforeEach } from '../hooks.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const configuration = parse(readFileSync(resolve(root, 'promptfooconfig.yaml'), 'utf8'))
const catalog = parse(readFileSync(resolve(root, 'catalog.yaml'), 'utf8'))
const scenarios = parse(readFileSync(resolve(root, 'scenarios.yaml'), 'utf8'))
const cli = resolve(root, 'node_modules/promptfoo/dist/src/entrypoint.js')
const scratch = []
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true }) })

describe('real promptfoo CLI with an offline provider', () => {
  it.each([
    [false, false, 'pass'], [true, false, 'fail'], [false, true, 'incomplete'],
  ])('runs the production assertions and pass^3 reporter; broken=%s, noTrace=%s', (broken, noTrace, status) => {
    const directory = mkdtempSync(resolve(tmpdir(), 'astra-eval-'))
    scratch.push(directory)
    const configPath = resolve(directory, 'config.yaml')
    const assertions = configuration.defaultTest.assert.map((assertion) => ({
      ...assertion, ...(assertion.type === 'javascript'
        ? { value: assertion.value.replace('file://', `file://${root}/`) } : {}),
    }))
    writeFileSync(configPath, stringify({
      ...configuration,
      providers: [{ id: `file://${root}/__tests__/fixtures/target.mjs`, config: { tools: catalog } }],
      defaultTest: { assert: assertions, options: { provider: `file://${root}/__tests__/fixtures/grader.mjs` } },
      tests: [{ description: 'Offline Water case', metadata: { id: 'offline-water' }, vars: {
        input: 'Mark Water done', broken, noTrace, rubric: 'Describe Water only.',
        expectations: { required: [{ name: 'log_habit', arguments: { habit_id: 'water' } }] },
      } }],
      extensions: [`file://${root}/hooks.mjs:afterAll`],
    }))
    const run = spawnSync(process.execPath, [cli, 'eval', '--config', configPath, '--no-write', '--no-share', '--no-cache', '--no-table'], {
      cwd: directory, encoding: 'utf8', timeout: 45000,
      env: { ...process.env, PROMPTFOO_CONFIG_DIR: resolve(directory, '.promptfoo'),
        PROMPTFOO_DISABLE_TELEMETRY: '1', PROMPTFOO_DISABLE_SHARING: '1' },
    })
    const summaryPath = resolve(directory, 'reports/summary.json')
    expect(run.error, run.stdout + run.stderr).toBeUndefined()
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'))
    if (status !== 'pass') expect(run.status, run.stdout + run.stderr).not.toBe(0)
    else expect(run.status, run.stdout + run.stderr).toBe(0)
    expect(summary.status).toBe(status)
    expect(summary.cases[0]).toMatchObject({ attempts: 3, passed: broken ? 0 : 3, skipped: noTrace ? 3 : 0 })
    expect(readFileSync(summaryPath, 'utf8')).not.toContain('TOOL_TRACE_SECRET')
  })
})

describe('HTTP provider wiring without a server', () => {
  it.each([
    ['ORBIT_EVAL_TOKEN', 200], ['ORBIT_EVAL_FREE_TOKEN', 200], ['ORBIT_EVAL_BUDGET_TOKEN', 403],
  ])('renders multipart and the selected credential: %s, status=%s', async (credentialKey, status) => {
    vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://astra.invalid')
    vi.stubEnv(credentialKey, 'offline-token')
    let requests = 0
    vi.stubGlobal('fetch', async (url, options) => {
      requests++
      const request = new Request(url, options)
      expect(request.url).toBe('https://astra.invalid/api/chat')
      expect(request.headers.get('authorization')).toBe('Bearer offline-token')
      const form = await request.formData()
      expect(form.get('message')).toBe('Water & Walk? á')
      expect(form.get('history')).toBe('[]')
      return Response.json(status === 200 ? { aiMessage: 'Water is pending.' }
        : { error: 'Daily AI message limit reached.', errorCode: 'PAY_GATE' }, { status })
    })
    const provider = await loadApiProvider('http', { options: { config: {
        ...configuration.providers[0].config,
        url: 'https://astra.invalid/api/chat',
        transformResponse: `file://${root}/response.mjs`,
    } } })
    const response = await provider.callApi('Water & Walk? á', { vars: { credentialKey } })
    expect(response.output).toMatchObject({ answer: status === 200 ? 'Water is pending.' : 'Daily AI message limit reached.',
      httpStatus: status, trace: { state: 'skipped' } })
    expect(requests).toBe(1)
  })
})

describe('corpus and execution constraints', () => {
  it('has a manual-dispatch-only Action that publishes summary files only', () => {
    const workflow = parse(readFileSync(resolve(root, '../../.github/workflows/astra-eval.yml'), 'utf8'))
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch'])
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
    for (const key of ['ORBIT_EVAL_BASE_URL', 'ORBIT_EVAL_GRADER', 'ORBIT_EVAL_RESET_SCRIPT', 'ORBIT_EVAL_HABIT_ID',
      'ORBIT_EVAL_SECOND_HABIT_ID', 'ORBIT_EVAL_OVERDUE_DATE', 'ORBIT_EVAL_TOKEN', 'ORBIT_EVAL_FREE_TOKEN', 'ORBIT_EVAL_BUDGET_TOKEN']) {
      vi.stubEnv(key, key === 'ORBIT_EVAL_BASE_URL' ? 'https://astra.invalid' : key === 'ORBIT_EVAL_OVERDUE_DATE' ? '2026-01-01' : 'offline')
    }
    expect(() => beforeAll({ suite: { tests: scenarios } })).not.toThrow()
    vi.stubEnv('ORBIT_EVAL_BASE_URL', 'http://astra.invalid')
    expect(() => beforeAll({ suite: { tests: scenarios } })).toThrow('HTTPS')
    vi.stubEnv('ORBIT_EVAL_TOKEN', '')
    expect(() => beforeAll({ suite: { tests: scenarios } })).toThrow('ORBIT_EVAL_TOKEN')
  })
  it('resets before each attempt and resolves IDs in prompts and expectations', () => {
    vi.stubEnv('ORBIT_EVAL_RESET_SCRIPT', '/usr/bin/true')
    vi.stubEnv('ORBIT_EVAL_HABIT_ID', 'actual-water')
    const test = structuredClone(scenarios.find((scenario) => scenario.metadata.id === 'single-log-en'))
    expect(beforeEach({ test }).test.vars.expectations.required[0].arguments.habit_id).toBe('actual-water')
    expect(test.vars.input).toContain('actual-water')
    vi.stubEnv('ORBIT_EVAL_RESET_SCRIPT', '/usr/bin/false')
    expect(() => beforeEach({ test })).toThrow('Fixture reset failed')
  })
})
