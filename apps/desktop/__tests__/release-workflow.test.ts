import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import vector from '../__fixtures__/signer-vector.json'
import { artifactName, targets } from '../scripts/release.ts'

const require = createRequire(import.meta.url)
const { load } = require('js-yaml') as { load: (source: string) => Workflow }
interface Step { name?: string; run?: string; if?: string }
interface Workflow {
  on: Record<string, unknown>
  concurrency: { 'cancel-in-progress': boolean }
  jobs: Record<string, { needs?: string | string[]; steps: Step[]; strategy?: { matrix: { include: { target: string }[] } } }>
}
const workflow = load(readFileSync(new URL('../../../.github/workflows/desktop-release.yml', import.meta.url), 'utf8'))
const publish = workflow.jobs.publish!.steps.find((step) => step.name === 'Publish versioned artifacts before advancing the channel')!.run!
const directories: string[] = []
// WHY: The publisher runs on Ubuntu; these cases execute that workflow's Bash script.
const publicationTest = it.skipIf(process.platform === 'win32')
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })))

function publishAttempt(previous: string | null, failVersion = false, failFirstLookup = false, variant = 'staging', failDownload = false) {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-desktop-publish-'))
  directories.push(directory)
  cpSync(fileURLToPath(new URL('../scripts', import.meta.url)), join(directory, 'apps/desktop/scripts'), { recursive: true })
  if (variant === 'production') {
    mkdirSync(join(directory, 'desktop-assets'))
    for (const target of Object.keys(targets)) {
      const name = artifactName(variant, vector.version, target).replace('.app.tar.gz', '.dmg')
      writeFileSync(join(directory, 'desktop-assets', name), vector.payload)
      writeFileSync(join(directory, 'desktop-assets', `${name}.sig`), vector.signature)
    }
  }
  const executable = join(directory, 'gh')
  writeFileSync(executable, `#!/usr/bin/env node
const { appendFileSync, readFileSync, writeFileSync } = require('node:fs')
const args = process.argv.slice(2)
appendFileSync(process.env.COMMAND_LOG, JSON.stringify(args) + '\\n')
if (args[1] === 'view') {
  const lookups = readFileSync(process.env.COMMAND_LOG, 'utf8').trim().split('\\n').map(JSON.parse).filter(command => command[1] === 'view')
  if (process.env.FAIL_FIRST_LOOKUP === 'true' && lookups.length === 1) process.exit(1)
  process.exit(process.env.PREVIOUS_VERSION ? 0 : 1)
}
if (args[1] === 'download') writeFileSync(args[args.indexOf('--output') + 1], JSON.stringify({version: process.env.PREVIOUS_VERSION}))
if (args[1] === 'create' && args[2].includes('-v') && process.env.FAIL_VERSION === 'true') process.exit(1)
if (args[1] === 'upload' && args.some(arg => arg.endsWith('.dmg')) && process.env.FAIL_DOWNLOAD === 'true') process.exit(1)
if (args[1] === 'create' && args[2] === 'desktop-' + process.env.DESKTOP_VARIANT && process.env.PREVIOUS_VERSION) process.exit(1)
`)
  chmodSync(executable, 0o755)
  const log = join(directory, 'commands.jsonl')
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', publish], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, RUNNER_TEMP: directory,
      DESKTOP_VARIANT: variant, DESKTOP_VERSION: vector.version, SOURCE_SHA: 'b'.repeat(40), GITHUB_SHA: 'a'.repeat(40),
      GITHUB_REPOSITORY: 'thomasluizon/orbit-ui-mobile', PREVIOUS_VERSION: previous ?? '',
      TAURI_SIGNING_PUBLIC_KEY: vector.publicKey, FAIL_DOWNLOAD: String(failDownload),
      FAIL_VERSION: String(failVersion), FAIL_FIRST_LOOKUP: String(failFirstLookup), COMMAND_LOG: log },
  })
  const commands = readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as string[])
  return { result, commands, directory }
}

publicationTest.each(['1.9.0', null])('publishes four fixed production downloads before the manifest with previous %s', (previous) => {
  const { result, commands } = publishAttempt(previous, false, false, 'production')
  expect(result.status, result.stderr).toBe(0)
  const downloads = commands.find(command => command[1] === 'upload' && command.some(arg => arg.endsWith('.dmg')))
  expect(downloads).toBeDefined()
  expect(downloads![2]).toBe('desktop-production')
  expect(downloads).toContain('--clobber')
  const paths = downloads!.filter(arg => /\.(dmg|exe)$/.test(arg))
  expect(paths.map(path => path.split('/').at(-1)).sort()).toEqual([
    'orbit-aarch64-apple-darwin.dmg', 'orbit-aarch64-pc-windows-msvc.exe',
    'orbit-x86_64-apple-darwin.dmg', 'orbit-x86_64-pc-windows-msvc.exe',
  ])
  for (const path of paths) expect(readFileSync(path, 'utf8')).toBe(vector.payload)
  const manifestWrite = commands.find(command => ['create', 'upload'].includes(command[1]!) && command.includes('desktop-assets/latest.json'))!
  expect(commands.indexOf(downloads!)).toBeLessThan(commands.indexOf(manifestWrite))
})

publicationTest('keeps the production manifest untouched if fixed download publication fails', () => {
  const { result, commands } = publishAttempt('1.9.0', false, false, 'production', true)
  expect(result.status).not.toBe(0)
  expect(commands.some(command => command[1] === 'upload' && command.includes('desktop-assets/latest.json'))).toBe(false)
})

