import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { parse } from 'yaml'
import { afterEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { declaredStepEnvironment, deploymentRecord as record, readStubWrites, writeGitHubStub } from '../support/release-step-environment'
import type { StubDeployments } from '../support/release-step-environment'

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
    expect(decision.message).toContain('not above the newest iOS version 1.3.154')
  })

  it.each(['', 'crash on Android 9'])('refuses Android at the version iOS shipped alone, with reason "%s"', (platformOnlyReason) => {
    const decision = check({ platform: 'android', appVersion: '1.3.154', platformNewest: '1.3.153', siblingNewest: '1.3.154', platformOnlyReason })
    expect(decision.allowed).toBe(false)
    expect(decision.message).toContain('not above the newest iOS version 1.3.154')
    expect(decision.message).toContain('nextVersion 1.3.155')
  })

  it('lets Android rebuild the shared version that both platforms carry', () => {
    expect(check({ platform: 'android', appVersion: '1.3.153', platformNewest: '1.3.153', siblingNewest: '1.3.153' }).allowed).toBe(true)
  })

  it.each([
    ['ios', '1.3.153', '1.3.152', '1.3.153'],
    ['ios', '1.3.153', '1.3.153', '1.3.153'],
    ['android', '1.3.153', '1.3.153', '1.3.153'],
    ['android', '1.3.153', '1.3.152', '1.3.153'],
  ] as const)('refuses a %s only release at %s when its newest is %s and the other platform carries %s', (platform, appVersion, platformNewest, siblingNewest) => {
    const decision = check({ platform, appVersion, platformNewest, siblingNewest, platformOnlyReason: 'platform defect' })
    expect(decision.allowed).toBe(false)
    expect(decision.message).toContain(`not above the newest ${platform === 'ios' ? 'Android' : 'iOS'} version ${siblingNewest}`)
    expect(decision.message).toContain('nextVersion 1.3.154')
  })

  it.each([
    { android: '1.3.153', ios: '1.3.153' },
    { android: '1.3.153', ios: '1.3.152' },
    { android: '1.3.153', ios: '1.3.154' },
    { android: '1.3.153', ios: null },
    { android: null, ios: '1.3.154' },
  ])('allows the plan nextVersion for each kind of release when Android is at $android and iOS at $ios', (newest) => {
    const nextVersion = pair.planVersions(newest).nextVersion as string
    const decide = (platform: 'android' | 'ios', platformOnlyReason: string) => check({
      platform, appVersion: nextVersion, platformOnlyReason,
      platformNewest: platform === 'android' ? newest.android : newest.ios,
      siblingNewest: platform === 'android' ? newest.ios : newest.android,
    })
    expect(decide('android', '')).toMatchObject({ allowed: true, platformOnly: false })
    expect(decide('android', 'Android defect')).toMatchObject({ allowed: true, platformOnly: true })
    expect(decide('ios', 'iOS defect')).toMatchObject({ allowed: true, platformOnly: true })
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
  const upload = {
    environment: 'production', appVersion: '1.3.153', buildNumber: '2', variant: 'production', sha,
    platformOnlyReason: ' ', repository: 'owner/repository', logUrl: 'https://example.invalid/run',
  }
  const recorded = { id: 41, payload: { app_version: '1.3.153', ios_build_number: '2', variant: 'production' } }
  const otherBuild = { id: 40, payload: { ...recorded.payload, ios_build_number: '1' } }

  /**
   * A GitHub double that keeps each created deployment, as the real list does.
   * `failAt` fails a call before it takes effect. `loseResponseAt` applies the call, then fails it.
   * Both hold positions in the order of all calls, from 0.
   */
  function fakeGitHub(options: { existing?: unknown; created?: unknown; failAt?: number[]; loseResponseAt?: number[] } = {}) {
    const calls: { kind: 'read' | 'create' | 'status'; path: string; payload?: Record<string, unknown> }[] = []
    const pauses: number[] = []
    let stored = options.existing ?? []
    const settle = (effect: () => unknown) => {
      const position = calls.length - 1
      if (options.failAt?.includes(position)) throw new Error('gh: Bad Gateway (HTTP 502)')
      const result = effect()
      if (options.loseResponseAt?.includes(position)) throw new Error('gh: connection reset')
      return result
    }
    const github = {
      read: (path: string) => { calls.push({ kind: 'read', path }); return settle(() => stored) },
      write: (path: string, payload: Record<string, unknown>) => {
        const kind = path.endsWith('/statuses') ? 'status' : 'create'
        calls.push({ kind, path, payload })
        return settle(() => {
          if (kind === 'status') return { id: 1 }
          const created = options.created ?? { id: 77, payload: payload.payload }
          if (Array.isArray(stored)) stored = [...stored, created]
          return created
        })
      },
    }
    return {
      calls, pauses, kinds: () => calls.map((call) => call.kind),
      input: { ...upload, github, pause: (milliseconds: number) => { pauses.push(milliseconds) } },
    }
  }

  it('looks for the record of this upload on the commit, then creates it and marks it successful', () => {
    const fake = fakeGitHub()
    expect(pair.recordIosDeployment(fake.input)).toBe(77)
    expect(fake.calls.map((call) => call.path)).toEqual([
      `repos/owner/repository/deployments?sha=${sha}&task=ios-release&environment=production&per_page=100`,
      'repos/owner/repository/deployments',
      'repos/owner/repository/deployments/77/statuses',
    ])
    expect(fake.calls[1]!.payload).toMatchObject({ task: 'ios-release', environment: 'production', ref: sha, required_contexts: [] })
    expect(fake.calls[1]!.payload!.payload).toEqual({ app_version: '1.3.153', ios_build_number: '2', variant: 'production' })
    expect(fake.calls[2]!.payload).toMatchObject({ state: 'success' })
    expect(fake.pauses).toEqual([])
  })

  it('keeps the platform-only reason in the record', () => {
    const fake = fakeGitHub()
    pair.recordIosDeployment({ ...fake.input, environment: 'staging', variant: 'staging', platformOnlyReason: 'iOS widget defect' })
    expect(fake.calls[1]!.payload!.payload).toMatchObject({ variant: 'staging', platform_only_reason: 'iOS widget defect' })
  })

  it('reuses the record of the same upload, so a rerun does not record twice', () => {
    const fake = fakeGitHub({ existing: [otherBuild, recorded] })
    expect(pair.recordIosDeployment(fake.input)).toBe(41)
    expect(fake.kinds()).toEqual(['read', 'status'])
    expect(fake.calls[1]!.path).toBe('repos/owner/repository/deployments/41/statuses')
  })

  it('creates a record when the commit holds only another build number', () => {
    const fake = fakeGitHub({ existing: [otherBuild] })
    expect(pair.recordIosDeployment(fake.input)).toBe(77)
    expect(fake.kinds()).toEqual(['read', 'create', 'status'])
  })

  it.each([
    ['the lookup fails', { failAt: [0] }, ['read', 'read', 'create', 'status']],
    ['the creation fails', { failAt: [1] }, ['read', 'create', 'read', 'create', 'status']],
    ['the creation response is lost', { loseResponseAt: [1] }, ['read', 'create', 'read', 'status']],
    ['the status fails', { failAt: [2] }, ['read', 'create', 'status', 'read', 'status']],
  ])('repeats the record once when %s, and creates one deployment', (_name, failure, kinds) => {
    const fake = fakeGitHub(failure)
    expect(pair.recordIosDeployment(fake.input)).toBe(77)
    expect(fake.kinds()).toEqual(kinds)
    expect(fake.pauses).toEqual([2000])
  })

  it('stops after three failed attempts and raises the last error', () => {
    const fake = fakeGitHub({ failAt: [0, 1, 2] })
    expect(() => pair.recordIosDeployment(fake.input)).toThrow('HTTP 502')
    expect(fake.kinds()).toEqual(['read', 'read', 'read'])
    expect(fake.pauses).toEqual([2000, 4000])
  })

  it('stops when GitHub returns no numeric id', () => {
    expect(() => pair.recordIosDeployment(fakeGitHub({ created: {} }).input)).toThrow('numeric id')
  })

  it('fails closed on a lookup response that is not a list', () => {
    expect(() => pair.recordIosDeployment(fakeGitHub({ existing: {} }).input)).toThrow('unexpected deployments response')
  })
})

