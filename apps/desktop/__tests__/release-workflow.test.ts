import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import vector from '../__fixtures__/signer-vector.json'
import published from '../__fixtures__/channel-staging.json'
import { artifactName, targets } from '../scripts/release.ts'

// WHY: Publication runs several real Git and Node processes; allow startup headroom on shared hosts (#1964).
vi.setConfig({ testTimeout: 30_000 })

const require = createRequire(import.meta.url)
const { load } = require('js-yaml') as { load: (source: string) => Workflow }
interface Step { name?: string; run?: string; if?: string; env?: Record<string, string> }
interface Workflow {
  on: Record<string, unknown>
  concurrency: { 'cancel-in-progress': boolean }
  jobs: Record<string, { needs?: string | string[]; if?: string; outputs?: Record<string, string>; env?: Record<string, string>; steps: Step[]; 'timeout-minutes'?: number | string; strategy?: { matrix: { include: { runner: string; target: string; timeout: number }[] } } }>
}
const workflow = load(readFileSync(new URL('../../../.github/workflows/desktop-release.yml', import.meta.url), 'utf8'))
const publish = workflow.jobs.publish!.steps.find((step) => step.name === 'Publish versioned artifacts before advancing the channel')!.run!
const directories: string[] = []
// WHY: The publisher runs on Ubuntu; these cases execute that workflow's Bash script.
const publicationTest = it.skipIf(process.platform === 'win32')
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })))

publicationTest.each([
  { variant: 'production', admitted: true, force: false, allowed: true },
  { variant: 'production', admitted: false, force: false, allowed: false },
  { variant: 'production', admitted: false, force: true, allowed: true },
  { variant: 'staging', admitted: false, force: false, allowed: true },
])('gates dispatch planning for $variant with admission $admitted and override $force', ({ variant, admitted, force, allowed }) => {
  const planning = workflow.jobs.validate!.steps.find(step => step.name === 'Plan shell publication')!
  const guard = planning.run!.slice(0, planning.run!.indexOf('node --experimental-strip-types'))
  const result = spawnSync('bash', ['-c', guard], { encoding: 'utf8', env: {
    ...process.env, DESKTOP_VARIANT: variant, EVENT_NAME: 'workflow_dispatch',
    FORCE_UNSTAGED: String(force), STAGING_ADMITTED: String(admitted), GITHUB_REF: 'refs/heads/main',
  } })
  expect(result.status, result.stdout + result.stderr).toBe(allowed ? 0 : 1)
  if (!allowed) expect(result.stdout).toContain('Direct production dispatch requires force_unstaged')
})

