import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse, stringify } from 'yaml'

const repository = fileURLToPath(new URL('../../..', import.meta.url))
const instructions = readFileSync(join(repository, 'TESTING.md'), 'utf8')
  .split('## Astra capability eval\n')[1].split('### Environment')[0]
const installCommands = instructions.match(/npm ci [^`\n]+/g) ?? []

it('the manual Action uses the documented installs from the repository root', () => {
  const workflow = parse(readFileSync(join(repository, '.github/workflows/astra-eval.yml'), 'utf8'))
  expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch'])
  const installs = workflow.jobs.evaluate.steps.filter((step) => /^npm ci /m.test(step.run ?? ''))
  expect(installs).toHaveLength(1)
  expect(installs[0]['working-directory']).toBe('${{ github.workspace }}')
  expect(installs[0].run.trim().split('\n')).toEqual(installCommands)
  const steps = workflow.jobs.evaluate.steps
  const checkIndex = steps.findIndex((step) => step.run === 'npm test -- __tests__/install.test.mjs')
  expect(checkIndex).toBeGreaterThan(steps.indexOf(installs[0]))
  expect(checkIndex).toBeLessThan(steps.findIndex((step) => step.name === 'Prepare private rotating credentials'))
})

it('the documented clean install loads the harness and runs promptfoo past beforeAll', () => {
  const directory = mkdtempSync(join(tmpdir(), 'astra-install-'))
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !key.startsWith('ORBIT_EVAL_') && !['NODE_OPTIONS', 'NODE_PATH'].includes(key)))
  const run = (command, arguments_, cwd, env = environment) => execFileSync(command, arguments_, {
    cwd, env, encoding: 'utf8', timeout: 120000, stdio: 'pipe',
  })
  try {
    const paths = run('git', ['ls-files', '-z', 'package.json', 'package-lock.json', '.npmrc',
      'apps/*/package.json', 'eslint-rules/package.json', 'packages', 'evals/astra'], repository).split('\0').filter(Boolean)
    for (const path of paths) {
      mkdirSync(dirname(join(directory, path)), { recursive: true })
      cpSync(join(repository, path), join(directory, path))
    }
    expect(installCommands.length).toBeGreaterThan(0)
    for (const command of installCommands) run('npm', command.split(' ').slice(1), directory)
    const evaluation = join(directory, 'evals/astra')
    run(process.execPath, ['--input-type=module', '-e', "await import('./hooks.mjs'); await import('./assertions.mjs')"], evaluation)

    const configuration = parse(readFileSync(join(evaluation, 'promptfooconfig.yaml'), 'utf8'))
    writeFileSync(join(evaluation, 'install-smoke.yaml'), stringify({
      ...configuration,
      providers: [{ id: 'file://__tests__/fixtures/target.mjs', config: {
        tools: parse(readFileSync(join(evaluation, 'catalog.yaml'), 'utf8')),
      } }],
      defaultTest: { ...configuration.defaultTest, options: { provider: 'file://__tests__/fixtures/grader.mjs' } },
      tests: [{ metadata: { id: 'install-smoke', fixture: 'pro', locale: 'en' }, vars: {
        input: 'Mark Water done', credentialKey: 'ORBIT_EVAL_TOKEN', clientContext: {},
        composition: { mode: 'fallback' }, rubric: 'Describe Water only.',
        expectations: { required: [{ name: 'log_habit', arguments: { habit_id: 'water' } }] },
      } }],
    }))
    const credentials = join(directory, 'credentials.json')
    writeFileSync(credentials, JSON.stringify({ ORBIT_EVAL_TOKEN: { refreshToken: 'offline-refresh' } }), { mode: 0o600 })
    run('npx', ['promptfoo', 'eval', '--config', 'install-smoke.yaml'], evaluation, {
      ...environment,
      NODE_OPTIONS: `--import=${pathToFileURL(join(evaluation, '__tests__/fixtures/auth-preload.mjs')).href}`,
      ORBIT_EVAL_BASE_URL: 'https://orbit-api-staging-uqu2.onrender.com',
      ORBIT_EVAL_CREDENTIALS_FILE: credentials, ORBIT_EVAL_GRADER: 'file://__tests__/fixtures/grader.mjs',
      PROMPTFOO_CONFIG_DIR: join(directory, '.promptfoo'),
      PROMPTFOO_DISABLE_TELEMETRY: '1', PROMPTFOO_DISABLE_SHARING: '1',
    })
    const summary = JSON.parse(readFileSync(join(evaluation, 'reports/summary.json'), 'utf8'))
    expect(summary.cases).toEqual([expect.objectContaining({ id: 'install-smoke', attempts: 3, passed: 3 })])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 180000)
