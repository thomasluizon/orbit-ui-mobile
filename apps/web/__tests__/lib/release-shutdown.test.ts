import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const workflow = readFileSync(path.resolve(import.meta.dirname, '../../../../.github/workflows/release.yml'), 'utf8')
const directories: string[] = []

afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })))

function runDeployment(name: string, patchExitCode: number) {
  const directory = mkdtempSync(path.join(tmpdir(), 'release-shutdown-'))
  directories.push(directory)
  const step = workflow.split(`- name: ${name}\n`)[1]!.split('      - name:')[0]!
  const script = step.split('        run: |\n')[1]!.replaceAll(/^          /gm, '')
  const tracePath = path.join(directory, 'requests')
  writeFileSync(path.join(directory, 'curl'), `#!/bin/bash
printf '%s\\n' "$@" >> "$TRACE_PATH"
for argument in "$@"; do
  if [ "$argument" = PATCH ]; then exit "$PATCH_EXIT_CODE"; fi
done
exit 37
`, { mode: 0o755 })
  const result = spawnSync('/bin/bash', ['-c', script], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, TRACE_PATH: tracePath,
      PATCH_EXIT_CODE: String(patchExitCode), SERVICE_ID: 'service-under-test',
      RENDER_API_KEY: 'test-credential', IMAGE: 'image-under-test', DIGEST: 'digest-under-test' },
  })
  return { result, requests: readFileSync(tracePath, 'utf8').split('\n') }
}

describe('web release shutdown window', () => {
  it.each(['Deploy web digest', 'Deploy staging web digest'])('configures the drain window before %s', name => {
    const { result, requests } = runDeployment(name, 0)
    expect(requests.indexOf('PATCH')).toBeGreaterThan(-1)
    expect(requests.indexOf('POST')).toBeGreaterThan(requests.indexOf('PATCH'))
    const body = requests[requests.indexOf('-d') + 1]!
    expect(JSON.parse(body)).toEqual({ serviceDetails: { maxShutdownDelaySeconds: 300 } })
    expect(result.status).toBe(37)
  })

  it.each(['Deploy web digest', 'Deploy staging web digest'])('stops %s when configuring the window fails', name => {
    const { result, requests } = runDeployment(name, 23)
    expect(result.status).toBe(23)
    expect(requests).not.toContain('POST')
  })
})