describe('command line', () => {
  const directories: string[] = []
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
  })

  function run(args: string[], deployments: StubDeployments, reason = '') {
    const directory = mkdtempSync(join(tmpdir(), 'mobile-version-pair-'))
    directories.push(directory)
    writeGitHubStub(directory, deployments)
    const summary = join(directory, 'summary.md')
    const result = spawnSync(process.execPath, [script, ...args, ...(reason ? ['--platform-only-reason', reason] : [])], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, GITHUB_REPOSITORY: 'owner/repository', GITHUB_STEP_SUMMARY: summary },
    })
    return {
      ...result,
      summary: (() => { try { return readFileSync(summary, 'utf8') } catch { return '' } })(),
      writes: readStubWrites(directory),
    }
  }

  const iosAt153 = (environment: string) => ['check', '--platform', 'ios', '--environment', environment, '--app-version', '1.3.153']
  const stagingBehind: StubDeployments = {
    production: { android: [record('1.3.152'), record('1.3.153')], ios: [record('1.3.152', 'ios-release')] },
    staging: { android: [record('1.3.139')], ios: [] },
  }

  it('allows iOS at the newest Android version', () => {
    const result = run(iosAt153('production'), stagingBehind)
    expect(result.status).toBe(0)
    expect(result.summary).toContain('allowed')
    expect(result.summary).toContain('| Environment | `production` |')
  })

  it('refuses iOS at a version Android does not carry', () => {
    const result = run(iosAt153('production'), { production: { android: [record('1.3.152')], ios: [record('1.3.152', 'ios-release')] } })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('differs from the newest Android version 1.3.152')
    expect(result.summary).toContain('refused')
  })

  it('reads only the records of the named environment, and a refusal names that environment and the pairs', () => {
    const result = run(iosAt153('staging'), stagingBehind)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('differs from the newest Android version 1.3.139')
    expect(result.stderr).toContain('The check read the staging environment.')
    expect(result.stderr).toContain('Android open and production pair with iOS production. Android internal pairs with iOS staging.')
    expect(result.summary).toContain('| Environment | `staging` |')
  })

  it('allows the mismatch with a platform-only reason and records it in the summary', () => {
    const result = run(iosAt153('production'), { production: { android: [record('1.3.152')], ios: [] } }, 'iOS only crash')
    expect(result.status).toBe(0)
    expect(result.summary).toContain('`true`')
    expect(result.stdout).toContain('iOS only crash')
  })

  it.each([
    ['production', { android: '1.3.153', ios: '1.3.152', laggingPlatform: 'ios', nextVersion: '1.3.154' }],
    ['staging', { android: '1.3.139', ios: null, laggingPlatform: 'ios', nextVersion: '1.3.140' }],
  ] as const)('prints the %s plan as JSON', (environment, plan) => {
    const result = run(['plan', '--environment', environment], stagingBehind)
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ environment, ...plan })
  })

  it('records an iOS upload through gh and prints the deployment', () => {
    const result = run(['record-ios', '--environment', 'staging', '--variant', 'staging', '--app-version', '1.3.153', '--build-number', '5', '--sha', sha], stagingBehind)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('iOS deployment 77: staging, 1.3.153 (5)')
  })

  it('fails closed when GitHub cannot be read', () => {
    const result = spawnSync(process.execPath, [script, ...iosAt153('production')], {
      encoding: 'utf8', env: { ...process.env, PATH: '/nonexistent', GITHUB_REPOSITORY: 'owner/repository' },
    })
    expect(result.status).toBe(1)
  })

  it('exits 0 for help and 2 for an unknown or incomplete argument', () => {
    expect(spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' }).status).toBe(0)
    expect(spawnSync(process.execPath, [script, 'check', '--orbit-not-a-flag', 'x'], { encoding: 'utf8' }).status).toBe(2)
    expect(spawnSync(process.execPath, [script, 'check', '--platform', 'ios'], { encoding: 'utf8' }).status).toBe(2)
  })

  it.each([
    [['-h']],
    [['check', '--help']],
    [['record-ios', '--environment', 'staging', '-h']],
  ])('prints the usage for a help flag where a command or a flag belongs: %j', (args) => {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Usage: node scripts/mobile-version-pair.js')
  })

  it('treats a help flag in the place of a flag value as that value', () => {
    const result = spawnSync(process.execPath, [script, 'check', '--platform', '-h', '--environment', 'production', '--app-version', '1.3.153'], { encoding: 'utf8' })
    expect(result.status).toBe(2)
    expect(result.stdout).toBe('')
  })

  it.each(['-h', '--help'])('runs the check when the platform-only reason is %s', (reason) => {
    const result = run(['check', '--platform', 'ios', '--environment', 'production', '--app-version', '1.3.151'], stagingBehind, reason)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('ios 1.3.151 is older than its newest release 1.3.152')
    expect(result.summary).toContain('| Verdict | refused |')
  })

  it.each(['-h', '--help'])('records the iOS upload when the platform-only reason is %s', (reason) => {
    const result = run(['record-ios', '--environment', 'staging', '--variant', 'staging', '--app-version', '1.3.153', '--build-number', '5', '--sha', sha], stagingBehind, reason)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('iOS deployment 77: staging, 1.3.153 (5)')
    expect(result.writes[0]!.payload).toMatchObject({ task: 'ios-release', payload: { platform_only_reason: reason } })
  })
})