publicationTest.each([
  { variant: 'production', runner: 'macOS', dmg: true },
  { variant: 'staging', runner: 'macOS', dmg: false },
  { variant: 'production', runner: 'Windows', dmg: false },
])('requests DMGs only for $variant on $runner', ({ variant, runner, dmg }) => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-desktop-package-'))
  directories.push(directory)
  const log = join(directory, 'arguments.json')
  const executable = join(directory, 'npm')
  writeFileSync(executable, `#!/usr/bin/env node
require('node:fs').writeFileSync(process.env.COMMAND_LOG, JSON.stringify(process.argv.slice(2)))
`)
  chmodSync(executable, 0o755)
  const script = workflow.jobs.build!.steps.find(step => step.name === 'Package without operating system or updater signing')!.run!
  const result = spawnSync('bash', ['-e', '-c', script], { encoding: 'utf8', env: { ...process.env,
    PATH: `${directory}:${process.env.PATH}`, COMMAND_LOG: log, DESKTOP_VARIANT: variant,
    RUNNER_OS: runner, DESKTOP_TARGET: runner === 'macOS' ? 'aarch64-apple-darwin' : 'x86_64-pc-windows-msvc' } })
  expect(result.status, result.stderr).toBe(0)
  const args = JSON.parse(readFileSync(log, 'utf8')) as string[]
  expect(args).toContain(`build:${variant}`)
  expect(args).toContain('--no-sign')
  expect(args.includes('--bundles')).toBe(dmg)
  if (dmg) expect(args[args.indexOf('--bundles') + 1]).toBe('app,dmg')
  const collection = workflow.jobs.build!.steps.find(step => step.name === 'Collect the production DMG')!
  expect(collection.if).toBe("inputs.variant == 'production' && runner.os == 'macOS'")
  expect(collection.run).toContain('apps/desktop/scripts/downloads.ts collect-dmg')
})

it('supports pinned automatic releases and requires every target before publication', () => {
  expect(Object.keys(workflow.on).sort()).toEqual(['workflow_call', 'workflow_dispatch'])
  expect(workflow.jobs.validate!.steps.some(step => step.name === 'Plan shell publication')).toBe(true)
  expect(workflow.concurrency['cancel-in-progress']).toBe(false)
  expect(workflow.jobs.build!.needs).toBe('validate')
  expect(workflow.jobs.publish!.needs).toEqual(['validate', 'build'])
  expect(workflow.jobs.build!.strategy!.matrix.include.map((entry) => entry.target).sort()).toEqual([
    'aarch64-apple-darwin', 'aarch64-pc-windows-msvc', 'x86_64-apple-darwin', 'x86_64-pc-windows-msvc',
  ])
})

publicationTest('publishes artifacts before advancing an existing channel, with its manifest last', () => {
  const { result, commands } = publishAttempt('1.9.0')
  expect(result.status, result.stderr).toBe(0)
  const writes = commands.filter((command) => ['create', 'upload'].includes(command[1]!))
  expect(writes.map((command) => command.slice(1, 4))).toEqual([
    ['create', 'desktop-staging-v2.0.0', 'desktop-assets/*'],
    ['upload', 'desktop-staging', 'desktop-assets/latest.json.sig'],
    ['upload', 'desktop-staging', 'desktop-assets/latest.json'],
  ])
  expect(writes[0]![writes[0]!.indexOf('--target') + 1]).toBe('b'.repeat(40))
})

publicationTest('creates the first public channel only after its artifact release exists', () => {
  const { result, commands } = publishAttempt(null)
  expect(result.status, result.stderr).toBe(0)
  expect(commands.filter((command) => command[1] === 'create').map((command) => command[2])).toEqual([
    'desktop-staging-v2.0.0', 'desktop-staging',
  ])
})

publicationTest('leaves the channel untouched if publishing the version fails', () => {
  const { result, commands } = publishAttempt('1.9.0', true)
  expect(result.status).not.toBe(0)
  expect(commands.some((command) => command[1] === 'upload')).toBe(false)
})

publicationTest.each(['2.0.0', '2.1.0'])('does not publish or overwrite version %s', (version) => {
  const { result, commands } = publishAttempt(version)
  expect(result.status).not.toBe(0)
  expect(commands.some((command) => ['create', 'upload'].includes(command[1]!))).toBe(false)
})

publicationTest('cannot skip the version gate when a channel lookup fails transiently', () => {
  const { result, commands } = publishAttempt('3.0.0', false, true)
  expect(result.status).not.toBe(0)
  expect(commands.some((command) => command[1] === 'upload')).toBe(false)
})

publicationTest.each([
  { plan: 'success', changed: 'false', build: 'skipped', publish: 'skipped', accepted: true },
  { plan: 'success', changed: 'true', build: 'success', publish: 'success', accepted: true },
  { plan: 'failure', changed: '', build: 'skipped', publish: 'skipped', accepted: false },
  { plan: 'success', changed: 'true', build: 'failure', publish: 'skipped', accepted: false },
  { plan: 'success', changed: 'true', build: 'success', publish: 'failure', accepted: false },
  { plan: 'success', changed: 'true', build: 'success', publish: 'cancelled', accepted: false },
  { plan: 'success', changed: 'true', build: 'skipped', publish: 'skipped', accepted: false },
])('admits web only after a valid desktop result: $plan/$changed/$build/$publish', ({ plan, changed, build, publish, accepted }) => {
  const script = workflow.jobs.ready!.steps.find(step => step.name === 'Require completed desktop admission')!.run!
  const result = spawnSync('bash', ['-c', script], { env: { ...process.env,
    PLAN_RESULT: plan, SHELL_CHANGED: changed, BUILD_RESULT: build, PUBLISH_RESULT: publish } })
  expect(result.status === 0).toBe(accepted)
})
