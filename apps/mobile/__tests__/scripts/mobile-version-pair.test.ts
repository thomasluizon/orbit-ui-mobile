import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { parse } from 'yaml'
import { afterEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { declaredStepEnvironment, deploymentRecord as record, writeGitHubStub } from '../support/release-step-environment'

const require = createRequire(import.meta.url)
const script = fileURLToPath(new URL('../../scripts/mobile-version-pair.js', import.meta.url))
const pair = require('../../scripts/mobile-version-pair.js') as {
  bumpPatch: (version: string) => string
  checkVersionPair: (input: Record<string, unknown>) => { allowed: boolean; platformOnly: boolean; message: string }
  compareVersions: (left: string, right: string) => number
  newestVersion: (deployments: unknown) => string | null
  planVersions: (newest: { android: string | null; ios: string | null }) => Record<string, unknown>
  recordIosDeployment: (input: Record<string, unknown>) => number
}

const sha = 'a'.repeat(40)
const check = (overrides: Record<string, unknown>) =>
  pair.checkVersionPair({
    platform: 'ios',
    appVersion: '1.3.153',
    platformOnlyReason: '',
    platformNewest: '1.3.152',
    siblingNewest: '1.3.153',
    ...overrides,
  })

describe('version arithmetic', () => {
  it('compares each numeric segment, not text', () => {
    expect(pair.compareVersions('1.3.152', '1.3.9')).toBe(1)
    expect(pair.compareVersions('1.3.9', '1.4.0')).toBe(-1)
    expect(pair.compareVersions('1.3.152', '1.3.152')).toBe(0)
  })

  it('rejects a version that is not major.minor.patch', () => {
    expect(() => pair.compareVersions('1.3', '1.3.1')).toThrow('Invalid version')
  })

  it('bumps the last segment by one', () => {
    expect(pair.bumpPatch('1.3.152')).toBe('1.3.153')
  })

  it('reads the highest recorded version from real deployment records', () => {
    expect(pair.newestVersion([record('1.3.9'), record('1.3.152'), record('1.3.151')])).toBe('1.3.152')
    expect(pair.newestVersion([])).toBeNull()
  })

  it('fails closed on a record without a version', () => {
    expect(() => pair.newestVersion([{ ...record('1.3.152'), payload: {} }])).toThrow('Invalid version')
    expect(() => pair.newestVersion({})).toThrow('unexpected deployments response')
  })
})

describe('version pair rules', () => {
  it('lets iOS mirror the newest Android version', () => {
    expect(check({})).toMatchObject({ allowed: true, platformOnly: false })
  })

  it.each(['1.3.152', '1.3.154', '1.4.0'])('refuses iOS %s when Android is at 1.3.153', (appVersion) => {
    const decision = check({ appVersion, platformNewest: '1.3.151' })
    expect(decision.allowed).toBe(false)
    expect(decision.message).toContain('differs from the newest Android version 1.3.153')
  })

  it('refuses iOS when no Android release exists to mirror', () => {
    expect(check({ siblingNewest: null }).allowed).toBe(false)
  })

  it('lets Android start a new shared version above both platforms', () => {
    expect(check({ platform: 'android', appVersion: '1.3.154', platformNewest: '1.3.153', siblingNewest: '1.3.153' }).allowed).toBe(true)
  })

  it('lets Android release before any iOS record exists', () => {
    expect(check({ platform: 'android', appVersion: '1.3.153', platformNewest: '1.3.152', siblingNewest: null }).allowed).toBe(true)
  })

  it('refuses Android below the newest iOS version without a reason', () => {
    const decision = check({ platform: 'android', appVersion: '1.3.153', platformNewest: '1.3.152', siblingNewest: '1.3.154' })
    expect(decision.allowed).toBe(false)
    expect(decision.message).toContain('older than the newest iOS version 1.3.154')
  })

  it('refuses a platform that moves below its own newest release, even with a reason', () => {
    const decision = check({ platform: 'android', appVersion: '1.3.150', platformNewest: '1.3.152', platformOnlyReason: 'crash on Android 9' })
    expect(decision.allowed).toBe(false)
    expect(decision.message).toContain('older than its newest release')
  })

  it('allows a version that differs only with a platform-only reason, and records it', () => {
    const decision = check({ appVersion: '1.3.155', platformOnlyReason: 'Keychain defect on iOS 18' })
    expect(decision).toMatchObject({ allowed: true, platformOnly: true })
    expect(decision.message).toContain('Keychain defect on iOS 18')
  })

  it('treats a blank reason as no reason', () => {
    expect(check({ appVersion: '1.3.155', platformOnlyReason: '   ' }).allowed).toBe(false)
  })
})

describe('shared release plan', () => {
  it('names the lagging platform and the next shared version', () => {
    expect(pair.planVersions({ android: '1.3.153', ios: '1.3.152' })).toMatchObject({
      inStep: false, laggingPlatform: 'ios', nextVersion: '1.3.154',
    })
    expect(pair.planVersions({ android: '1.3.152', ios: '1.3.153' })).toMatchObject({ laggingPlatform: 'android', nextVersion: '1.3.154' })
    expect(pair.planVersions({ android: '1.3.152', ios: '1.3.152' })).toMatchObject({ inStep: true, laggingPlatform: null, nextVersion: '1.3.153' })
    expect(pair.planVersions({ android: '1.3.152', ios: null })).toMatchObject({ laggingPlatform: 'ios', nextVersion: '1.3.153' })
    expect(pair.planVersions({ android: null, ios: null })).toMatchObject({ nextVersion: null })
  })
})

describe('iOS deployment record', () => {
  it('creates the deployment and marks it successful', () => {
    const calls: { path: string; payload: Record<string, unknown> }[] = []
    const run = (path: string, payload: Record<string, unknown>) => {
      calls.push({ path, payload })
      return { id: 77 }
    }
    const id = pair.recordIosDeployment({
      environment: 'production', appVersion: '1.3.153', buildNumber: '2', variant: 'production', sha,
      platformOnlyReason: ' ', repository: 'owner/repository', logUrl: 'https://example.invalid/run', run,
    })
    expect(id).toBe(77)
    expect(calls.map((call) => call.path)).toEqual(['repos/owner/repository/deployments', 'repos/owner/repository/deployments/77/statuses'])
    expect(calls[0]!.payload).toMatchObject({ task: 'ios-release', environment: 'production', ref: sha, required_contexts: [] })
    expect(calls[0]!.payload.payload).toEqual({ app_version: '1.3.153', ios_build_number: '2', variant: 'production' })
    expect(calls[1]!.payload).toMatchObject({ state: 'success' })
  })

  it('keeps the platform-only reason in the record', () => {
    const calls: Record<string, unknown>[] = []
    pair.recordIosDeployment({
      environment: 'staging', appVersion: '1.3.155', buildNumber: '3', variant: 'staging', sha, platformOnlyReason: 'iOS widget defect',
      repository: 'owner/repository', logUrl: 'https://example.invalid/run',
      run: (_path: string, payload: Record<string, unknown>) => { calls.push(payload); return { id: 1 } },
    })
    expect(calls[0]!.payload).toMatchObject({ platform_only_reason: 'iOS widget defect' })
  })

  it('stops when GitHub returns no numeric id', () => {
    expect(() => pair.recordIosDeployment({
      environment: 'production', appVersion: '1.3.153', buildNumber: '2', variant: 'production', sha, repository: 'owner/repository', logUrl: '',
      run: () => ({}),
    })).toThrow('numeric id')
  })
})

describe('command line', () => {
  const directories: string[] = []
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
  })

  function run(args: string[], deployments: Parameters<typeof writeGitHubStub>[1], reason = '') {
    const directory = mkdtempSync(join(tmpdir(), 'mobile-version-pair-'))
    directories.push(directory)
    writeGitHubStub(directory, deployments)
    const summary = join(directory, 'summary.md')
    const result = spawnSync(process.execPath, [script, ...args, ...(reason ? ['--platform-only-reason', reason] : [])], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, GITHUB_REPOSITORY: 'owner/repository', GITHUB_STEP_SUMMARY: summary },
    })
    return { ...result, summary: (() => { try { return readFileSync(summary, 'utf8') } catch { return '' } })() }
  }

  const iosAt153 = ['check', '--platform', 'ios', '--environment', 'production', '--app-version', '1.3.153']

  it('allows iOS at the newest Android version', () => {
    const result = run(iosAt153, { android: [record('1.3.152'), record('1.3.153')], ios: [record('1.3.152', 'ios-release')] })
    expect(result.status).toBe(0)
    expect(result.summary).toContain('allowed')
  })

  it('refuses iOS at a version Android does not carry', () => {
    const result = run(iosAt153, { android: [record('1.3.152')], ios: [record('1.3.152', 'ios-release')] })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('differs from the newest Android version 1.3.152')
    expect(result.summary).toContain('refused')
  })

  it('allows the mismatch with a platform-only reason and records it in the summary', () => {
    const result = run(iosAt153, { android: [record('1.3.152')], ios: [] }, 'iOS only crash')
    expect(result.status).toBe(0)
    expect(result.summary).toContain('`true`')
    expect(result.stdout).toContain('iOS only crash')
  })

  it('prints the plan as JSON', () => {
    const result = run(['plan', '--environment', 'production'], { android: [record('1.3.153')], ios: [record('1.3.152', 'ios-release')] })
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ laggingPlatform: 'ios', nextVersion: '1.3.154' })
  })

  it('fails closed when GitHub cannot be read', () => {
    const result = spawnSync(process.execPath, [script, ...iosAt153], {
      encoding: 'utf8', env: { ...process.env, PATH: '/nonexistent', GITHUB_REPOSITORY: 'owner/repository' },
    })
    expect(result.status).toBe(1)
  })

  it('exits 0 for help and 2 for an unknown or incomplete argument', () => {
    expect(spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' }).status).toBe(0)
    expect(spawnSync(process.execPath, [script, 'check', '--orbit-not-a-flag', 'x'], { encoding: 'utf8' }).status).toBe(2)
    expect(spawnSync(process.execPath, [script, 'check', '--platform', 'ios'], { encoding: 'utf8' }).status).toBe(2)
  })
})

