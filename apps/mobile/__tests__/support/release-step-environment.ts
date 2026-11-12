import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

export interface DeploymentRecord { task: string; sha: string; payload: Record<string, unknown> }
export type DeploymentEnvironment = 'staging' | 'production'
export type StubDeployments = Partial<Record<DeploymentEnvironment, { android: DeploymentRecord[]; ios: DeploymentRecord[] }>>
export interface StubWrite { path: string; payload: Record<string, unknown> }

const producedAndroidRecord = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../tools/__tests__/android-deployment-fixture.json', import.meta.url)), 'utf8'),
).deployment as DeploymentRecord

export const deploymentRecord = (version: string, task = 'android-release'): DeploymentRecord => ({
  ...producedAndroidRecord,
  task,
  payload: { ...producedAndroidRecord.payload, app_version: version },
})

const stubSource = `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const args = process.argv.slice(2)
const refuse = () => { console.error('unexpected gh call: ' + args.join(' ')); process.exit(9) }
const path = args.find((argument) => argument.startsWith('repos/'))
if (args[0] !== 'api' || !path) refuse()
if (args.includes('POST')) {
  appendFileSync(join(__dirname, 'writes.jsonl'), JSON.stringify({ path, payload: JSON.parse(readFileSync(0, 'utf8')) }) + '\\n')
  process.stdout.write(JSON.stringify({ id: 77 }))
} else {
  const query = new URLSearchParams(path.split('?')[1])
  const platform = { 'android-release': 'android', 'ios-release': 'ios' }[query.get('task')]
  const records = JSON.parse(readFileSync(join(__dirname, 'responses.json'), 'utf8'))[query.get('environment')]?.[platform]
  if (!records) refuse()
  process.stdout.write(JSON.stringify(query.has('sha') ? records.filter((record) => record.sha === query.get('sha')) : records))
}
`

/**
 * Writes an executable `gh` into `directory` that answers deployment calls offline.
 * A read returns only the records of the `task` and the `environment` the call names; an environment
 * the test did not supply fails the call. A write returns id 77, and `readStubWrites` lists every write.
 */
export function writeGitHubStub(directory: string, deployments: StubDeployments) {
  writeFileSync(join(directory, 'responses.json'), JSON.stringify(deployments))
  writeFileSync(join(directory, 'gh'), stubSource, { mode: 0o755 })
}

export function readStubWrites(directory: string): StubWrite[] {
  const log = join(directory, 'writes.jsonl')
  if (!existsSync(log)) return []
  return readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as StubWrite)
}

/**
 * Builds the environment GitHub Actions gives a step: every key the step declares in `env:`,
 * and nothing else. An input the caller leaves empty still arrives as an empty string.
 * A declared key without a supplied value throws, so a new step variable cannot go untested.
 */
export function declaredStepEnvironment(step: { env?: Record<string, string> }, values: Record<string, string>) {
  const declared = Object.keys(step.env ?? {})
  const missing = declared.filter((key) => !(key in values))
  if (missing.length > 0) throw new Error(`The step declares ${missing.join(', ')} but the test supplies no value`)
  return Object.fromEntries(declared.map((key) => [key, values[key]!]))
}
