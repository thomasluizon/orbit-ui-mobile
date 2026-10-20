import { execFile } from 'node:child_process'
import { cp, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, expect, it } from 'vitest'

const execute = promisify(execFile)
const directories: string[] = []
const webRoot = path.resolve(import.meta.dirname, '../..')
const repositoryRoot = path.resolve(webRoot, '../..')

async function runFixture(source: string, environment?: string, reporterOverride = false, phaseTimeoutMs = 2000) {
  const directory = await mkdtemp(path.join(webRoot, '.tmp-vitest-stall-'))
  directories.push(directory)
  await writeFile(path.join(directory, 'stalled.test.ts'), source)
  await writeFile(path.join(directory, 'environment.mjs'), `export default {
    name: 'stalled-environment', viteEnvironment: 'ssr',
    setup() { return { teardown() { return new Promise(() => {}) } } }
  }`)
  await writeFile(path.join(directory, 'vitest.config.mts'), `
    import webConfig from ${JSON.stringify(path.join(webRoot, 'vitest.config.ts'))}
    import { createStallDiagnostics } from ${JSON.stringify(path.join(webRoot, 'vitest/stall-diagnostics.ts'))}
    const diagnostics = createStallDiagnostics(${phaseTimeoutMs})
    export default {
      ...webConfig,
      test: {
        ...webConfig.test, root: ${JSON.stringify(directory)}, projects: undefined,
        include: ['*.test.ts'], setupFiles: [], maxWorkers: 1,
        environment: ${JSON.stringify(environment ?? 'node')},
        testTimeout: 5000, hookTimeout: 5000, ...diagnostics,
      }
    }
  `)
  try {
    const result = await execute(process.execPath, [
      path.join(repositoryRoot, 'node_modules/vitest/vitest.mjs'),
      'run', '--config', path.join(directory, 'vitest.config.mts'),
      ...(reporterOverride ? ['--reporter=dot'] : []),
    ], { cwd: directory, timeout: 10_000, maxBuffer: 1024 * 1024 })
    return { code: 0, output: result.stdout + result.stderr, killed: false }
  } catch (cause) {
    const failure = cause as Error & { code: number | string; stdout: string; stderr: string; killed: boolean }
    return { code: failure.code, output: failure.stdout + failure.stderr, killed: failure.killed }
  }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

it('loads the web config through tsx for tooling without starting a worker', async () => {
  const result = await execute(process.execPath, [
    '--import', 'tsx', '--input-type=module', '-e',
    `import config from './apps/web/vitest.config.ts';
      if ((config.default ?? config).test.pool.name !== 'bounded-forks') process.exitCode = 1`,
  ], { cwd: repositoryRoot, timeout: 10_000 }).catch((failure: { stdout: string; stderr: string }) => {
    throw new Error(failure.stdout + failure.stderr)
  })
  expect(result.stderr).toBe('')
}, 15_000)

it('type-checks the config and its harness without the Docker-excluded tests', async () => {
  const directory = await mkdtemp(path.join(webRoot, '.tmp-vitest-stall-'))
  directories.push(directory)
  for (const entry of await readdir(webRoot)) {
    if (entry === 'vitest.config.ts' || entry === 'vitest') {
      await cp(path.join(webRoot, entry), path.join(directory, entry), { recursive: true })
    }
  }
  const result = await execute(process.execPath, [
    path.join(repositoryRoot, 'node_modules/typescript/bin/tsc'),
    '--ignoreConfig', '--noEmit', '--skipLibCheck', '--module', 'esnext',
    '--moduleResolution', 'bundler', '--target', 'es2022', '--esModuleInterop',
    path.join(directory, 'vitest.config.ts'),
  ], { cwd: directory, timeout: 20_000 }).catch((failure: { stdout: string; stderr: string }) => {
    throw new Error(failure.stdout + failure.stderr)
  })
  expect(result.stdout).toBe('')
}, 25_000)

it('bounds a module import stall and names its unfinished phase', async () => {
  const result = await runFixture(`import { it } from 'vitest'
    await new Promise(() => {})
    it('never collected', () => {})`)
  expect(result.killed).toBe(false)
  expect(result.code).toBe(1)
  expect(result.output).toContain('stalled.test.ts')
  expect(result.output).toContain('module import')
  expect(result.output).toContain('unfinished')
}, 15_000)

for (const phase of ['beforeAll', 'afterAll', 'beforeEach', 'afterEach']) {
  it(`bounds a pending ${phase} hook and names it even with a reporter override`, async () => {
    const result = await runFixture(`import { it, ${phase} } from 'vitest'
      ${phase}(async () => { await new Promise(() => {}) })
      it('hook owner', () => {})`, undefined, true)
    expect(result.killed).toBe(false)
    expect(result.code).toBe(1)
    expect(result.output).toContain('stalled.test.ts')
    expect(result.output).toContain(`> ${phase}`)
    expect(result.output).toContain('unfinished')
  }, 15_000)
}

it('bounds a pending test body independently of fake timers', async () => {
  const result = await runFixture(`import { it, vi } from 'vitest'
    it('pending body', async () => { vi.useFakeTimers(); await new Promise(() => {}) })`)
  expect(result.killed).toBe(false)
  expect(result.code).toBe(1)
  expect(result.output).toContain('stalled.test.ts > test body: pending body')
  expect(result.output).toContain('unfinished')
}, 15_000)

it('fails when tests pass but environment teardown never settles', async () => {
  const result = await runFixture(`import { it } from 'vitest'
    it('passed before teardown', () => {})`, './environment.mjs')
  expect(result.killed).toBe(false)
  expect(result.code).toBe(1)
  expect(result.output).toContain('stalled.test.ts > teardown')
  expect(result.output).toContain('unfinished')
  expect(result.output).toContain('1 passed')
}, 15_000)

it('lets completed files exit green without an unfinished phase', async () => {
  const result = await runFixture(`import { it, expect } from 'vitest'
    it('completes', () => { expect(2 + 2).toBe(4) })`)
  expect(result.killed).toBe(false)
  expect(result.code).toBe(0)
  expect(result.output).toContain('1 passed')
  expect(result.output).not.toContain('unfinished')
}, 15_000)

it('names a test body even when its event loop is blocked', async () => {
  const result = await runFixture(`import { it } from 'vitest'
    it('blocked body', () => { while (true) {} })`)
  expect(result.killed).toBe(false)
  expect(result.code).toBe(1)
  expect(result.output).toContain('stalled.test.ts > test body: blocked body')
  expect(result.output).toContain('unfinished')
}, 15_000)

it('fails unfinished worker shutdown before the normal Vitest exit deadline', async () => {
  const result = await runFixture(`import { it } from 'vitest'
    it('passed before shutdown', () => {})`, './environment.mjs', false, 300_000)
  expect(result.killed).toBe(false)
  expect(result.code).toBe(1)
  expect(result.output).toContain('stalled.test.ts > teardown')
  expect(result.output).toContain('unfinished')
}, 15_000)
