import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

interface Workflow<Job extends string> {
  on: Record<string, { branches?: string[]; paths?: string[] } | null>
  jobs: Record<Job, {
    'runs-on': string
    'timeout-minutes': number
    env: Record<string, string>
    steps: { name?: string; run?: string; uses?: string; if?: string; with?: Record<string, string> }[]
  }>
}

const readWorkflow = <Job extends string>(name: string) => parse(readFileSync(resolve(`../../.github/workflows/${name}.yml`), 'utf8')) as Workflow<Job>

describe('iOS build and release boundaries', () => {
  it('signs the containing app and widget with separate provisioning profiles', () => {
    const workflow = readWorkflow<'release'>('ios-release')
    expect(workflow.jobs.release.env.IOS_WIDGET_PROVISIONING_PROFILE_NAME).toBeDefined()
    const archive = workflow.jobs.release.steps.find((step) => step.name === 'Archive the embedded app')?.run
    expect(archive).not.toContain('PROVISIONING_PROFILE_SPECIFIER=')
    const install = workflow.jobs.release.steps.find((step) => step.name === 'Install signing credentials')?.run
    expect(install).toContain('IOS_WIDGET_PROVISIONING_PROFILE_BASE64')
    const exportArchive = workflow.jobs.release.steps.find((step) => step.name === 'Export the App Store package')?.run
    expect(exportArchive).toContain("bundle_id + '.widget'")
  })
  it.each(['ios-build', 'ios-release'])('%s resolves the updates entry against the configured Metro root', (name) => {
    const workflow = readWorkflow<string>(name)
    const job = Object.values(workflow.jobs)[0]!
    const entry = execFileSync(process.execPath, ['-e', `
      const { convertEntryPointToRelative, resolveEntryPoint } = require('expo/config/paths')
      const root = process.cwd()
      process.stdout.write(convertEntryPointToRelative(root, resolveEntryPoint(root, { platform: 'ios' }), null))
    `], { cwd: resolve('.'), env: { ...process.env, EXPO_NO_METRO_WORKSPACE_ROOT: 'false', ...job.env }, encoding: 'utf8' })
    expect(resolve(entry)).toBe(resolve('index.js'))
  })

  it('compiles mobile pull requests on macOS without signing or launching a simulator', () => {
    const workflow = readWorkflow<'compile'>('ios-build')
    expect(workflow.on.pull_request?.paths).toContain('apps/mobile/**')
    expect(workflow.jobs.compile['runs-on']).toMatch(/^macos-/)
    const commands = workflow.jobs.compile.steps.map((step) => step.run ?? '').join('\n')
    expect(commands).toContain('expo prebuild --platform ios')
    expect(commands).toContain("-destination 'generic/platform=iOS Simulator'")
    expect(commands).toContain('CODE_SIGNING_ALLOWED=NO')
    expect(commands).not.toMatch(/simctl|expo start/)
    expect(commands).toContain('-workspace ios/OrbitStaging.xcworkspace -scheme OrbitStaging')
    expect(commands).toContain('-configuration Release -sdk iphonesimulator')
    expect(workflow.jobs.compile['timeout-minutes']).toBeGreaterThanOrEqual(55)
  })

  it('reuses compiler outputs while regenerating and compiling every source revision', () => {
    const workflow = readWorkflow<'compile'>('ios-build')
    const { steps, env } = workflow.jobs.compile
    const cacheIndex = steps.findIndex((step) => step.uses === 'actions/cache@v6')
    expect(cacheIndex).toBeGreaterThanOrEqual(0)
    const cache = steps[cacheIndex]!
    expect(cache.with?.path).toBe('${{ env.CCACHE_DIR }}')
    expect(env.USE_CCACHE).toBe('1')
    expect(env.CCACHE_DIR).toBe('${{ github.workspace }}/.cache/ios-ccache')
    for (const input of ['runner.arch', 'package-lock.json', 'apps/mobile/app.json', 'apps/mobile/app.config.js', 'apps/mobile/plugins/**', 'apps/mobile/modules/**']) {
      expect(cache.with?.key).toContain(input)
    }
    expect(cache.with?.key).toContain('${{ github.run_id }}-${{ github.run_attempt }}')
    expect(cache.with?.key).toBe(`${cache.with?.['restore-keys']?.trim()}\${{ github.run_id }}-\${{ github.run_attempt }}`)
    const installIndex = steps.findIndex((step) => step.run?.includes('brew install ccache'))
    const prebuildIndex = steps.findIndex((step) => step.run?.includes('expo prebuild --platform ios'))
    const compileIndex = steps.findIndex((step) => step.run?.includes('xcodebuild -workspace'))
    expect(installIndex).toBeGreaterThanOrEqual(0)
    expect(installIndex).toBeLessThan(prebuildIndex)
    expect(cacheIndex).toBeLessThan(prebuildIndex)
    expect(prebuildIndex).toBeLessThan(compileIndex)
    expect(steps[prebuildIndex]?.if).toBeUndefined()
    expect(steps[compileIndex]?.if).toBeUndefined()
    expect(steps.some((step) => step.run?.includes('ccache --zero-stats'))).toBe(true)
    expect(steps.some((step) => step.run?.includes('ccache --show-stats'))).toBe(true)
    expect(workflow.on.push?.branches).toEqual(['main'])
    expect(workflow.on.push?.paths).toEqual(workflow.on.pull_request?.paths)
  })

  it('keeps credentialed TestFlight publishing manual', () => {
    const workflow = readWorkflow<'release'>('ios-release')
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch'])
    expect(workflow.jobs.release['runs-on']).toMatch(/^macos-/)
  })

  it.each([
    ['production', 'refs/heads/feature/release', false],
    ['production', 'refs/heads/main', true],
    ['staging', 'refs/heads/feature/release', true],
  ] as const)('validates %s releases from %s before signing', (variant, ref, accepted) => {
    const workflow = readWorkflow<'release'>('ios-release')
    const script = workflow.jobs.release.steps.find((step) => step.name === 'Validate the release configuration')?.run
    expect(script).toBeTypeOf('string')
    const directory = mkdtempSync(join(tmpdir(), 'orbit-ios-dispatch-'))
    const appDirectory = join(directory, 'apps/mobile')
    mkdirSync(join(appDirectory, 'scripts'), { recursive: true })
    copyFileSync(resolve('app.json'), join(appDirectory, 'app.json'))
    copyFileSync(resolve('scripts/set-app-version.js'), join(appDirectory, 'scripts/set-app-version.js'))
    const release = () => execFileSync('/bin/bash', ['-c', script!], {
      cwd: directory, stdio: 'pipe',
      env: {
        PATH: process.env.PATH ?? '', NODE_ENV: 'test', ORBIT_APP_VARIANT: variant, GITHUB_REF: ref,
        ORBIT_APPLE_TEAM_ID: 'TESTTEAM01', ORBIT_IOS_APP_STORE_ID: '1234567890',
        IOS_PROVISIONING_PROFILE_NAME: 'Orbit Distribution', EXPO_PUBLIC_GOOGLE_CLIENT_ID: 'client',
        IOS_WIDGET_PROVISIONING_PROFILE_NAME: 'Orbit Widget Distribution',
        EXPO_PUBLIC_TURNSTILE_SITE_KEY: 'site', EXPO_PUBLIC_SENTRY_DSN: 'dsn',
        SENTRY_AUTH_TOKEN: 'test-token', APP_STORE_CONNECT_API_KEY_ID: 'test-key',
        APP_STORE_CONNECT_API_ISSUER_ID: 'test-issuer', APP_VERSION: '2.0.0', IOS_BUILD_NUMBER: '42',
      },
    })
    try {
      if (accepted) {
        expect(release).not.toThrow()
        const config: { expo: { ios: { buildNumber: string } } } = JSON.parse(readFileSync(join(appDirectory, 'app.json'), 'utf8'))
        expect(config.expo.ios.buildNumber).toBe('42')
      } else {
        expect(release).toThrow('Production iOS releases must run from main')
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
