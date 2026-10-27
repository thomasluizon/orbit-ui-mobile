import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const repository = fileURLToPath(new URL('../../../', import.meta.url))
const turbo = resolve(repository, 'node_modules/turbo/bin/turbo')
const configuration = readFileSync(resolve(repository, 'turbo.json'), 'utf8')
const { packageManager } = JSON.parse(readFileSync(resolve(repository, 'package.json'), 'utf8'))
const tokenDirectory = 'design/canvas/_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/tokens'
const consumers = [
  { workspace: 'packages/shared', name: '@orbit/shared', inputs: [
    '.github/workflows/contract-rebaseline.yml',
    'apps/web/components/input.tsx', 'apps/mobile/modules/widget/input.kt',
    'apps/web/e2e/layout/interaction-fill-clearance.spec.ts',
    'apps/mobile/__tests__/components/ui/interaction-fill-clearance.test.tsx',
    'design/canvas/Orbit Widget Android.dc.html', `${tokenDirectory}/typography.css`,
    '.gitignore', 'apps/mobile/.gitignore', 'eslint-rules/no-comments.cjs', 'tsconfig.base.json',
  ] },
  { workspace: 'apps/desktop', name: '@orbit/desktop', inputs: [
    '.github/workflows/desktop-release.yml', 'apps/web/components/auth/desktop-auth-bridge.tsx',
    'apps/web/lib/desktop-push.ts', 'apps/web/lib/desktop-updates.ts',
  ] },
  { workspace: 'apps/mobile', name: '@orbit/mobile', inputs: [
    '.github/workflows/ios-build.yml', '.github/workflows/ios-release.yml',
    `${tokenDirectory}/colors.css`, 'packages/shared/src/theme/neutral-ramp.ts',
  ] },
  { workspace: 'apps/web', name: '@orbit/web', inputs: [
    'tools/check-surface-scope.mjs', 'DESIGN.md', 'design/brand/png/orbit-platform-icon-512.png',
    'apps/mobile/components/ui/list-row.tsx', 'packages/shared/src/__tests__/contrast.ts',
  ] },
  { workspace: 'eslint-rules', name: '@orbit/eslint-rules', inputs: [
    'apps/web/eslint.config.mjs', 'apps/mobile/eslint.config.js', 'apps/web/tsconfig.json',
    'apps/web/app/globals.css', 'apps/mobile/components/ui/input.css',
    'packages/shared/src/theme/spacing.json', 'packages/shared/src/theme/spacing.css',
    `${tokenDirectory}/spacing.css`,
  ] },
]
const fixtures = []

function write(root, filename, contents) {
  const target = resolve(root, filename)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, contents)
}

function fixture(consumer, config = configuration) {
  const root = mkdtempSync(resolve(tmpdir(), 'orbit-turbo-inputs-'))
  fixtures.push(root)
  write(root, 'package.json', JSON.stringify({ name: 'cache-input-fixture', private: true, packageManager,
    workspaces: ['apps/*', 'packages/*', 'eslint-rules'] }))
  write(root, 'turbo.json', config)
  write(root, '.gitignore', '.turbo/\ncoverage/\nexecutions\n')
  for (const { workspace, name } of consumers) {
    write(root, `${workspace}/package.json`, JSON.stringify({ name, scripts: { test: 'node run.mjs' } }))
  }
  for (const input of consumer.inputs.filter((input) => input !== '.gitignore')) write(root, input, 'valid')
  const inputs = consumer.inputs.filter((input) => input !== '.gitignore')
  write(root, `${consumer.workspace}/run.mjs`, `
    import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
    import { resolve } from 'node:path'
    const root = resolve(${JSON.stringify(root)})
    appendFileSync(resolve(root, 'executions'), 'executed\\n')
    for (const input of ${JSON.stringify(inputs)}) {
      if (readFileSync(resolve(root, input), 'utf8') !== 'valid') {
        process.stderr.write('external input rejected: ' + input + '\\n')
        process.exit(1)
      }
    }
    mkdirSync('coverage', { recursive: true })
    writeFileSync('coverage/result.txt', 'covered')
  `)
  return root
}

function run(root, name) {
  return spawnSync(process.execPath, [turbo, 'run', 'test', `--filter=${name}`, '--cache=local:rw',
    '--cache-dir=.turbo/cache'], { cwd: root, encoding: 'utf8', timeout: 30_000,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TURBO_TELEMETRY_DISABLED: '1' } })
}