function publishAttempt(previous: string | null, failVersion = false, failFirstLookup = false, variant = 'staging', failDownload = false, failure: 'manifest' | 'tampered-previous' | 'unsigned-previous' | 'wrong-key' | 'tag' | 'lineage' | null = null) {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-desktop-publish-'))
  directories.push(directory)
  cpSync(fileURLToPath(new URL('../scripts', import.meta.url)), join(directory, 'apps/desktop/scripts'), { recursive: true })
  if (variant === 'production') {
    mkdirSync(join(directory, 'desktop-assets'))
    for (const target of Object.keys(targets)) {
      const name = artifactName(variant, vector.version, target).replace('.app.tar.gz', '.dmg')
      writeFileSync(join(directory, 'desktop-assets', name), vector.payload)
      writeFileSync(join(directory, 'desktop-assets', `${name}.sig`), vector.artifacts[name as keyof typeof vector.artifacts])
    }
  }
  const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', env: {
    ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  } }).trim()
  git('init', '--quiet')
  const tree = git('mktree')
  const ancestor = git('commit-tree', tree, '-m', 'ancestor')
  const descendant = git('commit-tree', tree, '-p', ancestor, '-m', 'descendant')
  const source = failure === 'lineage' ? ancestor : descendant
  git('update-ref', 'HEAD', source)
  if (previous) git('tag', `desktop-${variant}-v${previous}`, descendant)
  if (failure === 'tag') git('tag', `desktop-${variant}-v${vector.version}`, source)
  const previousVector = vector.channels[`${variant}-${previous}` as keyof typeof vector.channels]
  const executable = join(directory, 'gh')
  writeFileSync(executable, `#!/usr/bin/env node
const { appendFileSync, readFileSync, writeFileSync } = require('node:fs')
const args = process.argv.slice(2)
appendFileSync(process.env.COMMAND_LOG, JSON.stringify(args) + '\\n')
if (args[0] === 'api') {
  const status = process.env.FAIL_FIRST_LOOKUP === 'true' ? 500 : process.env.PREVIOUS_VERSION ? 200 : 404
  process.stdout.write('HTTP/2.0 ' + status + ' response\\r\\nContent-Type: application/json\\r\\n\\r\\n{}')
  process.exit(status === 200 ? 0 : 1)
}
if (args[1] === 'download') {
  const signature = args[args.indexOf('--pattern') + 1].endsWith('.sig')
  if (signature && process.env.FAILURE === 'unsigned-previous') process.exit(1)
  const value = signature ? process.env.PREVIOUS_SIGNATURE : process.env.PREVIOUS_MANIFEST
  writeFileSync(args[args.indexOf('--output') + 1], !signature && process.env.FAILURE === 'tampered-previous' ? '{"version":"1.0.0"}' : value)
}
if (args[1] === 'upload' && args.includes('desktop-assets/latest.json') && process.env.FAILURE === 'manifest') process.exit(1)
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
      DESKTOP_VARIANT: variant, DESKTOP_VERSION: vector.version, SOURCE_SHA: source, GITHUB_SHA: 'a'.repeat(40),
      GITHUB_REPOSITORY: 'thomasluizon/orbit-ui-mobile', PREVIOUS_VERSION: previous ?? '',
      TAURI_SIGNING_PUBLIC_KEY: failure === 'wrong-key' ? published.publicKey : vector.publicKey, FAILURE: failure ?? '',
      PREVIOUS_MANIFEST: previousVector?.manifest ?? '', PREVIOUS_SIGNATURE: previousVector?.signature ?? '', FAIL_DOWNLOAD: String(failDownload),
      FAIL_VERSION: String(failVersion), FAIL_FIRST_LOOKUP: String(failFirstLookup), COMMAND_LOG: log },
  })
  const commands = readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as string[])
  return { result, commands, directory, source }
}

publicationTest.each(['1.9.0', null])('publishes fixed production downloads and checksums after the manifest with previous %s', (previous) => {
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
  expect(commands.indexOf(downloads!)).toBeGreaterThan(commands.indexOf(manifestWrite))
  expect(downloads!.some(path => path.endsWith('SHA256SUMS'))).toBe(true)
})

publicationTest('publishes no fixed download if the manifest upload fails', () => {
  const { result, commands } = publishAttempt('1.9.0', false, false, 'production', false, 'manifest')
  expect(result.status).not.toBe(0)
  expect(commands.some(command => command[1] === 'upload' && command.some(arg => arg.endsWith('.dmg')))).toBe(false)
})

it('supports pinned automatic releases and requires every target before publication', () => {
  expect(Object.keys(workflow.on).sort()).toEqual(['workflow_call', 'workflow_dispatch'])
  expect(workflow.jobs.validate!.steps.some(step => step.name === 'Plan shell publication')).toBe(true)
  expect(workflow.concurrency['cancel-in-progress']).toBe(false)
  expect(workflow.jobs.build!.needs).toBe('validate')
  expect(workflow.jobs.publish!.needs).toEqual(['validate', 'build'])
  expect(workflow.jobs.validate!.outputs).toEqual({
    shell_changed: '${{ steps.plan.outputs.shell_changed }}',
    advance_channel: '${{ steps.plan.outputs.advance_channel }}',
    version: '${{ steps.plan.outputs.version }}',
  })
  expect(workflow.jobs.build!.if).toBe("needs.validate.outputs.shell_changed == 'true'")
  expect(workflow.jobs.publish!.if).toBe("needs.validate.outputs.advance_channel == 'true'")
  expect(workflow.jobs.ready!.env).toMatchObject({ ADVANCE_CHANNEL: '${{ needs.validate.outputs.advance_channel }}' })
  expect(workflow.jobs.build!.strategy!.matrix.include.map((entry) => entry.target).sort()).toEqual([
    'aarch64-apple-darwin', 'aarch64-pc-windows-msvc', 'x86_64-apple-darwin', 'x86_64-pc-windows-msvc',
  ])
  expect(workflow.jobs.build!['timeout-minutes']).toBe('${{ matrix.timeout }}')
  expect(Object.fromEntries(workflow.jobs.build!.strategy!.matrix.include.map((entry) => [entry.target, entry.timeout]))).toEqual({
    'aarch64-apple-darwin': 120, 'x86_64-apple-darwin': 120, 'aarch64-pc-windows-msvc': 35, 'x86_64-pc-windows-msvc': 35,
  })
})

publicationTest('publishes artifacts before advancing an existing channel, with its manifest last', () => {
  const { result, commands, source } = publishAttempt('1.9.0')
  expect(result.status, result.stderr).toBe(0)
  const writes = commands.filter((command) => ['create', 'upload'].includes(command[1]!))
  expect(writes.map((command) => command.slice(1, 4))).toEqual([
    ['create', 'desktop-staging-v2.0.0', 'desktop-assets/*'],
    ['upload', 'desktop-staging', 'desktop-assets/latest.json.sig'],
    ['upload', 'desktop-staging', 'desktop-assets/latest.json'],
  ])
  expect(writes[0]![writes[0]!.indexOf('--target') + 1]).toBe(source)
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
  expect(commands.some(command => command[1] === 'upload' || (command[1] === 'create' && command[2] === 'desktop-staging'))).toBe(false)
})

publicationTest.each(['2.0.0', '2.1.0'])('does not publish or overwrite version %s', (version) => {
  const { result, commands } = publishAttempt(version)
  expect(result.status).not.toBe(0)
  expect(commands.some((command) => ['create', 'upload'].includes(command[1]!))).toBe(false)
})

publicationTest('cannot skip the version gate when a channel lookup fails transiently', () => {
  const { result, commands } = publishAttempt('3.0.0', false, true)
  expect(result.status).not.toBe(0)
  expect(commands.some((command) => ['create', 'upload'].includes(command[1]!))).toBe(false)
})

publicationTest.each([
  { plan: 'success', changed: 'false', advance: 'false', build: 'skipped', publish: 'skipped', accepted: true },
  { plan: 'success', changed: 'true', advance: 'true', build: 'success', publish: 'success', accepted: true },
  { plan: 'success', changed: 'true', advance: 'false', build: 'success', publish: 'skipped', accepted: true },
  { plan: 'failure', changed: '', advance: '', build: 'skipped', publish: 'skipped', accepted: false },
  { plan: 'success', changed: 'true', advance: 'true', build: 'failure', publish: 'skipped', accepted: false },
  { plan: 'success', changed: 'true', advance: 'true', build: 'success', publish: 'failure', accepted: false },
  { plan: 'success', changed: 'true', advance: 'true', build: 'success', publish: 'cancelled', accepted: false },
  { plan: 'success', changed: 'true', advance: 'true', build: 'skipped', publish: 'skipped', accepted: false },
  { plan: 'success', changed: 'true', advance: 'true', build: 'success', publish: 'skipped', accepted: false },
  { plan: 'success', changed: 'true', advance: 'false', build: 'failure', publish: 'skipped', accepted: false },
  { plan: 'success', changed: 'true', advance: 'false', build: 'success', publish: 'success', accepted: false },
  { plan: 'success', changed: 'false', advance: 'true', build: 'skipped', publish: 'skipped', accepted: false },
])('admits web only after a valid desktop result: $plan/$changed/$advance/$build/$publish', ({ plan, changed, advance, build, publish, accepted }) => {
  const script = workflow.jobs.ready!.steps.find(step => step.name === 'Require completed desktop admission')!.run!
  const result = spawnSync('bash', ['-c', script], { env: { ...process.env,
    PLAN_RESULT: plan, SHELL_CHANGED: changed, ADVANCE_CHANNEL: advance, BUILD_RESULT: build, PUBLISH_RESULT: publish } })
  expect(result.status === 0).toBe(accepted)
})

publicationTest.each([
  ['tampered-previous', 'verification failed'], ['unsigned-previous', 'Command failed'],
  ['wrong-key', 'configured key'], ['tag', 'tag already exists'], ['lineage', 'must descend'],
] as const)('refuses %s before any release mutation', (failure, message) => {
  const { result, commands } = publishAttempt('1.9.0', false, false, 'staging', false, failure)
  expect(result.status).not.toBe(0)
  if (failure !== 'unsigned-previous') expect(result.stderr).toContain(message)
  expect(commands.some(command => ['create', 'upload'].includes(command[1]!))).toBe(false)
})

it('requires the explicit monotonic gate and keeps private signing secrets out of validation', () => {
  expect(publish).toContain('scripts/release.ts newer')
  expect(JSON.stringify(workflow.jobs.validate)).not.toContain('TAURI_SIGNING_PRIVATE_KEY')
  const planning = workflow.jobs.validate!.steps.find(step => step.name === 'Plan shell publication')!.run!
  expect(planning).toContain('STAGING_ADMITTED')
  const plan = workflow.jobs.validate!.steps.find(step => step.name === 'Plan shell publication')!
  expect(plan.env!.STAGING_ADMITTED).toBe('${{ inputs.staging_admitted }}')
  expect(workflow.on).toMatchObject({ workflow_call: { inputs: { staging_admitted: { type: 'boolean', default: false } } } })
  expect((workflow.on.workflow_dispatch as { inputs: Record<string, unknown> }).inputs).not.toHaveProperty('staging_admitted')
  expect(planning).toContain('FORCE_UNSTAGED')
})
