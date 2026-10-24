import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

interface Workflow<Job extends string> {
  on: Record<string, { paths?: string[] } | null>
  jobs: Record<Job, {
    'runs-on': string
    steps: { name?: string; run?: string }[]
  }>
}

const readWorkflow = <Job extends string>(name: string) => parse(readFileSync(resolve(`../../.github/workflows/${name}.yml`), 'utf8')) as Workflow<Job>

describe('iOS build and release boundaries', () => {
  it('compiles mobile pull requests on macOS without signing or launching a simulator', () => {
    const workflow = readWorkflow<'compile'>('ios-build')
    expect(workflow.on.pull_request?.paths).toContain('apps/mobile/**')
    expect(workflow.jobs.compile['runs-on']).toMatch(/^macos-/)
    const commands = workflow.jobs.compile.steps.map((step) => step.run ?? '').join('\n')
    expect(commands).toContain('expo prebuild --platform ios')
    expect(commands).toContain("-destination 'generic/platform=iOS Simulator'")
    expect(commands).toContain('CODE_SIGNING_ALLOWED=NO')
    expect(commands).not.toMatch(/simctl|expo start/)
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
