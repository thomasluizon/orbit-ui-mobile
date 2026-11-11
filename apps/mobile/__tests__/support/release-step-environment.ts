import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

export interface DeploymentRecord { task: string; payload: Record<string, unknown> }

const producedAndroidRecord = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../tools/__tests__/android-deployment-fixture.json', import.meta.url)), 'utf8'),
).deployment as DeploymentRecord

export const deploymentRecord = (version: string, task = 'android-release'): DeploymentRecord => ({
  ...producedAndroidRecord,
  task,
  payload: { ...producedAndroidRecord.payload, app_version: version },
})

/** Writes an executable `gh` into `directory` that answers the two deployment reads offline. */
export function writeGitHubStub(directory: string, deployments: { android: DeploymentRecord[]; ios: DeploymentRecord[] }) {
  writeFileSync(join(directory, 'responses.json'), JSON.stringify(deployments))
  writeFileSync(join(directory, 'gh'), [
    '#!/bin/sh',
    'case "$*" in',
    `  *"task=android-release"*) node -e 'process.stdout.write(JSON.stringify(require(process.argv[1]).android))' "${directory}/responses.json" ;;`,
    `  *"task=ios-release"*) node -e 'process.stdout.write(JSON.stringify(require(process.argv[1]).ios))' "${directory}/responses.json" ;;`,
    '  *) echo "unexpected gh call: $*" >&2; exit 9 ;;',
    'esac',
  ].join('\n'))
  chmodSync(join(directory, 'gh'), 0o755)
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
