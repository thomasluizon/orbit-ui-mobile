import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { load } = require('js-yaml') as { load: (source: string) => Workflow }
interface Step { name?: string; run?: string }
interface Workflow {
  on: Record<string, unknown>
  concurrency: { 'cancel-in-progress': boolean }
  jobs: Record<string, { needs?: string; steps: Step[]; strategy?: { matrix: { include: { target: string }[] } } }>
}
const workflow = load(readFileSync(new URL('../../../.github/workflows/desktop-release.yml', import.meta.url), 'utf8'))
const publish = workflow.jobs.publish!.steps.find((step) => step.name === 'Publish versioned artifacts before advancing the channel')!.run!
const directories: string[] = []
// WHY: The publisher runs on Ubuntu; these cases execute that workflow's Bash script.
const publicationTest = it.skipIf(process.platform === 'win32')
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })))

function publishAttempt(previous: string | null, failVersion = false, failFirstLookup = false) {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-desktop-publish-'))
  directories.push(directory)
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
if (args[1] === 'create' && args[2] === 'desktop-staging' && process.env.PREVIOUS_VERSION) process.exit(1)
`)
  chmodSync(executable, 0o755)
  const log = join(directory, 'commands.jsonl')
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', publish], {
    cwd: fileURLToPath(new URL('../../..', import.meta.url)),
    encoding: 'utf8',
    env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, RUNNER_TEMP: directory,
      DESKTOP_VARIANT: 'staging', DESKTOP_VERSION: '2.0.0', GITHUB_SHA: 'a'.repeat(40),
      GITHUB_REPOSITORY: 'thomasluizon/orbit-ui-mobile', PREVIOUS_VERSION: previous ?? '',
      FAIL_VERSION: String(failVersion), FAIL_FIRST_LOOKUP: String(failFirstLookup), COMMAND_LOG: log },
  })
  const commands = readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as string[])
  return { result, commands }
}

it('dispatches only manually, serializes each channel and requires every target before publication', () => {
  expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch'])
  expect(workflow.concurrency['cancel-in-progress']).toBe(false)
  expect(workflow.jobs.build!.needs).toBe('validate')
  expect(workflow.jobs.publish!.needs).toBe('build')
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