describe('release workflows', () => {
  interface Step { name?: string; run?: string; uses?: string; env?: Record<string, string> }
  interface Workflow {
    on: { workflow_dispatch: { inputs: Record<string, { required?: boolean; type: string; default?: string }> } }
    permissions: Record<string, string>
    jobs: Record<string, { needs?: string; 'runs-on': string; permissions?: Record<string, string>; steps: Step[] }>
  }
  const read = (name: string) => parse(readFileSync(resolve(`../../.github/workflows/${name}.yml`), 'utf8')) as Workflow
  const android = read('android-release')
  const ios = read('ios-release')
  const index = (steps: Step[], predicate: (step: Step) => boolean) => steps.findIndex(predicate)
  const ahead = '1.3.160'

  /** Runs one workflow step in a directory that holds the script and a stub `gh`, with only the declared environment. */
  function runStep(step: Step, deployments: StubDeployments, values: Record<string, string>, runner: Record<string, string> = {}) {
    const directory = mkdtempSync(join(tmpdir(), 'orbit-release-step-'))
    try {
      mkdirSync(join(directory, 'apps/mobile/scripts'), { recursive: true })
      copyFileSync(script, join(directory, 'apps/mobile/scripts/mobile-version-pair.js'))
      writeGitHubStub(directory, deployments)
      const result = spawnSync('/bin/bash', ['-c', step.run!], {
        cwd: directory, encoding: 'utf8',
        env: {
          PATH: `${directory}:${process.env.PATH ?? ''}`, NODE_ENV: 'test', GITHUB_REPOSITORY: 'owner/repository', ...runner,
          ...declaredStepEnvironment(step, values),
        },
      })
      return { ...result, writes: readStubWrites(directory) }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }

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

  it('defaults the iOS variant to production, the pair of the default Android open track', () => {
    expect(ios.on.workflow_dispatch.inputs.variant).toMatchObject({ type: 'choice', default: 'production' })
  })

  it('records the iOS upload in a job of its own, so a rerun of the record never uploads again', () => {
    const record = ios.jobs['record-upload']!
    expect(record.needs).toBe('release')
    expect(record['runs-on']).toBe('ubuntu-latest')
    expect(record.permissions).toEqual({ contents: 'read', deployments: 'write' })
    expect(record.steps.map((step) => step.run ?? '').join('\n')).toContain('mobile-version-pair.js record-ios')
    expect(ios.jobs.release!.steps.map((step) => step.run ?? '').join('\n')).not.toContain('record-ios')
  })

  it('gives write access to deployments only to the record job, and keeps the tester job independent of it', () => {
    expect(ios.permissions).toEqual({ contents: 'read' })
    expect(ios.jobs.release!.permissions).toEqual({ contents: 'read', deployments: 'read' })
    expect(ios.jobs['testflight-access']!.permissions).toBeUndefined()
    expect(ios.jobs['testflight-access']!.needs).toBe('release')
  })

  it.each(['staging', 'production'] as const)('records a %s upload in the environment of the same name', (variant) => {
    const step = ios.jobs['record-upload']!.steps.find((candidate) => candidate.name === 'Record the iOS upload')!
    const result = runStep(step, { [variant]: { android: [record('1.3.153')], ios: [] } }, {
      GH_TOKEN: 'test-token', ORBIT_APP_VARIANT: variant, APP_VERSION: '1.3.153', IOS_BUILD_NUMBER: '7', PLATFORM_ONLY_REASON: '',
    }, { GITHUB_SHA: 'b'.repeat(40), GITHUB_RUN_ID: '1' })
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    const [created, status] = result.writes
    expect(created).toMatchObject({
      path: 'repos/owner/repository/deployments',
      payload: { environment: variant, task: 'ios-release', ref: 'b'.repeat(40), payload: { app_version: '1.3.153', ios_build_number: '7', variant } },
    })
    expect(status).toMatchObject({ path: 'repos/owner/repository/deployments/77/statuses', payload: { state: 'success' } })
  })

  const runAndroidGuard = (options: { track: string; androidVersion: string; productionIos: string | null; stagingIos: string | null; platformOnlyReason?: string }) => {
    const step = android.jobs['release-android']!.steps.find((candidate) => candidate.name === 'Require one mobile version')!
    const iosRecords = (version: string | null) => (version ? [record(version, 'ios-release')] : [])
    return runStep(step, {
      production: { android: [record('1.3.152')], ios: iosRecords(options.productionIos) },
      staging: { android: [record('1.3.139')], ios: iosRecords(options.stagingIos) },
    }, {
      GH_TOKEN: 'test-token', APP_VERSION: options.androidVersion,
      PLATFORM_ONLY_REASON: options.platformOnlyReason ?? '', RELEASE_TRACK: options.track,
    })
  }

  it.each([
    ['open', '1.3.153', '1.3.152', ahead, '', 0, 'keeps both platforms on one version'],
    ['production', '1.3.153', '1.3.152', ahead, '', 0, 'keeps both platforms on one version'],
    ['internal', '1.3.141', ahead, '1.3.140', '', 0, 'keeps both platforms on one version'],
    ['internal', '1.3.140', ahead, '1.3.140', '', 1, 'not above the newest iOS version 1.3.140'],
    ['open', '1.3.152', '1.3.153', null, '', 1, 'not above the newest iOS version 1.3.153'],
    ['open', '1.3.153', '1.3.153', null, '', 1, 'not above the newest iOS version 1.3.153'],
    ['internal', '1.3.139', null, '1.3.140', '', 1, 'not above the newest iOS version 1.3.140'],
    ['open', '1.3.154', '1.3.153', null, 'Android only crash', 0, 'Android only crash'],
    ['open', '1.3.153', '1.3.153', null, 'Android only crash', 1, 'not above the newest iOS version 1.3.153'],
  ] as const)('runs the Android guard on the %s track at %s against production iOS %s and staging iOS %s with reason "%s"', (track, androidVersion, productionIos, stagingIos, platformOnlyReason, status, output) => {
    const result = runAndroidGuard({ track, androidVersion, productionIos, stagingIos, platformOnlyReason })
    expect(result.stdout + result.stderr).toContain(output)
    expect(result.status).toBe(status)
  })

  it('keeps the Android run title format the release skills parse', () => {
    const raw = readFileSync(resolve('../../.github/workflows/android-release.yml'), 'utf8')
    expect(raw).toContain('run-name: Android Release ${{ inputs.app_version }} (${{ inputs.android_version_code }}) to ${{ inputs.track }} on ${{ github.ref_name }}')
  })
})