function expectRun(root, name, status, executions) {
  const result = run(root, name)
  expect(result.status, result.stdout + result.stderr).toBe(status)
  expect(readFileSync(resolve(root, 'executions'), 'utf8')).toBe('executed\n'.repeat(executions))
  return result
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true })
})

it('demonstrates stale success when workflow inputs are omitted', () => {
  const consumer = consumers[1]
  const root = fixture(consumer, JSON.stringify({ tasks: { test: { outputs: ['coverage/**'] } } }))
  expectRun(root, consumer.name, 0, 1)
  write(root, consumer.inputs[0], 'invalid')
  expectRun(root, consumer.name, 0, 1)
}, 30_000)

it('executes the shared guard again when another consumer task configuration changes', () => {
  const consumer = consumers[0]
  const root = fixture({ ...consumer, inputs: [] })
  symlinkSync(resolve(repository, 'node_modules'), resolve(root, 'node_modules'), 'junction')
  write(root, '.gitignore', '.turbo/\ncoverage/\nexecutions\nnode_modules/\n')
  write(root, `${consumer.workspace}/scripts/turbo-inputs.test.mjs`, readFileSync(import.meta.filename, 'utf8'))
  write(root, `${consumer.workspace}/vitest.config.mjs`, `
    export default { test: { maxWorkers: 1 } }
  `)
  write(root, `${consumer.workspace}/run.mjs`, `
    import { appendFileSync } from 'node:fs'
    import { spawnSync } from 'node:child_process'
    appendFileSync(${JSON.stringify(resolve(root, 'executions'))}, 'executed\\n')
    const result = spawnSync(process.execPath, [${JSON.stringify(resolve(root, 'node_modules/vitest/vitest.mjs'))},
      'run', 'scripts/turbo-inputs.test.mjs', '--config=vitest.config.mjs',
      '-t', '@orbit/desktop'], { stdio: 'inherit' })
    process.exit(result.status ?? 1)
  `)
  const initial = expectRun(root, consumer.name, 0, 1)
  expect(initial.stdout + initial.stderr).toContain('2 passed')
  expectRun(root, consumer.name, 0, 1)
  write(root, 'unrelated-root.txt', 'unrelated')
  expectRun(root, consumer.name, 0, 1)
  const changed = JSON.parse(configuration)
  changed.tasks['@orbit/desktop#test'].inputs = ['$TURBO_DEFAULT$']
  write(root, 'turbo.json', JSON.stringify(changed))
  const result = expectRun(root, consumer.name, 1, 2)
  expect(result.stdout + result.stderr).toContain('2 failed')
}, 60_000)

describe.each(consumers)('$name external test inputs', (consumer) => {
  it('retains valid hits and coverage, then executes every changed external input', () => {
    const root = fixture(consumer)
    expectRun(root, consumer.name, 0, 1)
    rmSync(resolve(root, consumer.workspace, 'coverage'), { recursive: true })
    expectRun(root, consumer.name, 0, 1)
    expect(readFileSync(resolve(root, consumer.workspace, 'coverage/result.txt'), 'utf8')).toBe('covered')
    write(root, 'unrelated-root.txt', 'unrelated')
    write(root, '.github/workflows/unrelated.yml', 'unrelated')
    expectRun(root, consumer.name, 0, 1)
    write(root, `${consumer.workspace}/local-source.ts`, 'export const changed = true')
    expectRun(root, consumer.name, 0, 2)
    let executions = 2
    for (const input of consumer.inputs) {
      const original = readFileSync(resolve(root, input), 'utf8')
      write(root, input, 'invalid')
      const result = expectRun(root, consumer.name, input === '.gitignore' ? 0 : 1, ++executions)
      if (input !== '.gitignore') expect(result.stdout + result.stderr).toContain(`external input rejected: ${input}`)
      write(root, input, original)
    }
    expectRun(root, consumer.name, 0, executions)
  }, 120_000)

  it('executes again when an external input is deleted', () => {
    const root = fixture(consumer)
    expectRun(root, consumer.name, 0, 1)
    rmSync(resolve(root, consumer.inputs[0]))
    expectRun(root, consumer.name, 1, 2)
  }, 30_000)
})