describe('release workflows', () => {
  interface Step { name?: string; run?: string; uses?: string; env?: Record<string, string> }
  interface Workflow {
    on: { workflow_dispatch: { inputs: Record<string, { required?: boolean; type: string }> } }
    permissions: Record<string, string>
    jobs: Record<string, { steps: Step[] }>
  }
  const read = (name: string) => parse(readFileSync(resolve(`../../.github/workflows/${name}.yml`), 'utf8')) as Workflow
  const android = read('android-release')
  const ios = read('ios-release')
  const index = (steps: Step[], predicate: (step: Step) => boolean) => steps.findIndex(predicate)

  it.each([['android-release', android], ['ios-release', ios]] as const)('%s accepts an optional platform-only reason', (_name, workflow) => {
    expect(workflow.on.workflow_dispatch.inputs.platform_only_reason).toMatchObject({ type: 'string', required: false })
  })

  it('checks the Android version after checkout and before the build installs anything', () => {
    const steps = android.jobs['release-android']!.steps
    const guard = index(steps, (step) => step.name === 'Require one mobile version')
    expect(guard).toBeGreaterThan(index(steps, (step) => step.uses === 'actions/checkout@v7'))
    expect(guard).toBeLessThan(index(steps, (step) => step.name === 'Install dependencies from the lockfile'))
    expect(steps[guard]!.run).toContain('mobile-version-pair.js check --platform android')
    expect(steps[guard]!.run).toContain('--platform-only-reason "$PLATFORM_ONLY_REASON"')
  })

  it('checks the iOS version before it writes the version into the project', () => {
    const steps = ios.jobs.release!.steps
    const validate = steps.find((step) => step.name === 'Validate the release configuration')!.run!
    expect(validate).toContain('mobile-version-pair.js check --platform ios')
    expect(validate.indexOf('mobile-version-pair.js check')).toBeLessThan(validate.indexOf('set-app-version.js'))
  })

  it('records the iOS upload only after the upload step', () => {
    const steps = ios.jobs.release!.steps
    expect(ios.permissions.deployments).toBe('write')
    const upload = index(steps, (step) => step.name === 'Upload to TestFlight with the App Store Connect API key')
    const recorded = index(steps, (step) => step.name === 'Record the iOS upload')
    expect(recorded).toBe(upload + 1)
    expect(steps[recorded]!.run).toContain('mobile-version-pair.js record-ios')
  })

  const runAndroidGuard = (options: { track: string; androidVersion: string; iosVersion: string | null; platformOnlyReason?: string }) => {
    const step = android.jobs['release-android']!.steps.find((candidate) => candidate.name === 'Require one mobile version')!
    const directory = mkdtempSync(join(tmpdir(), 'orbit-android-guard-'))
    try {
      mkdirSync(join(directory, 'apps/mobile/scripts'), { recursive: true })
      copyFileSync(script, join(directory, 'apps/mobile/scripts/mobile-version-pair.js'))
      writeGitHubStub(directory, {
        android: [record('1.3.152')],
        ios: options.iosVersion ? [record(options.iosVersion, 'ios-release')] : [],
      })
      return spawnSync('/bin/bash', ['-c', step.run!], {
        cwd: directory, encoding: 'utf8',
        env: {
          PATH: `${directory}:${process.env.PATH ?? ''}`, NODE_ENV: 'test', GITHUB_REPOSITORY: 'owner/repository',
          ...declaredStepEnvironment(step, {
            GH_TOKEN: 'test-token', APP_VERSION: options.androidVersion,
            PLATFORM_ONLY_REASON: options.platformOnlyReason ?? '', RELEASE_TRACK: options.track,
          }),
        },
      })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }

  it.each([
    ['open', '1.3.153', '1.3.152', '', 0, 'keeps both platforms on one version'],
    ['internal', '1.3.153', '1.3.152', '', 0, 'keeps both platforms on one version'],
    ['open', '1.3.152', '1.3.153', '', 1, 'older than the newest iOS version 1.3.153'],
    ['open', '1.3.152', '1.3.153', 'Android only crash', 0, 'Android only crash'],
  ] as const)('runs the Android guard on the %s track at %s against iOS %s with reason "%s"', (track, androidVersion, iosVersion, platformOnlyReason, status, output) => {
    const result = runAndroidGuard({ track, androidVersion, iosVersion, platformOnlyReason })
    expect(result.status).toBe(status)
    expect(result.stdout + result.stderr).toContain(output)
  })

  it('keeps the Android run title format the release skills parse', () => {
    const raw = readFileSync(resolve('../../.github/workflows/android-release.yml'), 'utf8')
    expect(raw).toContain('run-name: Android Release ${{ inputs.app_version }} (${{ inputs.android_version_code }}) to ${{ inputs.track }} on ${{ github.ref_name }}')
  })
})
